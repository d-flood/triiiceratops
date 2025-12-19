<script lang="ts">
    import { getContext } from 'svelte';
    import CaretDown from 'phosphor-svelte/lib/CaretDown';
    import Eye from 'phosphor-svelte/lib/Eye';
    import EyeSlash from 'phosphor-svelte/lib/EyeSlash';
    import { manifestsState } from '../state/manifests.svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m } from '../state/i18n.svelte';
    import { extractBody } from '../utils/annotationAdapter';

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

            if (shouldBeVisible) {
                const newSet = new Set<string>();
                annotations.forEach((a: any) => {
                    const id = getAnnotationId(a);
                    if (id) newSet.add(id);
                });
                viewerState.visibleAnnotationIds = newSet;
            } else {
                viewerState.visibleAnnotationIds = new Set();
            }
        } else {
            viewerState.visibleAnnotationIds = new Set();
        }
    });

    // Derived state for "All Visible" status
    let isAllVisible = $derived.by(() => {
        if (annotations.length === 0) return false;
        return annotations.every((a: any) => {
            const id = getAnnotationId(a);
            return !id || viewerState.visibleAnnotationIds.has(id);
        });
    });

    function toggleAnnotation(id: string) {
        if (viewerState.visibleAnnotationIds.has(id)) {
            viewerState.visibleAnnotationIds.delete(id);
        } else {
            viewerState.visibleAnnotationIds.add(id);
        }
        // Reassign to trigger reactivity
        viewerState.visibleAnnotationIds = new Set(
            viewerState.visibleAnnotationIds,
        );
    }

    function toggleAllAnnotations() {
        if (isAllVisible) {
            // Hide all
            viewerState.visibleAnnotationIds = new Set();
        } else {
            // Show all
            const newSet = new Set<string>();
            annotations.forEach((a: any) => {
                const id = getAnnotationId(a);
                if (id) newSet.add(id);
            });
            viewerState.visibleAnnotationIds = newSet;
        }
    }

    // State for hovered annotation to draw connecting line
    let hoveredAnnotationId: string | null = $state(null);
    let toolbarContainer: HTMLElement | undefined = $state();

    // Calculate coordinates for connecting line
    let connectingLine = $derived.by(() => {
        if (!hoveredAnnotationId) return null;
        return null;
    });

    let lineCoords: { x1: number; y1: number; x2: number; y2: number } | null =
        $state(null);

    $effect(() => {
        if (!hoveredAnnotationId) {
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

            const listItem = root.getElementById(
                `annotation-list-item-${hoveredAnnotationId}`,
            );
            const visual = root.getElementById(
                `annotation-visual-${hoveredAnnotationId}`,
            );

            if (listItem && visual) {
                const listRect = listItem.getBoundingClientRect();
                const visualRect = visual.getBoundingClientRect();

                // Calculate connection points
                // List item: Left center
                const startX = listRect.left;
                const startY = listRect.top + listRect.height / 2;

                // Visual: Center of the annotation visual
                const endX = visualRect.left + visualRect.width / 2;
                const endY = visualRect.top + visualRect.height / 2;

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

    let renderedAnnotations = $derived.by(() => {
        if (!annotations.length) return [];

        return annotations.map((anno: any) => {
            const bodies = extractBody(anno);

            return {
                id: getAnnotationId(anno),
                bodies,
                label:
                    (typeof anno.getLabel === 'function'
                        ? anno.getLabel()
                        : anno.label) || '',
            };
        });
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

<!-- Unified Annotation Toolbar -->
{#if viewerState.showAnnotations}
    <div
        bind:this={toolbarContainer}
        class="absolute top-4 right-4 z-40 pointer-events-auto transition-all duration-300"
    >
        <!-- z-index increased for Leaflet (z-400 is map) -->
        <details class="group relative">
            <summary
                class="flex items-center gap-2 bg-base-200/90 backdrop-blur shadow-lg rounded-full px-4 py-2 cursor-pointer list-none hover:bg-base-200 transition-all select-none border border-base-300 pointer-events-auto"
            >
                <!-- Toggle Button -->
                <button
                    class="btn btn-xs btn-circle btn-ghost"
                    onclick={(e) => {
                        e.preventDefault();
                        toggleAllAnnotations();
                    }}
                    title={isAllVisible
                        ? m.hide_all_annotations()
                        : m.show_all_annotations()}
                >
                    {#if isAllVisible}
                        <Eye size={16} weight="bold" />
                    {:else}
                        <EyeSlash size={16} weight="bold" />
                    {/if}
                </button>

                <!-- Badge Text -->
                <span class="text-sm font-medium">
                    {m.annotations_count({ count: annotations.length })}
                    <span class="opacity-50 text-xs font-normal ml-1">
                        {m.visible_count({
                            count: viewerState.visibleAnnotationIds.size,
                        })}
                    </span>
                </span>

                <CaretDown
                    size={16}
                    weight="bold"
                    class="group-open:rotate-180 transition-transform opacity-80"
                />
            </summary>

            <!-- Expanded List -->
            <div
                class="absolute right-0 mt-2 w-96 bg-base-200/95 backdrop-blur shadow-xl rounded-box p-0 max-h-[60vh] overflow-y-auto border border-base-300 flex flex-col divide-y divide-base-300"
            >
                {#each renderedAnnotations as anno, i}
                    {@const isVisible = viewerState.visibleAnnotationIds.has(
                        anno.id,
                    )}
                    <!-- List Item Row -->
                    <div
                        id="annotation-list-item-{anno.id}"
                        class="w-full text-left p-3 hover:bg-base-300 transition-colors cursor-pointer flex gap-3 group/item items-start focus:outline-none focus:bg-base-300 relative"
                        role="button"
                        tabindex="0"
                        onmouseenter={() => (hoveredAnnotationId = anno.id)}
                        onmouseleave={() => (hoveredAnnotationId = null)}
                        onclick={(e) => {
                            e.preventDefault();
                            toggleAnnotation(anno.id);
                        }}
                        onkeypress={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleAnnotation(anno.id);
                            }
                        }}
                    >
                        <!-- Visual Toggle Indicator (eye icon button) -->
                        <!-- If user wants only the eye to toggle, we should stopPropagation on it, 
                             and maybe remove toggle from the main click? 
                             Wait, user updated task: "Changing the list item interaction so that clicking the item no longer key-toggles visibility. ... Disregard this."
                             So click anywhere ON the row still toggles. 
                        -->
                        <button
                            class="btn btn-xs btn-circle btn-ghost mt-0.5 shrink-0"
                            onclick={(e) => {
                                e.stopPropagation();
                                toggleAnnotation(anno.id);
                            }}
                        >
                            {#if isVisible}
                                <Eye size={16} weight="bold" />
                            {:else}
                                <EyeSlash size={16} weight="bold" />
                            {/if}
                        </button>

                        <div class="flex-1 min-w-0 pointer-events-none">
                            <div class="flex items-start justify-between">
                                <span class="font-bold text-sm text-primary"
                                    >#{i + 1}</span
                                >
                                <!-- Only show label separately if it's different from the content being displayed -->
                                {#if anno.label && !anno.bodies.some((b) => b.value === anno.label)}
                                    <span
                                        class="text-xs opacity-50 truncate max-w-[150px]"
                                        >{anno.label}</span
                                    >
                                {/if}
                            </div>
                            <div
                                class="text-sm prose prose-sm max-w-none prose-p:my-0 prose-a:text-blue-500 wrap-break-word text-left {isVisible
                                    ? ''
                                    : 'opacity-50'} space-y-2"
                            >
                                {#each anno.bodies as body}
                                    <div
                                        class="flex flex-wrap gap-2 pointer-events-auto"
                                    >
                                        {#if body.purpose === 'tagging'}
                                            <span
                                                class="badge badge-primary badge-outline badge-sm"
                                            >
                                                {body.value}
                                            </span>
                                        {:else if body.purpose === 'linking'}
                                            <a
                                                href={body.value}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                class="flex items-center gap-1 text-primary hover:underline hover:text-primary-focus p-1 rounded hover:bg-base-200 -ml-1 transition-colors"
                                                onclick={(e) =>
                                                    e.stopPropagation()}
                                            >
                                                <!-- Link Icon -->
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    width="12"
                                                    height="12"
                                                    fill="currentColor"
                                                    viewBox="0 0 256 256"
                                                    ><path
                                                        d="M136.37,187.53a12,12,0,0,1,0,17l-5.94,5.94a60,60,0,0,1-84.88-84.88l24.12-24.12A60,60,0,0,1,152.06,99,12,12,0,1,1,135,116a36,36,0,0,0-50.93,1.57L60,141.66a36,36,0,0,0,50.93,50.93l5.94-5.94A12,12,0,0,1,136.37,187.53Zm81.51-149.41a60,60,0,0,0-84.88,0l-5.94,5.94a12,12,0,0,0,17,17l5.94-5.94a36,36,0,0,1,50.93,50.93l-24.11,24.12A36,36,0,0,1,121,140a12,12,0,1,0-17.08,17,60,60,0,0,0,82.39,2.46l24.12-24.12A60,60,0,0,0,217.88,38.12Z"
                                                    ></path></svg
                                                >
                                                <span
                                                    class="truncate max-w-[200px]"
                                                    >{body.value}</span
                                                >
                                            </a>
                                        {:else}
                                            <!-- Commenting / Default -->
                                            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                            {#if body.isHtml}
                                                {@html body.value}
                                            {:else}
                                                {body.value || '(No content)'}
                                            {/if}
                                        {/if}
                                    </div>
                                {/each}

                                {#if anno.bodies.length === 0}
                                    <span class="opacity-50 italic text-xs"
                                        >(No content)</span
                                    >
                                {/if}
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="p-4 text-center opacity-50 text-sm">
                        No annotations available.
                    </div>
                {/each}
            </div>
        </details>
    </div>
{/if}
