<script lang="ts">
    import { onMount } from 'svelte';
    import type { BuiltInTheme, ThemeConfig } from 'triiiceratops';

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
     * Core only, and no plugins: `apps/site` declares no plugin dependency, and
     * a builder that previewed chrome the reader's own build would not ship
     * would be lying to them.
     *
     * Its rules are in `app.css` with the rest of the route's, so this page
     * costs one stylesheet like every other.
     */
    let {
        manifestId,
        config,
        theme,
        themeConfig,
        colourTokens,
        lengthTokens,
        onbase,
    }: {
        manifestId: string;
        config: ViewerConfig;
        /** The built-in theme the overrides are layered on, following the page. */
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
     * The probe carries the theme attribute *and* the class the published
     * stylesheet scopes its tokens under, so its custom properties resolve to
     * that theme's values — including the derived ones, which are `var()`
     * references and resolve only where the theme is in scope. The e2e suite
     * asserts the swatches come back with real colours, which is what catches
     * that scope changing.
     */
    $effect(() => {
        const element = probe;
        if (!element || !theme) return;
        onbase(readTokenValues(element, colourTokens, lengthTokens));
    });
</script>

<div class="pv">
    {#if Viewer === undefined}
        <p class="pv__wait">The viewer loads once the page has.</p>
    {:else}
        <div
            class="pv__probe viewer-root"
            data-theme={theme}
            bind:this={probe}
        ></div>
        <div class="pv__live">
            <Viewer
                {manifestId}
                {config}
                {theme}
                {themeConfig}
                plugins={false}
            />
        </div>
    {/if}
</div>
