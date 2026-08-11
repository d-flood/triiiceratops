<script lang="ts">
    /**
     * The annotation **shape** overlay: the boxes, polygons, and points drawn on
     * the image itself.
     *
     * Distinct from `AnnotationOverlay.svelte`, which draws the SVG connector
     * lines between a panel row and the shapes here. They are two concerns, not
     * two copies of one, and both are carried forward.
     *
     * ## Renderer-independent, and on the frame cadence
     *
     * This used to live inside the third-party renderer's own component, keyed
     * on a counter that one of its events bumped, and it converted coordinates
     * through that library's viewport. Nothing here reaches into the renderer:
     * geometry comes from `ViewerState.canvasToScreen` and the redraw signal
     * from `ViewerState.subscribeFrame` — the `frame` cadence, which is the
     * renderer's own animation events. That is what let the previous renderer be
     * deleted without taking the annotation overlay with it.
     *
     * The write lands in the same frame as the paint: the frame listener runs
     * inside the renderer's `requestAnimationFrame` callback, and Svelte flushes
     * on the microtask that follows it — before the browser composites. The
     * shapes and the pixels therefore move together, where the old binding
     * repositioned them one frame after the image had already moved.
     *
     * ## Why DOM and not the paint hook
     *
     * > The canvas paints pixels; a parallel DOM layer carries the focusable,
     * > labelled targets.
     *
     * Every editable shape below is a real `<button>` with an accessible name and
     * Enter/Space activation. Canvas-drawn shapes have no focus, no name, and no
     * keyboard reach, and an automated accessibility scan cannot notice their
     * absence because the elements would simply not exist. Migrating the drawing
     * to core's paint hook is later work and is bounded by that rule: pixels may
     * move onto the canvas only while these targets stay in the DOM, projected
     * from the same geometry.
     *
     * ## Mounted beside the renderer, not inside it
     *
     * A sibling of the renderer host inside the viewer's stage element, which is
     * the shared positioning context — so `canvasToScreen`'s surface-local CSS
     * pixels are this overlay's own coordinates with no offset arithmetic. Being
     * a sibling also keeps it out of the renderer root's `role="application"`
     * subtree, where browse mode is suppressed and these labels would be skipped
     * by NVDA and JAWS. It comes AFTER the renderer in DOM order, so Tab reaches
     * the picture before the things marked on it.
     */
    import { getContext, onMount } from 'svelte';

    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { parseAnnotations } from '../utils/annotationAdapter';
    import { collectCanvasAnnotations } from '../utils/canvasAnnotations';
    import {
        projectAnnotationShapes,
        shapeContainsPoint,
        type AnnotationShape,
    } from '../utils/annotationShapes';
    import type { CanvasImageSpaceDimensions } from '../utils/canvasImageSpace';
    import { resolvePointRadius } from '../utils/pointMarker';
    import { resolveCanvasImage } from '../utils/resolveCanvasImage';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // Deprecated shim: external listeners may still observe this event for one
    // release, but in-repo communication uses viewerState.annotationEditBus.
    const REQUEST_EDIT_EVENT = 'triiiceratops:annotation-editor:request-edit';

    let root: HTMLDivElement | undefined = $state();

    /**
     * Bumped once per rendered frame — the `frame` cadence, and the only reason
     * the projection below re-runs while the viewport is moving.
     *
     * Deliberately component-local `$state` rather than anything on
     * `ViewerState`: a frame tick must not wake the batched state watcher every
     * plugin subscribes through.
     */
    let frameTick = $state(0);

    let readonlyTooltip = $state<{
        id: string;
        text: string;
        x: number;
        y: number;
        side: 'top' | 'bottom' | 'left' | 'right';
    } | null>(null);

    // Point marker diameter in screen pixels, from the shared point style so the
    // read-only overlay matches the editor. Radius → diameter.
    const pointMarkerSize = $derived(
        resolvePointRadius(viewerState.config?.pointStyle) * 2,
    );

    const activeEditAnnotationId = $derived(
        viewerState.annotationEditBus.activeEditAnnotationId,
    );

    /**
     * Selection, from the one gesture the renderer reserves for it.
     *
     * A read-only shape takes no pointer events — a drag that starts over one
     * must still pan the image — so this cannot be a `click` handler on the
     * shape, and it deliberately is not a second tap recogniser on the stage
     * either: `subscribeSurfaceTap` delivers the arbiter's own decision, so a
     * drag, a pinch, and a gesture suppressed by an input claim are already
     * excluded, with one slop threshold rather than two.
     *
     * The hit test runs against the geometry the shapes were POSITIONED from,
     * exactly as the tooltip's does, so the answer is the shape the reader saw
     * under their finger and it costs no layout read. Topmost first, which is
     * what a click would have reached; a tap on no shape clears the selection,
     * which is how a reader puts one down without hunting for the shape again.
     */
    $effect(() =>
        viewerState.subscribeSurfaceTap((point) => {
            const hit = [...shapes]
                .reverse()
                .find(
                    (shape) =>
                        isTappableShape(shape) &&
                        shapeContainsPoint(
                            shape,
                            point.x,
                            point.y,
                            pointMarkerSize,
                        ),
                );

            viewerState.setActiveAnnotationId(hit ? hit.annotationId : null);
        }),
    );

    /**
     * Whether the annotation editor is open, which is what makes a shape
     * editable — and therefore focusable and operable.
     *
     * Read from the plugin's toolbar button, which is target-independent
     * (`isActive` reflects open for both a panel and a flyout). The editor plugin
     * is paused as of this epic, so this is `false` in a shipped viewer today;
     * the branch stays because the editor returns with the phase-2 drawing layer
     * and the focusable-target contract is what it returns onto.
     *
     * TODO(phase 2, drawing layer): core should not name a plugin. The literal
     * `'annotation-editor'` id is carried verbatim from the previous overlay, and it means
     * core hard-codes which single plugin may make an annotation editable —
     * nothing else can, however it is packaged. The phase-2 drawing layer (built
     * on the paint hook and the input-claim API) should replace this with an
     * editing claim a plugin declares — an "annotation editing is open" state on
     * `ViewerState.annotationEditBus` set by whoever is editing — so this reads a
     * capability rather than a name.
     */
    const annotationEditorOpen = $derived.by(() => {
        const editorButton = viewerState.pluginMenuButtons.find(
            (button) => button.pluginId === 'annotation-editor',
        );
        return editorButton?.isActive?.() ?? false;
    });

    /**
     * Every annotation on every canvas the reader is looking at.
     *
     * `annotatableCanvasIds` is one canvas in `individuals`, the whole SPREAD in
     * `paged`, and the folios the viewport meets in `continuous` — so the facing
     * page of a spread and the folio scrolled to are both included, where this
     * used to read `viewerState.canvasId` alone and draw neither. Collected by the
     * shared helper the panel also uses, so the two cannot disagree about what is
     * on screen; a connector is a line between them, and a disagreement is a line
     * to nowhere.
     */
    const canvasAnnotations = $derived(
        collectCanvasAnnotations({
            manifestId: viewerState.manifestId,
            canvasIds: viewerState.annotatableCanvasIds,
            getAnnotations: (manifestId, canvasId) =>
                viewerState.getAnnotations(manifestId, canvasId),
            searchAnnotations: viewerState.searchAnnotations,
        }),
    );

    // Parsed per canvas, so every annotation carries the canvas its geometry is
    // in — which is what lets a spread's two pages project through their own
    // laid-out rects.
    const parsedAnnotations = $derived(
        canvasAnnotations.flatMap((entry) =>
            parseAnnotations(
                entry.annotations,
                entry.searchHitIds,
                entry.canvasId,
            ),
        ),
    );

    /**
     * The annotations that should have a shape at all — a question about viewer
     * state, and settled before any geometry is projected so a hidden annotation
     * costs no arithmetic per frame.
     */
    const shownAnnotations = $derived(
        parsedAnnotations.filter((anno) => {
            // A search hit is always shown; everything else honours the
            // annotation panel's visibility set.
            if (
                !anno.isSearchHit &&
                !viewerState.visibleAnnotationIds.has(anno.sourceAnnotationId)
            ) {
                return false;
            }
            // The one being edited is drawn by the editor, not here.
            return anno.sourceAnnotationId !== activeEditAnnotationId;
        }),
    );

    /**
     * Canvas/image dimensions per canvas on screen, for the annotations whose
     * targets are in image space.
     *
     * A map rather than one canvas's numbers: the canvases on screen are not all
     * the same size, and a spread's two pages may declare different image
     * dimensions. Built once per change of the visible set rather than per frame —
     * it walks the manifest's canvas list, which an 800-folio manifest makes
     * expensive enough to matter.
     */
    const imageDimensionsByCanvas = $derived.by(() => {
        // A plain Map, deliberately: it is built fresh inside a `$derived` and
        // never mutated afterwards, so there is nothing for a reactive Map to
        // notice — the derivation itself is the notification.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const byCanvas = new Map<string, CanvasImageSpaceDimensions>();
        const manifestId = viewerState.manifestId;
        if (!manifestId || canvasAnnotations.length === 0) return byCanvas;

        const wanted = new Set(
            canvasAnnotations.map((entry) => entry.canvasId),
        );
        for (const canvas of viewerState.getCanvases(manifestId)) {
            // Raw IIIF Canvas JSON: `id` in v3, `@id` in v2.
            const id = (canvas as any)?.id || (canvas as any)?.['@id'];
            if (!id || !wanted.has(id)) continue;

            const resolved = resolveCanvasImage(canvas);
            if (
                !resolved ||
                typeof resolved.resourceWidth !== 'number' ||
                typeof resolved.resourceHeight !== 'number'
            ) {
                continue;
            }

            byCanvas.set(id, {
                canvasWidth: resolved.canvasWidth,
                canvasHeight: resolved.canvasHeight,
                imageWidth: resolved.resourceWidth,
                imageHeight: resolved.resourceHeight,
            });
        }

        return byCanvas;
    });

    /**
     * Where every shown shape is, in surface-local CSS pixels.
     *
     * Re-projected on the frame tick, and on `rendererReady` so the shapes
     * appear as soon as a renderer can answer where the canvas is rather than at
     * the next viewport movement.
     */
    const shapes: AnnotationShape[] = $derived.by(() => {
        void frameTick;
        void viewerState.rendererReady;

        if (shownAnnotations.length === 0) return [];

        return projectAnnotationShapes(shownAnnotations, {
            // Each shape through ITS canvas. A canvas the renderer has not laid
            // out answers `null` and the shape is dropped rather than drawn at
            // another page's offset.
            toScreen: (point, canvasId) =>
                viewerState.canvasToScreen(point, canvasId ?? undefined),
            imageDimensions: (canvasId) =>
                (canvasId && imageDimensionsByCanvas.get(canvasId)) || null,
        });
    });

    function isEditableShape(shape: AnnotationShape): boolean {
        return annotationEditorOpen && !shape.isSearchHit;
    }

    /**
     * Whether a shape is drawn at all this frame.
     *
     * A full-canvas annotation's target IS the page, so it has no box worth
     * outlining: it is drawn only while something is pointing at it — its panel
     * row hovered, or the annotation selected — and otherwise a page-sized
     * rectangle would sit over the whole image permanently.
     */
    function isShapeDrawn(shape: AnnotationShape): boolean {
        return (
            !shape.isFullCanvasTarget ||
            viewerState.hoveredAnnotationId === shape.annotationId ||
            viewerState.activeAnnotationId === shape.annotationId
        );
    }

    /**
     * Whether a tap on a shape may select it.
     *
     * Everything but a full-canvas target, which is deliberately unselectable
     * from the image: its box answers every tap anywhere on the canvas,
     * including the ones that mean "clear the selection". It stays reachable
     * from the annotation panel, which is where a whole-page note belongs.
     */
    function isTappableShape(shape: AnnotationShape): boolean {
        return !shape.isFullCanvasTarget;
    }

    /** Whether a shape is the selected annotation's. */
    function isActiveShape(shape: AnnotationShape): boolean {
        return viewerState.activeAnnotationId === shape.annotationId;
    }

    function shouldShowShapeTooltip(shape: AnnotationShape): boolean {
        return (
            !shape.isSearchHit && !shape.isFullCanvasTarget && !!shape.tooltip
        );
    }

    function requestAnnotationEdit(
        annotationId: string,
        event: MouseEvent | KeyboardEvent,
    ) {
        // The editor accepts edit requests whenever it is open, however it is
        // hosted — read the open state from its toolbar button.
        if (!annotationEditorOpen) return;

        event.stopPropagation();
        viewerState.annotationEditBus.requestEdit(annotationId);
        window.dispatchEvent(
            new CustomEvent(REQUEST_EDIT_EVENT, {
                detail: { annotationId },
            }),
        );
    }

    function handleShapeKeydown(annotationId: string, event: KeyboardEvent) {
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        requestAnnotationEdit(annotationId, event);
    }

    function getTooltipSide(clientX: number, clientY: number) {
        if (clientY < 72) return 'bottom';
        if (clientX > window.innerWidth - 160) return 'left';
        if (clientX < 160) return 'right';
        return 'top';
    }

    /**
     * A read-only shape's hover state, hit-tested against the projected geometry.
     *
     * Read-only shapes take no pointer events — a drag that starts over one must
     * still pan the image — so `:hover` cannot do this. The test runs against the
     * same numbers the shapes were positioned from, which is also why it needs no
     * layout read: `getBoundingClientRect` per pointer move over an annotation is
     * exactly what the overlay-performance journey measures.
     */
    function updateReadonlyTooltip(event: PointerEvent) {
        if (!root || !isOverRenderer(event.target)) {
            readonlyTooltip = null;
            return;
        }

        const bounds = root.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;

        // Last first: the topmost shape wins, which is the one a click would
        // have reached.
        const hovered = [...shapes]
            .reverse()
            .find(
                (shape) =>
                    !isEditableShape(shape) &&
                    shouldShowShapeTooltip(shape) &&
                    shapeContainsPoint(shape, x, y, pointMarkerSize),
            );

        if (!hovered) {
            readonlyTooltip = null;
            return;
        }

        readonlyTooltip = {
            id: hovered.id,
            text: hovered.tooltip,
            x: Math.min(Math.max(event.clientX, 16), window.innerWidth - 16),
            y: Math.min(
                Math.max(event.clientY - 10, 16),
                window.innerHeight - 16,
            ),
            side: getTooltipSide(event.clientX, event.clientY),
        };
    }

    function clearReadonlyTooltip() {
        readonlyTooltip = null;
    }

    /**
     * The renderer's own root: the element the image surface fills. It contains
     * neither the toolbar, the canvas-nav chrome, nor an error cover.
     */
    const RENDERER_ROOT = '.renderer-root';

    /**
     * Whether a pointer event happened over the image, rather than over some
     * other part of the stage.
     *
     * The listeners below are on the stage, because the overlay itself takes no
     * pointer events and the shapes must not swallow a pan — but the stage holds
     * the toolbar, the canvas-nav chrome, and the error covers too, and hovering
     * a toolbar button that happens to sit over an annotation must not pop the
     * annotation's tooltip. The previous renderer's own handler was on its own
     * root, the renderer only, and this is what keeps that scope while still
     * hearing the events by bubbling.
     *
     * Asked per event rather than resolved once on mount deliberately: the
     * renderer element unmounts and remounts (a manifest change, a tile-source
     * error cover taking its place), and a listener bound to the node that was
     * there at mount would go quiet after the first such swap.
     */
    function isOverRenderer(target: EventTarget | null): boolean {
        return target instanceof Element && !!target.closest(RENDERER_ROOT);
    }

    /** Whether anything is drawn at all — see the subscription below. */
    const hasShapes = $derived(shownAnnotations.length > 0);

    $effect(() => {
        // The frame cadence, subscribed to the VIEWER rather than to a renderer
        // instance: a renderer that mounts, remounts, or is swapped for the other
        // one keeps this working with no rebinding here.
        //
        // Subscribed only while there is a shape to move. A viewer with no
        // annotations — or with all of them hidden — must not wake anything per
        // frame, and `subscribeFrame` detaches from the renderer entirely once
        // its last listener leaves, so an idle overlay costs the frame loop
        // nothing at all. Keyed on a BOOLEAN rather than on the count, so
        // toggling one annotation does not resubscribe.
        if (!hasShapes) return;
        return viewerState.subscribeFrame(() => {
            frameTick += 1;
        });
    });

    onMount(() => {
        /*
         * Pointer tracking for the read-only tooltip, heard on the stage element
         * this overlay shares with the renderer and NARROWED to the renderer by
         * `isOverRenderer`.
         *
         * The overlay itself is `pointer-events: none` (only the editable
         * buttons opt back in), so a listener on its own root would never fire,
         * and the renderer's root is a sibling rather than an ancestor — the
         * stage is the nearest element both are inside. Listening there and
         * testing the target is what reproduces the scope the previous
         * renderer's own root handler had: the stage also holds the toolbar, the
         * canvas-nav chrome, and the error covers, and hovering one of those
         * must not pop an annotation's tooltip.
         */
        const stage = root?.parentElement ?? null;
        stage?.addEventListener('pointermove', updateReadonlyTooltip);
        stage?.addEventListener('pointerleave', clearReadonlyTooltip);

        return () => {
            stage?.removeEventListener('pointermove', updateReadonlyTooltip);
            stage?.removeEventListener('pointerleave', clearReadonlyTooltip);
        };
    });
