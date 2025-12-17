<script lang="ts">
    import DemoHeader from '../lib/components/DemoHeader.svelte';
    import TriiiceratopsViewer from '../lib/components/TriiiceratopsViewer.svelte';
    import { ViewerState } from '../lib/state/viewer.svelte';
    import type { ViewerStateSnapshot } from '../lib/state/viewer.svelte';

    // Initialize state from URL if present
    const urlParams = new URLSearchParams(window.location.search);

    let manifestUrl = $state(urlParams.get('manifest') || '');
    let currentManifest = $state(urlParams.get('manifest') || '');
    let canvasId = $state(urlParams.get('canvas') || '');

    const defaultConfig = {
        showRightMenu: true,
        showLeftMenu: true,
        showCanvasNav: true,
        rightMenu: {
            showSearch: true,
            showGallery: true,
            showAnnotations: true,
            showFullscreen: true,
            showInfo: true,
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

    // This defines <triiiceratops-viewer> and <triiiceratops-viewer-image>
    import('../lib/custom-element');
    import('../lib/custom-element-image');

    // Persist state to URL
    $effect(() => {
        const params = new URLSearchParams();
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
    let externalState = $state<ViewerStateSnapshot | null>(null);
    let lastEventType = $state<string>('');

    // ViewerState for Svelte component mode (via bindable prop)
    let svelteViewerState: ViewerState | undefined = $state();

    // Set up event listeners when viewer mounts - use onMount pattern
    let listenersAttached = false;

    $effect(() => {
        // Only run once after mount, and only if we haven't attached listeners yet
        if (listenersAttached) return;

        // Use setTimeout to ensure custom elements are defined and rendered
        const timeoutId = setTimeout(() => {
            const el = document.querySelector(
                'triiiceratops-viewer, triiiceratops-viewer-image',
            ) as HTMLElement | null;

            if (!el) return;

            listenersAttached = true;

            const handleStateChange = (e: Event) => {
                const customEvent = e as CustomEvent<ViewerStateSnapshot>;
                externalState = customEvent.detail;
                lastEventType = e.type;
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

                    if (hasChanges) {
                        config.gallery = newGallery;
                        config.search = newSearch;
                        config.annotations = newAnnotations;
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

        config.gallery.open = svelteViewerState.showThumbnailGallery;
        config.gallery.dockPosition = svelteViewerState.dockSide as any;
        config.search.open = svelteViewerState.showSearchPanel;
        config.annotations.open = svelteViewerState.showAnnotations;
    });

    // Push config.search.query to Svelte viewerState (one-way: Config -> Viewer)
    $effect(() => {
        if (viewerMode !== 'svelte' || !svelteViewerState) return;

        const query = config.search?.query;
        if (query !== undefined && query !== svelteViewerState.searchQuery) {
            svelteViewerState.search(query);
        }
    });

    // External control functions - call methods on ViewerState via the element
    function externalNextCanvas() {
        // Access viewerState property on the web component (exposed via shadowRoot)
        const el = document.querySelector(
            'triiiceratops-viewer, triiiceratops-viewer-image',
        ) as any;
        // The state is exposed via events, but we can also call methods
        // by accessing the inner component's viewerState
        if (el?.shadowRoot) {
            const inner = el.shadowRoot.querySelector(
                '[id="triiiceratops-viewer"]',
            );
            // For now, dispatch a custom event to trigger navigation
            // or we could expose getViewerState() on the element
        }
        console.log(
            '[Demo] External next canvas - use events for state updates',
        );
    }
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

    <h1 class="text-3xl text-center pt-8">Triiiceratops IIIF Viewer Demo</h1>

    <!-- Viewer -->
    <main class="flex-1 relative min-h-0 p-2 lg:pb-16 lg:pt-8 lg:px-32">
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
                    />
                {:else if viewerMode === 'image'}
                    <triiiceratops-viewer-image
                        manifest-id={currentManifest}
                        canvas-id={canvasId}
                        config={configStr}
                    ></triiiceratops-viewer-image>
                {:else if viewerMode === 'custom-theme'}
                    <triiiceratops-viewer-image
                        manifest-id={currentManifest}
                        canvas-id={canvasId}
                        theme-config={customThemeConfig}
                        config={configStr}
                    ></triiiceratops-viewer-image>
                {:else}
                    <triiiceratops-viewer
                        manifest-id={currentManifest}
                        canvas-id={canvasId}
                        config={configStr}
                    ></triiiceratops-viewer>
                {/if}
            </div>
        </div>
    </main>
</div>

<style>
    triiiceratops-viewer,
    triiiceratops-viewer-image {
        display: block;
        width: 100%;
        height: 100%;
    }
</style>
