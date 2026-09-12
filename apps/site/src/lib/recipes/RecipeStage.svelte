<script lang="ts">
    import { onMount } from 'svelte';
    import type { SdkPlugin } from 'triiiceratops/svelte';

    import { SITE_VIEWER_THEME } from '../viewerTheme';
    import type { ViewerConfig } from '../viewerConfig';
    import RecipeList from './RecipeList.svelte';
    import { DEFAULT_MANIFEST_URL } from './manifestCatalog';

    /**
     * Every manifest the workspace tracks, against one running viewer.
     *
     * The page a maintainer opens to see what a recipe actually renders as, and
     * the evidence behind the support column of the Cookbook's viewer table: the
     * catalog's own verdict sits beside each recipe, so a claim and the thing it
     * is a claim about are on screen together.
     *
     * One viewer for all of them, switched by manifest rather than remounted.
     * The recipes are third-party URLs on other people's servers, so a recipe
     * that will not load is as much of a result as one that will.
     *
     * The viewer, its stylesheet and its plugins are fetched after the page has
     * loaded. This route is under the same score gate as every other page of the
     * site, and a canvas renderer does not belong on any of their critical
     * paths.
     */

    type ViewerComponent =
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer'];

    let Viewer = $state<ViewerComponent | undefined>(undefined);
    let plugins = $state.raw<readonly SdkPlugin[]>([]);
    let manifestUrl = $state(DEFAULT_MANIFEST_URL);

    /*
     * The tools open from the start. A maintainer arrives to check one feature
     * of one recipe, and a toolbar that has to be opened first is a click
     * between them and every answer the page exists to give.
     */
    const config: ViewerConfig = { toolbarOpen: true };

    onMount(() => {
        const start = async () => {
            await import('triiiceratops/style.css');
            /*
             * Exactly the plugins a recipe needs to render or be inspected —
             * the same pair `/viewer/` runs. The export plugins are features of
             * the viewer rather than of any recipe, and `/features/` is where
             * each of those is shown.
             */
            const [module, av, image] = await Promise.all([
                import('triiiceratops/svelte'),
                import('@triiiceratops/plugin-av'),
                import('@triiiceratops/plugin-image-manipulation'),
            ]);
            plugins = [av.AvPlugin, image.ImageManipulationPlugin];
            Viewer = module.TriiiceratopsViewer;
        };

        if (document.readyState === 'complete') {
            void start();
            return;
        }
        const run = () => void start();
        addEventListener('load', run, { once: true });
        return () => removeEventListener('load', run);
    });
</script>

<div class="recstage">
    <RecipeList
        activeUrl={manifestUrl}
        onSelect={(url) => (manifestUrl = url)}
    />

    <div class="recstage__viewer">
        {#if Viewer === undefined}
            <p class="recstage__wait">The viewer loads once the page has.</p>
        {:else}
            <Viewer
                manifestId={manifestUrl}
                {config}
                {plugins}
                themeConfig={SITE_VIEWER_THEME}
            />
        {/if}
    </div>
</div>
