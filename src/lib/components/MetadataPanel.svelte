<script lang="ts">
    import { getContext } from 'svelte';
    import Info from 'phosphor-svelte/lib/Info';
	import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
	import { m, language } from '../state/i18n.svelte';
	import { resolveThumbnailResourceSrc } from '../utils/getThumbnailSrc';
	import {
		normalizeIiifLinks,
		normalizeMetadataEntries,
		resolveHtmlValues,
	} from '../utils/metadataNormalization';
	import {
		resolveLanguageValue,
	} from '../utils/languageMap';
	import SanitizedHtml from './SanitizedHtml.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    let { embedded = false }: { embedded?: boolean } = $props();
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
		const rawMetadata = json?.metadata || manifest?.getMetadata?.();
		return normalizeMetadataEntries(rawMetadata, viewerLocale);
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

	// --- Provider (0234) ---
	let providers = $derived.by(() => {
        if (!json?.provider) return [];
        const raw = Array.isArray(json.provider)
            ? json.provider
            : [json.provider];
		return raw.map((p: any) => {
			const label = resolveLanguageValue(p.label, viewerLocale) || '';
			const links = [
				...normalizeIiifLinks(p.homepage, viewerLocale),
				...normalizeIiifLinks(p.seeAlso, viewerLocale),
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
	let homepages = $derived(normalizeIiifLinks(json?.homepage, viewerLocale));

	// --- Rendering (0046) ---
	let rendering = $derived(normalizeIiifLinks(json?.rendering, viewerLocale));

	// --- See Also (0053) ---
	let seeAlso = $derived(normalizeIiifLinks(json?.seeAlso, viewerLocale));

    let position = $derived(
        viewerState.config.information?.position ?? 'right',
    );
</script>

{#if viewerState.showMetadataPanel}
    <div
        data-panel-id="metadata"
        class="panel"
        class:floating={!embedded}
        class:bordered={!embedded && !viewerState.config.transparentBackground}
        class:border-left={!embedded && !viewerState.config.transparentBackground && position === 'left'}
        class:border-right={!embedded && !viewerState.config.transparentBackground && position !== 'left'}
        role="dialog"
        aria-label={m.metadata()}
    >
        {#if !embedded}
        <div class="header">
            <div class="header-title">
                <Info size={20} weight="bold" class="header-icon" />
                <h2 class="header-heading">{m.metadata()}</h2>
            </div>
        </div>
        {/if}

        <div class="body" class:scrollable={!embedded}>
            <h3 class="title">{title}</h3>

            {#if manifestThumbnail}
                <div class="thumbnail-wrap">
                    <img
                        src={manifestThumbnail}
                        alt=""
                        class="thumbnail"
                    />
                </div>
            {/if}

            {#if summary}
                <SanitizedHtml
                    tag="div"
                    html={summary}
                    class="viewer-html summary"
                />
            {/if}

            <dl>
                {#if attribution}
                    <dt class="term">
                        {attributionLabel}
                    </dt>
                    <SanitizedHtml
                        tag="dd"
                        html={attribution}
                        class="viewer-html detail"
                    />
                {/if}

                {#if license}
                    <dt class="term">
                        {m.license()}
                    </dt>
                    <dd class="detail">
                        <a
                            href={license}
                            target="_blank"
                            rel="noreferrer"
                            class="link break-all">{license}</a
                        >
                    </dd>
                {/if}

                {#each metadata as item, i (i)}
                    <dt class="term">
                        {item.label}
                    </dt>
                    <SanitizedHtml
                        tag="dd"
                        html={item.value}
                        class="viewer-html detail"
                    />
                {/each}

                <!-- Provider (0234) -->
                {#if providers.length > 0}
                    <dt class="term">
                        {m.provider()}
                    </dt>
                    <dd class="detail">
                        {#each providers as provider (provider.label || provider.links[0]?.id || provider.logos[0])}
                            <div class="provider">
                                <div class="provider-row">
                                    {#each provider.logos as logo (logo)}
                                        <div class="provider-logo-wrap">
                                            <img
                                                src={logo}
                                                alt=""
                                                class="provider-logo"
                                            />
                                        </div>
                                    {/each}

                                    {#if provider.label}
                                        <span class="provider-label"
                                            >{provider.label}</span
                                        >
                                    {/if}
                                </div>

                                {#if provider.links.length > 0}
                                    <div class="provider-links">
                                        {#each provider.links as link (link.id)}
                                            <a
                                                href={link.id}
                                                target="_blank"
                                                rel="noreferrer"
                                                class="link break-all"
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
                    <dt class="term">
                        {m.homepage()}
                    </dt>
                    <dd class="detail">
                        {#each homepages as hp, index (index)}
                            <a
                                href={hp.id}
                                target="_blank"
                                rel="noreferrer"
                                class="link break-all link-block"
                                >{hp.label}</a
                            >
                        {/each}
                    </dd>
                {/if}

                <!-- Rendering / Alternative Formats (0046) -->
                {#if rendering.length > 0}
                    <dt class="term">
                        {m.rendering()}
                    </dt>
                    <dd class="detail">
                        {#each rendering as item, index (index)}
                            <a
                                href={item.id}
                                target="_blank"
                                rel="noreferrer"
                                class="link break-all link-block"
                                >{item.label}{#if item.format}&nbsp;<span
                                        class="format">({item.format})</span
                                    >{/if}</a
                            >
                        {/each}
                    </dd>
                {/if}

                <!-- See Also / Related Resources (0053) -->
                {#if seeAlso.length > 0}
                    <dt class="term">
                        {m.see_also()}
                    </dt>
                    <dd class="detail">
                        {#each seeAlso as item, index (index)}
                            <a
                                href={item.id}
                                target="_blank"
                                rel="noreferrer"
                                class="link break-all link-block"
                                >{item.label}{#if item.format}&nbsp;<span
                                        class="format">({item.format})</span
                                    >{/if}</a
                            >
                        {/each}
                    </dd>
                {/if}

                {#if viewerState.manifestId}
                    <dt class="term">
                        {m.iiif_manifest_label()}
                    </dt>
                    <dd class="detail">
                        <a
                            href={viewerState.manifestId}
                            target="_blank"
                            rel="noreferrer"
                            class="link break-all"
                        >
                            {viewerState.manifestId}
                        </a>
                    </dd>
                {/if}
            </dl>
        </div>
    </div>
{/if}

<style>
    .panel {
        min-height: 0;
        display: flex;
        flex-direction: column;
    }

    .panel.floating {
        height: 100%;
        background-color: var(--panel-surface);
        box-shadow: 0 25px 50px -12px #00000040;
        z-index: 100;
        transition-property: width;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.2s;
    }

    .panel.bordered.border-left {
        border-right-width: 1px;
        border-right-style: solid;
        border-color: var(--surface-border);
    }

    .panel.bordered.border-right {
        border-left-width: 1px;
        border-left-style: solid;
        border-color: var(--surface-border);
    }

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-color: var(--surface-border);
    }

    .header-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }

    .header-title :global(.header-icon) {
        flex-shrink: 0;
    }

    .header-heading {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .body {
        padding: 1rem;
    }

    .body.scrollable {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .title {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
        margin-bottom: 1rem;
        overflow-wrap: break-word;
    }

    .thumbnail-wrap {
        margin-bottom: 1rem;
    }

    .thumbnail {
        max-height: 12rem;
        width: auto;
        border-radius: var(--radius-panels);
        border-width: 1px;
        border-style: solid;
        border-color: var(--surface-border);
        object-fit: contain;
    }

    .body :global(.summary) {
        margin-bottom: 1.5rem;
    }

    .term {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
        opacity: 0.7;
        margin-top: 1.5rem;
    }

    .body :global(.detail) {
        font-size: 0.875rem;
        line-height: 1.25rem;
        padding-inline-start: 1rem;
    }

    .provider {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }

    .provider-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .provider-logo-wrap {
        flex: 1 1 0%;
        min-width: 0;
    }

    .provider-logo {
        height: 3rem;
        width: 100%;
        object-fit: contain;
        object-position: left;
    }

    .provider-label {
        flex-shrink: 0;
        font-weight: 600;
    }

    .provider-links {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .format {
        opacity: 0.5;
    }

    .break-all {
        word-break: break-all;
    }

    .link-block {
        display: block;
        margin-top: 0.25rem;
    }

    .link {
        cursor: pointer;
        text-decoration-line: underline;
        color: var(--color-primary-text);
    }

    .link:focus {
        outline-style: none;
    }

    .link:focus-visible {
        outline-offset: 2px;
        outline: 2px solid;
    }

    @media (hover: hover) {
        .link:hover {
            color: var(--color-primary-text);
        }
    }
</style>
