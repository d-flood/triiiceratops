<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';
    import { resolveLanguageValue } from '../utils/languageMap';

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
        const thumbnail = json?.thumbnail;
        if (!thumbnail) return '';

        const first = Array.isArray(thumbnail) ? thumbnail[0] : thumbnail;
        if (typeof first === 'string') return first;
        return first?.id || first?.['@id'] || '';
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
                value = resolveLanguageValue(source.value, currentLang);
            } else if (item.getValue) {
                value = resolveLanguageValue(item.getValue(), currentLang);
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
            return resolveLanguageValue(statement.value, viewerLocale);
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
            const homepages = normaliseLinks(p.homepage);
            const logos = (
                Array.isArray(p.logo) ? p.logo : p.logo ? [p.logo] : []
            )
                .map((logo: any) =>
                    typeof logo === 'string' ? logo : logo?.id || logo?.['@id'],
                )
                .filter(Boolean);
            return { label, homepages, logos };
        });
    });

    // --- Homepage (0047) ---
    let homepages = $derived(normaliseLinks(json?.homepage));

    // --- Rendering (0046) ---
    let rendering = $derived(normaliseLinks(json?.rendering));

    // --- See Also (0053) ---
    let seeAlso = $derived(normaliseLinks(json?.seeAlso));
</script>

<!-- Modal -->
<dialog class="modal" open={viewerState.showMetadataDialog}>
    <div class="modal-box w-11/12 max-w-5xl">
        <form method="dialog">
            <button
                class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                onclick={() => viewerState.toggleMetadataDialog()}
                >&#x2715;</button
            >
        </form>

        <h3 class="font-bold text-lg mb-4">
            {title}
        </h3>

        <div class="py-4 overflow-y-auto max-h-[70vh]">
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
                <div class="mb-6 prose">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    <p>{@html summary}</p>
                </div>
            {/if}

            <dl>
                {#if attribution}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {attributionLabel}
                    </dt>
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    <dd class="text-sm ps-4">{@html attribution}</dd>
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
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    <dd class="text-sm ps-4">{@html item.value}</dd>
                {/each}

                <!-- Provider (0234) -->
                {#if providers.length > 0}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.provider()}
                    </dt>
                    <dd class="text-sm ps-4">
                        {#each providers as provider, index (index)}
                            <div class="flex items-center gap-3 mt-2">
                                {#each provider.logos as logo, index (index)}
                                    <img
                                        src={logo}
                                        alt=""
                                        class="h-8 w-auto object-contain"
                                    />
                                {/each}
                                {#if provider.homepages.length > 0}
                                    {#each provider.homepages as hp, index (index)}
                                        <a
                                            href={hp.id}
                                            target="_blank"
                                            rel="noreferrer"
                                            class="link link-primary"
                                            >{provider.label || hp.label}</a
                                        >
                                    {/each}
                                {:else}
                                    <span>{provider.label}</span>
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

        <div class="modal-action">
            <form method="dialog">
                <button
                    class="btn"
                    onclick={() => viewerState.toggleMetadataDialog()}
                    >{m.close()}</button
                >
            </form>
        </div>
    </div>
    <form method="dialog" class="modal-backdrop">
        <button onclick={() => viewerState.toggleMetadataDialog()}
            >{m.close()}</button
        >
    </form>
</dialog>
