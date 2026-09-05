<script lang="ts">
    import { LISTED } from './routes';

    /**
     * The rail's items: every route whose prose has landed, in the order of the
     * argument the site makes, tinted by group. The groups carry no labels —
     * three tint steps and the spacing convey the grouping, and inert category
     * labels would add a row of words that says nothing.
     *
     * A route still carrying filler is absent here, which is the same predicate
     * that keeps it out of the sitemap and gives it `noindex`.
     */
    let {
        current,
        onnavigate,
    }: { current: string; onnavigate?: () => void } = $props();
</script>

<div class="rail__list">
    {#each LISTED as route, index (route.path)}
        <a
            class="rail__item g{route.group}"
            href={route.path}
            aria-current={route.path === current ? 'page' : undefined}
            onclick={onnavigate}
        >
            <span class="n">{index + 1}</span>
            <span>{route.shortTitle}</span>
        </a>
    {/each}
</div>
