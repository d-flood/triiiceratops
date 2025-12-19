<script lang="ts">
    import { setContext, onDestroy, untrack } from 'svelte';
    import { ViewerState, VIEWER_STATE_KEY } from '../state/viewer.svelte';
    import type { PluginDef } from '../types/plugin';
    import type { DaisyUITheme, ThemeConfig } from '../theme/types';
    import type { ViewerConfig } from '../types/config';
    import { applyTheme } from '../theme/themeManager';
    import OSDViewer from './OSDViewer.svelte';
    import CanvasNavigation from './CanvasNavigation.svelte';
    import AnnotationOverlay from './AnnotationOverlay.svelte';
    import ThumbnailGallery from './ThumbnailGallery.svelte';
    import FloatingMenu from './FloatingMenu.svelte';
    import LeftFab from './LeftFab.svelte';
    import MetadataDialog from './MetadataDialog.svelte';
    import SearchPanel from './SearchPanel.svelte';
    import { m, language } from '../state/i18n.svelte';

    // SSR-safe browser detection for library consumers
    const browser = typeof window !== 'undefined';

    interface Props {
        manifestId?: string;
        canvasId?: string;
        plugins?: PluginDef[];
        /** Built-in DaisyUI theme name. Defaults to 'light' or 'dark' based on prefers-color-scheme. */
        theme?: DaisyUITheme;
        /** Custom theme configuration to override the base theme's values. */
        themeConfig?: ThemeConfig;
        /** Configuration options for the viewer UI */
        config?: ViewerConfig;
        /** Bindable viewer state instance for external access (Svelte consumers) */
        viewerState?: ViewerState;
    }

    let {
        manifestId,
        canvasId,
        plugins = [],
        theme,
        themeConfig,
        config = {},
        viewerState = $bindable(),
    }: Props = $props();

    // Reference to root element for applying theme
    let rootElement: HTMLElement | undefined = $state();

    // Reactively apply theme when element is available or theme/themeConfig changes
    $effect(() => {
        if (rootElement) {
            applyTheme(rootElement, theme, themeConfig);
        }
    });

    // Create per-instance viewer state
    // Note: We pass empty initial values and use $effect blocks below to set
    // manifestId, canvasId, and plugins reactively, avoiding Svelte's
    // "state_referenced_locally" warning about capturing initial prop values.
    const internalViewerState = new ViewerState(null, undefined, []);
    viewerState = internalViewerState; // Expose via bindable prop
    setContext(VIEWER_STATE_KEY, internalViewerState);

    onDestroy(() => {
        internalViewerState.destroyAllPlugins();
    });

    $effect(() => {
        if (manifestId && manifestId !== internalViewerState.manifestId) {
            internalViewerState.setManifest(manifestId);
        }
    });

    // Track last applied canvasId PROP value to prevent reverting internal navigation
    let lastAppliedCanvasId = '';

    $effect(() => {
        // Only sync from prop to internal state when PROP actually changes
        // This prevents internal navigation from being reverted when the effect
        // runs due to internal state changes
        if (canvasId && canvasId !== lastAppliedCanvasId) {
            lastAppliedCanvasId = canvasId;
            // Only apply if different from current internal state
            if (canvasId !== internalViewerState.canvasId) {
                internalViewerState.setCanvas(canvasId);
            }
        }
    });

    // Track last applied config to prevent redundant updates and loops
    let lastConfigStr = '';

    $effect(() => {
        if (config) {
            const str = JSON.stringify(config);
            if (str !== lastConfigStr) {
                lastConfigStr = str;
                console.log(
                    '[Viewer] updateConfig called with new config:',
                    config,
                );
                internalViewerState.updateConfig(config);
            }
        }
    });

    // Register plugins reactively with cleanup
    let registeredPluginIds: string[] = [];

    $effect(() => {
        // Create dependency on plugins prop by accessing it
        const currentPlugins = plugins;

        // Use untrack so that operations inside (like registerPlugin accessing/writing state)
        // do NOT become dependencies of this effect. This prevents infinite loops.
        untrack(() => {
            // Cleanup previous plugins first
            for (const id of registeredPluginIds) {
                internalViewerState.unregisterPlugin(id);
            }
            registeredPluginIds = [];

            // Register new plugins
            for (const plugin of currentPlugins) {
                const id =
                    plugin.id ||
                    `plugin-${Math.random().toString(36).substr(2, 9)}`;
                // Create a copy with the ID to ensure stability for THIS registration
                const defWithId = { ...plugin, id };
                internalViewerState.registerPlugin(defWithId);
                registeredPluginIds.push(id);
            }
        });

        // Cleanup on effect re-run
        return () => {
            for (const id of registeredPluginIds) {
                internalViewerState.unregisterPlugin(id);
            }
            registeredPluginIds = [];
        };
    });

    onDestroy(() => {
        internalViewerState.destroyAllPlugins();
    });

    $effect(() => {
        if (!browser) return;

        const handleFullScreenChange = () => {
            internalViewerState.isFullScreen = !!document.fullscreenElement;
        };
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => {
            document.removeEventListener(
                'fullscreenchange',
                handleFullScreenChange,
            );
        };
    });

    let isLeftSidebarVisible = $derived(
        (internalViewerState.showThumbnailGallery &&
            internalViewerState.dockSide === 'left') ||
            internalViewerState.pluginPanels.some(
                (p) => p.position === 'left' && p.isVisible(),
            ),
    );

    let isRightSidebarVisible = $derived(
        internalViewerState.showSearchPanel ||
            (internalViewerState.showThumbnailGallery &&
                internalViewerState.dockSide === 'right') ||
            internalViewerState.pluginPanels.some(
                (p) => p.position === 'right' && p.isVisible(),
            ),
    );

    let manifestData = $derived(internalViewerState.manifest);
    let canvases = $derived(internalViewerState.canvases);
    let currentCanvasIndex = $derived(internalViewerState.currentCanvasIndex);

    let tileSources = $derived.by(() => {
        if (
            !canvases ||
            currentCanvasIndex === -1 ||
            !canvases[currentCanvasIndex]
        ) {
            if (!manifestData?.isFetching) {
                console.log('TriiiceratopsViewer: No canvas found');
            }
            return null;
        }

        const canvas = canvases[currentCanvasIndex];

        // Use Manifesto to get images
        let images = canvas.getImages();

        // Fallback for IIIF v3: iterate content if images is empty
        if ((!images || !images.length) && canvas.getContent) {
            images = canvas.getContent();
        }

        if (!images || !images.length) {
            // Check for raw v3 items
            if (canvas.__jsonld && canvas.__jsonld.items) {
                // Try to locate annotation pages -> annotations
            }
            if (!manifestData?.isFetching) {
                console.log('TriiiceratopsViewer: No images/content in canvas');
            }
            return null;
        }

        const annotation = images[0];
        let resource = annotation.getResource ? annotation.getResource() : null;

        // v3 fallback: getBody
        if (!resource && annotation.getBody) {
            const body = annotation.getBody();
            if (Array.isArray(body) && body.length > 0) resource = body[0];
            else if (body) resource = body;
        }

        // Check if resource is valid (Manifesto sometimes returns empty wrapper objects for v3 bodies)
        // The wrapper may have getServices() that returns manifest-level services, so we can't rely on that.
        // Instead, check if the resource has actual content (id, __jsonld, or a service property)
        const resourceJson = resource?.__jsonld || resource;
        const hasContent =
            resource &&
            (resource.id ||
                resource['@id'] ||
                (resourceJson &&
                    (resourceJson.service ||
                        resourceJson.id ||
                        resourceJson['@id'])));
        if (resource && !hasContent) {
            resource = null;
        }

        if (!resource) {
            // raw json fallback
            const json = annotation.__jsonld || annotation;
            if (json.body) {
                resource = Array.isArray(json.body) ? json.body[0] : json.body;
            }
        }

        if (!resource) {
            // console.log('TriiiceratopsViewer: No resource in annotation');
            return null;
        }

        // Helper to normalize ID
        const getId = (thing: any) => thing.id || thing['@id'];

        // Start of service detection logic
        // Check raw json service FIRST - Manifesto's getServices() often returns
        // manifest-level services instead of the image body's services
        let services: any[] = [];
        const rJson = resource.__jsonld || resource;
        if (rJson.service) {
            services = Array.isArray(rJson.service)
                ? rJson.service
                : [rJson.service];
        }

        // Fallback to getServices() only if raw json didn't have services
        if (!services.length && resource.getServices) {
            services = resource.getServices();
        }

        if (services.length > 0) {
            // Find a valid image service
            const service = services.find((s: any) => {
                const type = s.getType
                    ? s.getType()
                    : s.type || s['@type'] || '';
                const profile = s.getProfile ? s.getProfile() : s.profile || '';
                return (
                    type === 'ImageService1' ||
                    type === 'ImageService2' ||
                    type === 'ImageService3' ||
                    (typeof profile === 'string' &&
                        profile.includes('http://iiif.io/api/image')) ||
                    (typeof profile === 'string' && profile === 'level0')
                );
            });

            if (service) {
                let id = getId(service);
                if (id && !id.endsWith('/info.json')) {
                    id = `${id}/info.json`;
                }
                return id;
            }
        }

        // Fallback: Heuristic from Image ID (if it looks like IIIF)
        const resourceId = getId(resource);
        if (resourceId && resourceId.includes('/iiif/')) {
            // Try to strip standard IIIF parameters to find base
            // IIIF URLs often look like .../identifier/region/size/rotation/quality.format
            // We look for the part before the region (often 'full')
            const parts = resourceId.split('/');
            // find index of 'full' or region
            const regionIndex = parts.findIndex(
                (p: string) => p === 'full' || p.match(/^\d+,\d+,\d+,\d+$/),
            );
            if (regionIndex > 0) {
                const base = parts.slice(0, regionIndex).join('/');
                return `${base}/info.json`;
            }
        }

        console.log(
            'TriiiceratopsViewer: No service or ID found, returning raw URL',
        );
        const url = resourceId;
        return { type: 'image', url };
    });
