<script>
    // Consume the packed `@triiiceratops/plugin-sdk/svelte` adapter: a selector
    // exposed as a Svelte readable store, read with `$`-auto-subscription.
    import { viewerSelector } from '@triiiceratops/plugin-sdk/svelte';

    let { context } = $props();
    const open = viewerSelector(context, (s) => s.toolbarOpen);
</script>

<span data-testid="tri-plugin-value">{$open ? 'open' : 'closed'}</span>
