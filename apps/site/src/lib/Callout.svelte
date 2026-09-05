<script lang="ts">
    /**
     * An aside the reader is meant to stop at: a note, a caution, a warning.
     *
     * The kind is a word rather than a colour, because the colour is what the
     * reader sees and the word is what the document means. The site's rules and
     * tints do the rest — a callout is a bordered block of the same prose, not a
     * box with an icon in it.
     */
    let {
        kind = 'note',
        title = '',
        children,
    }: {
        kind?: string;
        title?: string;
        children?: import('svelte').Snippet;
    } = $props();
</script>

<aside class="callout callout--{kind}">
    {#if title}<p class="callout__title">{title}</p>{/if}
    {@render children?.()}
</aside>
