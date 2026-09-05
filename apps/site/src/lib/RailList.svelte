<script lang="ts">
    import type { SitePage } from './routes';

    /**
     * The rail's items: every page the site navigates to, in the order of the
     * argument the site makes, tinted by group. The groups carry no labels —
     * three tint steps and the spacing convey the grouping, and inert category
     * labels would add a row of words that says nothing.
     *
     * The item heights depend on the list being whole: they divide the rail's
     * height between them, so a rail missing items stretches the ones it has.
     */
    let {
        nav,
        current,
        onnavigate,
    }: {
        nav: readonly SitePage[];
        current: string;
        onnavigate?: () => void;
    } = $props();
</script>

<div class="rail__list">
    {#each nav as entry, index (entry.path)}
        <a
            class="rail__item g{entry.group}"
            href={entry.path}
            aria-current={entry.path === current ? 'page' : undefined}
            onclick={onnavigate}
        >
            <span class="n">{index + 1}</span>
            <span>{entry.shortTitle}</span>
        </a>
    {/each}
</div>
