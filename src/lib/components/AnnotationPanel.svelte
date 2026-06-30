<script lang="ts">
    import { getContext } from 'svelte';
    import Eye from 'phosphor-svelte/lib/Eye';
    import EyeSlash from 'phosphor-svelte/lib/EyeSlash';
    import ListDashes from 'phosphor-svelte/lib/ListDashes';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { manifestsState } from '../state/manifests.svelte';
    import { m } from '../state/i18n.svelte';
    import SanitizedHtml from './SanitizedHtml.svelte';
    import { extractBody } from '../utils/annotationAdapter';
    import { Button, Badge } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let { embedded = false }: { embedded?: boolean } = $props();

    let position = $derived(
        viewerState.config.annotations?.position ?? 'right',
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
                isSearchHit: Boolean(anno.isSearchHit),
                label:
                    (typeof anno.getLabel === 'function'
                        ? anno.getLabel()
                        : anno.label) || '',
            };
        });
    });

    let toggleableAnnotations = $derived(
        renderedAnnotations.filter((anno) => !anno.isSearchHit),
    );

    // Derived state for "All Visible" status
    let isAllVisible = $derived.by(() => {
        if (toggleableAnnotations.length === 0) return false;
        return toggleableAnnotations.every((anno) => {
            return !anno.id || viewerState.visibleAnnotationIds.has(anno.id);
        });
    });

    function toggleAnnotation(anno: { id: string; isSearchHit: boolean }) {
        if (anno.isSearchHit || !anno.id) {
            return;
        }

        viewerState.annotationVisibilityTouched = true;
        if (viewerState.visibleAnnotationIds.has(anno.id)) {
            viewerState.visibleAnnotationIds.delete(anno.id);
        } else {
            viewerState.visibleAnnotationIds.add(anno.id);
        }
    }

    function shouldIgnoreRowToggle(target: EventTarget | null): boolean {
        if (!(target instanceof Element)) {
            return false;
        }

        return Boolean(
            target.closest(
                'a, button, input, select, textarea, summary, [role="button"], [data-annotation-interactive="true"]',
            ),
        );
    }

    function toggleAllAnnotations() {
        viewerState.annotationVisibilityTouched = true;
        if (isAllVisible) {
            // Hide all
            viewerState.visibleAnnotationIds.clear();
        } else {
            // Show all
            viewerState.visibleAnnotationIds.clear();
            toggleableAnnotations.forEach((anno) => {
                if (anno.id) viewerState.visibleAnnotationIds.add(anno.id);
            });
        }
    }
</script>

