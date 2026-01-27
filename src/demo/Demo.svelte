<script lang="ts">
    import DemoHeader from '../lib/components/DemoHeader.svelte';
    import TriiiceratopsViewer from '../lib/components/TriiiceratopsViewer.svelte';
    import SettingsMenu from '../lib/components/SettingsMenu.svelte';
    import { ViewerState } from '../lib/state/viewer.svelte';
    import type { ViewerStateSnapshot } from '../lib/state/viewer.svelte';
    import { m } from '../lib/state/i18n.svelte';
    import { SvelteURLSearchParams } from 'svelte/reactivity';
    import { ImageManipulationPlugin } from '../lib/plugins/image-manipulation';
    import { AnnotationEditorPlugin } from '../lib/plugins/annotation-editor';

    // Initialize state from URL if present
    const urlParams = new URLSearchParams(window.location.search);

    let manifestUrl = $state(urlParams.get('manifest') || '');
    let currentManifest = $state(urlParams.get('manifest') || '');
    let canvasId = $state(urlParams.get('canvas') || '');

    const defaultConfig: import('../lib/types/config').ViewerConfig = {
        showToggle: true,
        toolbarOpen: false,
        showCanvasNav: true,
        showZoomControls: true,
        viewingMode: 'individuals',
        toolbar: {
            showSearch: true,
            showGallery: true,
            showAnnotations: true,
            showFullscreen: true,
            showInfo: true,
            showViewingMode: true,
        },
        gallery: {
            open: false,
            draggable: true,
            showCloseButton: true,
            dockPosition: 'bottom' as
                | 'bottom'
                | 'top'
                | 'left'
                | 'right'
                | 'none',
        },
        search: {
            open: false,
            showCloseButton: true,
            query: '',
        },
        annotations: {
            open: false,
            visible: true,
        },
    };

    let initialConfig = defaultConfig;
    const configParam = urlParams.get('config');
    if (configParam) {
        try {
            initialConfig = { ...defaultConfig, ...JSON.parse(configParam) };
        } catch (e) {
            console.error('Failed to parse config from URL', e);
        }
    }

    let config = $state(initialConfig);

    // Initialize mode from URL, default to 'image'
    // const urlParams = new URLSearchParams(window.location.search); // Already defined above
    let viewerMode = $state(urlParams.get('mode') || 'image');

    // Derived string for custom elements
    let configStr = $derived(JSON.stringify(config));

    $effect(() => {
        console.log('[Demo] configStr updated:', configStr);
    });

    function loadManifest() {
        currentManifest = manifestUrl;
    }

    // This defines <triiiceratops-viewer>
    import('../lib/custom-element');

    // Persist state to URL
    $effect(() => {
        const params = new SvelteURLSearchParams();
        params.set('mode', viewerMode);
        if (manifestUrl) params.set('manifest', manifestUrl);
        if (canvasId) params.set('canvas', canvasId);

        // Only persist config if it's different from default?
        // For simplicity and correctness of bookmarking "exactly this view", we persist it.
        // To avoid massive URLs for default state, we could compare, but let's stick to explicit first.
        params.set('config', JSON.stringify(config));

        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
    });

    // Custom theme configuration for the "Custom Theme" demo
    // This demonstrates hex color conversion and theme customization
    const customThemeConfig = JSON.stringify({
        primary: '#e1a730',
        primaryContent: '#ffffff',
        secondary: '#264b3d',
        secondaryContent: '#ffffff',
        accent: '#16376f',
        accentContent: '#ffffff',
        neutral: '#e9d9b9',
        neutralContent: '#000000',
        base100: '#ecede7',
        base200: '#b7b7b3',
        base300: '#838381',
        baseContent: '#000000',
        info: '#254477',
        success: '#264b3d',
        warning: '#733100',
        error: '#b95527',
        radiusBox: '1.5rem',
        radiusField: '0.75rem',
        radiusSelector: '0.5rem',
        border: '2px',
    });

    // ==================== External State Access Demo ====================

    // State received from web component events
    let _externalState = $state<ViewerStateSnapshot | null>(null);
    let _lastEventType = $state<string>('');

    // ViewerState for Svelte component mode (via bindable prop)
    let svelteViewerState: ViewerState | undefined = $state();

    const enabledPlugins = [ImageManipulationPlugin, AnnotationEditorPlugin];

    // Derived active plugins based on mode
    let activePlugins = $derived(
        viewerMode === 'image' ||
            viewerMode === 'custom-theme' ||
            viewerMode === 'svelte'
            ? enabledPlugins
            : [],
    );

    $effect(() => {
        if (viewerMode !== 'svelte') {
            const el = document.querySelector('triiiceratops-viewer') as any;
            if (el) {
                el.plugins = activePlugins;
            }
        }
    });

    // Set up event listeners when viewer mounts - use onMount pattern
    let listenersAttached = false;

    $effect(() => {
        console.log(
            '[Demo] Setup effect running. listenersAttached:',
            listenersAttached,
        );
        // Only run once after mount, and only if we haven't attached listeners yet
        if (listenersAttached) return;

        // Use setTimeout to ensure custom elements are defined and rendered
        const timeoutId = setTimeout(() => {
            console.log('[Demo] Setup timeout firing');
            const el = document.querySelector('triiiceratops-viewer') as any;

            if (!el) return;

            // Initial plugin sync is handled by the effect above,
            // but we can ensure it here too or just rely on the reactive effect.
            // The effect depends on `activePlugins`, which is derived.
            // When this component mounts, effect runs.
            // However, the web component might not be upgraded yet.
            // Let's set it here just in case, but using the reactive value.
            el.plugins = activePlugins;

            listenersAttached = true;

            const handleStateChange = (e: Event) => {
                const customEvent = e as CustomEvent<ViewerStateSnapshot>;
                _externalState = customEvent.detail;
                // ... logic remains same ...
                _lastEventType = e.type;
                console.log(
                    `[Demo] Received ${e.type} event:`,
                    customEvent.detail,
                );

                // Sync relevant state back to config for settings dropdown
                const state = customEvent.detail;
                if (state) {
                    let hasChanges = false;
                    const newGallery = { ...config.gallery };
                    if (newGallery.open !== state.showThumbnailGallery) {
                        newGallery.open = state.showThumbnailGallery;
                        hasChanges = true;
                    }
                    if (newGallery.dockPosition !== (state.dockSide as any)) {
                        newGallery.dockPosition = state.dockSide as any;
                        hasChanges = true;
                    }
                    if (state.gallerySize && state.dockSide === 'none') {
                        newGallery.width = state.gallerySize.width;
                        newGallery.height = state.gallerySize.height;
                        hasChanges = true;
                    }
                    if (state.galleryPosition && state.dockSide === 'none') {
                        newGallery.x = state.galleryPosition.x;
                        newGallery.y = state.galleryPosition.y;
                        hasChanges = true;
                    }

                    const newSearch = { ...config.search };
                    if (newSearch.open !== state.showSearchPanel) {
                        newSearch.open = state.showSearchPanel;
                        hasChanges = true;
                    }
                    // NOTE: Search query is one-way only (Config -> Viewer)
                    // We do NOT sync query back from viewer to config because of ISSUES

                    const newAnnotations = { ...config.annotations };
                    if (newAnnotations.open !== state.showAnnotations) {
                        newAnnotations.open = state.showAnnotations;
                        hasChanges = true;
                    }

                    if (config.toolbarOpen !== state.toolbarOpen) {
                        config.toolbarOpen = state.toolbarOpen;
                        hasChanges = true;
                    }

                    if (config.viewingMode !== state.viewingMode) {
                        config.viewingMode = state.viewingMode;
                        hasChanges = true;
                    }

                    if (hasChanges) {
                        config.gallery = newGallery;
                        config.search = newSearch;
                        config.annotations = newAnnotations;
                    }

                    // Sync canvas ID back to the dropdown
                    if (state.canvasId && state.canvasId !== canvasId) {
                        canvasId = state.canvasId;
                    }
                }
            };

            // Listen to all state change events
            el.addEventListener('statechange', handleStateChange);
            el.addEventListener('canvaschange', handleStateChange);
            el.addEventListener('manifestchange', handleStateChange);
        }, 100);

        return () => {
            clearTimeout(timeoutId);
        };
    });

    // Sync config from Svelte viewerState (for Svelte component mode)
    // IMPORTANT: Only update config when values actually change to prevent infinite loops
    $effect(() => {
        if (viewerMode !== 'svelte' || !svelteViewerState) return;

        if (config.gallery) {
            config.gallery.open = svelteViewerState.showThumbnailGallery;
            config.gallery.dockPosition = svelteViewerState.dockSide as any;
        }
        if (config.search) {
            config.search.open = svelteViewerState.showSearchPanel;
        }
        if (config.annotations) {
            config.annotations.open = svelteViewerState.showAnnotations;
        }
        config.toolbarOpen = svelteViewerState.toolbarOpen;
        config.viewingMode = svelteViewerState.viewingMode;

        // Sync canvas ID back to the dropdown
        if (
            svelteViewerState.canvasId &&
            svelteViewerState.canvasId !== canvasId
        ) {
            canvasId = svelteViewerState.canvasId;
        }
    });

    // Push config.search.query to Svelte viewerState (one-way: Config -> Viewer)
    // Track last pushed query to only trigger on actual CONFIG changes
    let lastPushedQuery = $state('');
    $effect(() => {
        if (viewerMode !== 'svelte' || !svelteViewerState) return;

        const query = config.search?.query;
        // Only search if the CONFIG query has changed (not just differs from viewer)
        if (query !== undefined && query !== lastPushedQuery) {
            lastPushedQuery = query;
            if (query !== svelteViewerState.searchQuery) {
                svelteViewerState.search(query);
            }
        }
    });
