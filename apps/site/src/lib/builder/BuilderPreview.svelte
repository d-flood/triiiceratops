<script lang="ts">
    import { onMount } from 'svelte';
    import type { BuiltInTheme, ThemeConfig } from 'triiiceratops';

    import type { SitePlugin } from '../sitePlugins';
    import type { ViewerConfig } from '../viewerConfig';
    import { readTokenValues } from './probe';

    /**
     * The builder's live viewer, and the probe the controls take their starting
     * values from.
     *
     * The viewer, its stylesheet and the manifest are fetched after the page has
     * loaded. This route is under the same score gate as every other marketing
     * page, and a page arguing the viewer is light must not put a canvas
     * renderer on its own critical path.
     *
     * The plugins are whichever ones the reader turned on, and no others: a
     * builder that previewed chrome the reader's own build would not ship
     * would be lying to them. Each one is fetched only once it is chosen.
     *
     * Its rules are in `app.css` with the rest of the route's, so this page
     * costs one stylesheet like every other.
     */
    let {
        manifestId,
        config,
        plugins,
        theme,
        themeConfig,
        colourTokens,
        lengthTokens,
        onbase,
    }: {
        manifestId: string;
        config: ViewerConfig;
        /** Only the plugins the reader turned on, already loaded. */
        plugins: readonly SitePlugin[];
        /** The theme the overrides are layered on, and the snippet names. */
        theme: BuiltInTheme;
        /** Only the tokens the reader has set. */
        themeConfig: ThemeConfig;
        colourTokens: readonly string[];
        lengthTokens: readonly string[];
        /** The untouched value of every token, once the theme can be read. */
        onbase: (base: {
            colours: Record<string, string>;
            lengths: Record<string, number>;
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

    /*
     * The probe carries the class the published stylesheet scopes its tokens
     * under, so its custom properties resolve the way the running viewer's do
     * — including the derived ones, which are `var()` references and resolve
     * only where a theme is in scope. The e2e suite asserts the swatches come
     * back with real colours, which is what catches that scope changing.
     *
     * The ground is set here rather than in the template because the order is
     * load-bearing: the attribute has to be on the element before its computed
     * values are read through it.
     */
    $effect(() => {
        const element = probe;
        if (!element) return;

        element.setAttribute('data-theme', theme);
        onbase(readTokenValues(element, colourTokens, lengthTokens));
    });
</script>

<div class="pv">
    {#if Viewer === undefined}
        <p class="pv__wait">The viewer loads once the page has.</p>
    {:else}
        <div class="pv__probe viewer-root" bind:this={probe}></div>
        <div class="pv__live">
            <Viewer {manifestId} {config} {theme} {themeConfig} {plugins} />
        </div>
    {/if}
</div>
