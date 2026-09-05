<script lang="ts">
    import { onMount } from 'svelte';

    import '$lib/bare-viewer/bare-viewer.css';
    import { APP_MARKER, BARE_VIEWER_APP } from '$lib/applications';
    import { HOSTED_VIEWER_PATH, SITE_NAME, absolute } from '$lib/site';

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
     */

    type BareViewerComponent =
        (typeof import('$lib/bare-viewer/BareViewer.svelte'))['default'];

    let BareViewer = $state<BareViewerComponent | undefined>(undefined);

    onMount(() => {
        void (async () => {
            // The viewer's published light-DOM stylesheet, which it needs in
            // order to render.
            await import('triiiceratops/style.css');
            BareViewer = (await import('$lib/bare-viewer/BareViewer.svelte'))
                .default;
        })();
    });

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

{#if BareViewer}
    <BareViewer />
{:else}
    <div class="appwait">
        <p>Loading the viewer…</p>
        <p class="aside">
            It needs JavaScript. Paste a manifest URL or a IIIF content state
            once it has loaded.
        </p>
    </div>
{/if}

<style>
    .appwait {
        display: flex;
        min-height: 100dvh;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--s3);
        padding: var(--s5);
        text-align: center;
    }
</style>