</script>

<div class="min-h-screen h-screen bg-base-300 flex flex-col">
    <!-- Header with input -->
    <DemoHeader
        bind:manifestUrl
        bind:viewerMode
        bind:canvasId
        bind:config
        onLoad={loadManifest}
    />

    <h1 class="text-3xl text-center pt-8">{m.demo_title()}</h1>

    <!-- Viewer -->
    <main class="flex-1 relative min-h-0 p-2 lg:pb-16 lg:pt-8 lg:px-8">
        <div class="flex gap-4 h-full">
            <!-- Main Viewer -->
            <div
                class="flex-1 rounded-box overflow-hidden border border-base-content/10 shadow-2xl"
            >
                {#if viewerMode === 'svelte'}
                    <!-- Svelte Component (direct import, not web component) -->
                    <TriiiceratopsViewer
                        manifestId={currentManifest}
                        {canvasId}
                        {config}
                        bind:viewerState={svelteViewerState}
                        plugins={enabledPlugins}
                    />
                {:else}
                    <!-- Web Component -->
                    <triiiceratops-viewer
                        manifest-id={currentManifest}
                        canvas-id={canvasId}
                        theme-config={viewerMode === 'custom-theme'
                            ? customThemeConfig
                            : undefined}
                        config={configStr}
                    ></triiiceratops-viewer>
                {/if}
            </div>

            <!-- Desktop Settings Sidebar -->
            <div
                class="hidden lg:flex flex-col w-80 shrink-0 bg-base-100 rounded-box border border-base-content/10 shadow-xl overflow-hidden"
            >
                <div
                    class="p-4 font-bold text-lg border-b border-base-content/10 bg-base-100"
                >
                    {m.settings_view_configuration()}
                </div>
                <div class="flex-1 overflow-y-auto">
                    <SettingsMenu
                        bind:config
                        class="menu p-2 flex-nowrap w-full"
                    />
                </div>
            </div>
        </div>
    </main>
</div>

<style>
    triiiceratops-viewer {
        display: block;
        width: 100%;
        height: 100%;
    }
</style>
