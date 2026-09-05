<script lang="ts">
    import type { Snippet } from 'svelte';

    /**
     * A ruled list of links, as a container the document composes.
     *
     * Named for the shape it draws rather than for what any one page puts in it:
     * a set of rows, each a link with a supporting line and an optional second
     * link on the right. `/production/` uses two of them, but nothing here knows
     * that.
     *
     * `note` is the group's own supporting line, carried as an attribute rather
     * than left to an ordinary paragraph above it. It is set in the smaller
     * muted face belonging to this group, and it has to sit flush with the rows
     * rather than centred at the prose measure — which is the other reason the
     * group is one `section` and not two loose siblings, since the rule that
     * centres prose matches a paragraph only as a direct child.
     */
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
