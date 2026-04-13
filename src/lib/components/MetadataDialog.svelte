<script lang="ts">
    import { getContext } from 'svelte';
    import Info from 'phosphor-svelte/lib/Info';
    import X from 'phosphor-svelte/lib/X';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';
    import { resolveThumbnailResourceSrc } from '../utils/getThumbnailSrc';
    import {
        resolveAllLanguageValues,
        resolveLanguageValue,
    } from '../utils/languageMap';
    import SanitizedHtml from './SanitizedHtml.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    let viewerLocale = $derived(
        (viewerState.config as { locale?: string }).locale || language.current,
    );

    let manifest = $derived(viewerState.manifest);
    let json = $derived(manifest?.__jsonld);

    // --- Title ---
    let title = $derived.by(() => {
        if (!manifest) return m.loading();
        const label = manifest.getLabel?.();
        const resolved = resolveLanguageValue(label, viewerLocale);
        return resolved || m.metadata_label_fallback();
    });

    let manifestThumbnail = $derived.by(() => {
        return resolveThumbnailResourceSrc(json?.thumbnail);
    });

    function resolveHtmlValues(value: unknown, locale?: string): string {
        return resolveAllLanguageValues(value, locale).join('<br />');
    }

    // --- Summary (v3) or Description (v2) ---
    let summary = $derived.by(() => {
        if (!manifest) return '';
        if (json?.summary) {
            return resolveLanguageValue(json.summary, viewerLocale);
        }
        return manifest.getDescription?.() || '';
    });

    // --- Metadata entries ---
    let metadata = $derived.by(() => {
        const currentLang = viewerLocale;
        const rawMetadata = json?.metadata || manifest?.getMetadata?.();
        if (!rawMetadata) return [];

        return rawMetadata.map((item: any) => {
            let label = '';
            let value = '';

            const source = item?.__jsonld || item;

            if (source.label) {
                label = resolveLanguageValue(source.label, currentLang);
            } else if (item.getLabel) {
                label = resolveLanguageValue(item.getLabel(), currentLang);
            }

            if (source.value) {
                value = resolveHtmlValues(source.value, currentLang);
            } else if (item.getValue) {
                value = resolveHtmlValues(item.getValue(), currentLang);
            }

            return { label, value };
        });
    });

    // --- Attribution (requiredStatement) ---
    let attributionLabel = $derived.by(() => {
        const statement = json?.requiredStatement;
        if (!statement?.label) return m.attribution();
        return (
            resolveLanguageValue(statement.label, viewerLocale) ||
            m.attribution()
        );
    });

    let attribution = $derived.by(() => {
        const statement = json?.requiredStatement;
        if (statement?.value) {
            return resolveHtmlValues(statement.value, viewerLocale);
        }

        return manifest ? manifest.getRequiredStatement()?.getValue() : '';
    });

    // --- License / Rights ---
    let license = $derived.by(() => {
        if (!manifest) return '';
        // v3 uses rights, v2 uses license
        return json?.rights || manifest.getLicense?.() || '';
    });

    // --- Helper: normalise a IIIF link property to an array of objects ---
    function normaliseLinks(
        raw: any,
    ): Array<{ id: string; label: string; format?: string }> {
        if (!raw) return [];
        const items = Array.isArray(raw) ? raw : [raw];
        return items
            .map((item: any) => {
                if (typeof item === 'string') return { id: item, label: item };
                const id = item.id || item['@id'] || '';
                const label =
                    resolveLanguageValue(item.label, viewerLocale) ||
                    item.format ||
                    id;
                return { id, label, format: item.format };
            })
            .filter((item: any) => item.id);
    }

    // --- Provider (0234) ---
    let providers = $derived.by(() => {
        if (!json?.provider) return [];
        const raw = Array.isArray(json.provider)
            ? json.provider
            : [json.provider];
        return raw.map((p: any) => {
            const label = resolveLanguageValue(p.label, viewerLocale) || '';
            const links = [
                ...normaliseLinks(p.homepage),
                ...normaliseLinks(p.seeAlso),
            ];
            const logos = (
                Array.isArray(p.logo) ? p.logo : p.logo ? [p.logo] : []
            )
                .map((logo: any) =>
                    typeof logo === 'string' ? logo : logo?.id || logo?.['@id'],
                )
                .filter(Boolean);
            return { label, links, logos };
        });
    });

    // --- Homepage (0047) ---
    let homepages = $derived(normaliseLinks(json?.homepage));

    // --- Rendering (0046) ---
    let rendering = $derived(normaliseLinks(json?.rendering));

    // --- See Also (0053) ---
    let seeAlso = $derived(normaliseLinks(json?.seeAlso));

    let panelWidth = $derived(viewerState.config.information?.width ?? '320px');
    let position = $derived(
        viewerState.config.information?.position ?? 'right',
    );
    let showCloseButton = $derived(
        viewerState.config.information?.showCloseButton ?? true,
    );
</script>

