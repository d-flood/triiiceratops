<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { isFullCanvasAnnotation } from '../utils/annotationAdapter';
    import { collectCanvasAnnotations } from '../utils/canvasAnnotations';
    import { getAnnotationId } from '../utils/iiifIds';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    /**
     * Every annotation on every canvas on screen — the same collection the panel
     * lists and the shape overlay draws, so a connector can join a row to a shape
     * on a facing page as readily as on the current one.
     */
    let annotations = $derived(
        collectCanvasAnnotations({
            manifestId: viewerState.manifestId,
            canvasIds: viewerState.annotatableCanvasIds,
            getAnnotations: (manifestId, canvasId) =>
                viewerState.getAnnotations(manifestId, canvasId),
            searchAnnotations: viewerState.searchAnnotations,
        }).flatMap((entry) => entry.annotations),
    );

    let toggleableAnnotationIds = $derived.by(() => {
        return annotations
            .filter((anno: any) => !anno.isSearchHit)
            .map((anno: any) => getAnnotationId(anno))
            .filter(Boolean);
    });

    function escapeAttributeValue(value: string): string {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }

        return value.replace(/(["\\])/g, '\\$1');
    }

    /**
     * While the reader has not touched visibility themselves, everything on
     * screen is shown — including annotations on a canvas that has only just
     * scrolled into view, or the facing page of a spread just turned to.
     *
     * Keyed on "is anything on screen still not in the set" rather than on the set
     * being empty, which is what the previous guard tested. That guard ran once
     * and never again, so in `paged` and `continuous` every canvas after the first
     * arrived hidden: shapes drawn nowhere, and rows whose eye claimed the reader
     * had hidden something they never touched. The condition settles because
     * `showVisibleCanvasAnnotations` adds exactly these ids.
     */
    $effect(() => {
        if (
            !viewerState.showAnnotations ||
            viewerState.annotationVisibilityTouched ||
            toggleableAnnotationIds.length === 0
        ) {
            return;
        }

        const allShown = toggleableAnnotationIds.every((id) =>
            viewerState.visibleAnnotationIds.has(id),
        );
        if (!allShown) {
            viewerState.showVisibleCanvasAnnotations();
        }
    });

    // Connecting line logic
    let toolbarContainer: HTMLElement | undefined = $state();
    let lines: { x1: number; y1: number; x2: number; y2: number }[] = $state(
        [],
    );

    /** Every connector as one path: a `M…L…` subpath per line. */
    let linePath = $derived(
        lines
            .map((line) => `M${line.x1} ${line.y1}L${line.x2} ${line.y2}`)
            .join(''),
    );

    /**
     * Every end dot as one path.
     *
     * A zero-length subpath, which SVG renders as a round cap when
     * `stroke-linecap: round` — a dot whose diameter is the stroke width, with no
     * `<circle>` per end.
     */
    let dotPath = $derived(
        lines
            .map(
                (line) =>
                    `M${line.x1} ${line.y1}L${line.x1} ${line.y1}` +
                    `M${line.x2} ${line.y2}L${line.x2} ${line.y2}`,
            )
            .join(''),
    );

    function isFullCanvas(annotationId: string): boolean {
        const annotation = annotations.find(
            (anno: any) => getAnnotationId(anno) === annotationId,
        );

        return annotation ? isFullCanvasAnnotation(annotation) : false;
    }

    /**
     * The annotations a connector is drawn for: the **selected** one and the
     * **hovered** one.
     *
     * Both, rather than one or the other. A selection persists — that is what
     * distinguishes it from a hover — so its line has to survive the pointer
     * moving away, while hovering another row must still preview where that one
     * is. When they are the same annotation there is one line, not two.
     *
     * A full-canvas annotation is excluded: its target is the whole page, so
     * there is no point on it to draw a line to.
     */
    let connectedAnnotationIds = $derived.by(() => {
        const ids: string[] = [];

        for (const id of [
            viewerState.activeAnnotationId,
            viewerState.hoveredAnnotationId,
        ]) {
            if (!id || ids.includes(id) || isFullCanvas(id)) continue;
            ids.push(id);
        }

        return ids;
    });

    $effect(() => {
        const connectedIds = connectedAnnotationIds;
        if (connectedIds.length === 0) {
            lines = [];
            return;
        }

        // Rebind observers if annotation display sync changes the rendered nodes
        // while the same annotation remains hovered.
        void annotations;
        void viewerState.visibleAnnotationIds.size;

        let root: Document | ShadowRoot = document;
        if (toolbarContainer) {
            const node = toolbarContainer.getRootNode();
            if (node instanceof Document || node instanceof ShadowRoot) {
                root = node;
            }
        }

        let frame: number | null = null;
        let observedElements: Element[] = [];

        const scheduleUpdate = () => {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                updateCoords();
            });
        };

        const resizeObserver = new ResizeObserver(scheduleUpdate);

        const observeElements = (elements: Element[]) => {
            if (
                elements.length === observedElements.length &&
                elements.every(
                    (element, index) => element === observedElements[index],
                )
            ) {
                return;
            }

            resizeObserver.disconnect();
            observedElements = elements;
            elements.forEach((element) => resizeObserver.observe(element));
        };

        function updateCoords() {
            // The viewer element decides which side of the image the panel is
            // on, and it is the same answer for every connector, so it is read
            // once here rather than per annotation.
            const viewerEl =
                (toolbarContainer &&
                    toolbarContainer.closest('#triiiceratops-viewer')) ||
                root.getElementById('triiiceratops-viewer');

            const next: typeof lines = [];
            const observed: Element[] = [];

            for (const annotationId of connectedIds) {
                // The list item ID lives in AnnotationPanel, which must be rendered for this to work.
                const listItem = root.getElementById(
                    `annotation-list-item-${annotationId}`,
                );
                const visuals = Array.from(
                    root.querySelectorAll<HTMLElement>(
                        `[data-annotation-id="${escapeAttributeValue(annotationId)}"]`,
                    ),
                );

                if (!listItem || visuals.length === 0) continue;

                const listRect = listItem.getBoundingClientRect();
                observed.push(listItem, ...visuals);

                let isRightPanel = false;
                if (viewerEl) {
                    const viewerRect = viewerEl.getBoundingClientRect();
                    const viewerCenter = viewerRect.left + viewerRect.width / 2;
                    isRightPanel =
                        listRect.left + listRect.width / 2 > viewerCenter;
                } else {
                    isRightPanel = listRect.left > window.innerWidth / 2;
                }

                // Panel on the right connects from the row's left edge, and
                // vice versa — the side facing the image.
                const startX = isRightPanel ? listRect.left : listRect.right;
                const startY = listRect.top + listRect.height / 2;

                for (const visual of visuals) {
                    const visualRect = visual.getBoundingClientRect();
                    next.push({
                        x1: startX,
                        y1: startY,
                        x2: visualRect.left + visualRect.width / 2,
                        y2: visualRect.top + visualRect.height / 2,
                    });
                }
            }

            observeElements(
                next.length > 0 && viewerEl
                    ? [...observed, viewerEl]
                    : observed,
            );
            lines = next;
        }

        updateCoords();

        root.addEventListener('scroll', scheduleUpdate, true);
        window.addEventListener('resize', scheduleUpdate);
        // The connector lines run from a panel row to a shape on the image, so
        // they have to be redrawn whenever the image moves. That is the `frame`
        // cadence exactly — the renderer's own animation events — rather than
        // this component knowing any renderer's event names. Unlike the old
        // binding it also survives a renderer mounting after the hover starts,
        // because the subscription is to the viewer, not to a renderer instance.
        const unsubscribeFrame = viewerState.subscribeFrame(scheduleUpdate);

        return () => {
            root.removeEventListener('scroll', scheduleUpdate, true);
            window.removeEventListener('resize', scheduleUpdate);
            unsubscribeFrame();
            resizeObserver.disconnect();
            if (frame !== null) cancelAnimationFrame(frame);
        };
    });
