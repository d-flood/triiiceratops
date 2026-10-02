<script lang="ts">
    import { page } from '$app/state';

    import type { SitePage } from './routes';

    const nav = $derived((page.data.nav ?? []) as SitePage[]);
    const onward = $derived(
        nav
            .map((entry, index) => ({ entry, number: index + 1 }))
            .filter(({ entry }) => entry.path !== page.data.path),
    );
</script>

{#if onward.length > 0}
    <nav aria-label="Other pages">
        <h2>Other pages</h2>
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
