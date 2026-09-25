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

    /**
     * The bare viewer: a viewer with no chrome, driven by the content state in
     * the URL.
     *
     * Published IIIF Cookbook recipes link this path directly, which is why it
     * is the one URL in the tree that cannot move.
     *
     * The page prerenders to the shell below and nothing more. The viewer — a
     * canvas renderer — is imported and instantiated in `onMount`, so none of it
     * runs while the static adapter is rendering.
     *
     * It carries no social preview card, as it did not before: a card names one
     * page, and this one shows whatever material its link points at.
     *
     * The one exception to "no chrome" is the strip above the viewer: readers
     * reach this route cold from a Cookbook link, with no way back to the site
     * and no way to change the scheme, because the toggle lives in the prose
     * routes' rail and this route sits outside it.
     */

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

    /*
     * The site's host, not its name. The bar has to read as a way off this page
     * rather than as a title for the viewer under it: a product name at the top
     * left of an application is where that application names itself, and this
     * one would then be claiming the viewer ships a branded bar.
     */
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
            <!--
                For a reader who will never get past this screen. With scripting
                on, the viewer takes over mid-load and carries the same sentence
                across on the same ground, so anything extra here would be a line
                that appears and then vanishes.
            -->
            <noscript>
                <p class="aside">The viewer needs JavaScript.</p>
            </noscript>
        </div>
    {/if}
</div>

<style>
    /*
     * The bar takes the height it needs and the viewer takes the rest; nothing
     * here names a bar height, so the two cannot disagree about one.
     */
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

    /* The rail's brand idiom at the size this strip can afford, behind an
       arrow. The mark and the arrow are decorative; the host is the link's
       text, and `aria-label` says what following it does. */
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
