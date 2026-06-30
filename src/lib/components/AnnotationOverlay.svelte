<script lang="ts">
    import { getContext } from 'svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { isFullCanvasAnnotation } from '../utils/annotationAdapter';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let annotations = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return [];
        }
        const manifestAnnotations = manifestsState.getAnnotations(
            viewerState.manifestId,
            viewerState.canvasId,
        );
        // Add search hits for current canvas
        // These behave as ephemeral annotations
        const searchAnnotations = viewerState.currentCanvasSearchAnnotations;

        return [...manifestAnnotations, ...searchAnnotations];
    });

    let toggleableAnnotationIds = $derived.by(() => {
        return annotations
            .filter((anno: any) => !anno.isSearchHit)
            .map((anno: any) => getAnnotationId(anno))
            .filter(Boolean);
    });

    // Helper to get ID from annotation object
    function getAnnotationId(anno: any): string {
        return (
            anno.id ||
            anno['@id'] ||
            (typeof anno.getId === 'function' ? anno.getId() : '') ||
            ''
        );
    }

    function escapeAttributeValue(value: string): string {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }

        return value.replace(/(["\\])/g, '\\$1');
    }

    $effect(() => {
        if (
            !viewerState.showAnnotations ||
            viewerState.annotationVisibilityTouched ||
            viewerState.visibleAnnotationIds.size > 0
        ) {
            return;
        }

        if (toggleableAnnotationIds.length > 0) {
            viewerState.showCurrentCanvasAnnotations();
        }
    });

    // Connecting line logic
    let toolbarContainer: HTMLElement | undefined = $state();
    let lines: { x1: number; y1: number; x2: number; y2: number }[] = $state(
        [],
    );
    let hoveredAnnotationIsFullCanvas = $derived.by(() => {
        if (!viewerState.hoveredAnnotationId) {
            return false;
        }

        const hoveredAnnotation = annotations.find(
            (anno: any) =>
                getAnnotationId(anno) === viewerState.hoveredAnnotationId,
        );

        return hoveredAnnotation
            ? isFullCanvasAnnotation(hoveredAnnotation)
            : false;
    });

    $effect(() => {
        if (!viewerState.hoveredAnnotationId || hoveredAnnotationIsFullCanvas) {
            lines = [];
            return;
        }

        const updateCoords = () => {
            const hoveredAnnotationId = viewerState.hoveredAnnotationId;
            if (!hoveredAnnotationId) {
                lines = [];
                return;
            }

            let root: Document | ShadowRoot = document;
            if (toolbarContainer) {
                const node = toolbarContainer.getRootNode();
                if (node instanceof Document || node instanceof ShadowRoot) {
                    root = node;
                }
            }

            // Note: The list item ID is now in AnnotationPanel, which must be rendered for this to work
            const listItem = root.getElementById(
                `annotation-list-item-${hoveredAnnotationId}`,
            );
            const visuals = Array.from(
                root.querySelectorAll<HTMLElement>(
                    `[data-annotation-id="${escapeAttributeValue(hoveredAnnotationId)}"]`,
                ),
            );

            if (listItem && visuals.length > 0) {
                const listRect = listItem.getBoundingClientRect();

                // Determine start point based on panel position (left or right)
                // We find the viewer container's horizontal center to determine if the panel is on its left or right.
                const viewerEl =
                    (toolbarContainer &&
                        toolbarContainer.closest('#triiiceratops-viewer')) ||
                    root.getElementById('triiiceratops-viewer');
                let isRightPanel = false;
                if (viewerEl) {
                    const viewerRect = viewerEl.getBoundingClientRect();
                    const viewerCenter = viewerRect.left + viewerRect.width / 2;
                    isRightPanel =
                        listRect.left + listRect.width / 2 > viewerCenter;
                } else {
                    // Fallback to window-based heuristic if viewer element is not found
                    isRightPanel = listRect.left > window.innerWidth / 2;
                }

                let startX, startY;

                if (isRightPanel) {
                    // Panel is on right, connect from left edge of list item
                    startX = listRect.left;
                    startY = listRect.top + listRect.height / 2;
                } else {
                    // Panel is on left, connect from right edge of list item
                    startX = listRect.right;
                    startY = listRect.top + listRect.height / 2;
                }

                lines = visuals.map((visual) => {
                    const visualRect = visual.getBoundingClientRect();
                    const endX = visualRect.left + visualRect.width / 2;
                    const endY = visualRect.top + visualRect.height / 2;
                    return { x1: startX, y1: startY, x2: endX, y2: endY };
                });
            } else {
                lines = [];
            }
        };

        // Run immediately
        updateCoords();

        // Optional: Could add resize listener or interval if things move,
        // but for hover it might be enough to just set it once or on scroll
        const interval = setInterval(updateCoords, 16); // ~60fps follow

        return () => clearInterval(interval);
    });
</script>

{#if lines.length > 0}
    <svg
        class="connecting-lines"
        style="width: 100vw; height: 100vh;"
    >
        {#each lines as line, index (`${line.x1}:${line.y1}:${line.x2}:${line.y2}:${index}`)}
            <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="currentColor"
                stroke-width="2"
            />
            <!-- Dot at target end -->
            <circle cx={line.x2} cy={line.y2} r="3" fill="currentColor" />
        {/each}
        <!-- Dot at start (list item) end -->
        <circle cx={lines[0].x1} cy={lines[0].y1} r="3" fill="currentColor" />
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
        color: var(--color-primary);
    }

    .root-node-anchor {
        display: none;
    }
</style>
