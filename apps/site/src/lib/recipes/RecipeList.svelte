<script lang="ts">
    import {
        groupRecipes,
        INSTITUTIONAL_MANIFESTS,
        LOCAL_MANIFESTS,
        PRESENTATION_4_MANIFESTS,
        WAVEFORM_MANIFESTS,
        type ManifestEntry,
        type ManifestSection,
    } from './manifestCatalog';

    let {
        activeUrl = '',
        onSelect,
    }: {
        activeUrl?: string;
        onSelect: (url: string) => void;
    } = $props();

    const sections: readonly ManifestSection[] = [
        ...groupRecipes(),
        {
            key: 'presentation-4',
            heading: 'Presentation 4',
            entries: PRESENTATION_4_MANIFESTS,
        },
        {
            key: 'institutional',
            heading: 'Institutional manifests',
            entries: INSTITUTIONAL_MANIFESTS,
        },
        {
            key: 'waveforms',
            heading: 'Live waveform data',
            entries: WAVEFORM_MANIFESTS,
        },
        {
            key: 'local',
            heading: 'Vendored here',
            entries: LOCAL_MANIFESTS,
        },
    ].filter((section) => section.entries.length > 0);

    function status(entry: ManifestEntry): string | undefined {
        if (!entry.support || entry.support === 'supported') return undefined;
        return entry.reason ? `Unsupported — ${entry.reason}` : 'Unsupported';
    }
</script>

<!-- Recipe names would out-match real prose in site search. -->
<nav class="recstage__rail" aria-label="Manifests" data-pagefind-ignore>
    {#each sections as section (section.key)}
        <h2 class="recstage__head">{section.heading}</h2>
        <ul class="recstage__group">
            {#each section.entries as entry (entry.url)}
                {@const say = status(entry)}
                <li>
                    <button
                        type="button"
                        class="recstage__opt"
                        class:on={entry.url === activeUrl}
                        aria-current={entry.url === activeUrl
                            ? 'true'
                            : undefined}
                        onclick={() => onSelect(entry.url)}
                    >
                        <span class="recstage__name">{entry.label}</span>
                        {#if say}
                            <span class="recstage__say">{say}</span>
                        {/if}
                    </button>
                </li>
            {/each}
        </ul>
    {/each}
</nav>
