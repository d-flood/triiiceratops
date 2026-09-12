<script lang="ts">
    import { onMount } from 'svelte';

    import { absolute } from './site';

    let { to }: { to: string } = $props();

    // Static hosting cannot send an HTTP redirect; preserve shared view selections.
    onMount(() => {
        window.location.replace(
            to + window.location.search + window.location.hash,
        );
    });
</script>

<svelte:head>
    <title>Page moved — Triiiceratops</title>
    <meta name="robots" content="noindex" />
    <link rel="canonical" href={absolute(to)} />
    <noscript><meta http-equiv="refresh" content={`0;url=${to}`} /></noscript>
</svelte:head>

<main>
    <h1>Page moved</h1>
    <p><a href={to}>Continue to {to}</a></p>
</main>
