<script lang="ts">
    import type { TocEntry } from './docs';

    let { entries }: { entries: readonly TocEntry[] } = $props();
</script>

{#if entries.length > 1}
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