</script>

<!--
    One element per shape, positioned in surface-local CSS pixels.

    Editable shapes are real `<button>`s with an accessible name and Enter/Space
    activation; read-only ones are inert, unfocusable, and take no pointer events
    so a pan can start on top of them. A full-canvas annotation has no meaningful
    box, so it is drawn only while its panel row is hovered.
-->
<div bind:this={root} class="anno-shape-layer" data-testid="annotation-shapes">
    {#each shapes as shape (shape.id)}
        {#if isShapeDrawn(shape)}
            {#if shape.type === 'RECTANGLE'}
                {#if isEditableShape(shape)}
                    <button
                        type="button"
                        id="annotation-visual-{shape.id}"
                        data-annotation-id={shape.annotationId}
                        class="anno-rect"
                        class:tooltip={shouldShowShapeTooltip(shape)}
                        class:tooltip-primary={shouldShowShapeTooltip(shape)}
                        class:search-hit={shape.isSearchHit}
                        class:active={isActiveShape(shape)}
                        data-tip={shouldShowShapeTooltip(shape)
                            ? shape.tooltip
                            : undefined}
                        aria-label={shape.tooltip}
                        style:left="{shape.rect.x}px"
                        style:top="{shape.rect.y}px"
                        style:width="{shape.rect.width}px"
                        style:height="{shape.rect.height}px"
                        onclick={(event) =>
                            requestAnnotationEdit(shape.annotationId, event)}
                        onkeydown={(event) =>
                            handleShapeKeydown(shape.annotationId, event)}
                    ></button>
                {:else}
                    <div
                        id="annotation-visual-{shape.id}"
                        data-annotation-id={shape.annotationId}
                        class="anno-readonly-wrap"
                        style:left="{shape.rect.x}px"
                        style:top="{shape.rect.y}px"
                        style:width="{shape.rect.width}px"
                        style:height="{shape.rect.height}px"
                    >
                        <div
                            class="anno-rect-fill"
                            class:search-hit={shape.isSearchHit}
                            class:hovered={readonlyTooltip?.id === shape.id}
                            class:active={isActiveShape(shape)}
                        ></div>
                    </div>
                {/if}
            {:else if shape.type === 'POLYGON'}
                {#if isEditableShape(shape)}
                    <button
                        type="button"
                        id="annotation-visual-{shape.id}"
                        data-annotation-id={shape.annotationId}
                        class="anno-polygon-btn"
                        class:tooltip={shouldShowShapeTooltip(shape)}
                        class:tooltip-primary={shouldShowShapeTooltip(shape)}
                        data-tip={shouldShowShapeTooltip(shape)
                            ? shape.tooltip
                            : undefined}
                        aria-label={shape.tooltip}
                        style:left="{shape.bounds.x}px"
                        style:top="{shape.bounds.y}px"
                        style:width="{shape.bounds.width}px"
                        style:height="{shape.bounds.height}px"
                        onclick={(event) =>
                            requestAnnotationEdit(shape.annotationId, event)}
                        onkeydown={(event) =>
                            handleShapeKeydown(shape.annotationId, event)}
                    >
                        <svg class="anno-polygon-svg">
                            <polygon
                                points={shape.points
                                    .map((point) => point.join(','))
                                    .join(' ')}
                                class="anno-polygon-shape interactive"
                                class:search-hit={shape.isSearchHit}
                                class:active={isActiveShape(shape)}
                                stroke-width="2"
                            />
                        </svg>
                    </button>
                {:else}
                    <div
                        id="annotation-visual-{shape.id}"
                        data-annotation-id={shape.annotationId}
                        class="anno-readonly-wrap"
                        style:left="{shape.bounds.x}px"
                        style:top="{shape.bounds.y}px"
                        style:width="{shape.bounds.width}px"
                        style:height="{shape.bounds.height}px"
                    >
                        <svg class="anno-polygon-svg readonly">
                            <polygon
                                points={shape.points
                                    .map((point) => point.join(','))
                                    .join(' ')}
                                class="anno-polygon-shape"
                                class:search-hit={shape.isSearchHit}
                                class:hovered={readonlyTooltip?.id === shape.id}
                                class:active={isActiveShape(shape)}
                                stroke-width="2"
                            />
                        </svg>
                    </div>
                {/if}
            {:else if shape.type === 'POINT'}
                {#if isEditableShape(shape)}
                    <button
                        type="button"
                        id="annotation-visual-{shape.id}"
                        data-annotation-id={shape.annotationId}
                        class="anno-point"
                        class:tooltip={shouldShowShapeTooltip(shape)}
                        class:tooltip-primary={shouldShowShapeTooltip(shape)}
                        class:search-hit={shape.isSearchHit}
                        class:active={isActiveShape(shape)}
                        data-tip={shouldShowShapeTooltip(shape)
                            ? shape.tooltip
                            : undefined}
                        aria-label={shape.tooltip}
                        style:left="{shape.point.x - pointMarkerSize / 2}px"
                        style:top="{shape.point.y - pointMarkerSize / 2}px"
                        style:width="{pointMarkerSize}px"
                        style:height="{pointMarkerSize}px"
                        onclick={(event) =>
                            requestAnnotationEdit(shape.annotationId, event)}
                        onkeydown={(event) =>
                            handleShapeKeydown(shape.annotationId, event)}
                    ></button>
                {:else}
                    <div
                        id="annotation-visual-{shape.id}"
                        data-annotation-id={shape.annotationId}
                        class="anno-readonly-wrap"
                        style:left="{shape.point.x - pointMarkerSize / 2}px"
                        style:top="{shape.point.y - pointMarkerSize / 2}px"
                        style:width="{pointMarkerSize}px"
                        style:height="{pointMarkerSize}px"
                    >
                        <div
                            class="anno-point-fill"
                            class:search-hit={shape.isSearchHit}
                            class:hovered={readonlyTooltip?.id === shape.id}
                            class:active={isActiveShape(shape)}
                        ></div>
                    </div>
                {/if}
            {/if}
        {/if}
    {/each}
</div>

{#if readonlyTooltip}
    <div
        class="tooltip tooltip-open tooltip-primary readonly-tooltip"
        class:place-top={readonlyTooltip.side === 'top'}
        class:place-bottom={readonlyTooltip.side === 'bottom'}
        class:place-left={readonlyTooltip.side === 'left'}
        class:place-right={readonlyTooltip.side === 'right'}
        data-tip={readonlyTooltip.text}
        aria-hidden="true"
        style="left: {readonlyTooltip.x}px; top: {readonlyTooltip.y}px; width: 0; height: 0;"
    ></div>
{/if}

<style>
    /* Color tokens used by annotation overlays */
    .anno-rect,
    .anno-readonly-wrap,
    .anno-rect-fill,
    .anno-point,
    .anno-point-fill,
    .anno-polygon-shape {
        --anno-red: oklch(63.7% 0.237 25.331);
        --anno-yellow: oklch(85.2% 0.199 91.936);
    }

    /*
     * The layer covers the stage and takes no input of its own: the shapes are
     * positioned in surface-local coordinates, and a reader must still be able to
     * pan and zoom from anywhere on the image — including from over an
     * annotation. The editable shapes opt back in individually.
     */
    .anno-shape-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    /* Shared transition for annotation color changes (transition-colors) */
    .anno-rect,
    .anno-rect-fill,
    .anno-point,
    .anno-point-fill,
    .anno-polygon-shape {
        transition-property:
            color, background-color, border-color, text-decoration-color, fill,
            stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }

    /*
     * The SELECTED shape, in the visual vocabulary the overlay already has:
     * the same deepened fill that says "the pointer is on this one", made
     * permanent, plus a heavier border.
     *
     * Deliberately no new indicator here. What says WHICH annotation is selected
     * is the connector line to its panel row and the marked row itself, and both
     * of those carry their own contrast; a third affordance over the image would
     * be a third thing to keep legible against arbitrary pixels.
     */
    .anno-rect.active,
    .anno-rect-fill.active,
    .anno-point.active,
    .anno-point-fill.active {
        border-width: 3px;
    }

    .anno-rect.active,
    .anno-rect-fill.active {
        background-color: color-mix(in oklab, var(--anno-red) 40%, transparent);
    }

    .anno-rect.active.search-hit,
    .anno-rect-fill.active.search-hit {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 60%,
            transparent
        );
    }

    .anno-polygon-shape.active {
        fill: color-mix(in oklab, var(--anno-red) 40%, transparent);
        stroke-width: 3;
    }

    .anno-polygon-shape.active.search-hit {
        fill: color-mix(in oklab, var(--anno-yellow) 60%, transparent);
    }

    /* Editable rectangle overlay (a real <button>) */
    .anno-rect {
        position: absolute;
        border-width: 2px;
        border-style: solid;
        cursor: pointer;
        pointer-events: auto;
        border-color: var(--anno-red);
        background-color: color-mix(in oklab, var(--anno-red) 20%, transparent);
    }
    .anno-rect.search-hit {
        border-color: var(--anno-yellow);
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 40%,
            transparent
        );
    }
    .anno-rect:hover {
        background-color: color-mix(in oklab, var(--anno-red) 40%, transparent);
    }
    .anno-rect.search-hit:hover {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 60%,
            transparent
        );
    }

    /* Read-only overlay wrapper (positions the fill) */
    .anno-readonly-wrap {
        position: absolute;
        pointer-events: none;
    }

    /* Read-only rectangle fill */
    .anno-rect-fill {
        pointer-events: none;
        position: absolute;
        inset: 0;
        border-width: 2px;
        border-style: solid;
        border-color: var(--anno-red);
        background-color: color-mix(in oklab, var(--anno-red) 20%, transparent);
    }
    .anno-rect-fill.hovered {
        background-color: color-mix(in oklab, var(--anno-red) 40%, transparent);
    }
    .anno-rect-fill.search-hit {
        border-color: var(--anno-yellow);
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 40%,
            transparent
        );
    }
    .anno-rect-fill.search-hit.hovered {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 60%,
            transparent
        );
    }

    /* Editable polygon overlay (a real <button>) */
    .anno-polygon-btn {
        position: absolute;
        pointer-events: auto;
        border-width: 0;
        background-color: transparent;
        padding: 0;
    }

    .anno-polygon-svg {
        position: absolute;
        inset: 0;
        height: 100%;
        width: 100%;
    }
    .anno-polygon-svg.readonly {
        pointer-events: none;
    }

    .anno-polygon-shape {
        fill: color-mix(in oklab, var(--anno-red) 20%, transparent);
        stroke: var(--anno-red);
    }
    .anno-polygon-shape.search-hit {
        fill: color-mix(in oklab, var(--anno-yellow) 40%, transparent);
        stroke: var(--anno-yellow);
    }
    .anno-polygon-shape.hovered {
        fill: color-mix(in oklab, var(--anno-red) 40%, transparent);
    }
    .anno-polygon-shape.search-hit.hovered {
        fill: color-mix(in oklab, var(--anno-yellow) 60%, transparent);
    }
    .anno-polygon-shape.interactive {
        cursor: pointer;
    }
    .anno-polygon-shape.interactive:hover {
        fill: color-mix(in oklab, var(--anno-red) 40%, transparent);
    }
    .anno-polygon-shape.interactive.search-hit:hover {
        fill: color-mix(in oklab, var(--anno-yellow) 60%, transparent);
    }

    /* Editable point overlay (a real <button>) */
    .anno-point {
        position: absolute;
        border-radius: calc(infinity * 1px);
        border-width: 2px;
        border-style: solid;
        cursor: pointer;
        pointer-events: auto;
        border-color: var(--anno-red);
        background-color: var(--anno-red);
    }
    .anno-point.search-hit {
        border-color: var(--anno-yellow);
        background-color: var(--anno-yellow);
    }
    .anno-point:hover {
        background-color: color-mix(in oklab, var(--anno-red) 80%, transparent);
    }
    .anno-point.search-hit:hover {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 80%,
            transparent
        );
    }

    /* Read-only point fill */
    .anno-point-fill {
        pointer-events: none;
        position: absolute;
        inset: 0;
        border-radius: calc(infinity * 1px);
        border-width: 2px;
        border-style: solid;
        border-color: var(--anno-red);
        background-color: var(--anno-red);
    }
    .anno-point-fill.hovered {
        background-color: color-mix(in oklab, var(--anno-red) 80%, transparent);
    }
    .anno-point-fill.search-hit {
        border-color: var(--anno-yellow);
        background-color: var(--anno-yellow);
    }
    .anno-point-fill.search-hit.hovered {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 80%,
            transparent
        );
    }

    /* Fixed read-only tooltip anchor */
    .readonly-tooltip {
        position: fixed;
        z-index: 50;
        pointer-events: none;
    }

    /* Tooltip styling (matches src/lib/components/ui/Tooltip.svelte) */
    .tooltip {
        --tt-bg: var(--tri-color-neutral);
        --tt-fg: var(--tri-color-neutral-content);
        --tt-off: calc(100% + 0.5rem);
        --tt-tail: calc(100% + 1px + 0.25rem);
        display: inline-block;
        position: relative;
    }

    .tooltip-primary {
        --tt-bg: var(--tri-color-primary);
        --tt-fg: var(--tri-color-primary-content);
    }

    .tooltip[data-tip]:not([data-tip=''])::before {
        border-radius: var(--tri-radius-buttons);
        text-align: center;
        white-space: normal;
        max-width: 20rem;
        color: var(--tt-fg);
        opacity: 0;
        background-color: var(--tt-bg);
        pointer-events: none;
        z-index: 2;
        content: attr(data-tip);
        width: max-content;
        padding-block: 0.25rem;
        padding-inline: 0.5rem;
        font-size: 0.875rem;
        line-height: 1.25;
        position: absolute;
    }

    .tooltip[data-tip]:not([data-tip=''])::after {
        opacity: 0;
        background-color: var(--tt-bg);
        content: '';
        pointer-events: none;
        --mask-tooltip: url("data:image/svg+xml,%3Csvg width='10' height='4' viewBox='0 0 8 4' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0.500009 1C3.5 1 3.00001 4 5.00001 4C7 4 6.5 1 9.5 1C10 1 10 0.499897 10 0H0C-1.99338e-08 0.5 0 1 0.500009 1Z' fill='black'/%3E%3C/svg%3E%0A");
        width: 0.625rem;
        height: 0.25rem;
        mask-position: -1px 0;
        mask-repeat: no-repeat;
        mask-image: var(--mask-tooltip);
        display: block;
        position: absolute;
    }

    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]::before,
        .tooltip[data-tip]::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms,
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms;
        }
    }

    .tooltip[data-tip]:not([data-tip='']):hover::before,
    .tooltip[data-tip]:not([data-tip='']):hover::after,
    .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::before,
    .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::after,
    .tooltip-open[data-tip]:not([data-tip=''])::before,
    .tooltip-open[data-tip]:not([data-tip=''])::after {
        opacity: 1;
        --tt-pos: 0rem;
    }
    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]:not([data-tip='']):hover::before,
        .tooltip[data-tip]:not([data-tip='']):hover::after,
        .tooltip[data-tip]:not([data-tip='']):has(
                :global(:focus-visible)
            )::before,
        .tooltip[data-tip]:not([data-tip='']):has(
                :global(:focus-visible)
            )::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
    }

    /* Default placement is top (when no side specified) */
    .tooltip::before,
    .tooltip.place-top::before {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-off) 50%;
    }
    .tooltip::after,
    .tooltip.place-top::after {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-tail) 50%;
    }
    .tooltip.place-bottom::before {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) auto auto 50%;
    }
    .tooltip.place-bottom::after {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem))
            rotate(180deg);
        inset: var(--tt-tail) auto auto 50%;
    }
    .tooltip.place-left::before {
        transform: translateX(calc(var(--tt-pos, 0.25rem) - 0.25rem))
            translateY(-50%);
        inset: 50% var(--tt-off) auto auto;
    }
    .tooltip.place-left::after {
        transform: translateX(var(--tt-pos, 0.25rem)) translateY(-50%)
            rotate(-90deg);
        inset: 50% calc(var(--tt-tail) + 1px) auto auto;
    }
    .tooltip.place-right::before {
        transform: translateX(calc(var(--tt-pos, -0.25rem) + 0.25rem))
            translateY(-50%);
        inset: 50% auto auto var(--tt-off);
    }
    .tooltip.place-right::after {
        transform: translateX(var(--tt-pos, -0.25rem)) translateY(-50%)
            rotate(90deg);
        inset: 50% auto auto calc(var(--tt-tail) + 1px);
    }
</style>
