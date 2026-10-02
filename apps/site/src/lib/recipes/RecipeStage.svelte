<script lang="ts">
    import { onMount } from 'svelte';
    import type { SdkPlugin } from 'triiiceratops/svelte';

    import { SITE_VIEWER_THEME } from '../viewerTheme';
    import type { ViewerConfig } from '../viewerConfig';
    import RecipeList from './RecipeList.svelte';
    import { DEFAULT_MANIFEST_URL } from './manifestCatalog';

    type ViewerComponent =
        (typeof import('triiiceratops/svelte'))['TriiiceratopsViewer'];

    let Viewer = $state<ViewerComponent | undefined>(undefined);
    let plugins = $state.raw<readonly SdkPlugin[]>([]);
    let manifestUrl = $state(DEFAULT_MANIFEST_URL);

    const config: ViewerConfig = { toolbarOpen: true };

    onMount(() => {
        const start = async () => {
            await import('triiiceratops/style.css');
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
            <p class="recstage__wait">Loading viewer…</p>
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
