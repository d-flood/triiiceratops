<script lang="ts">
    import { getContext } from 'svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';
    import { m, language } from '../state/i18n.svelte';

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let manifest = $derived(viewerState.manifest);

    // Helper to extract metadata
    let metadata = $derived.by(() => {
        const currentLang = language.current;
        if (!manifest) return [];

        // Manifesto's getMetadata() returns an array of { label: ..., value: ... } objects
        // The values might be strings or arrays of objects (LanguageMap)
        const rawMetadata = manifest.getMetadata();

        if (!rawMetadata) return [];

        return rawMetadata.map((item: any) => {
            let label = '';
            let value = '';

            // Helper to pick best language
            const pickLang = (val: string | any[]) => {
                if (typeof val === 'string') return val;
                if (Array.isArray(val)) {
                    // exact match
                    let match = val.find(
                        (x: any) =>
                            x.locale === currentLang ||
                            x.language === currentLang,
                    );
                    // fallback to en
                    if (!match)
                        match = val.find(
                            (x: any) =>
                                x.locale === 'en' || x.language === 'en',
                        );
                    // fallback to none/null
                    if (!match)
                        match = val.find((x: any) => !x.locale && !x.language);
                    // fallback to first
                    if (!match) match = val[0];

                    return match ? match.value : '';
                }
                return String(val);
            };

            // Handle Label
            if (item.getLabel) {
                label = pickLang(item.getLabel());
            } else if (item.label) {
                label = pickLang(item.label);
            }

            // Handle Value
            if (item.getValue) {
                value = pickLang(item.getValue());
            } else if (item.value) {
                value = pickLang(item.value);
            }

            return { label, value };
        });
    });

    // Also get top-level description, attribution, license/rights
    let description = $derived(manifest ? manifest.getDescription() : '');
    let attribution = $derived(
        manifest ? manifest.getRequiredStatement()?.getValue() : '',
    );
    // getRequiredStatement usually returns { label: ..., value: ... } or similar structure that supports getValue()

    let license = $derived(manifest ? manifest.getLicense() : '');
</script>

<!-- Modal -->
<dialog class="modal" open={viewerState.showMetadataDialog}>
    <div class="modal-box w-11/12 max-w-5xl">
        <form method="dialog">
            <button
                class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
                onclick={() => viewerState.toggleMetadataDialog()}>✕</button
            >
        </form>

        <h3 class="font-bold text-lg mb-4">
            {manifest
                ? manifest.getLabel().length && manifest.getLabel()[0]
                    ? manifest.getLabel()[0].value
                    : m.metadata_label_fallback()
                : m.loading()}
        </h3>

        <div class="py-4 overflow-y-auto max-h-[70vh]">
            {#if description}
                <div class="mb-6 prose">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    <p>{@html description}</p>
                </div>
            {/if}

            <dl class="grid grid-cols-1 md:grid-cols-[200px_1fr]">
                {#if attribution}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.attribution()}
                    </dt>
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    <dd class="text-sm ps-2">{@html attribution}</dd>
                {/if}

                {#if license}
                    <dt class="font-bold text-lg opacity-70 mt-6">
                        {m.license()}
                    </dt>
                    <dd class="text-sm ps-2">
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
                    <dd class="text-sm ps-2">{@html item.value}</dd>
                {/each}
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
