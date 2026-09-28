<script lang="ts">
    import type { DocsNavSection } from './docs';

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
