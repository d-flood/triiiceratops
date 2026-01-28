<script lang="ts">
    import { getContext } from 'svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';

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

    // Helper to get ID from annotation object
    function getAnnotationId(anno: any): string {
        return (
            anno.id ||
            anno['@id'] ||
            (typeof anno.getId === 'function' ? anno.getId() : '') ||
            ''
        );
    }

    // Effect to initialize visibility when annotations load
    $effect(() => {
        // When annotations array changes (e.g. canvas change)
        if (annotations.length > 0) {
            const shouldBeVisible =
                viewerState.config.annotations?.visible ?? true;

            viewerState.visibleAnnotationIds.clear();
            if (shouldBeVisible) {
                annotations.forEach((a: any) => {
                    const id = getAnnotationId(a);
                    if (id) viewerState.visibleAnnotationIds.add(id);
                });
            }
        } else {
            viewerState.visibleAnnotationIds.clear();
        }
    });

    // Connecting line logic
    let toolbarContainer: HTMLElement | undefined = $state();
    let lineCoords: { x1: number; y1: number; x2: number; y2: number } | null =
        $state(null);

    $effect(() => {
        if (!viewerState.hoveredAnnotationId) {
            lineCoords = null;
            return;
        }

        const updateCoords = () => {
            let root: Document | ShadowRoot = document;
            if (toolbarContainer) {
                const node = toolbarContainer.getRootNode();
                if (node instanceof Document || node instanceof ShadowRoot) {
                    root = node;
                }
            }

            // Note: The list item ID is now in AnnotationPanel, which must be rendered for this to work
            const listItem = root.getElementById(
                `annotation-list-item-${viewerState.hoveredAnnotationId}`,
            );
            const visual = root.getElementById(
                `annotation-visual-${viewerState.hoveredAnnotationId}`,
            );

            if (listItem && visual) {
                const listRect = listItem.getBoundingClientRect();
                const visualRect = visual.getBoundingClientRect();

                // Determine start point based on panel position (left or right)
                // We can heuristic this: if list is on right half of screen, connect to its left edge.
                // If list is on left half, connect to its right edge.
                const isRightPanel = listRect.left > window.innerWidth / 2;

                let startX, startY, endX, endY;

                if (isRightPanel) {
                    // Panel is on right, connect from left edge of list item
                    startX = listRect.left;
                    startY = listRect.top + listRect.height / 2;

                    // Connect to right edge of visual
                    endX = visualRect.right;
                    endY = visualRect.top + visualRect.height / 2;
                } else {
                    // Panel is on left, connect from right edge of list item
                    startX = listRect.right;
                    startY = listRect.top + listRect.height / 2;

                    // Connect to left edge of visual
                    endX = visualRect.left;
                    endY = visualRect.top + visualRect.height / 2;
                }

                endX = visualRect.left + visualRect.width / 2;
                endY = visualRect.top + visualRect.height / 2;

                lineCoords = { x1: startX, y1: startY, x2: endX, y2: endY };
            } else {
                lineCoords = null;
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

{#if lineCoords}
    <svg
        class="fixed inset-0 z-50 pointer-events-none drop-shadow-md text-primary"
        style="width: 100vw; height: 100vh;"
    >
        <line
            x1={lineCoords.x1}
            y1={lineCoords.y1}
            x2={lineCoords.x2}
            y2={lineCoords.y2}
            stroke="currentColor"
            stroke-width="2"
        />
        <!-- Optional: Dots at ends -->
        <circle
            cx={lineCoords.x1}
            cy={lineCoords.y1}
            r="3"
            fill="currentColor"
        />
        <circle
            cx={lineCoords.x2}
            cy={lineCoords.y2}
            r="3"
            fill="currentColor"
        />
    </svg>
{/if}

<!-- Hidden element to capture root node context if needed, though document.getElementById usually works globally -->
<div bind:this={toolbarContainer} class="hidden"></div>
