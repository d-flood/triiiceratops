<script lang="ts">
    import type { DocsNavSection } from './docs';

    /**
     * The documentation sidebar: the declared pages, in the declared order,
     * under the sections they were declared in.
     *
     * The home sits above every section and carries no heading of its own — it
     * is one link, and a heading over one link labels nothing.
     */
    let {
        sections,
        current,
        onnavigate,
    }: {
        sections: readonly DocsNavSection[];
        current: string;
        onnavigate?: () => void;
    } = $props();
</script>

<!-- Out of the search index: the sidebar sits inside the indexed page body, so
     without this every documentation page would match a query for the title of
     every other one. -->
<nav class="docsnav" aria-label="Documentation" data-pagefind-ignore>
    {#each sections as section (section.title ?? '')}
        {#if section.title}
            <h2 class="docsnav__section">{section.title}</h2>
        {/if}
        <ul class="docsnav__list">
            {#each section.items as item (item.path)}
                <li>
                    <a
                        href={item.path}
                        aria-current={item.path === current
                            ? 'page'
                            : undefined}
                        onclick={onnavigate}>{item.title}</a
                    >
                </li>
            {/each}
        </ul>
    {/each}
</nav>