</script>

<!--
    Every connector is drawn TWICE: a wider casing pass first, then the line
    itself over it. See the casing note in the styles below — a single-colour line
    over an image has no contrast guarantee at all.

    FOUR elements, whatever the number of connectors: every line is a subpath of
    one `d`, and every end dot is a zero-length subpath of another, which SVG
    draws as a round cap. So a pan updates four attributes rather than
    re-rendering three elements per line per frame, and the markup does not carry
    a nested loop. The dots are drawn per line rather than once per panel row
    because two connectors may start from different rows (the selected annotation
    and the hovered one); where several coincide they are indistinguishable from
    one.
-->
{#if lines.length > 0}
    <svg class="connecting-lines" style="width: 100vw; height: 100vh;">
        <path class="casing-line" d={linePath} />
        <path class="casing-dot" d={dotPath} />
        <path class="ink-line" d={linePath} />
        <path class="ink-dot" d={dotPath} />
    </svg>
{/if}

<!-- Hidden element to capture root node context if needed, though document.getElementById usually works globally -->
<div bind:this={toolbarContainer} class="root-node-anchor"></div>

<style>
    .connecting-lines {
        position: fixed;
        inset: 0;
        z-index: 50;
        pointer-events: none;
        filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.12));
        color: var(--tri-color-primary-text);
    }

    .connecting-lines path {
        fill: none;
        stroke-linecap: round;
    }

    /*
     * TWO-TONE, and that is what makes the connector visible at all.
     *
     * It runs from a panel row across the IMAGE — arbitrary pixels, and with
     * `transparentBackground` set not even a known colour — so no pairing
     * against a token describes what is actually behind it. A single-colour line
     * over content nobody chose has no contrast guarantee, whatever colour it is;
     * a drop shadow softens the problem and does not solve it.
     *
     * So the line carries its own contrast, exactly as the image surface's focus
     * ring does (`CanvasHost.svelte`): the ink in `--tri-color-primary-text` over
     * a wider casing in `--tri-viewer-bg`, two tones that clear 3:1 AGAINST EACH
     * OTHER in all four themes. Whatever the image is doing underneath, one of
     * them stands off it. That pairing is carried by `pnpm test:contrast`, which
     * already gates it for the focus ring — the same pair, for the same reason.
     *
     * The ink stays the primary colour: the connector belongs to the annotation
     * panel, and this is the palette's legible-on-a-surface form of it, which is
     * also why it is the `-text` variant and not the raw fill token.
     */
    .casing-line,
    .casing-dot {
        stroke: var(--tri-viewer-bg);
    }

    .ink-line,
    .ink-dot {
        stroke: currentColor;
    }

    /*
     * The four widths, and the 2px of casing each pass leaves showing. A dot is a
     * round cap on a zero-length subpath, so its diameter IS its stroke width:
     * 6 for the 3px-radius dot, 10 for the same dot with its casing.
     */
    .casing-line {
        stroke-width: 6;
    }

    .ink-line {
        stroke-width: 2;
    }

    .casing-dot {
        stroke-width: 10;
    }

    .ink-dot {
        stroke-width: 6;
    }

    .root-node-anchor {
        display: none;
    }
</style>