</script>

<div
    bind:this={rootElement}
    id="triiiceratops-viewer"
    class="flex w-full h-full relative overflow-hidden {internalViewerState
        .config.transparentBackground
        ? ''
        : 'bg-base-100'}"
>
    <!-- Left Column -->
    {#if isLeftSidebarVisible}
        <div
            class="flex-none flex flex-row z-20 transition-all {internalViewerState
                .config.transparentBackground
                ? ''
                : 'bg-base-200 border-r border-base-300'}"
        >
            <!-- Gallery (when docked left) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'left'}
                <div class="h-full w-[200px] pointer-events-auto relative">
                    <ThumbnailGallery {canvases} />
                </div>
            {/if}

            {#each internalViewerState.pluginPanels as panel (panel.id)}
                {#if panel.isVisible() && panel.position === 'left'}
                    <div class="h-full relative pointer-events-auto">
                        <panel.component
                            {...panel.props ?? {}}
                            locale={language.current}
                        />
                    </div>
                {/if}
            {/each}
        </div>
    {/if}

    <!-- Center Column -->
    <div
        id="triiiceratops-center-panel"
        class="flex-1 relative min-w-0 flex flex-col"
    >
        <!-- Top Area (Gallery) -->
        {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'top'}
            <div
                class="flex-none h-[140px] w-full pointer-events-auto relative z-20"
            >
                <ThumbnailGallery {canvases} />
            </div>
        {/if}

        <!-- Main Viewer Area -->
        <div
            class="flex-1 relative min-h-0 w-full h-full {internalViewerState
                .config.transparentBackground
                ? ''
                : 'bg-base-100'}"
        >
            {#if manifestData?.isFetching}
                <div class="w-full h-full flex items-center justify-center">
                    <span
                        class="loading loading-spinner loading-lg text-primary"
                    ></span>
                </div>
            {:else if manifestData?.error}
                <div
                    class="w-full h-full flex items-center justify-center text-error"
                >
                    {m.error_prefix()}
                    {manifestData.error}
                </div>
            {:else if tileSources}
                {#key tileSources}
                    <OSDViewer
                        {tileSources}
                        viewerState={internalViewerState}
                    />
                {/key}
            {:else}
                <div
                    class="w-full h-full flex items-center justify-center text-base-content/50"
                >
                    {m.no_image_found()}
                </div>
            {/if}

            <AnnotationOverlay />
            <MetadataDialog />

            <!-- Floating Menu / FABs -->
            {#if internalViewerState.showRightMenu}
                <FloatingMenu />
            {/if}
            {#if internalViewerState.showLeftMenu}
                <LeftFab />
            {/if}

            <!-- Overlay Plugin Panels -->
            {#each internalViewerState.pluginPanels as panel (panel.id)}
                {#if panel.isVisible() && panel.position === 'overlay'}
                    <div class="absolute inset-0 z-40 pointer-events-none">
                        <panel.component
                            {...panel.props ?? {}}
                            locale={language.current}
                        />
                    </div>
                {/if}
            {/each}

            <!-- Canvas Nav (Absolute positioned inside center, or floating?) currently assumes absolute -->
            {#if canvases.length > 1 && internalViewerState.showCanvasNav}
                <CanvasNavigation viewerState={internalViewerState} />
            {/if}

            <!-- Float-mode Gallery -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'none'}
                <ThumbnailGallery {canvases} />
            {/if}
        </div>

        <!-- Bottom Area (Gallery) -->
        {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'bottom'}
            <div
                class="flex-none h-[140px] w-full pointer-events-auto relative z-20"
            >
                <ThumbnailGallery {canvases} />
            </div>
        {/if}

        <!-- Bottom Area (Plugin Panels) -->
        {#each internalViewerState.pluginPanels as panel (panel.id)}
            {#if panel.isVisible() && panel.position === 'bottom'}
                <div class="relative w-full z-40 pointer-events-auto">
                    <panel.component
                        {...panel.props ?? {}}
                        locale={language.current}
                    />
                </div>
            {/if}
        {/each}
    </div>

    <!-- Right Column -->
    {#if isRightSidebarVisible}
        <div
            class="flex-none flex flex-row z-20 transition-all {internalViewerState
                .config.transparentBackground
                ? ''
                : 'bg-base-200 border-l border-base-300'}"
        >
            <!-- Search Panel -->
            {#if internalViewerState.showSearchPanel}
                <div class="h-full relative pointer-events-auto">
                    <SearchPanel />
                </div>
            {/if}

            <!-- Gallery (when docked right) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'right'}
                <div class="h-full w-[200px] pointer-events-auto relative">
                    <ThumbnailGallery {canvases} />
                </div>
            {/if}

            <!-- Right Plugin Panels -->
            {#each internalViewerState.pluginPanels as panel (panel.id)}
                {#if panel.isVisible() && panel.position === 'right'}
                    <div class="h-full relative pointer-events-auto">
                        <panel.component
                            {...panel.props ?? {}}
                            locale={language.current}
                        />
                    </div>
                {/if}
            {/each}
        </div>
    {/if}
</div>
