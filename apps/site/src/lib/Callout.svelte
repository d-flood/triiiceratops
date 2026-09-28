<script lang="ts">
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
