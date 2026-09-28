<script lang="ts">
    import type { Snippet } from 'svelte';

    let { note = '', children }: { note?: string; children?: Snippet } =
        $props();

    const say = $derived(note.trim());
</script>

<section>
    {#if say}
        <p class="linkrows__say">{say}</p>
    {/if}
    <div class="linkrows">
        {#if children}
            {@render children()}
        {/if}
    </div>
</section>
