<script lang="ts">
    import { getContext } from 'svelte';
    import X from 'phosphor-svelte/lib/X';
    import Eye from 'phosphor-svelte/lib/Eye';
    import EyeSlash from 'phosphor-svelte/lib/EyeSlash';
    import ListDashes from 'phosphor-svelte/lib/ListDashes';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import { m } from '../state/i18n.svelte';
    import { extractBody } from '../utils/annotationAdapter';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let width = $derived(viewerState.config.annotations?.width ?? '320px');
    let position = $derived(
        viewerState.config.annotations?.position ?? 'right',
    );
    let showCloseButton = $derived(
        viewerState.config.annotations?.showCloseButton ?? true,
    );

    let annotations = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return [];
        }
        const manifestAnnotations = manifestsState.getAnnotations(
            viewerState.manifestId,
            viewerState.canvasId,
        );
        // Add search hits for current canvas
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
    }

    function toggleAllAnnotations() {
        if (isAllVisible) {
            // Hide all
            viewerState.visibleAnnotationIds.clear();
        } else {
            // Show all
            viewerState.visibleAnnotationIds.clear();
            annotations.forEach((a: any) => {
                const id = getAnnotationId(a);
                if (id) viewerState.visibleAnnotationIds.add(id);
            });
        }
    }
</script>

<!-- Drawer / Panel -->
{#if viewerState.showAnnotations}
    <div
        class="h-full bg-base-200 shadow-2xl z-100 flex flex-col transition-[width] duration-200 {viewerState
            .config.transparentBackground
            ? ''
            : position === 'left'
              ? 'border-r border-base-300'
              : 'border-l border-base-300'}"
        style="width: {width}"
        role="dialog"
        aria-label={m.settings_submenu_annotations()}
    >
        <!-- Header -->
        <div
            class="flex items-center justify-between p-4 border-b border-base-300"
        >
            <div class="flex items-center gap-2">
                <ListDashes size={20} weight="bold" />
                <h2 class="font-bold text-lg">
                    {m.settings_submenu_annotations()}
                </h2>
            </div>
            {#if showCloseButton}
                <button
                    class="btn btn-sm btn-circle btn-ghost"
                    onclick={() => viewerState.toggleAnnotations()}
                    aria-label={m.close()}
                >
                    <X size={20} weight="bold" />
                </button>
            {/if}
        </div>

        <!-- Toolbar / Stats -->
        <div
            class="p-4 border-b border-base-300 bg-base-100/50 flex items-center justify-between"
        >
            <div class="text-sm font-medium opacity-80">
                {m.annotations_count({ count: annotations.length })}
            </div>
            <button
                class="btn btn-sm btn-ghost gap-2"
                onclick={toggleAllAnnotations}
                disabled={annotations.length === 0}
            >
                {#if isAllVisible}
                    <Eye size={16} weight="bold" />
                    {m.hide_all_annotations()}
                {:else}
                    <EyeSlash size={16} weight="bold" />
                    {m.show_all_annotations()}
                {/if}
            </button>
        </div>

        <!-- List -->
        <div
            class="flex-1 overflow-y-auto p-0 flex flex-col divide-y divide-base-300"
        >
            {#each renderedAnnotations as anno, i (anno.id)}
                {@const isVisible = viewerState.visibleAnnotationIds.has(
                    anno.id,
                )}
                <!-- List Item Row -->
                <div
                    class="w-full text-left p-4 hover:bg-base-100 transition-colors cursor-pointer flex gap-3 group/item items-start focus:outline-none focus:bg-base-100 relative {isVisible
                        ? ''
                        : 'opacity-60 bg-base-200/50'}"
                    role="button"
                    tabindex="0"
                    id="annotation-list-item-{anno.id}"
                    onmouseenter={() =>
                        (viewerState.hoveredAnnotationId = anno.id)}
                    onmouseleave={() =>
                        (viewerState.hoveredAnnotationId = null)}
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
                        <div class="flex items-start justify-between mb-1">
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
                            class="text-sm prose prose-sm max-w-none prose-p:my-0 prose-a:text-blue-500 wrap-break-word text-left space-y-2"
                        >
                            {#each anno.bodies as body, i (i)}
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
                                            onclick={(e) => e.stopPropagation()}
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
                                            <span class="truncate max-w-[200px]"
                                                >{body.value}</span
                                            >
                                        </a>
                                    {:else if body.isHtml}
                                        {@html body.value}
                                    {:else}
                                        {body.value || '(No content)'}
                                    {/if}
                                </div>
                            {/each}

                            {#if anno.bodies.length === 0}
                                <span class="opacity-50 italic text-xs"
                                    >{m.no_content()}</span
                                >
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="p-8 text-center opacity-50 text-sm">
                    {m.no_annotations_available()}
                </div>
            {/each}
        </div>
    </div>
{/if}
