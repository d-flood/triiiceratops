<script lang="ts">
    /**
     * The annotation **shape** overlay: the boxes, polygons, and points drawn on
     * the image itself. Distinct from `AnnotationOverlay.svelte`, which draws the
     * SVG connector lines between a panel row and the shapes here.
     */
    import { getContext, onMount } from 'svelte';

    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { parseAnnotations } from '../utils/annotationAdapter';
    import { isAnnotationEditorOpen } from '../utils/annotationEditing';
    import { collectCanvasAnnotations } from '../utils/canvasAnnotations';
    import {
        prepareAnnotationShapes,
        projectPreparedShapes,
        shapeContainsPoint,
        type AnnotationShape,
        type ScreenRect,
    } from '../utils/annotationShapes';
    import type { CanvasImageSpaceDimensions } from '../utils/canvasImageSpace';
    import { getCanvasId } from '../utils/iiifIds';
    import {
        DEFAULT_POINT_DIAMETER,
        observePointDiameter,
    } from '../utils/pointMarker';
    import { resolveCanvasImage } from '../utils/resolveCanvasImage';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    /**
     * The wrapper class each shape type wears when it is editable. Read-only
     * shapes all share `anno-readonly-wrap`, which positions a fill child; the
     * editable arm carries its own visual treatment on the button itself.
     */
    const EDITABLE_WRAPPER_CLASS: Record<AnnotationShape['type'], string> = {
        RECTANGLE: 'anno-rect',
        POLYGON: 'anno-polygon-btn',
        POINT: 'anno-point',
    };

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

    /**
     * Geometry comes from `ViewerState.canvasToScreen` and the redraw signal from
     * `ViewerState.subscribeFrame` — nothing here reaches into the renderer
     * directly. The frame listener runs inside the renderer's
     * `requestAnimationFrame` callback, and Svelte flushes on the microtask that
     * follows it, before the browser composites, so the shapes and the pixels
     * move together.
     *
     * Every editable shape is a real `<button>` with an accessible name and
     * Enter/Space activation, because canvas-drawn shapes have no focus, no
     * name, and no keyboard reach, and an automated accessibility scan cannot
     * notice their absence — the elements would simply not exist. Pixels may
     * move onto core's paint hook only while these targets stay in the DOM,
     * projected from the same geometry.
     */

    let readonlyTooltip = $state<{
        id: string;
        text: string;
        x: number;
        y: number;
        side: 'top' | 'bottom' | 'left' | 'right';
    } | null>(null);

    /**
     * Point marker diameter in screen pixels, resolved from the theme token so
     * the read-only overlay, the editor and the stylesheet cannot disagree.
     *
     * The layer is the probe's scope: it inherits the same tokens the shapes do,
     * so a host that sets the marker size on a subtree gets the size it asked
     * for and the hit test that goes with it.
     */
    let pointMarkerSize = $state(DEFAULT_POINT_DIAMETER);

    /** Attached to the layer, which inherits the tokens the shapes are drawn in. */
    const measureMarker = (node: HTMLElement) =>
        observePointDiameter(node, (diameter) => {
            pointMarkerSize = diameter;
        });

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
     */
    const annotationEditorOpen = $derived(
        isAnnotationEditorOpen(viewerState.pluginMenuButtons),
    );

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
                // A shape's tooltip is the annotation's body text, so it picks
                // a `Choice` body's item in the same locale the panel does.
                viewerState.activeLocale,
            ),
        ),
    );

    /**
     * The annotations that should have a shape at all — a question about viewer
     * state, and settled before any geometry is projected so a hidden annotation
     * costs no arithmetic per frame.
     */
    const shownAnnotations = $derived.by(() => {
        // Nothing is asking for annotations, so none are drawn — whatever is
        // still in the visibility set. The set is seeded by the annotations
        // panel and by an open editor, and neither clears it on the way out, so
        // without this a shape outlived the thing that put it on screen.
        if (!viewerState.showAnnotations && !annotationEditorOpen) return [];
        return parsedAnnotations.filter((anno) => {
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
        });
    });

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
            const id = getCanvasId(canvas);
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
     * Every shown annotation's tooltip text and canvas-space geometry.
     *
     * The half of a shape a pan or a zoom cannot change, so it is assembled here
     * — once per change of the shown set, their body text, the active locale or
     * the canvases' image dimensions — rather than inside the frame tick below.
     */
    const preparedShapes = $derived(
        prepareAnnotationShapes(
            shownAnnotations,
            (canvasId) =>
                (canvasId && imageDimensionsByCanvas.get(canvasId)) || null,
        ),
    );

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

        if (preparedShapes.length === 0) return [];

        // Each shape through ITS canvas. A canvas the renderer has not laid out
        // answers `null` and the shape is dropped rather than drawn at another
        // page's offset.
        return projectPreparedShapes(preparedShapes, (point, canvasId) =>
            viewerState.canvasToScreen(point, canvasId ?? undefined),
        );
    });

    /**
     * The box every shape type is positioned by, in surface-local CSS pixels.
     *
     * A point has no extent of its own: it is drawn at a fixed SCREEN size
     * centred on its projected position, so it stays the same size as the
     * reader zooms, where a rectangle and a polygon's bounds scale with the
     * image.
     */
    function shapeBox(shape: AnnotationShape): ScreenRect {
        if (shape.type === 'RECTANGLE') return shape.rect;
        if (shape.type === 'POLYGON') return shape.bounds;
        return {
            x: shape.point.x - pointMarkerSize / 2,
            y: shape.point.y - pointMarkerSize / 2,
            width: pointMarkerSize,
            height: pointMarkerSize,
        };
    }

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
    One element per shape, positioned in surface-local CSS pixels. A sibling of
    the renderer host in the viewer's stage element, so `canvasToScreen`'s
    surface-local CSS pixels are this overlay's own coordinates with no offset
    arithmetic; being a sibling also keeps it out of the renderer root's
    `role="application"` subtree, where these labels would be skipped by NVDA
    and JAWS. It comes AFTER the renderer in DOM order, so Tab reaches the
    picture before the things marked on it.

    Editable shapes are real `<button>`s with an accessible name and Enter/Space
    activation; read-only ones are inert, unfocusable, and take no pointer events
    so a pan can start on top of them. A full-canvas annotation has no meaningful
    box, so it is drawn only while its panel row is hovered.

    One element serves all three shape types: the wrapper's position, id,
    label, handlers and tooltip state are the same question for each, and only
    its class and its children differ. The a11y ignore below is for the
    editable/read-only pairing: the compiler cannot see which tag
    `<svelte:element>` resolves to, and the handlers exist only on the
    `<button>` arm — a read-only shape is a `div` with no handler at all.
