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
    import { Spinner } from './ui';

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
            untrack(() => {
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
            });
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

    function getPluginPanelClose(
        props: Record<string, unknown> | undefined,
    ): (() => void) | undefined {
        return typeof props?.close === 'function'
            ? (props.close as () => void)
            : undefined;
    }

    function showPanelCloseButton(showCloseButton: boolean | undefined) {
        return showCloseButton ?? true;
    }

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
                close: showPanelCloseButton(
                    internalViewerState.config.search?.showCloseButton,
                )
                    ? () => internalViewerState.toggleSearchPanel()
                    : undefined,
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
                close: showPanelCloseButton(
                    internalViewerState.config.annotations?.showCloseButton,
                )
                    ? () => internalViewerState.toggleAnnotations()
                    : undefined,
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
                close: showPanelCloseButton(
                    internalViewerState.config.information?.showCloseButton,
                )
                    ? () => internalViewerState.toggleMetadataPanel()
                    : undefined,
            });
        }

        for (const panel of internalViewerState.pluginPanels) {
            if (panel.isVisible() && panel.position === 'left') {
                const resolveTitle = (
                    m as unknown as Record<string, (() => string) | undefined>
                )[panel.name];
                panels.push({
                    id: panel.id,
                    title: resolveTitle ? resolveTitle() : panel.name,
                    icon: panel.icon,
                    component: panel.component,
                    props: { ...(panel.props ?? {}), locale: viewerLocale },
                    close: getPluginPanelClose(panel.props),
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
                close: showPanelCloseButton(
                    internalViewerState.config.search?.showCloseButton,
                )
                    ? () => internalViewerState.toggleSearchPanel()
                    : undefined,
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
                close: showPanelCloseButton(
                    internalViewerState.config.annotations?.showCloseButton,
                )
                    ? () => internalViewerState.toggleAnnotations()
                    : undefined,
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
                close: showPanelCloseButton(
                    internalViewerState.config.information?.showCloseButton,
                )
                    ? () => internalViewerState.toggleMetadataPanel()
                    : undefined,
            });
        }
        if (internalViewerState.showStructuresPanel) {
            panels.push({
                id: 'structures',
                title: m.structures_title(),
                icon: ListBullets,
                component: StructuresPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.structures?.showCloseButton,
                )
                    ? () => internalViewerState.toggleStructuresPanel()
                    : undefined,
            });
        }
        if (showCollectionSidebar) {
            panels.push({
                id: 'collection',
                title: m.collection_title(),
                icon: Folder,
                component: CollectionPanel,
                close: showPanelCloseButton(
                    internalViewerState.config.collection?.showCloseButton,
                )
                    ? () => internalViewerState.toggleCollectionPanel()
                    : undefined,
            });
        }

        for (const panel of internalViewerState.pluginPanels) {
            if (panel.isVisible() && panel.position === 'right') {
                const resolveTitle = (
                    m as unknown as Record<string, (() => string) | undefined>
                )[panel.name];
                panels.push({
                    id: panel.id,
                    title: resolveTitle ? resolveTitle() : panel.name,
                    icon: panel.icon,
                    component: panel.component,
                    props: { ...(panel.props ?? {}), locale: viewerLocale },
                    close: getPluginPanelClose(panel.props),
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
            canvases.length > 0 &&
            currentCanvasIndex < 0 &&
            !manifestData?.isFetching
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
    class="viewer-root"
    class:opaque={!internalViewerState.config.transparentBackground}
>
    <!-- Left Column -->
    {#if isLeftSidebarVisible}
        <div
            class="side-col side-col-left"
            class:opaque={!internalViewerState.config.transparentBackground}
        >
            {#if visiblePanelsLeft.length > 0}
                <div class="panel-host" style="width: {leftPanelWidth}">
                    <PanelStack panels={visiblePanelsLeft} />
                </div>
            {/if}

            <!-- Gallery (when docked left) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'left'}
                <div
                    class="gallery-host"
                    style="width: {internalViewerState.galleryFixedHeight +
                        40}px"
                >
                    <ThumbnailGallery {canvases} />
                </div>
            {/if}
        </div>
    {/if}

    <!-- Center Column -->
    <div id="triiiceratops-center-panel" class="center-col">
        <!-- Top Area (Gallery) -->
        {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'top'}
            <div
                class="gallery-band"
                style="height: {internalViewerState.galleryFixedHeight + 55}px"
            >
                <ThumbnailGallery {canvases} />
            </div>
        {/if}

        <!-- Main Viewer Area -->
        <div
            class="viewer-area"
            class:opaque={!internalViewerState.config.transparentBackground}
            role={internalViewerState.config.enableDragDrop
                ? 'region'
                : undefined}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
        >
            {#if manifestData?.isFetching}
                <div class="centered">
                    <Spinner size="lg" style="color:var(--color-primary)" />
                </div>
            {:else if manifestData?.error}
                <div class="centered error-text">
                    {m.error_prefix()}
                    {manifestData.error}
                </div>
            {:else if tileSources}
                {#if tileSourceError}
                    <div class="overlay-cover" role="alert">
                        {#if currentCanvasThumbnail}
                            <img
                                src={currentCanvasThumbnail}
                                alt=""
                                class="blur-bg"
                            />
                            <div class="dim-50"></div>
                        {/if}
                        <div class="error-card">
                            {#if tileSourceError.type === 'auth'}
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="warn-icon"
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
                                <p class="msg">
                                    {m.error_auth_required()}
                                </p>
                            {:else}
                                <ImageBroken
                                    size={48}
                                    color="var(--color-warning)"
                                />
                                <p class="msg msg-strong">
                                    {tileSourceErrorMessage}
                                </p>
                                {#if tileSourceErrorDetails}
                                    <p class="msg-details">
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
                <div class="overlay-cover" role="status">
                    {#if currentCanvasThumbnail}
                        <img src={currentCanvasThumbnail} alt="" class="blur-bg" />
                        <div class="dim-50"></div>
                    {/if}
                    <div class="error-card">
                        <ImageBroken size={48} color="var(--color-warning)" />
                        <p class="msg msg-strong">
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
                    <div class="plugin-overlay">
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
                <div class="drag-overlay">
                    <div class="drag-hint">
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
                class="gallery-band"
                style="height: {internalViewerState.galleryFixedHeight + 55}px"
            >
                <ThumbnailGallery {canvases} />
            </div>
        {/if}

        <!-- Bottom Area (Plugin Panels) -->
        {#each internalViewerState.pluginPanels as panel (panel.id)}
            {#if panel.isVisible() && panel.position === 'bottom'}
                <div class="plugin-bottom">
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
            class="side-col side-col-right"
            class:opaque={!internalViewerState.config.transparentBackground}
        >
            {#if visiblePanelsRight.length > 0}
                <div class="panel-host" style="width: {rightPanelWidth}">
                    <PanelStack panels={visiblePanelsRight} />
                </div>
            {/if}

            <!-- Gallery (when docked right) -->
            {#if internalViewerState.showThumbnailGallery && internalViewerState.dockSide === 'right'}
                <div
                    class="gallery-host"
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
    .viewer-root {
        display: flex;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }
    .viewer-root.opaque {
        background-color: var(--color-base-100);
    }

    .side-col {
        flex: none;
        min-height: 0;
        display: flex;
        flex-direction: row;
        z-index: 20;
        transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .side-col.opaque {
        background-color: var(--color-base-100);
    }
    .side-col-left.opaque {
        border-right: 1px solid var(--color-base-300);
    }

    .panel-host {
        height: 100%;
        min-height: 0;
        position: relative;
        pointer-events: auto;
    }
    .gallery-host {
        height: 100%;
        min-height: 0;
        position: relative;
        pointer-events: auto;
    }

    .center-col {
        flex: 1 1 0%;
        position: relative;
        min-width: 0;
        display: flex;
        flex-direction: column;
    }

    .gallery-band {
        flex: none;
        width: 100%;
        position: relative;
        pointer-events: auto;
        z-index: 20;
    }

    .viewer-area {
        flex: 1 1 0%;
        position: relative;
        min-height: 0;
        width: 100%;
        height: 100%;
    }
    .viewer-area.opaque {
        background-color: var(--color-base-100);
    }

    .centered {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .error-text {
        color: var(--color-error);
    }

    .overlay-cover {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        overflow: hidden;
    }
    .blur-bg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(24px);
        scale: 1.1;
        opacity: 0.4;
    }
    .dim-50 {
        position: absolute;
        inset: 0;
        background-color: color-mix(in oklab, var(--color-base-100) 50%, transparent);
    }
    .error-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        max-width: 24rem;
        text-align: center;
        padding-inline: 1rem;
        padding-block: 1.5rem;
        background-color: color-mix(in oklab, var(--color-base-100) 90%, transparent);
        border-radius: 0.75rem;
        box-shadow:
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a;
    }
    .warn-icon {
        width: 3rem;
        height: 3rem;
        color: var(--color-warning);
    }
    .msg {
        color: var(--color-base-content);
        font-size: 0.875rem;
        line-height: 1.25rem;
    }
    .msg-strong {
        font-weight: 600;
    }
    .msg-details {
        color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
        font-size: 0.75rem;
        line-height: 1rem;
        overflow-wrap: break-word;
        max-width: 20rem;
    }

    .plugin-overlay {
        position: absolute;
        inset: 0;
        z-index: 40;
        pointer-events: none;
    }
    .plugin-bottom {
        position: relative;
        width: 100%;
        z-index: 40;
        pointer-events: auto;
    }

    .drag-overlay {
        position: absolute;
        inset: 0;
        z-index: 45;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: color-mix(in oklab, var(--color-base-100) 70%, transparent);
        backdrop-filter: blur(4px);
    }
    .drag-hint {
        border-radius: var(--radius-box);
        border: 2px dashed var(--color-primary);
        background-color: color-mix(in oklab, var(--color-base-100) 90%, transparent);
        padding-inline: 1.5rem;
        padding-block: 1rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 500;
        color: var(--color-base-content);
        box-shadow:
            0 10px 15px -3px #0000001a,
            0 4px 6px -4px #0000001a;
    }

    /* Scoped scrollbar styles for the viewer */
    :global(#triiiceratops-viewer *) {
        scrollbar-width: thin;
        scrollbar-color: color-mix(in oklab, var(--color-base-content) 20%, transparent)
            transparent;
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
        background-color: color-mix(in oklab, var(--color-base-content) 20%, transparent);
        border-radius: 9999px;
        border: 1px solid transparent;
        background-clip: padding-box;
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-thumb:hover) {
        background-color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
    }

    :global(#triiiceratops-viewer ::-webkit-scrollbar-corner) {
        background: transparent;
        border-radius: 9999px;
    }
</style>
