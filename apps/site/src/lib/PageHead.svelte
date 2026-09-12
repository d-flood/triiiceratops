<script lang="ts">
    import { page } from '$app/state';

    import Hero from './Hero.svelte';

    /**
     * A page's heading and its introductory sentence, from the page's own words.
     *
     * Every prose route renders it — a content route, its edit variant, and the
     * routes that render from code — so a heading is a heading whichever of them
     * a reader is on. The front page's heading is the hero's: the headline sits
     * beside the running viewer there, which is the point the front page exists
     * to make.
     */
    const current = $derived(page.data.current);
    const isFront = $derived(page.data.path === '/');
</script>

{#if current}
    {#if isFront}
        <Hero headline={current.title} lede={current.intro} />
    {:else}
        <div class="pagehead">
            <h1>{current.title}</h1>
            <p class="lede">{current.intro}</p>
        </div>
    {/if}
{/if}
