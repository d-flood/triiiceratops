<script lang="ts">
    import { onDestroy, setContext, untrack } from 'svelte';
    import { language, m } from '../state/i18n.svelte';
    import { VIEWER_STATE_KEY, ViewerState } from '../state/viewer.svelte';
    import { applyTheme } from '../theme/themeManager';
    import type { DaisyUITheme, ThemeConfig } from '../theme/types';
    import type { SearchProvider, ViewerConfig } from '../types/config';
    import type { PluginDef } from '../types/plugin';
    import type { CanvasRegion } from '../utils/contentState';
    import { createPluginId } from '../utils/pluginId';
    import { getThumbnailSrc } from '../utils/getThumbnailSrc';
    import { getViewerTileSources } from '../utils/resolveCanvasImage';
    import { parseContentState } from '../utils/contentState';
    import { getCanvasId } from './viewerControls';
    import AnnotationOverlay from './AnnotationOverlay.svelte';
    import AnnotationPanel from './AnnotationPanel.svelte';
    import CollectionPanel from './CollectionPanel.svelte';
    import MetadataPanel from './MetadataPanel.svelte';
    import OSDViewer from './OSDViewer.svelte';
    import PanelStack, { type PanelStackItem } from './PanelStack.svelte';
    import SearchPanel from './SearchPanel.svelte';
    import StructuresPanel from './StructuresPanel.svelte';
    import ThumbnailGallery from './ThumbnailGallery.svelte';
    import Toolbar from './Toolbar.svelte';
    import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
    import ChatCenteredText from 'phosphor-svelte/lib/ChatCenteredText';
    import Info from 'phosphor-svelte/lib/Info';
    import ListBullets from 'phosphor-svelte/lib/ListBullets';
    import Folder from 'phosphor-svelte/lib/Folder';
    import ImageBroken from 'phosphor-svelte/lib/ImageBroken';
    import ViewerControls from './ViewerControls.svelte';

    // SSR-safe browser detection for library consumers
    const browser = typeof window !== 'undefined';

    interface Props {
        manifestId?: string;
        manifestJson?: any;
        canvasId?: string;
        plugins?: PluginDef[] | null | boolean;
        /** Built-in DaisyUI theme name. Defaults to 'light' or 'dark' based on prefers-color-scheme. */
        theme?: DaisyUITheme;
        /** Custom theme configuration to override the base theme's values. */
        themeConfig?: ThemeConfig;
        /** Configuration options for the viewer UI */
        config?: ViewerConfig;
        searchProvider?: SearchProvider | null;
        /** Bindable viewer state instance for external access (Svelte consumers) */
        viewerState?: ViewerState;
        initialCanvasRegion?: CanvasRegion | null;
    }

    type ViewerTileSourceError =
        | { type: 'auth' }
        | { type: 'load'; message?: string; details?: string }
        | null;

    let {
        manifestId,
        manifestJson,
        canvasId,
        plugins: rawPlugins = [],
        theme,
        themeConfig,
        config = {},
        searchProvider = null,
        viewerState = $bindable(),
        initialCanvasRegion = null,
    }: Props = $props();

    let plugins = $derived(Array.isArray(rawPlugins) ? rawPlugins : []);
    let isDragOver = $state(false);
    let viewerLocale = $derived(
        (config as ViewerConfig & { locale?: string })?.locale ||
            language.current,
    );

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

    $effect(() => {
        internalViewerState.setManifestRequestConfig(config?.requests);
    });

    $effect(() => {
        internalViewerState.setSearchProvider(searchProvider);
    });

    $effect(() => {
        internalViewerState.setInitialCanvasRegion(initialCanvasRegion);
    });

    function clearDragState() {
        isDragOver = false;
    }

    function hasCanvas(canvasId: string) {
        return internalViewerState.canvases.some(
            (canvas: any) => getCanvasId(canvas) === canvasId,
        );
    }

    function handleDragOver(event: DragEvent) {
        if (!internalViewerState.config.enableDragDrop) return;
        event.preventDefault();
        isDragOver = true;
    }

    function handleDragLeave(event: DragEvent) {
        if (!internalViewerState.config.enableDragDrop) return;
        if (event.currentTarget === event.target) {
            isDragOver = false;
        }
    }

    async function handleDrop(event: DragEvent) {
        if (!internalViewerState.config.enableDragDrop) return;
        event.preventDefault();
        clearDragState();

        const text = event.dataTransfer?.getData('text/plain')?.trim();
        if (!text) return;

        const parsed = parseContentState(text);
        if (parsed?.manifestId) {
            internalViewerState.setInitialCanvasRegion(parsed.region ?? null);
            if (parsed.canvasId) {
                internalViewerState.setCanvas(parsed.canvasId);
            }
            await internalViewerState.setManifest(parsed.manifestId, {
                requestConfig: config?.requests,
            });
            if (parsed.canvasId) {
                internalViewerState.setCanvas(parsed.canvasId);
            }
            return;
        }

        if (/^https?:\/\//i.test(text)) {
            internalViewerState.setInitialCanvasRegion(null);
            await internalViewerState.setManifest(text, {
                requestConfig: config?.requests,
            });
        }
    }

    $effect(() => {
        if (manifestId && manifestJson) {
            void (async () => {
                await internalViewerState.setManifestData(
                    manifestId,
                    manifestJson,
                );
                lastAppliedCanvasId = '';
            })();
            return;
        }

        if (manifestId && manifestId !== internalViewerState.manifestId) {
            // Don't re-trigger setManifest if the prop points to the active collection.
            // When a collection is loaded, internalViewerState.manifestId is the
            // currently-selected manifest inside the collection, which differs from
            // the collection URL passed as the prop.
            if (
                internalViewerState.collectionId &&
                manifestId === internalViewerState.collectionId
            ) {
                return;
            }
            void (async () => {
                const requestedManifestId = manifestId;
                const requestedCanvasId = canvasId;
                await internalViewerState.setManifest(manifestId, {
                    requestConfig: config?.requests,
                });
                lastAppliedCanvasId = '';

                // Manifest loading clears the active canvas before it picks a default.
                // Re-apply the requested prop value once the manifest is ready.
                if (
                    requestedManifestId === manifestId &&
                    requestedCanvasId &&
                    requestedCanvasId === canvasId &&
                    requestedCanvasId !== internalViewerState.canvasId &&
                    hasCanvas(requestedCanvasId)
                ) {
                    lastAppliedCanvasId = requestedCanvasId;
                    internalViewerState.setCanvas(requestedCanvasId);
                }
            })();
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
            if (
                internalViewerState.manifestId &&
                internalViewerState.canvases.length &&
                !hasCanvas(canvasId)
            ) {
                return;
            }
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
                internalViewerState.updateConfig(config);
            }
        }
    });

    // Register plugins reactively with cleanup
    let registeredPluginIds: string[] = [];

    $effect(() => {
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
                if (!plugin || typeof plugin !== 'object') {
                    continue;
                }

                const id = plugin.id || createPluginId();
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

    let showCollectionSidebar = $derived(
        internalViewerState.showCollectionPanel &&
            internalViewerState.hasCollection,
    );

    let leftPanelWidth = $derived(
        internalViewerState.config.leftPanelWidth ?? '320px',
    );
    let rightPanelWidth = $derived(
        internalViewerState.config.rightPanelWidth ?? '320px',
    );

    let visiblePanelsLeft = $derived.by<PanelStackItem[]>(() => {
        const panels: PanelStackItem[] = [];

        if (
            internalViewerState.showSearchPanel &&
            internalViewerState.config.search?.position === 'left'
        ) {
            panels.push({
                id: 'search',
                title: m.search(),
                icon: MagnifyingGlass,
                component: SearchPanel,
            });
        }
        if (
            internalViewerState.showAnnotations &&
            internalViewerState.config.annotations?.position === 'left'
        ) {
            panels.push({
                id: 'annotations',
                title: m.settings_submenu_annotations(),
                icon: ChatCenteredText,
                component: AnnotationPanel,
            });
        }
        if (
            internalViewerState.showMetadataPanel &&
            internalViewerState.config.information?.position === 'left'
        ) {
            panels.push({
                id: 'metadata',
                title: m.metadata(),
                icon: Info,
                component: MetadataPanel,
            });
        }

        for (const panel of internalViewerState.pluginPanels) {
            if (panel.isVisible() && panel.position === 'left') {
                const resolveTitle = (
                    m as Record<string, (() => string) | undefined>
                )[panel.name];
                panels.push({
                    id: panel.id,
                    title: resolveTitle ? resolveTitle() : panel.name,
                    icon: panel.icon,
                    component: panel.component,
                    props: { ...(panel.props ?? {}), locale: viewerLocale },
                });
            }
        }

        return panels;
    });

    let visiblePanelsRight = $derived.by<PanelStackItem[]>(() => {
        const panels: PanelStackItem[] = [];

        if (
            internalViewerState.showSearchPanel &&
            internalViewerState.config.search?.position !== 'left'
        ) {
            panels.push({
                id: 'search',
                title: m.search(),
                icon: MagnifyingGlass,
                component: SearchPanel,
            });
        }
        if (
            internalViewerState.showAnnotations &&
            internalViewerState.config.annotations?.position !== 'left'
        ) {
            panels.push({
                id: 'annotations',
                title: m.settings_submenu_annotations(),
                icon: ChatCenteredText,
                component: AnnotationPanel,
            });
        }
        if (
            internalViewerState.showMetadataPanel &&
            internalViewerState.config.information?.position !== 'left'
        ) {
            panels.push({
                id: 'metadata',
                title: m.metadata(),
                icon: Info,
                component: MetadataPanel,
            });
        }
        if (internalViewerState.showStructuresPanel) {
            panels.push({
                id: 'structures',
                title: m.structures_title(),
                icon: ListBullets,
                component: StructuresPanel,
            });
        }
        if (showCollectionSidebar) {
            panels.push({
                id: 'collection',
                title: m.collection_title(),
                icon: Folder,
                component: CollectionPanel,
            });
        }

        for (const panel of internalViewerState.pluginPanels) {
            if (panel.isVisible() && panel.position === 'right') {
                const resolveTitle = (
                    m as Record<string, (() => string) | undefined>
                )[panel.name];
                panels.push({
                    id: panel.id,
                    title: resolveTitle ? resolveTitle() : panel.name,
                    icon: panel.icon,
                    component: panel.component,
                    props: { ...(panel.props ?? {}), locale: viewerLocale },
                });
            }
        }

        return panels;
    });

    let isLeftSidebarVisible = $derived(
        (internalViewerState.showThumbnailGallery &&
            internalViewerState.dockSide === 'left') ||
            visiblePanelsLeft.length > 0,
    );

    let isRightSidebarVisible = $derived(
        (internalViewerState.showThumbnailGallery &&
            internalViewerState.dockSide === 'right') ||
            visiblePanelsRight.length > 0,
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
            internalViewerState.search(query);
        }
    });

    // Auto-select initial canvas: prefer start canvas from manifest, then first canvas
    $effect(() => {
        if (
            canvases &&
            canvases.length > 0 &&
            !internalViewerState.canvasId &&
            !manifestData?.isFetching &&
            !canvasId // Don't auto-select if a canvasId prop is provided
        ) {
            const startCanvas = internalViewerState.startCanvasId;
            if (startCanvas) {
                internalViewerState.setCanvas(startCanvas);
            } else {
                const firstCanvasId = getCanvasId(canvases[0]);
                if (firstCanvasId) {
                    internalViewerState.setCanvas(firstCanvasId);
                }
            }
        }
    });

    // Derive thumbnail URL for the current canvas (used for auth error backdrop)
    // Uses the same fallback chain as ThumbnailGallery
    let currentCanvasThumbnail = $derived.by(() => {
        if (
            !canvases ||
            currentCanvasIndex === -1 ||
            !canvases[currentCanvasIndex]
        )
            return null;
        return getThumbnailSrc(canvases[currentCanvasIndex]) || null;
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

        const tileSourcesArray = getViewerTileSources({
            canvases,
            currentCanvasIndex,
            currentCanvasId: internalViewerState.canvasId,
            viewingMode: internalViewerState.viewingMode,
            pagedOffset: internalViewerState.pagedOffset,
            getSelectedChoice: (canvasId) =>
                internalViewerState.getSelectedChoice(canvasId),
        });

        if (!tileSourcesArray) {
            if (!manifestData?.isFetching) {
                console.log('TriiiceratopsViewer: No images/content in canvas');
            }
            return null;
        }

        console.log(
            '[TriiiceratopsViewer] Derived tileSources:',
            tileSourcesArray,
        );
        return tileSourcesArray;
    });

    let tileSourceError = $derived(
        internalViewerState.tileSourceError as ViewerTileSourceError,
    );
    let tileSourceErrorMessage = $derived(
        tileSourceError?.type === 'load'
            ? tileSourceError.message || 'Unable to load this image.'
            : null,
    );
    let tileSourceErrorDetails = $derived(
        tileSourceError?.type === 'load' &&
            tileSourceError.details &&
            tileSourceError.details !== tileSourceErrorMessage
            ? tileSourceError.details
            : null,
    );
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
            class="flex-none min-h-0 flex flex-row z-20 transition-all {internalViewerState
                .config.transparentBackground
                ? ''
                : 'bg-base-100 border-r border-base-300'}"
        >
            {#if visiblePanelsLeft.length > 0}
                <div
                    class="h-full min-h-0 relative pointer-events-auto"
                    style="width: {leftPanelWidth}"
                >
                    <PanelStack panels={visiblePanelsLeft} />
                </div>
            {/if}

            <!-- Gallery (when docked left) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'left'}
                <div
                    class="h-full min-h-0 pointer-events-auto relative"
                    style="width: {internalViewerState.galleryFixedHeight +
                        40}px"
                >
                    <ThumbnailGallery {canvases} />
                </div>
            {/if}
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
            role={internalViewerState.config.enableDragDrop
                ? 'region'
                : undefined}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
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
                {#if tileSourceError}
                    <div
                        class="w-full h-full absolute inset-0 z-5 flex items-center justify-center pointer-events-none overflow-hidden"
                        role="alert"
                    >
                        {#if currentCanvasThumbnail}
                            <img
                                src={currentCanvasThumbnail}
                                alt=""
                                class="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
                            />
                            <div class="absolute inset-0 bg-base-100/50"></div>
                        {/if}
                        <div
                            class="relative flex flex-col items-center gap-3 max-w-sm text-center px-4 py-6 bg-base-100/90 rounded-xl shadow-lg"
                        >
                            {#if tileSourceError.type === 'auth'}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="w-12 h-12 text-warning"
                                >
                                    <rect
                                        x="3"
                                        y="11"
                                        width="18"
                                        height="11"
                                        rx="2"
                                        ry="2"
                                    />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <p class="text-base-content text-sm">
                                    {m.error_auth_required()}
                                </p>
                            {:else}
                                <ImageBroken class="w-12 h-12 text-warning" />
                                <p
                                    class="text-base-content text-sm font-semibold"
                                >
                                    {tileSourceErrorMessage}
                                </p>
                                {#if tileSourceErrorDetails}
                                    <p
                                        class="text-base-content/70 text-xs wrap-break-word max-w-xs"
                                    >
                                        {tileSourceErrorDetails}
                                    </p>
                                {/if}
                            {/if}
                        </div>
                    </div>
                {:else}
                    <OSDViewer
                        {tileSources}
                        viewerState={internalViewerState}
                    />
                {/if}
            {:else if manifestData && !manifestData.isFetching && !tileSources}
                <div
                    class="w-full h-full absolute inset-0 z-5 flex items-center justify-center pointer-events-none overflow-hidden"
                    role="status"
                >
                    {#if currentCanvasThumbnail}
                        <img
                            src={currentCanvasThumbnail}
                            alt=""
                            class="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
                        />
                        <div class="absolute inset-0 bg-base-100/50"></div>
                    {/if}
                    <div
                        class="relative flex flex-col items-center gap-3 max-w-sm text-center px-4 py-6 bg-base-100/90 rounded-xl shadow-lg"
                    >
                        <ImageBroken class="w-12 h-12 text-warning" />
                        <p class="text-base-content text-sm font-semibold">
                            {m.no_image_found()}
                        </p>
                    </div>
                </div>
            {/if}

            <AnnotationOverlay />

            <!-- Floating Toolbar -->
            <Toolbar />

            <!-- Overlay Plugin Panels -->
            {#each internalViewerState.pluginPanels as panel (panel.id)}
                {#if panel.isVisible() && panel.position === 'overlay'}
                    <div class="absolute inset-0 z-40 pointer-events-none">
                        <panel.component
                            {...panel.props ?? {}}
                            locale={viewerLocale}
                        />
                    </div>
                {/if}
            {/each}

            <!-- Viewer Controls (Canvas Navigation + Zoom + IIIF Choice Selector) -->
            <ViewerControls />

            {#if internalViewerState.config.enableDragDrop && isDragOver}
                <div
                    class="absolute inset-0 z-45 pointer-events-none flex items-center justify-center bg-base-100/70 backdrop-blur-sm"
                >
                    <div
                        class="rounded-box border-2 border-dashed border-primary bg-base-100/90 px-6 py-4 text-sm font-medium text-base-content shadow-lg"
                    >
                        {m.drop_manifest_hint()}
                    </div>
                </div>
            {/if}

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
                        locale={viewerLocale}
                    />
                </div>
            {/if}
        {/each}
    </div>

    <!-- Right Column -->
    {#if isRightSidebarVisible}
        <div
            class="flex-none min-h-0 flex flex-row z-20 transition-all {internalViewerState
                .config.transparentBackground
                ? ''
                : 'bg-base-100'}"
        >
            {#if visiblePanelsRight.length > 0}
                <div
                    class="h-full min-h-0 relative pointer-events-auto"
                    style="width: {rightPanelWidth}"
                >
                    <PanelStack panels={visiblePanelsRight} />
                </div>
            {/if}

            <!-- Gallery (when docked right) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'right'}
                <div
                    class="h-full min-h-0 pointer-events-auto relative"
                    style="width: {internalViewerState.galleryFixedHeight +
                        40}px"
                >
                    <ThumbnailGallery {canvases} />
                </div>
            {/if}
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
        border-radius: 9999px;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-thumb) {
        background-color: var(--fallback-bc, oklch(var(--bc) / 0.2));
        border-radius: 9999px;
        border: 1px solid transparent;
        background-clip: padding-box;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-thumb:hover) {
        background-color: var(--fallback-bc, oklch(var(--bc) / 0.4));
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-corner) {
        background: transparent;
        border-radius: 9999px;
    }
</style>
