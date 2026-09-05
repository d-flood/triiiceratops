<script lang="ts">
    import type { TocEntry } from './docs';

    /**
     * A page's contents, above its body.
     *
     * Above rather than beside: a third column would have to fit between the
     * sidebar and the rail, and at that width the measure is what gives way.
     * Each link is the heading's persisted slug, so it keeps resolving after the
     * heading is retitled.
     *
     * A page with a single heading has no shape to show, so it gets no contents.
     */
    let { entries }: { entries: readonly TocEntry[] } = $props();
</script>

{#if entries.length > 1}
    <!-- Out of the search index: the contents repeat the page's own headings,
         which the indexer already reads from the body below. -->
    <nav class="toc" aria-labelledby="toc-heading" data-pagefind-ignore>
        <h2 class="toc__title" id="toc-heading">On this page</h2>
        <ul>
            {#each entries as entry (entry.id)}
                <li class="toc__l{entry.level}">
                    <a href="#{entry.id}">{entry.text}</a>
                </li>
            {/each}
        </ul>
    </nav>
{/if}
