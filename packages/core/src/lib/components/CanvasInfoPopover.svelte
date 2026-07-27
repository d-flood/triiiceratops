<script lang="ts">
    import { getContext } from 'svelte';
    import Info from 'phosphor-svelte/lib/Info';
    import X from 'phosphor-svelte/lib/X';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';
    import {
        normalizeIiifLinks,
        normalizeMetadataEntries,
    } from '../utils/metadataNormalization';
    import { resolveLanguageValue } from '../utils/languageMap';
    import SanitizedHtml from './SanitizedHtml.svelte';
    import { Button } from './ui';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    let viewerLocale = $derived(
        (viewerState.config as { locale?: string }).locale || language.current,
    );

    let canvas = $derived.by(() => {
        const idx = viewerState.currentCanvasIndex;
        return viewerState.canvases[idx] ?? null;
    });

    let json = $derived(canvas?.__jsonld ?? canvas);

    let label = $derived.by(() => {
        if (!json) return '';
        return resolveLanguageValue(json.label, viewerLocale);
    });

    let summary = $derived.by(() => {
        if (!json?.summary) return '';
        return resolveLanguageValue(json.summary, viewerLocale);
    });

    let metadata = $derived.by(() => {
        if (!json?.metadata) return [];
        return normalizeMetadataEntries(
            Array.isArray(json.metadata) ? json.metadata : [],
            viewerLocale,
        );
    });

    let rendering = $derived(normalizeIiifLinks(json?.rendering, viewerLocale));

    let hasAdditionalContent = $derived(
        !!(summary || metadata.length > 0 || rendering.length > 0),
    );

    let showButton = $derived(
        viewerState.config.information?.showButton !== false,
    );
</script>

{#if hasAdditionalContent && showButton}
    <div class="wrapper">
        <Button
            circle
            size="xs"
            ghost
            class="trigger"
            onclick={() => viewerState.toggleCanvasInfo()}
            aria-label={m.canvas_info_tooltip()}
            title={m.canvas_info_tooltip()}
        >
            <Info size={14} weight="bold" />
        </Button>

        {#if viewerState.showCanvasInfo}
            <!-- Backdrop to close popover -->
            <button
                class="backdrop"
                onclick={() => viewerState.toggleCanvasInfo()}
                aria-label={m.close()}
                tabindex="-1"
            ></button>

            <!-- Popover -->
            <div
                class="popover"
                style="left: 50%; transform: translateX(-50%); z-index: 1001;"
                role="dialog"
                aria-label={m.canvas_info()}
            >
                <div class="scroll">
                    <div class="head">
                        <h4 class="title">{m.canvas_info()}</h4>
                        <Button
                            size="xs"
                            circle
                            ghost
                            class="close"
                            onclick={() => viewerState.toggleCanvasInfo()}
                            aria-label={m.close()}
                        >
                            <X size={14} />
                        </Button>
                    </div>

                    {#if label}
                        <p class="canvas-label">{label}</p>
                    {/if}

                    {#if summary}
                        <SanitizedHtml
                            tag="div"
                            html={summary}
                            class="viewer-html summary"
                        />
                    {/if}

                    {#if metadata.length > 0}
                        <dl class="metadata">
                            {#each metadata as item, i (i)}
                                <dt class="meta-label">
                                    {item.label}
                                </dt>
                                <SanitizedHtml
                                    tag="dd"
                                    html={item.value}
                                    class="viewer-html meta-value"
                                />
                            {/each}
                        </dl>
                    {/if}

                    {#if rendering.length > 0}
                        <div class="rendering">
                            <span class="rendering-title">{m.rendering()}</span>
                            {#each rendering as item (item.id)}
                                <a
                                    href={item.id}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="rendering-link">{item.label}</a
                                >
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>
{/if}

<style>
    .wrapper {
        position: relative;
        display: inline-flex;
    }

    /* Trigger button: ghost circle with primary-colored icon (text-primary). */
    .wrapper :global(.trigger) {
        color: var(--color-primary-text);
    }

    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 40;
        cursor: default;
    }

    .popover {
        position: absolute;
        bottom: 100%;
        margin-bottom: 0.5rem;
        background-color: var(--panel-bg);
        border-width: 1px;
        border-style: solid;
        border-color: var(--surface-border);
        border-radius: var(--radius-panels);
        box-shadow:
            0 20px 25px -5px #0000001a,
            0 8px 10px -6px #0000001a;
        width: 18rem;
        max-height: 16rem;
        overflow: hidden;
    }

    .scroll {
        overflow-y: auto;
        max-height: 16rem;
        padding: 1rem;
    }

    .head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .title {
        font-weight: 700;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }

    .canvas-label {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
    }

    .scroll :global(.summary) {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.8;
        margin-bottom: 0.5rem;
    }

    .metadata {
        font-size: 0.75rem;
        line-height: 1rem;
    }

    .meta-label {
        font-weight: 700;
        opacity: 0.7;
        margin-top: 0.5rem;
    }

    .metadata :global(.meta-value) {
        padding-inline-start: 0.5rem;
    }

    .rendering {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top-width: 1px;
        border-top-style: solid;
        border-top-color: var(--surface-border);
    }

    .rendering-title {
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 700;
        opacity: 0.7;
    }

    .rendering-link {
        color: var(--color-primary-text);
        text-decoration-line: underline;
        cursor: pointer;
        font-size: 0.75rem;
        line-height: 1rem;
        display: block;
        margin-top: 0.25rem;
        word-break: break-all;
    }
</style>
