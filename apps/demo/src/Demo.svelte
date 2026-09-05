<script lang="ts">
    import DemoHeader from './DemoHeader.svelte';
    import RecipeBrowser from './RecipeBrowser.svelte';
    import SettingsMenu from './SettingsMenu.svelte';
    import { language, m } from './i18n.svelte';
    import type { ComponentProps } from 'svelte';
    import {
        TriiiceratopsViewer,
        VIEWER_STATE_AVAILABLE_EVENT,
        ViewerState,
        type BuiltInTheme,
        type CanvasRegion,
        type SdkPlugin,
        type TriiiceratopsViewerElement,
        type ViewerStateSnapshot,
    } from 'triiiceratops/svelte';
    import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
    import { ImageDownloadPlugin } from '@triiiceratops/plugin-image-export';
    import { PdfExportPlugin } from '@triiiceratops/plugin-pdf-export';
    import { AnnotationEditorPlugin } from '@triiiceratops/plugin-annotation-editor';
    import { AvPlugin } from '@triiiceratops/plugin-av';
    import {
        buildShareUrl,
        carriesContentState,
        clearStoredConfig,
        clonePlain,
        createSparseTracker,
        resolveInitialConfig,
        resolveInitialView,
        writeStoredConfig,
        type SparseConfig,
    } from '@triiiceratops/config';
    import { resolveDroppedView } from './drop';

    /** Where this surface keeps its light/dark choice. See the note below. */
    const THEME_STORAGE_KEY = 'triiiceratops.playground.theme';

    const urlParams = new URLSearchParams(window.location.search);

    const initialView = resolveInitialView(urlParams);

    let manifestUrl = $state(initialView.manifestUrl);
    let currentManifest = $state(initialView.manifestUrl);
    let canvasId = $state(initialView.canvasId);
    let initialCanvasRegion = $state<CanvasRegion | null>(initialView.region);

    /*
     * The region arrived aimed at one canvas and is never recomputed, so sharing
     * it once the viewer has moved elsewhere would emit a region belonging to a
     * canvas nobody is looking at.
     */
    const regionCanvasId = initialView.region ? initialView.canvasId : '';

    /*
     * Core does not export `ViewerConfig` by name; the viewer component's own
     * prop type is the public way to name it.
     */
    type ViewerConfig = NonNullable<
        ComponentProps<typeof TriiiceratopsViewer>['config']
    >;

    const defaultConfig: ViewerConfig = {
        showToggle: true,
        toolbarOpen: true,
        showCanvasNav: true,
        showZoomControls: true,
        // The settings pane binds these two to checkboxes, which materializes
        // them as `false` on mount. Stating them here keeps that from reading as
        // a user choice worth persisting.
        transparentBackground: false,
        preserveCanvasScale: false,
        leftPanelWidth: '320px',
        rightPanelWidth: '320px',
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
            showCloseButton: true,
            dockPosition: 'bottom' as 'bottom' | 'top' | 'left' | 'right',
        },
        search: {
            open: false,
            showCloseButton: true,
            query: '',
        },
        annotations: {
            open: false,
            showCloseButton: true,
        },
        information: {
            open: false,
            showCloseButton: true,
            position: 'right' as 'left' | 'right',
            showButton: true,
        },
        structures: {
            open: false,
            showCloseButton: true,
        },
        collection: {
            open: false,
            showCloseButton: true,
        },
    };

    const resolved = resolveInitialConfig({
        search: urlParams,
        defaults: defaultConfig,
    });

    let config = $state(resolved.config);

    /*
     * Only keys the user explicitly set are persisted, so an untouched key stays
     * whatever the manifest says. The tracker holds plain, non-reactive objects:
     * the persistence effect must not re-run on its own bookkeeping.
     */
    const tracker = createSparseTracker(defaultConfig, resolved.sparse);

    /** A value the viewer reported, not one the user chose. */
    function applyViewerValue(path: string[], value: unknown) {
        tracker.applyViewerValue(config as SparseConfig, path, value);
    }

    function shouldSyncViewingMode(
        mode: 'individuals' | 'paged' | 'continuous',
    ) {
        return config.viewingMode !== undefined || mode !== 'individuals';
    }

    // Initialize mode from URL, default to 'image'
    // const urlParams = new URLSearchParams(window.location.search); // Already defined above
    let viewerMode = $state(urlParams.get('mode') || 'image');

    // The demo page theme is split from the viewer theme.
    //
    // The storage key is namespaced by surface. The marketing site at the domain
    // root stores its own scheme choice on this origin, and the two are
    // deliberately independent — a palette that suits a warm-paper marketing
    // page is not necessarily the one a reader wants here. A bare `theme` key
    // would have made the choice travel between them by accident.
    //
    // `demoTheme` (light/dark only) governs the demo chrome — it is written to
    // <html data-theme> and persisted. `viewerTheme` is what we hand to the
    // viewer component: it follows `demoTheme` until the user explicitly picks
    // one of the four built-in themes for the viewer (via the config pane). Once
    // that happens (`viewerThemeUserSet`), the demo's light/dark toggle no longer
    // steers the viewer.
    const initialDemoTheme = ((): 'light' | 'dark' => {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    })();
    let demoTheme = $state<'light' | 'dark'>(initialDemoTheme);

    let viewerThemeUserSet = $state(false);
    let viewerThemeExplicit = $state<BuiltInTheme>(initialDemoTheme);
    let viewerTheme = $derived<BuiltInTheme>(
        viewerThemeUserSet ? viewerThemeExplicit : demoTheme,
    );

    $effect(() => {
        localStorage.setItem(THEME_STORAGE_KEY, demoTheme);
    });

    // Called by the config pane when the user picks a viewer theme or a preset.
    function setViewerTheme(theme: BuiltInTheme) {
        viewerThemeExplicit = theme;
        viewerThemeUserSet = true;
    }

    // The app owns the page locale and hands it to the viewer as its `locale`
    // input — the API a consumer has. An IIIF locale chosen in the settings pane
    // is the more specific answer to the same question, so it wins.
    let viewerConfig = $derived({
        ...config,
        locale: config.locale ?? language.current,
    });
    let configStr = $derived(JSON.stringify(viewerConfig));

    function loadManifest() {
        currentManifest = manifestUrl;
    }

    let dragOver = $state(false);
    let dropRejected = $state(false);
    let rejectionTimer: ReturnType<typeof setTimeout> | undefined;

    function onDragOver(event: DragEvent) {
        if (!carriesContentState(event.dataTransfer)) return;
        // Without this the browser treats the pane as a non-target and never
        // fires `drop`.
        event.preventDefault();
        dragOver = true;
    }

    /*
     * `dragleave` bubbles from every descendant the pointer crosses, so a
     * pointer still inside the pane would otherwise flicker the drop state off
     * and on for the whole drag.
     */
    function onDragLeave(event: DragEvent) {
        const pane = event.currentTarget as HTMLElement;
        const entered = event.relatedTarget as Node | null;
        if (entered && pane.contains(entered)) return;
        dragOver = false;
    }

    /*
     * The playground resolves the drop itself and assigns its own props. Handing
     * the payload to this viewer as `contentState` would do nothing: the
     * precedence ladder discards it whenever a discrete manifest prop is set,
     * and this page always sets one (ADR 0006).
     */
    function onDrop(event: DragEvent) {
        event.preventDefault();
        dragOver = false;

        const view = resolveDroppedView(event.dataTransfer);
        if (!view) {
            // Transient, and in the overlay: an unusable drop must say so
            // without leaving the page permanently wearing an error surface.
            dropRejected = true;
            clearTimeout(rejectionTimer);
            rejectionTimer = setTimeout(() => (dropRejected = false), 4000);
            return;
        }

        dropRejected = false;
        manifestUrl = view.manifestId;
        currentManifest = view.manifestId;
        canvasId = view.canvasId ?? '';
        initialCanvasRegion = view.region ?? null;
    }

    // This defines <triiiceratops-viewer>
    import('triiiceratops/element/register');

    function resetConfig() {
        config = clonePlain(defaultConfig);
        tracker.reset();
        clearStoredConfig();
    }

    /*
     * The view travels as a content state the viewer's own parser reads back;
     * configuration travels in its own parameter, and only the keys the user
     * set, so the recipient's manifest-driven defaults stay honored.
     */
    async function shareState() {
        const newUrl = buildShareUrl({
            pathname: window.location.pathname,
            mode: viewerMode,
            target: {
                // The loaded manifest, not whatever is sitting in the input.
                manifestId: currentManifest,
                canvasId: canvasId || undefined,
                region:
                    canvasId === regionCanvasId
                        ? (initialCanvasRegion ?? undefined)
                        : undefined,
            },
            config: tracker.userSet,
        });

        window.history.replaceState({}, '', newUrl);
        await navigator.clipboard.writeText(window.location.origin + newUrl);
    }

    // Custom theme configuration for the "Custom Theme" demo
    // This demonstrates hex color conversion and theme customization
    const customThemeConfig = JSON.stringify({
        primary: '#e1a730',
        primaryContent: '#ffffff',
        neutral: '#e9d9b9',
        neutralContent: '#000000',
        viewerBg: '#ecede7',
        toolbarBg: '#b7b7b3',
        panelBg: '#b7b7b3',
        surfaceBorder: '#838381',
        content: '#000000',
        success: '#264b3d',
        warning: '#733100',
        error: '#b95527',
        radiusBox: '1.5rem',
        radiusButtons: '0.75rem',
        radiusSelector: '0.5rem',
        radiusControls: '9999px',
        border: '2px',
    });

    // ==================== External State Access Demo ====================

    // State received from web component events
    let _externalState = $state<ViewerStateSnapshot | null>(null);
    let _lastEventType = $state<string>('');

    // ViewerState for Svelte component mode (via bindable prop)
    let svelteViewerState: ViewerState | undefined = $state();

    let viewerEl = $state<TriiiceratopsViewerElement | undefined>();

    /*
     * What the page reads out of the Web Component's own ViewerState, copied
     * into this page's reactive graph.
     *
     * The element publishes its ViewerState as a getter-only property alongside
     * `viewerstateavailable`, and that is the only way the page — or any other
     * consumer — can reach its manifests. But the element is a self-contained
     * bundle with its own copy of the viewer's state module, so its state is
     * reactive only inside it: the page can read the object, never watch it
     * mutate. Both the ViewerState and its `canvases` array also keep one
     * identity for the element's whole life, so holding either would freeze the
     * page at whatever it happened to read first. The values are therefore
     * copied out on the element's own events instead.
     */
    let elementCanvases = $state.raw<ViewerState['canvases']>([]);
    let elementManifestJson = $state.raw<unknown>(undefined);

    /*
     * The element branch is torn down and rebuilt whenever the mode selector
     * leaves and re-enters it, and a new element brings a new ViewerState, so
     * this has to run per element rather than once per page: `viewerEl` is the
     * `bind:this` target, which Svelte clears when the element is destroyed.
     *
     * Listen first, then read. The element populates `viewerState` before
     * dispatching the event from a microtask, so doing both catches state that
     * became available before, during, or after this ran; the reverse order has
     * a window in which neither does.
     *
     * `manifestchange` is the other trigger because it is the only event that
     * moves either of the values read here.
     */
    $effect(() => {
        const el = viewerEl;
        if (!el) return;

        const publish = () => {
            const state = el.viewerState;
            elementCanvases = [...(state?.canvases ?? [])];
            elementManifestJson = state?.manifestEntry?.json;
        };

        el.addEventListener(VIEWER_STATE_AVAILABLE_EVENT, publish);
        el.addEventListener('manifestchange', publish);
        publish();

        return () => {
            el.removeEventListener(VIEWER_STATE_AVAILABLE_EVENT, publish);
            el.removeEventListener('manifestchange', publish);
            elementCanvases = [];
            elementManifestJson = undefined;
        };
    });

    // Each plugin is typed against `@triiiceratops/plugin-sdk`, whose type-only
    // import of core's plugin types resolves to core's *published* `dist/types`.
    // Those are structurally identical to core's own `src/lib/types` but
    // nominally distinct (e.g. ViewerState's `#private` brand), so we cast at
    // this in-repo boundary. Runtime is unaffected.
    const enabledPlugins = [
        ImageManipulationPlugin,
        ImageDownloadPlugin,
        PdfExportPlugin,
        AnnotationEditorPlugin,
        AvPlugin,
    ] as unknown as SdkPlugin[];

    function isLanguageMapKey(key: string): boolean {
        return (
            key === 'none' || /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(key)
        );
    }

    function isLanguageMapEntry(value: unknown): boolean {
        return (
            typeof value === 'string' ||
            (Array.isArray(value) &&
                value.every((item) => typeof item === 'string'))
        );
    }

    function addLocale(locales: string[], locale: string) {
        if (!locales.includes(locale)) {
            locales.push(locale);
        }
    }

    function extractManifestLocales(value: unknown, found: string[] = []) {
        if (!value || typeof value !== 'object') {
            return found;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                extractManifestLocales(item, found);
            }
            return found;
        }

        const record = value as Record<string, unknown>;
        const entries = Object.entries(record);

        if (
            entries.length > 0 &&
            entries.every(
                ([key, entry]) =>
                    isLanguageMapKey(key) && isLanguageMapEntry(entry),
            )
        ) {
            for (const [key] of entries) {
                addLocale(found, key);
            }
            return found;
        }

        for (const entry of Object.values(record)) {
            extractManifestLocales(entry, found);
        }

        return found;
    }

    // Derived active plugins based on mode
    let activePlugins = $derived(
        viewerMode === 'image' ||
            viewerMode === 'custom-theme' ||
            viewerMode === 'svelte'
            ? enabledPlugins
            : [],
    );
    // The Svelte component's state is bound, so it can be read live; the
    // element's has to come from the copies published above.
    let canvases = $derived(
        viewerMode === 'svelte'
            ? (svelteViewerState?.canvases ?? [])
            : elementCanvases,
    );
    let availableViewerLocales = $derived(
        extractManifestLocales(
            viewerMode === 'svelte'
                ? svelteViewerState?.manifestEntry?.json
                : elementManifestJson,
        ).sort((a, b) => a.localeCompare(b)),
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
        // Only run once after mount, and only if we haven't attached listeners yet
        if (listenersAttached) return;

        // Use setTimeout to ensure custom elements are defined and rendered
        const timeoutId = setTimeout(() => {
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
                _lastEventType = e.type;

                const state = customEvent.detail;
                if (!state) return;

                applyViewerValue(
                    ['gallery', 'open'],
                    state.showThumbnailGallery,
                );
                applyViewerValue(['gallery', 'dockPosition'], state.dockSide);
                applyViewerValue(['search', 'open'], state.showSearchPanel);
                // Search query is one-way only (config -> viewer).
                applyViewerValue(
                    ['annotations', 'open'],
                    state.showAnnotations,
                );
                applyViewerValue(
                    ['information', 'open'],
                    state.showInformationPanel,
                );
                applyViewerValue(['toolbarOpen'], state.toolbarOpen);

                if (shouldSyncViewingMode(state.viewingMode)) {
                    applyViewerValue(['viewingMode'], state.viewingMode);
                }

                // Sync canvas ID back to the dropdown
                if (state.canvasId && state.canvasId !== canvasId) {
                    canvasId = state.canvasId;
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

    // Sync config from Svelte viewerState (for Svelte component mode).
    // `applyViewerValue` writes only on an actual change, which is what keeps
    // this effect from re-triggering itself.
    $effect(() => {
        if (viewerMode !== 'svelte' || !svelteViewerState) return;

        applyViewerValue(
            ['gallery', 'open'],
            svelteViewerState.showThumbnailGallery,
        );
        applyViewerValue(
            ['gallery', 'dockPosition'],
            svelteViewerState.dockSide,
        );
        applyViewerValue(['search', 'open'], svelteViewerState.showSearchPanel);
        applyViewerValue(
            ['annotations', 'open'],
            svelteViewerState.showAnnotations,
        );
        applyViewerValue(
            ['information', 'open'],
            svelteViewerState.showMetadataPanel,
        );
        applyViewerValue(['toolbarOpen'], svelteViewerState.toolbarOpen);

        if (shouldSyncViewingMode(svelteViewerState.viewingMode)) {
            applyViewerValue(['viewingMode'], svelteViewerState.viewingMode);
        }

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

    /*
     * Sparse persistence: whatever the configuration says that the tracker's
     * baseline does not is user intent, and only that is stored. `clean-config`
     * is a bookmarkable deterministic start, so a tab loaded with it reads
     * nothing from storage and writes nothing to it.
     */
    $effect(() => {
        const userSet = tracker.record(config as SparseConfig);
        if (!resolved.clean) writeStoredConfig(userSet);
    });
</script>

<div class="demo-root" data-theme={demoTheme}>
    <!-- Header with input -->
    <DemoHeader
        bind:manifestUrl
        bind:viewerMode
        bind:canvasId
        {canvases}
        bind:config
        bind:demoTheme
        {viewerTheme}
        onThemeChange={setViewerTheme}
        baseConfig={defaultConfig}
        availableLocales={availableViewerLocales}
        onLoad={loadManifest}
        onReset={resetConfig}
        onShare={shareState}
    />

    <h1 class="demo-title">{m.demo_title()}</h1>

    <!-- Viewer -->
    <main class="viewer-main">
        <div class="viewer-layout">
            <RecipeBrowser
                activeUrl={currentManifest}
                onSelect={(url) => {
                    manifestUrl = url;
                    loadManifest();
                }}
            />

            <!-- Main Viewer -->
            <div
                class="viewer-pane"
                ondragover={onDragOver}
                ondragleave={onDragLeave}
                ondrop={onDrop}
                role="presentation"
            >
                {#if viewerMode === 'svelte'}
                    <!-- Svelte Component (direct import, not web component) -->
                    <TriiiceratopsViewer
                        manifestId={currentManifest}
                        {canvasId}
                        {initialCanvasRegion}
                        config={viewerConfig}
                        theme={viewerTheme}
                        bind:viewerState={svelteViewerState}
                        plugins={enabledPlugins}
                    />
                {:else}
                    <!-- Web Component -->
                    <triiiceratops-viewer
                        bind:this={viewerEl}
                        manifest-id={currentManifest}
                        canvas-id={canvasId}
                        initial-canvas-region={initialCanvasRegion
                            ? JSON.stringify(initialCanvasRegion)
                            : undefined}
                        theme={viewerTheme}
                        theme-config={viewerMode === 'custom-theme'
                            ? customThemeConfig
                            : undefined}
                        config={configStr}
                    ></triiiceratops-viewer>
                {/if}

                {#if dragOver || dropRejected}
                    <div class="drop-target" data-testid="drop-target">
                        <span>
                            {dropRejected ? m.drop_rejected() : m.drop_hint()}
                        </span>
                    </div>
                {/if}
            </div>

            <!-- Desktop Settings Sidebar -->
            <div class="settings-sidebar">
                <div class="settings-sidebar-header">
                    {m.settings_view_configuration()}
                </div>
                <div class="settings-scroll">
                    <SettingsMenu
                        bind:config
                        {viewerTheme}
                        onThemeChange={setViewerTheme}
                        baseConfig={defaultConfig}
                        availableLocales={availableViewerLocales}
                        onReset={resetConfig}
                        onShare={shareState}
                        class="menu settings-menu-list"
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

    /* min-h-screen h-screen bg-base-300 flex flex-col */
    .demo-root {
        min-height: 100vh;
        min-height: 100dvh;
        height: 100vh;
        height: 100dvh;
        background-color: #d8d8d8;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* text-3xl text-center pt-8 */
    .demo-title {
        flex-shrink: 0;
        color: currentColor;
        font-size: clamp(1.25rem, 2.75vw, 1.875rem);
        line-height: 1.2;
        font-weight: 700;
        text-align: center;
        padding: clamp(0.75rem, 2vw, 2rem) 1rem 0;
    }

    /* flex-1 relative min-h-0 p-2 lg:pb-16 lg:pt-8 lg:px-8 */
    .viewer-main {
        flex: 1 1 0%;
        position: relative;
        min-height: 0;
        overflow: hidden;
        padding: 0.5rem;
    }
    @media (width >= 1024px) {
        .viewer-main {
            padding-bottom: 4rem;
            padding-top: 2rem;
            padding-inline: 2rem;
        }
    }

    /* flex gap-4 h-full */
    .viewer-layout {
        display: flex;
        justify-content: center;
        gap: 1rem;
        height: 100%;
        max-height: 100%;
        min-width: 0;
        /* The containing block for the recipe browser once it floats over the
           viewer on a narrow viewport. */
        position: relative;
    }

    /* flex-1 rounded-box overflow-hidden border border-base-content/10 shadow-2xl */
    .viewer-pane {
        flex: 1 1 0%;
        /* The containing block for the drop overlay. */
        position: relative;
        max-width: 1280px;
        height: 100%;
        max-height: 100%;
        min-width: 0;
        min-height: 0;
        border-radius: 6px;
        overflow: hidden;
        border-width: 1px;
        border-style: solid;
        border-color: color-mix(in oklab, currentColor 10%, transparent);
        box-shadow: 0 25px 50px -12px #00000040;
    }

    /* No permanent chrome: this exists only while a compatible drag is over the
       pane, or briefly after a drop that resolved to nothing. */
    .drop-target {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        /* The drag must reach the pane, not this overlay: a drop landing on an
           element that appeared mid-drag would retarget the event. */
        pointer-events: none;
        text-align: center;
        background-color: color-mix(in oklab, currentColor 8%, transparent);
        backdrop-filter: blur(2px);
        outline: 3px dashed currentColor;
        outline-offset: -0.75rem;
    }

    /* hidden lg:flex flex-col w-80 shrink-0 bg-base-100 rounded-box
       border border-base-content/10 shadow-xl overflow-hidden */
    .settings-sidebar {
        display: none;
        flex-direction: column;
        width: 20rem;
        flex-shrink: 0;
        background-color: #ffffff;
        border-radius: 6px;
        border-width: 1px;
        border-style: solid;
        border-color: color-mix(in oklab, currentColor 10%, transparent);
        box-shadow:
            0 20px 25px -5px #0000001a,
            0 8px 10px -6px #0000001a;
        overflow: hidden;
    }
    @media (width >= 1024px) {
        .settings-sidebar {
            display: flex;
        }
    }

    @media (width < 768px) {
        .demo-title {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        .viewer-main {
            padding: 0.375rem;
        }

        .viewer-layout {
            gap: 0;
        }

        .viewer-pane {
            border-radius: calc(6px * 0.75);
            box-shadow: 0 16px 34px -18px #00000066;
        }
    }

    /* p-4 font-bold text-lg border-b border-base-content/10 bg-base-100 */
    .settings-sidebar-header {
        padding: 1rem;
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: color-mix(in oklab, currentColor 10%, transparent);
        background-color: #ffffff;
    }

    /* flex-1 overflow-y-auto */
    .settings-scroll {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    /* SettingsMenu receives class="menu settings-menu-list". These rules give that
       list its padding, no-wrap layout, and full width. */
    .settings-scroll :global(.settings-menu-list) {
        padding: 0.5rem;
        flex-wrap: nowrap;
        width: 100%;
    }
</style>