<!-- Drawer / Panel -->
{#if viewerState.showAnnotations}
    <div
        class="panel"
        class:floating={!embedded}
        class:transparent={!embedded && viewerState.config.transparentBackground}
        class:border-left={!embedded &&
            !viewerState.config.transparentBackground &&
            position !== 'left'}
        class:border-right={!embedded &&
            !viewerState.config.transparentBackground &&
            position === 'left'}
        role="dialog"
        aria-label={m.settings_submenu_annotations()}
    >
        {#if !embedded}
            <div class="header">
                <div class="header-title">
                    <ListDashes size={20} weight="bold" />
                    <h2>
                        {m.settings_submenu_annotations()}
                    </h2>
                </div>
            </div>
        {/if}

        <!-- Toolbar / Stats -->
        <div class="toolbar">
            <div class="count">
                {m.annotations_count({ count: annotations.length })}
            </div>
            <Button
                size="sm"
                ghost
                class="toggle-all-btn"
                onclick={toggleAllAnnotations}
                disabled={toggleableAnnotations.length === 0}
            >
                {#if isAllVisible}
                    <Eye size={16} />
                    {m.hide_all_annotations()}
                {:else}
                    <EyeSlash size={16} />
                    {m.show_all_annotations()}
                {/if}
            </Button>
        </div>

        <!-- List -->
        <div class="list" class:scrollable={!embedded}>
            {#each renderedAnnotations as anno, i (anno.id)}
                {@const isVisible =
                    anno.isSearchHit ||
                    viewerState.visibleAnnotationIds.has(anno.id)}
                <!-- List Item Row -->
                <div
                    class="row"
                    class:search-hit={anno.isSearchHit}
                    class:dimmed={!isVisible}
                    role="button"
                    tabindex="0"
                    aria-disabled={anno.isSearchHit}
                    id="annotation-list-item-{anno.id}"
                    onmouseenter={() =>
                        (viewerState.hoveredAnnotationId = anno.id)}
                    onmouseleave={() =>
                        (viewerState.hoveredAnnotationId = null)}
                    onclick={(e) => {
                        if (shouldIgnoreRowToggle(e.target)) {
                            return;
                        }
                        e.preventDefault();
                        toggleAnnotation(anno);
                    }}
                    onkeypress={(e) => {
                        if (anno.isSearchHit) {
                            return;
                        }
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleAnnotation(anno);
                        }
                    }}
                >
                    <!-- Visual Toggle Indicator (eye icon button) -->
                    <Button
                        size="xs"
                        circle
                        ghost
                        class="eye-btn"
                        disabled={anno.isSearchHit}
                        onclick={(e) => {
                            e.stopPropagation();
                            toggleAnnotation(anno);
                        }}
                    >
                        {#if isVisible}
                            <Eye size={16} />
                        {:else}
                            <EyeSlash size={16} />
                        {/if}
                    </Button>

                    <div class="content">
                        <div class="content-head">
                            <span class="index">#{i + 1}</span>
                            <!-- Only show label separately if it's different from the content being displayed -->
                            {#if anno.label && !anno.bodies.some((b) => b.value === anno.label)}
                                <span class="label">{anno.label}</span>
                            {/if}
                        </div>
                        <div class="viewer-html bodies">
                            {#each anno.bodies as body, i (i)}
                                <div class="body-row">
                                    {#if body.purpose === 'tagging'}
                                        <Badge
                                            variant="primary"
                                            outline
                                            size="sm"
                                        >
                                            {body.value}
                                        </Badge>
                                    {:else if body.purpose === 'linking'}
                                        <a
                                            href={body.value}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="link"
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
                                            <span class="link-text"
                                                >{body.value}</span
                                            >
                                        </a>
                                    {:else if body.isHtml}
                                        <SanitizedHtml html={body.value} />
                                    {:else}
                                        {body.value || '(No content)'}
                                    {/if}
                                </div>
                            {/each}

                            {#if anno.bodies.length === 0}
                                <span class="no-content"
                                    >{m.no_content()}</span
                                >
                            {/if}
                        </div>
                    </div>
                </div>
            {:else}
                <div class="empty">
                    {m.no_annotations_available()}
                </div>
            {/each}
        </div>
    </div>
{/if}

<style>
    .panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .panel.floating {
        height: 100%;
        background-color: var(--color-base-200);
        box-shadow: 0 25px 50px -12px #00000040;
        z-index: 100;
        transition-property: width;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }

    .panel.border-left {
        border-left-width: 1px;
        border-left-style: solid;
        border-left-color: var(--color-base-300);
    }

    .panel.border-right {
        border-right-width: 1px;
        border-right-style: solid;
        border-right-color: var(--color-base-300);
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--color-base-300);
    }

    .header-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .header-title h2 {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
    }

    .toolbar {
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--color-base-300);
        background-color: color-mix(
            in oklab,
            var(--color-base-100) 50%,
            transparent
        );
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .count {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 500;
        opacity: 0.8;
    }

    /* btn-sm gap-2: override .btn's default gap (0.375rem) to gap-2 (0.5rem) */
    .toolbar :global(.toggle-all-btn) {
        gap: 0.5rem;
    }

    .list {
        padding: 0;
        display: flex;
        flex-direction: column;
    }

    /* divide-y divide-base-300 */
    .list > :global(* + *) {
        border-top-width: 1px;
        border-top-style: solid;
        border-top-color: var(--color-base-300);
    }

    .list.scrollable {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .row {
        width: 100%;
        text-align: left;
        padding: 1rem;
        transition-property: color, background-color, border-color,
            text-decoration-color, fill, stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        position: relative;
        cursor: pointer;
    }

    .row:focus {
        outline: none;
        background-color: color-mix(
            in oklab,
            var(--color-primary) 10%,
            transparent
        );
    }

    .row:hover {
        background-color: color-mix(
            in oklab,
            var(--color-primary) 5%,
            transparent
        );
    }

    .row.search-hit {
        cursor: default;
    }

    .row.dimmed {
        opacity: 0.6;
        background-color: color-mix(
            in oklab,
            var(--color-base-200) 50%,
            transparent
        );
    }

    /* btn-xs btn-circle btn-ghost mt-0.5 shrink-0 (shrink-0 already in .btn) */
    .row :global(.eye-btn) {
        margin-top: 0.125rem;
    }

    .content {
        flex: 1 1 0%;
        min-width: 0;
    }

    .content-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 0.25rem;
    }

    .index {
        font-weight: 700;
        font-size: 0.875rem;
        line-height: 1.25rem;
        color: var(--color-primary);
    }

    .label {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.5;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 150px;
    }

    .bodies {
        font-size: 0.875rem;
        line-height: 1.25rem;
        overflow-wrap: break-word;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .body-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }

    .link {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--color-primary);
        padding: 0.25rem;
        border-radius: 0.25rem;
        margin-left: -0.25rem;
        transition-property: color, background-color, border-color,
            text-decoration-color, fill, stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }

    .link:hover {
        text-decoration-line: underline;
        /* original `hover:text-primary-focus` was a dead DaisyUI v5 class (no
           --color-primary-focus token), so the text color stays --color-primary */
        background-color: var(--color-base-200);
    }

    .link-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 200px;
    }

    .no-content {
        opacity: 0.5;
        font-style: italic;
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .empty {
        padding: 2rem;
        text-align: center;
        opacity: 0.5;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }
</style>