{#if viewerState.showMetadataDialog}
    <div
        class="h-full bg-base-200 shadow-2xl z-100 flex flex-col transition-[width] duration-200 {viewerState
            .config.transparentBackground
            ? ''
            : position === 'left'
              ? 'border-r border-base-300'
              : 'border-l border-base-300'}"
        style="width: {panelWidth}"
        role="dialog"
        aria-label={m.metadata()}
    >
        <div
            class="flex items-center justify-between gap-3 p-4 border-b border-base-300"
        >
            <div class="flex items-center gap-2 min-w-0">
                <Info size={20} weight="bold" class="shrink-0" />
                <h2 class="font-bold text-lg truncate">{m.metadata()}</h2>
            </div>
            {#if showCloseButton}
                <button
                    class="btn btn-sm btn-circle btn-ghost shrink-0"
                    onclick={() => viewerState.toggleMetadataDialog()}
                    aria-label={m.close()}
                >
                    <X size={20} />
                </button>
            {/if}
        </div>

        <div class="flex-1 overflow-y-auto p-4">
            <h3 class="font-bold text-lg mb-4 wrap-break-word">{title}</h3>

            {#if manifestThumbnail}
                <div class="mb-4">
                    <img
                        src={manifestThumbnail}
                        alt=""
                        class="max-h-48 w-auto rounded-box border border-base-300 object-contain"
                    />
                </div>
            {/if}

            {#if summary}
                <SanitizedHtml
                    tag="div"
                    html={summary}
                    class="viewer-html mb-6 prose"
                />
            {/if}

            <dl>
                {#if attribution}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {attributionLabel}
                    </dt>
                    <SanitizedHtml
                        tag="dd"
                        html={attribution}
                        class="viewer-html text-sm ps-4"
                    />
                {/if}

                {#if license}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.license()}
                    </dt>
                    <dd class="text-sm ps-4">
                        <a
                            href={license}
                            target="_blank"
                            rel="noreferrer"
                            class="link link-primary break-all">{license}</a
                        >
                    </dd>
                {/if}

                {#each metadata as item, i (i)}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {item.label}
                    </dt>
                    <SanitizedHtml
                        tag="dd"
                        html={item.value}
                        class="viewer-html text-sm ps-4"
                    />
                {/each}

                <!-- Provider (0234) -->
                {#if providers.length > 0}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.provider()}
                    </dt>
                    <dd class="text-sm ps-4">
                        {#each providers as provider (provider.label || provider.links[0]?.id || provider.logos[0])}
                            <div class="flex flex-col gap-2 mt-2">
                                <div class="flex items-center gap-3">
                                    {#each provider.logos as logo (logo)}
                                        <div class="flex-1 min-w-0">
                                            <img
                                                src={logo}
                                                alt=""
                                                class="h-12 w-full object-contain object-left"
                                            />
                                        </div>
                                    {/each}

                                    {#if provider.label}
                                        <span class="shrink-0 font-semibold"
                                            >{provider.label}</span
                                        >
                                    {/if}
                                </div>

                                {#if provider.links.length > 0}
                                    <div class="flex flex-col gap-1">
                                        {#each provider.links as link (link.id)}
                                            <a
                                                href={link.id}
                                                target="_blank"
                                                rel="noreferrer"
                                                class="link link-primary break-all"
                                                >{link.label}</a
                                            >
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </dd>
                {/if}

                <!-- Homepage (0047) -->
                {#if homepages.length > 0}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.homepage()}
                    </dt>
                    <dd class="text-sm ps-4">
                        {#each homepages as hp, index (index)}
                            <a
                                href={hp.id}
                                target="_blank"
                                rel="noreferrer"
                                class="link link-primary break-all block mt-1"
                                >{hp.label}</a
                            >
                        {/each}
                    </dd>
                {/if}

                <!-- Rendering / Alternative Formats (0046) -->
                {#if rendering.length > 0}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.rendering()}
                    </dt>
                    <dd class="text-sm ps-4">
                        {#each rendering as item, index (index)}
                            <a
                                href={item.id}
                                target="_blank"
                                rel="noreferrer"
                                class="link link-primary break-all block mt-1"
                                >{item.label}{#if item.format}&nbsp;<span
                                        class="opacity-50">({item.format})</span
                                    >{/if}</a
                            >
                        {/each}
                    </dd>
                {/if}

                <!-- See Also / Related Resources (0053) -->
                {#if seeAlso.length > 0}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.see_also()}
                    </dt>
                    <dd class="text-sm ps-4">
                        {#each seeAlso as item, index (index)}
                            <a
                                href={item.id}
                                target="_blank"
                                rel="noreferrer"
                                class="link link-primary break-all block mt-1"
                                >{item.label}{#if item.format}&nbsp;<span
                                        class="opacity-50">({item.format})</span
                                    >{/if}</a
                            >
                        {/each}
                    </dd>
                {/if}

                {#if viewerState.manifestId}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.iiif_manifest_label()}
                    </dt>
                    <dd class="text-sm ps-4">
                        <a
                            href={viewerState.manifestId}
                            target="_blank"
                            rel="noreferrer"
                            class="link link-primary break-all"
                        >
                            {viewerState.manifestId}
                        </a>
                    </dd>
                {/if}
            </dl>
        </div>
    </div>
{/if}
