<script lang="ts">
    import { page } from '$app/state';

    import type { SitePage } from './routes';

    /**
     * The rest of the site, as ruled rows: every page the rail carries except
     * the one being read, numbered by its position in the rail so the two
     * orderings agree.
     */

    // `page.data` is not narrowed to one route's data, so the layout's own fields
    // arrive untyped in a block rendered inside a page.
    const nav = $derived((page.data.nav ?? []) as SitePage[]);
    const onward = $derived(
        nav
            .map((entry, index) => ({ entry, number: index + 1 }))
            .filter(({ entry }) => entry.path !== page.data.path),
    );
</script>

{#if onward.length > 0}
    <nav aria-label="The rest of the site">
        <h2>The rest of the site</h2>
        <div class="rows">
            {#each onward as { entry, number } (entry.path)}
                <a href={entry.path}>
                    <span class="n">{number}</span>
                    <span class="ttl">{entry.shortTitle}</span>
                    <span class="say">{entry.intro}</span>
                    <span class="go" aria-hidden="true">→</span>
                </a>
            {/each}
        </div>
    </nav>
{/if}
