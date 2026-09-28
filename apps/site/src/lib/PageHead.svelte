<script lang="ts">
    import { page } from '$app/state';

    import Hero from './Hero.svelte';

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