-->
<div
    bind:this={root}
    class="anno-shape-layer"
    data-testid="annotation-shapes"
    {@attach measureMarker}
>
    {#each shapes as shape (shape.id)}
        {#if isShapeDrawn(shape)}
            {@const editable = isEditableShape(shape)}
            {@const tip = editable && shouldShowShapeTooltip(shape)}
            {@const hovered = !editable && readonlyTooltip?.id === shape.id}
            {@const active = isActiveShape(shape)}
            {@const box = shapeBox(shape)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <svelte:element
                this={editable ? 'button' : 'div'}
                type={editable ? 'button' : undefined}
                id="annotation-visual-{shape.id}"
                data-annotation-id={shape.annotationId}
                class={editable
                    ? EDITABLE_WRAPPER_CLASS[shape.type]
                    : 'anno-readonly-wrap'}
                class:tooltip={tip}
                class:tooltip-primary={tip}
                class:search-hit={editable &&
                    shape.type !== 'POLYGON' &&
                    shape.isSearchHit}
                class:active={editable && shape.type !== 'POLYGON' && active}
                data-tip={tip ? shape.tooltip : undefined}
                aria-label={editable ? shape.tooltip : undefined}
                style="left: {box.x}px; top: {box.y}px; width: {box.width}px; height: {box.height}px;"
                onclick={editable
                    ? (event: MouseEvent) =>
                          requestAnnotationEdit(shape.annotationId, event)
                    : undefined}
                onkeydown={editable
                    ? (event: KeyboardEvent) =>
                          handleShapeKeydown(shape.annotationId, event)
                    : undefined}
            >
                {#if shape.type === 'POLYGON'}
                    <svg class="anno-polygon-svg" class:readonly={!editable}>
                        <polygon
                            points={shape.points
                                .map((point) => point.join(','))
                                .join(' ')}
                            class="anno-polygon-shape"
                            class:interactive={editable}
                            class:search-hit={shape.isSearchHit}
                            class:hovered
                            class:active
                        />
                    </svg>
                {:else if !editable}
                    <div
                        class={shape.type === 'RECTANGLE'
                            ? 'anno-rect-fill'
                            : 'anno-point-fill'}
                        class:search-hit={shape.isSearchHit}
                        class:hovered
                        class:active
                    ></div>
                {/if}
            </svelte:element>
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
        style="position: fixed; left: {readonlyTooltip.x}px; top: {readonlyTooltip.y}px; width: 0; height: 0;"
    ></div>
{/if}

<style>
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

        /*
         * The three steps of the fill ladder, named once and inherited by every
         * shape below. A shape at rest carries the configured fill; one under
         * the pointer or selected, and a search hit at rest, carry twice it; a
         * search hit under the pointer three times. `min()` because the base is
         * a theme token and a host may set it high enough that three steps would
         * overrun a percentage.
         *
         * Private `--anno-*` names, not `--tri-*`: these are this layer's own
         * arithmetic rather than anything a theme author sets, and a base token
         * declared below the viewer root would shadow the root's theme for this
         * subtree.
         */
        --anno-fill-rest: var(--tri-annotation-fill-opacity);
        --anno-fill-hover: min(
            100%,
            calc(var(--tri-annotation-fill-opacity) * 2)
        );
        --anno-fill-most: min(
            100%,
            calc(var(--tri-annotation-fill-opacity) * 3)
        );
    }

    /*
     * No transition on any of these colours, deliberately.
     *
     * Every one of them is now `var(--tri-annotation-*)`, and a colour property
     * carrying a transition does not follow its custom property when that
     * property changes: the engine keeps the value it last transitioned to, so a
     * theme applied to a viewer with shapes already on screen repaints the ones
     * drawn after it and leaves the rest at the old hue. Measured in Chrome
     * across a plain `var()`, a `color-mix()` of one, and `fill` + `fill-opacity`
     * split apart; registering the property with `@property` does not help
     * either, and dropping the transition does.
     *
     * What it costs is the 150ms fade a shape used to make on hover and on
     * selection, which now snaps. That is the cheaper of the two: the fade was a
     * Tailwind-era `transition-colors` carried over with the rest, and a theme
     * that does not reach half the shapes on screen is a broken theme.
     */

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
        border-width: calc(var(--tri-annotation-border-width) + 1px);
    }

    .anno-rect.active,
    .anno-rect-fill.active {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-hover),
            transparent
        );
    }

    .anno-rect.active.search-hit,
    .anno-rect-fill.active.search-hit {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-most),
            transparent
        );
    }

    .anno-polygon-shape.active {
        fill: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-hover),
            transparent
        );
        stroke-width: calc(var(--tri-annotation-border-width) + 1px);
    }

    .anno-polygon-shape.active.search-hit {
        fill: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-most),
            transparent
        );
    }

    /* Editable rectangle overlay (a real <button>) */
    .anno-rect {
        position: absolute;
        border-width: var(--tri-annotation-border-width);
        border-style: solid;
        cursor: pointer;
        pointer-events: auto;
        border-color: var(--tri-annotation-color);
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-rest),
            transparent
        );
    }
    .anno-rect.search-hit {
        border-color: var(--tri-annotation-hit-color);
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-hover),
            transparent
        );
    }
    .anno-rect:hover {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-hover),
            transparent
        );
    }
    .anno-rect.search-hit:hover {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-most),
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
        border-width: var(--tri-annotation-border-width);
        border-style: solid;
        border-color: var(--tri-annotation-color);
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-rest),
            transparent
        );
    }
    .anno-rect-fill.hovered {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-hover),
            transparent
        );
    }
    .anno-rect-fill.search-hit {
        border-color: var(--tri-annotation-hit-color);
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-hover),
            transparent
        );
    }
    .anno-rect-fill.search-hit.hovered {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-most),
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
        fill: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-rest),
            transparent
        );
        stroke: var(--tri-annotation-color);
        stroke-width: var(--tri-annotation-border-width);
    }
    .anno-polygon-shape.search-hit {
        fill: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-hover),
            transparent
        );
        stroke: var(--tri-annotation-hit-color);
    }
    .anno-polygon-shape.hovered {
        fill: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-hover),
            transparent
        );
    }
    .anno-polygon-shape.search-hit.hovered {
        fill: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-most),
            transparent
        );
    }
    .anno-polygon-shape.interactive {
        cursor: pointer;
    }
    .anno-polygon-shape.interactive:hover {
        fill: color-mix(
            in oklab,
            var(--tri-annotation-color) var(--anno-fill-hover),
            transparent
        );
    }
    .anno-polygon-shape.interactive.search-hit:hover {
        fill: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) var(--anno-fill-most),
            transparent
        );
    }

    /* Editable point overlay (a real <button>) */
    .anno-point {
        position: absolute;
        border-radius: calc(infinity * 1px);
        border-width: var(--tri-annotation-border-width);
        border-style: solid;
        cursor: pointer;
        pointer-events: auto;
        border-color: var(--tri-annotation-color);
        background-color: var(--tri-annotation-color);
    }
    .anno-point.search-hit {
        border-color: var(--tri-annotation-hit-color);
        background-color: var(--tri-annotation-hit-color);
    }
    .anno-point:hover {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-color) 80%,
            transparent
        );
    }
    .anno-point.search-hit:hover {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) 80%,
            transparent
        );
    }

    /* Read-only point fill */
    .anno-point-fill {
        pointer-events: none;
        position: absolute;
        inset: 0;
        border-radius: calc(infinity * 1px);
        border-width: var(--tri-annotation-border-width);
        border-style: solid;
        border-color: var(--tri-annotation-color);
        background-color: var(--tri-annotation-color);
    }
    .anno-point-fill.hovered {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-color) 80%,
            transparent
        );
    }
    .anno-point-fill.search-hit {
        border-color: var(--tri-annotation-hit-color);
        background-color: var(--tri-annotation-hit-color);
    }
    .anno-point-fill.search-hit.hovered {
        background-color: color-mix(
            in oklab,
            var(--tri-annotation-hit-color) 80%,
            transparent
        );
    }

    /*
     * The read-only tooltip anchor.
     *
     * `position: fixed` is written INLINE on the element, not here, and that is
     * load-bearing. This element carries `.tooltip` as well, and that sheet sets
     * `position: relative` on it; the two live in separate stylesheets, so a
     * scoped rule here wins only while this component's own CSS actually
     * reaches the page. Where it does not, the anchor fell back to `relative`
     * and the coordinates below — which are VIEWPORT coordinates, from
     * `clientX`/`clientY` — were applied as offsets from its place in the flow,
     * putting the bubble a page-length away from the pointer.
     *
     * An inline declaration outranks every stylesheet, so the one property the
     * tooltip cannot be wrong about is the one property that no longer depends
     * on which sheet arrives.
     */
    .readonly-tooltip {
        z-index: 50;
        pointer-events: none;
    }

    /*
     * The bubble, tail, reveal and placements come from `src/styles/tooltip.css`.
     * This recolours them, so it has to outrank that sheet's `--tt-bg`/`--tt-fg`
     * on `.tooltip` — and BOTH classes sit on the same element.
     *
     * `.tooltip` qualifies the selector for that reason, and it is the whole
     * point of the rule. Svelte's scope class is not enough on its own: that
     * sheet is scoped in some pipelines too, and then `.tooltip.<scope>` and
     * `.tooltip-primary.<scope>` are both one class plus a scope class — a
     * specificity TIE, settled by whichever stylesheet was injected last, which
     * is not this file's to decide. Qualified, this is one class more specific
     * than the sheet it is recolouring and the order stops mattering.
     *
     * Nothing here restates that sheet's `position: relative`. A drawn shape IS
     * the tooltip — `.tooltip` goes on the shape rather than on a wrapper around
     * it — and every such element is already placed by a rule above. A scoped
     * `position` on `.tooltip` would outrank those and take the shape out of the
     * coordinate system its inline `left`/`top` are written in. The read-only
     * anchor, which needs `fixed` and lost exactly this tie, carries that one
     * property inline instead — see `.readonly-tooltip` above.
     */
    .tooltip.tooltip-primary {
        --tt-bg: var(--tri-color-primary);
        --tt-fg: var(--tri-color-primary-content);
    }
</style>
