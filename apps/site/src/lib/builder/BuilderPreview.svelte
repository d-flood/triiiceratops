<script lang="ts">
    import { onMount } from 'svelte';
    import type { BuiltInTheme, ThemeConfig } from 'triiiceratops';

    import type { SitePlugin } from '../sitePlugins';
    import type { ViewerConfig } from '../viewerConfig';
    import { readTokenValues } from './probe';

    let {
        manifestId,
        config,
        plugins,
        theme,
        themeConfig,
        colourTokens,
        lengthTokens,
        percentTokens,
        onbase,
    }: {
        manifestId: string;
        config: ViewerConfig;
        plugins: readonly SitePlugin[];
        theme: BuiltInTheme;
        themeConfig: ThemeConfig;
        colourTokens: readonly string[];
        lengthTokens: readonly string[];
        percentTokens: readonly string[];
        onbase: (base: {
            colours: Record<string, string>;
            lengths: Record<string, number>;
            percents: Record<string, number>;
        }) => void;
    } = $props();

    type ViewerComponent =
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer'];

    let Viewer = $state<ViewerComponent | undefined>(undefined);
    let probe = $state<HTMLDivElement | undefined>(undefined);

    onMount(() => {
        const start = async () => {
            await import('triiiceratops/style.css');
            Viewer = (await import('triiiceratops/svelte')).TriiiceratopsViewer;
        };

        if (document.readyState === 'complete') {
            void start();
            return;
        }
        const run = () => void start();
        addEventListener('load', run, { once: true });
        return () => removeEventListener('load', run);
    });

    /* Attribute first, then read: computed values resolve only where a theme is in scope. */
    $effect(() => {
        const element = probe;
        if (!element) return;

        element.setAttribute('data-theme', theme);
        onbase(
            readTokenValues(element, colourTokens, lengthTokens, percentTokens),
        );
    });
</script>

<div class="pv">
    {#if Viewer === undefined}
        <p class="pv__wait">Loading viewer…</p>
    {:else}
        <div class="pv__probe viewer-root" bind:this={probe}></div>
        <div class="pv__live">
            <Viewer {manifestId} {config} {theme} {themeConfig} {plugins} />
        </div>
    {/if}
</div>
