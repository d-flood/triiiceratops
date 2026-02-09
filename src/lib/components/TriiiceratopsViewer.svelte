<script lang="ts">
    import { setContext, onDestroy, untrack } from 'svelte';
    import { ViewerState, VIEWER_STATE_KEY } from '../state/viewer.svelte';
    import type { PluginDef } from '../types/plugin';
    import type { DaisyUITheme, ThemeConfig } from '../theme/types';
    import type { ViewerConfig } from '../types/config';
    import { applyTheme } from '../theme/themeManager';
    import OSDViewer from './OSDViewer.svelte';
    import ViewerControls from './ViewerControls.svelte';
    import AnnotationOverlay from './AnnotationOverlay.svelte';
    import ThumbnailGallery from './ThumbnailGallery.svelte';
    import Toolbar from './Toolbar.svelte';
    import MetadataDialog from './MetadataDialog.svelte';
    import SearchPanel from './SearchPanel.svelte';
    import AnnotationPanel from './AnnotationPanel.svelte';
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
            internalViewerState.setViewerElement(rootElement);
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
            (internalViewerState.showSearchPanel &&
                internalViewerState.config.search?.position === 'left') ||
            (internalViewerState.showAnnotations &&
                internalViewerState.config.annotations?.position === 'left') ||
            internalViewerState.pluginPanels.some(
                (p) => p.position === 'left' && p.isVisible(),
            ),
    );

    let isRightSidebarVisible = $derived(
        (internalViewerState.showSearchPanel &&
            internalViewerState.config.search?.position !== 'left') ||
            (internalViewerState.showAnnotations &&
                internalViewerState.config.annotations?.position !== 'left') ||
            (internalViewerState.showThumbnailGallery &&
                internalViewerState.dockSide === 'right') ||
            internalViewerState.pluginPanels.some(
                (p) => p.position === 'right' && p.isVisible(),
            ),
    );

    let manifestData = $derived(internalViewerState.manifestEntry);
    let canvases = $derived(internalViewerState.canvases);
    let currentCanvasIndex = $derived(internalViewerState.currentCanvasIndex);

    // Effect to trigger deferred search once manifest is loaded
    $effect(() => {
        if (
            internalViewerState.pendingSearchQuery &&
            manifestData &&
            !manifestData.isFetching &&
            !manifestData.error &&
            manifestData.manifesto
        ) {
            const query = internalViewerState.pendingSearchQuery;
            internalViewerState.pendingSearchQuery = null;
            console.log(
                '[Viewer] Manifest loaded, triggering deferred search:',
                query,
            );
            internalViewerState.search(query);
        }
    });

    // Auto-select first canvas if none selected AND no canvasId prop was provided
    $effect(() => {
        if (
            canvases &&
            canvases.length > 0 &&
            !internalViewerState.canvasId &&
            !manifestData?.isFetching &&
            !canvasId // Don't auto-select if a canvasId prop is provided
        ) {
            console.log(
                '[Viewer] Auto-selecting first canvas:',
                canvases[0].id,
            );
            internalViewerState.setCanvas(canvases[0].id);
        }
    });

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

        // Helper to get images from a canvas, with v3 fallback
        // v2 uses getImages(), v3 uses getContent() for painting annotations
        const getCanvasImages = (c: any): any[] => {
            let imgs = c.getImages?.() || [];
            if ((!imgs || !imgs.length) && c.getContent) {
                imgs = c.getContent();
            }
            // Return wrapper to preserve methods
            return (imgs || []).map((img: any) => ({
                annotation: img,
                canvasId: c.id || c['@id'],
            }));
        };

        let images = getCanvasImages(canvas);
        if (internalViewerState.viewingMode === 'continuous') {
            // Get all images from all canvases
            images = [];
            for (const c of canvases) {
                images = images.concat(getCanvasImages(c));
            }
        } else if (internalViewerState.viewingMode === 'paged') {
            // Single pages at the start: pagedOffset (default 0, shifted = 1)
            const singlePages = internalViewerState.pagedOffset;
            // Only show two-page spread if we're past the single pages section
            if (currentCanvasIndex >= singlePages) {
                const nextIndex = currentCanvasIndex + 1;
                if (nextIndex < canvases.length) {
                    const nextCanvas = canvases[nextIndex];
                    const nextImages = getCanvasImages(nextCanvas);
                    images = images.concat(nextImages);
                }
            }
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

        // Map images to tile sources, in two page mode, this will get two image sources
        const tileSourcesArray = images
            .map((item: any) => getImageService(item.annotation, item.canvasId))
            .filter((s) => s !== null); // Filter out nulls to prevent OSD crashes

        console.log(
            '[TriiiceratopsViewer] Derived tileSources:',
            tileSourcesArray,
        );
        return tileSourcesArray;
    });

    function getImageService(annotation: any, canvasId: string) {
        let resource = annotation.getResource ? annotation.getResource() : null;

        // v3 fallback: getBody
        if (!resource && annotation.getBody) {
            const body = annotation.getBody();
            // Handle Choice (IIIF v2/v3)
            // Note: Manifesto might wrap Choice in a resource object, OR return the items as array if it flattens it.
            // We check multiple sources to determine if it was a Choice.

            const rawBody = annotation.__jsonld?.body || annotation.body;
            // Checking if the body is a Choice - check rawBody, body itself, or body's type
            const isChoice =
                rawBody?.type === 'Choice' ||
                rawBody?.type === 'oa:Choice' ||
                (body &&
                    !Array.isArray(body) &&
                    (body.type === 'Choice' || body.type === 'oa:Choice'));

            if (isChoice) {
                // Manifesto may return the items array as 'body' when getBody() is called,
                // or it may return the Choice object itself. We handle both cases.

                let items: any[] = [];
                if (Array.isArray(body)) {
                    items = body;
                } else if (body && (body.items || body.item)) {
                    items = body.items || body.item;
                } else if (rawBody && (rawBody.items || rawBody.item)) {
                    // Fallback to rawBody items if body doesn't have them
                    items = rawBody.items || rawBody.item;
                }

                // Get selected item ID from state
                const selectedId =
                    internalViewerState.getSelectedChoice(canvasId);

                let selectedItem = null;
                if (selectedId) {
                    selectedItem = items.find(
                        (item: any) => (item.id || item['@id']) === selectedId,
                    );
                }

                // Default to first item if no selection or not found
                if (!selectedItem && items.length > 0) {
                    selectedItem = items[0];
                }

                if (selectedItem) {
                    resource = selectedItem;
                }
            } else if (Array.isArray(body) && body.length > 0) {
                resource = body[0];
            } else if (body) {
                resource = body;
            }
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

        // Helper to normalize ID
        const getId = (thing: any) =>
            thing.id ||
            thing['@id'] ||
            (thing.__jsonld && (thing.__jsonld.id || thing.__jsonld['@id']));

        if (!resource) {
            // raw json fallback
            const json = annotation.__jsonld || annotation;
            if (json.body) {
                let body = json.body;
                // Handle Choice in raw JSON fallback
                if (body.type === 'Choice' || body.type === 'oa:Choice') {
                    const items = body.items || body.item || [];
                    // Get selected choice or default to first item
                    const selectedId =
                        internalViewerState.getSelectedChoice(canvasId);
                    const selectedItem = selectedId
                        ? items.find(
                              (item: any) =>
                                  (item.id || item['@id']) === selectedId,
                          )
                        : null;
                    body = selectedItem || items[0] || null;
                }
                resource = Array.isArray(body) ? body[0] : body;
            }
        }

        if (!resource) {
            // console.log('TriiiceratopsViewer: No resource in annotation');
            return null;
        }

        // Helper to normalize ID

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
            // Matches IIIF Image API profile URIs with http or https scheme
            const iiifImageApiPattern = /^https?:\/\/iiif\.io\/api\/image\//;

            // IIIF allows profile as a string, array, or containing objects
            // Shorthand levels (level0, level1, level2) are valid per spec
            const isIiifImageProfile = (p: unknown): boolean => {
                if (typeof p === 'string') {
                    return (
                        iiifImageApiPattern.test(p) ||
                        p === 'level0' ||
                        p === 'level1' ||
                        p === 'level2'
                    );
                }
                if (Array.isArray(p)) {
                    return p.some(
                        (item) =>
                            typeof item === 'string' &&
                            isIiifImageProfile(item),
                    );
                }
                return false;
            };

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
                    isIiifImageProfile(profile)
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

        if (!resourceId) {
            console.warn('TriiiceratopsViewer: No resource ID found', resource);
            if (resource) {
                console.log(
                    'Resource dump:',
                    JSON.stringify(resource, null, 2),
                );
                if (resource.getServices) {
                    console.log('Resource services:', resource.getServices());
                }
            }
            return null;
        }

        console.log(
            'TriiiceratopsViewer: No service or ID found, returning raw URL',
            resourceId,
        );
        const url = resourceId;
        return { type: 'image', url };
    }
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
            <!-- Search Panel (when configured left) -->
            {#if internalViewerState.showSearchPanel && internalViewerState.config.search?.position === 'left'}
                <div class="h-full relative pointer-events-auto">
                    <SearchPanel />
                </div>
            {/if}

            <!-- Annotations Panel (when configured left) -->
            {#if internalViewerState.showAnnotations && internalViewerState.config.annotations?.position === 'left'}
                <div class="h-full relative pointer-events-auto">
                    <AnnotationPanel />
                </div>
            {/if}

            <!-- Gallery (when docked left) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'left'}
                <div
                    class="h-full pointer-events-auto relative"
                    style="width: {internalViewerState.galleryFixedHeight +
                        40}px"
                >
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
                class="flex-none w-full pointer-events-auto relative z-20"
                style="height: {internalViewerState.galleryFixedHeight + 55}px"
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
                <OSDViewer {tileSources} viewerState={internalViewerState} />
            {:else if manifestData && !manifestData.isFetching && !tileSources}
                <div
                    class="w-full h-full flex items-center justify-center text-base-content/50"
                >
                    {m.no_image_found()}
                </div>
            {/if}

            <AnnotationOverlay />
            <MetadataDialog />

            <!-- Floating Toolbar (Replaced Unified Side Menu) -->
            <Toolbar />

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

            <!-- Viewer Controls (Canvas Navigation + Zoom + IIIF Choice Selector) -->
            <ViewerControls />

            <!-- Float-mode Gallery -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'none'}
                <ThumbnailGallery {canvases} />
            {/if}
        </div>

        <!-- Bottom Area (Gallery) -->
        {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'bottom'}
            <div
                class="flex-none w-full pointer-events-auto relative z-20"
                style="height: {internalViewerState.galleryFixedHeight + 55}px"
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
                : 'bg-base-100'}"
        >
            <!-- Search Panel -->
            {#if internalViewerState.showSearchPanel && internalViewerState.config.search?.position !== 'left'}
                <div class="h-full relative pointer-events-auto">
                    <SearchPanel />
                </div>
            {/if}

            <!-- Annotations Panel (when configured right) -->
            {#if internalViewerState.showAnnotations && internalViewerState.config.annotations?.position !== 'left'}
                <div class="h-full relative pointer-events-auto">
                    <AnnotationPanel />
                </div>
            {/if}

            <!-- Gallery (when docked right) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'right'}
                <div
                    class="h-full pointer-events-auto relative"
                    style="width: {internalViewerState.galleryFixedHeight +
                        40}px"
                >
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

<style>
    /* Scoped scrollbar styles for the viewer */
    :global(#triiiceratops-viewer *) {
        scrollbar-width: thin;
        scrollbar-color: var(--fallback-bc, oklch(var(--bc) / 0.2)) transparent;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar) {
        width: 4px;
        height: 4px;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-track) {
        background: transparent;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-thumb) {
        background-color: var(--fallback-bc, oklch(var(--bc) / 0.2));
        border-radius: 9999px;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-thumb:hover) {
        background-color: var(--fallback-bc, oklch(var(--bc) / 0.4));
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-corner) {
        background: transparent;
    }
</style>
