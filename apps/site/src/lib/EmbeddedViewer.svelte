<script lang="ts">
    import { onMount } from 'svelte';
    import ChromeSkeleton from './ChromeSkeleton.svelte';
    import type {
        BuiltInTheme,
        CanvasRegion,
        ThemeConfig,
        ViewerState,
    } from 'triiiceratops';
    import type { Example } from './examples';
    import type { SitePlugin } from './sitePlugins';
    import type { ViewerConfig } from './viewerConfig';
    import { SITE_VIEWER_THEME } from './viewerTheme';

    /** A viewer embedded in a marketing page. */
    let {
        example,
        config,
        canvasId,
        initialCanvasRegion,
        plugins = false,
        label,
        eager = false,
        theme,
        themeConfig = SITE_VIEWER_THEME,
        fill = false,
        acceptDroppedContentState = true,
        viewerState = $bindable(),
    }: {
        example: Example;
        config?: ViewerConfig;
        acceptDroppedContentState?: boolean;
        canvasId?: string;
        /** Names where the embed OPENS; spent at the first fit. */
        initialCanvasRegion?: CanvasRegion | null;
        plugins?: readonly SitePlugin[] | false;
        label: string;
        eager?: boolean;
        theme?: BuiltInTheme;
        themeConfig?: ThemeConfig;
        fill?: boolean;
        viewerState?: ViewerState;
    } = $props();

    type ViewerComponent =
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer'];

    const first = $derived(example.firstCanvas);
    const prerender = $derived(first.prerender);
    const reserved = $derived(example.reserve ?? first);

    let box: HTMLDivElement;
    let Viewer = $state<ViewerComponent | undefined>(undefined);

    const held = $derived(
        viewerState?.isManifestReady(example.manifest) !== true,
    );

    const applied = $derived({ ...config, transparentBackground: held });

    async function start() {
        const module = await import('triiiceratops/svelte');
        await import('triiiceratops/style.css');
        Viewer = module.TriiiceratopsViewer;
    }

    function afterLoad(then: () => void): () => void {
        if (document.readyState === 'complete') {
            then();
            return () => {};
        }
        addEventListener('load', then, { once: true });
        return () => removeEventListener('load', then);
    }

    onMount(() => {
        if (box.getRootNode() !== document) return;

        if (eager) return afterLoad(() => void start());

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                observer.disconnect();
                void start();
            },
            { rootMargin: '300px' },
        );
        const cancel = afterLoad(() => observer.observe(box));
        return () => {
            cancel();
            observer.disconnect();
        };
    });
</script>

<div
    class="vw"
    class:vw--fill={fill}
    bind:this={box}
    style="aspect-ratio: {reserved.width} / {reserved.height}"
    role="group"
    aria-label={label}
>
    {#if prerender && held}
        <img
            class="vw__first"
            src={prerender.src}
            alt={prerender.alt}
            width={first.width}
            height={first.height}
            decoding="async"
            fetchpriority={eager ? 'high' : 'auto'}
            loading={eager ? 'eager' : 'lazy'}
        />
    {/if}
    {#if Viewer === undefined}
        <ChromeSkeleton canvases={example.canvases} />
    {:else}
        <div class="vw__live">
            <Viewer
                bind:viewerState
                {acceptDroppedContentState}
                manifestId={example.manifest}
                {canvasId}
                {initialCanvasRegion}
                config={applied}
                {theme}
                {themeConfig}
                {plugins}
            />
        </div>
    {/if}
</div>
