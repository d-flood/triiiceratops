<script lang="ts">
    /*
     * The shelf of loadable manifests: the Cookbook catalog grouped as the
     * Cookbook groups it, followed by the manifests that have no catalog entry.
     *
     * A plain list rather than a collapsible drawer: it is one element of a page
     * here — beside the viewer on a wide viewport, above it on a narrow one —
     * so there is nothing for it to get out of the way of. The group names are
     * real headings, which is how a reader gets past forty recipes to the one
     * kind they came for.
     */
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
        /** The manifest currently loaded, marked in the list. */
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

    /*
     * Only a recipe the catalog has a verdict on says anything. An entry with
     * no `support` field has no catalog entry at all, and reading that as
     * either verdict would be inventing one.
     */
    function status(entry: ManifestEntry): string | undefined {
        if (!entry.support || entry.support === 'supported') return undefined;
        return entry.reason ? `Unsupported — ${entry.reason}` : 'Unsupported';
    }
</script>

<!-- `data-pagefind-ignore`: the page wears the chrome, so its body is the
     site's search scope, and forty recipe names are forty pages' worth of IIIF
     vocabulary that would out-match real prose on half the site's queries. The
     heading and the lede above still make the page findable. -->
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
