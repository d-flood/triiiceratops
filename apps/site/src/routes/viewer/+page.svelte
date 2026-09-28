<script lang="ts">
    import { onMount } from 'svelte';

    import '$lib/bare-viewer/bare-viewer.css';
    import { APP_MARKER, BARE_VIEWER_APP } from '$lib/applications';
    import {
        HOSTED_VIEWER_PATH,
        SITE_NAME,
        SITE_ROOT,
        absolute,
    } from '$lib/site';
    import ThemeToggle from '$lib/ThemeToggle.svelte';
    import Wordmark from '$lib/Wordmark.svelte';

    type BareViewerComponent =
        (typeof import('$lib/bare-viewer/BareViewer.svelte'))['default'];

    let BareViewer = $state<BareViewerComponent | undefined>(undefined);

    onMount(() => {
        void (async () => {
            await import('triiiceratops/style.css');
            BareViewer = (await import('$lib/bare-viewer/BareViewer.svelte'))
                .default;
        })();
    });

    const host = new URL(SITE_ROOT).host;

    const title = SITE_NAME;
    const description =
        'A bare IIIF viewer. Open the view named by an iiif-content parameter, or paste a manifest URL or content state.';
</script>

<svelte:head>
    <title>{title}</title>
    <link rel="canonical" href={absolute(HOSTED_VIEWER_PATH)} />
    <meta name="description" content={description} />
    <meta name={APP_MARKER} content={BARE_VIEWER_APP} />
</svelte:head>

<div class="route">
    <nav class="sitebar" aria-label="Site">
        <a class="brand" href="/" aria-label="Back to {host}">
            <span class="arrow" aria-hidden="true">←</span>
            <Wordmark eye />
            <span>{host}</span>
        </a>
        <ThemeToggle />
    </nav>

    {#if BareViewer}
        <BareViewer />
    {:else}
        <div class="appwait">
            <p>Loading the viewer…</p>
            <noscript>
                <p class="aside">The viewer needs JavaScript.</p>
            </noscript>
        </div>
    {/if}
</div>

<style>
    .route {
        display: flex;
        flex-direction: column;
        height: 100dvh;
        background: var(--bench);
    }

    .sitebar {
        display: flex;
        align-items: center;
        gap: var(--s3);
        padding: var(--s2) var(--s3);
        border-bottom: 1px solid var(--rule);
        background: var(--paper);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: var(--s2);
        color: var(--ink-2);
        font-size: var(--t-small);
        text-decoration: none;
    }
    .brand :global(svg) {
        width: 20px;
        height: auto;
        flex: none;
    }
    .brand:hover {
        color: var(--ink);
    }
    .brand .arrow {
        font-size: 1.1em;
        line-height: 1;
    }
    .brand:hover span {
        text-decoration: underline;
    }
    .brand:hover .arrow {
        text-decoration: none;
    }

    .appwait {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s3);
        padding: var(--s5);
        text-align: center;
    }
</style>
