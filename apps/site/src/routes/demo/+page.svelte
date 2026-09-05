<script lang="ts">
    import { onMount } from 'svelte';

    import '$lib/playground/playground.css';
    import { APP_MARKER, PLAYGROUND_APP } from '$lib/applications';
    import {
        FEDIVERSE_CREATOR,
        PLAYGROUND_OG_IMAGE,
        PLAYGROUND_OG_IMAGE_ALT,
        PLAYGROUND_PATH,
        SITE_NAME,
        THEME_COLOR,
        TWITTER_HANDLE,
        absolute,
    } from '$lib/site';

    /**
     * The playground: an application route, not a document.
     *
     * The page prerenders to the shell below and nothing more. The playground
     * itself — and with it the viewer, a canvas renderer — is imported and
     * instantiated in `onMount`, so no viewer code runs while the static adapter
     * is rendering. A static import here would put the whole renderer in the
     * prerender graph and execute it in Node.
     */

    type PlaygroundComponent =
        (typeof import('$lib/playground/Demo.svelte'))['default'];

    let Playground = $state<PlaygroundComponent | undefined>(undefined);

    onMount(() => {
        void (async () => {
            // The viewer's published light-DOM stylesheet, which it needs in
            // order to render. Loaded before the component so the first paint of
            // the viewer is not an unstyled one.
            await import('triiiceratops/style.css');
            Playground = (await import('$lib/playground/Demo.svelte')).default;
        })();
    });

    const canonical = absolute(PLAYGROUND_PATH);
    const title = 'Triiiceratops — live demo';
    const description =
        'Open any IIIF manifest in the Triiiceratops live demo: panels, image tools, PDF and image export, and annotations.';
    const socialDescription =
        'Open any IIIF manifest in the browser: panels, image tools, PDF and image export, and annotations.';
</script>

<svelte:head>
    <title>{title}</title>
    <link rel="canonical" href={canonical} />
    <meta name="description" content={description} />
    <meta name={APP_MARKER} content={PLAYGROUND_APP} />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content={SITE_NAME} />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={socialDescription} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={PLAYGROUND_OG_IMAGE} />
    <meta property="og:image:secure_url" content={PLAYGROUND_OG_IMAGE} />
    <meta property="og:image:type" content="image/png" />
    <!-- Declaring the dimensions lets Facebook and LinkedIn lay out the
         large-image card on their FIRST scrape, before they have downloaded the
         file. Without them the first share often renders as a small thumbnail. -->
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content={PLAYGROUND_OG_IMAGE_ALT} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content={TWITTER_HANDLE} />
    <meta name="twitter:creator" content={TWITTER_HANDLE} />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={socialDescription} />
    <meta name="twitter:image" content={PLAYGROUND_OG_IMAGE} />
    <meta name="twitter:image:alt" content={PLAYGROUND_OG_IMAGE_ALT} />
    <meta name="fediverse:creator" content={FEDIVERSE_CREATOR} />
    <meta name="theme-color" content={THEME_COLOR} />
</svelte:head>

{#if Playground}
    <Playground />
{:else}
    <div class="appwait">
        <p>Loading the playground…</p>
        <p class="aside">
            It needs JavaScript. <a class="link" href="/size/"
                >What the viewer weighs</a
            > is measured without it.
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
