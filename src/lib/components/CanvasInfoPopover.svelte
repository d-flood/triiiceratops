<script lang="ts">
    import { getContext } from 'svelte';
    import Info from 'phosphor-svelte/lib/Info';
    import X from 'phosphor-svelte/lib/X';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';
    import { resolveLanguageValue } from '../utils/languageMap';

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
        const currentLang = viewerLocale;
        if (!json?.metadata) return [];
        const raw = Array.isArray(json.metadata) ? json.metadata : [];
        return raw.map((item: any) => ({
            label: resolveLanguageValue(item.label, currentLang),
            value: resolveLanguageValue(item.value, currentLang),
        }));
    });

    /** Normalise a IIIF link property to an array of objects. */
    function normaliseLinks(
        raw: any,
    ): Array<{ id: string; label: string; format?: string }> {
        if (!raw) return [];
        const items = Array.isArray(raw) ? raw : [raw];
        return items
            .map((item: any) => {
                if (typeof item === 'string') return { id: item, label: item };
                const id = item.id || item['@id'] || '';
                const itemLabel =
                    resolveLanguageValue(item.label, viewerLocale) ||
                    item.format ||
                    id;
                return { id, label: itemLabel, format: item.format };
            })
            .filter((item: any) => item.id);
    }

    let rendering = $derived(normaliseLinks(json?.rendering));

    let hasContent = $derived(
        !!(label || summary || metadata.length > 0 || rendering.length > 0),
    );
</script>

{#if hasContent}
    <div class="relative inline-flex">
        <button
            class="btn btn-circle btn-xs btn-ghost opacity-60 hover:opacity-100"
            onclick={() => viewerState.toggleCanvasInfo()}
            aria-label={m.canvas_info_tooltip()}
            title={m.canvas_info_tooltip()}
        >
            <Info size={14} />
        </button>

        {#if viewerState.showCanvasInfo}
            <!-- Backdrop to close popover -->
            <button
                class="fixed inset-0 z-40 cursor-default"
                onclick={() => viewerState.toggleCanvasInfo()}
                aria-label={m.close()}
                tabindex="-1"
            ></button>

            <!-- Popover -->
            <div
                class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-base-200 border border-base-300 rounded-box shadow-xl p-4 w-72 max-h-64 overflow-y-auto"
                role="dialog"
                aria-label={m.canvas_info()}
            >
                <div class="flex items-start justify-between gap-2 mb-2">
                    <h4 class="font-bold text-sm">{m.canvas_info()}</h4>
                    <button
                        class="btn btn-xs btn-circle btn-ghost shrink-0"
                        onclick={() => viewerState.toggleCanvasInfo()}
                        aria-label={m.close()}
                    >
                        <X size={14} />
                    </button>
                </div>

                {#if label}
                    <p class="text-sm font-semibold mb-1">{label}</p>
                {/if}

                {#if summary}
                    <div class="text-xs opacity-80 mb-2 prose prose-sm">
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        {@html summary}
                    </div>
                {/if}

                {#if metadata.length > 0}
                    <dl class="text-xs">
                        {#each metadata as item, i (i)}
                            <dt class="font-bold opacity-70 mt-2">
                                {item.label}
                            </dt>
                            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                            <dd class="ps-2">{@html item.value}</dd>
                        {/each}
                    </dl>
                {/if}

                {#if rendering.length > 0}
                    <div class="mt-2 pt-2 border-t border-base-300">
                        <span class="text-xs font-bold opacity-70"
                            >{m.rendering()}</span
                        >
                        {#each rendering as item (item.id)}
                            <a
                                href={item.id}
                                target="_blank"
                                rel="noreferrer"
                                class="link link-primary text-xs block mt-1 break-all"
                                >{item.label}</a
                            >
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}
