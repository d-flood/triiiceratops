import type OpenSeadragon from 'openseadragon';
import type { ViewerErrorReporter } from '../types/viewerError';
import type { RequestConfig, SearchProvider, SearchResultGroup, ViewerConfig } from '../types/config';
import type { PluginMenuButton, PluginPanel, PluginFlyout, PluginMountThunk, PluginUiTarget, IconDescriptor } from '../types/plugin';
import { type StructureNode } from '../utils/structures';
import { type CollectionItem } from '../utils/collections';
import type { CanvasRegion } from '../utils/contentState';
/**
 * Snapshot of viewer state for external consumers.
 * Used by web component events to expose state without Svelte reactivity.
 */
export interface ViewerStateSnapshot {
    manifestId: string | null;
    canvasId: string | null;
    currentCanvasIndex: number;
    showAnnotations: boolean;
    showInformationPanel: boolean;
    showThumbnailGallery: boolean;
    showSearchPanel: boolean;
    showStructuresPanel: boolean;
    toolbarOpen: boolean;
    searchQuery: string;
    isFullScreen: boolean;
    dockSide: string;
    viewingMode: 'individuals' | 'paged' | 'continuous';
    viewingDirection: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top';
    preserveCanvasScale: boolean;
    galleryExpanded: boolean;
    galleryPosition: {
        x: number;
        y: number;
    };
    gallerySize: {
        width: number;
        height: number;
    };
}
export declare class ViewerState {
    #private;
    manifestId: string | null;
    canvasId: string | null;
    showAnnotations: boolean;
    showThumbnailGallery: boolean;
    toolbarOpen: boolean;
    isGalleryDockedBottom: boolean;
    isGalleryDockedRight: boolean;
    isFullScreen: boolean;
    showMetadataPanel: boolean;
    showCanvasInfo: boolean;
    showStructuresPanel: boolean;
    initialCanvasRegion: CanvasRegion | null;
    dockSide: string;
    /** Reactive collection declared as a plain `Set` — see the note on the `svelte/reactivity` import. */
    visibleAnnotationIds: Set<string>;
    annotationVisibilityTouched: boolean;
    hoveredAnnotationId: string | null;
    /**
     * Per-viewer plugin-written annotation display state, keyed by
     * `manifestId::canvasId` (ADR 0007). Moved off the page-shared manifest cache
     * so annotations displayed in one viewer never leak into another on the same
     * page. Plugins write it only through {@link setUserAnnotations} /
     * {@link clearUserAnnotations}; core merges it on top of manifest annotations
     * in {@link getAnnotations}. Its changes notify subscribers (command state).
     *
     * Reactive collection declared as a plain `Map` — see the note on the
     * `svelte/reactivity` import.
     */
    userAnnotations: Map<string, any[]>;
    /**
     * Manifest ids this viewer has finished loading/registering. Observable: core
     * adds to it when a manifest becomes ready, giving subscribers a
     * manifest-readiness notification (queryable via {@link isManifestReady}).
     *
     * Reactive collection declared as a plain `Set` — see the note on the
     * `svelte/reactivity` import.
     */
    loadedManifestIds: Set<string>;
    private userAnnotationKey;
    /**
     * Replace this viewer's displayed user annotations for one canvas. The
     * supported write path for plugin display sync (ADR 0001, amended): the
     * annotation-editor store calls this after each successful persistence op.
     */
    setUserAnnotations(manifestId: string, canvasId: string, annotations: any[]): void;
    /** Drop this viewer's displayed user annotations for one canvas. */
    clearUserAnnotations(manifestId: string, canvasId: string): void;
    /** This viewer's displayed user annotations for one canvas (never null). */
    getUserAnnotations(manifestId: string, canvasId: string): any[];
    /**
     * Annotations for a canvas: manifest-defined annotations from the shared
     * cache merged with this viewer's own user annotations (ADR 0007). Plugins
     * reach annotation data through this query rather than importing the manifest
     * cache. A `sourceId` restricts the result to one annotation list and skips
     * the user-annotation merge, mirroring the manifest cache's behavior.
     */
    getAnnotations(manifestId: string, canvasId: string, sourceId?: string): any[];
    /**
     * Canvases of a manifest (from the shared cache). Plugins reach canvas data
     * through this query rather than importing the manifest cache.
     */
    getCanvases(manifestId: string, sequenceIndex?: number): any[];
    /**
     * Ensure a canvas's external annotation lists are fetched, then return the
     * per-viewer merged annotations for it. Plugin-facing wrapper over the shared
     * cache's fetch-and-return.
     */
    ensureCanvasAnnotations(manifestId: string, canvasId: string, sourceId?: string): Promise<any[]>;
    /** Whether this viewer has finished loading the given manifest. */
    isManifestReady(manifestId: string): boolean;
    /** Record that a manifest is ready, notifying manifest-readiness subscribers. */
    private markManifestReady;
    showCurrentCanvasAnnotations(): void;
    private clearAnnotationVisibility;
    private setAnnotationsPanelOpen;
    tileSourceError: {
        type: 'auth';
    } | {
        type: 'load';
        message?: string;
        details?: string;
    } | null;
    selectedChoices: Map<string, string>;
    selectedSequenceIndex: number;
    collectionId: string | null;
    collectionLabel: string;
    collectionThumbnail: string;
    collectionItems: CollectionItem[];
    showCollectionPanel: boolean;
    private collectionThumbnailHydrationId;
    private _viewingDirection;
    get viewingDirection(): "left-to-right" | "right-to-left" | "top-to-bottom" | "bottom-to-top";
    set viewingDirection(value: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top');
    config: ViewerConfig;
    searchProvider: SearchProvider | null;
    manifestRequestConfig: RequestConfig | undefined;
    /**
     * This viewer's active locale (BCP-47) — its `config.locale` if set,
     * otherwise the page default (CONTEXT.md **Active locale**, ticket 06).
     * Observable state: readable and notifying, with no plugin-facing mutator.
     * Locale is *set* through `config.locale`; core (the viewer root) mirrors the
     * resolved value onto this field whenever the config or the page locale
     * changes, exactly as it mirrors other external facts (e.g. `isFullScreen`),
     * so the reactivity-driven watcher (ADR 0008) notifies subscribers. All of
     * the viewer's chrome renders in this locale (via the i18n context) and
     * ticket 08's `PluginLocaleService` will consume it. Defaults to the page
     * locale at construction so a server render and a subscriber-less viewer
     * both read a correct value before the first mirror runs.
     */
    activeLocale: string;
    get showToggle(): boolean;
    get showCanvasNav(): boolean;
    get showZoomControls(): boolean;
    get preserveCanvasScale(): boolean;
    /**
     * `gallery.size` — the docked band's height or the docked rail's width, and the
     * knob every thumbnail dimension is derived from. See `galleryGeometry`.
     *
     * Not named `gallerySize`: that is already the floating window's width and
     * height, which is a different thing entirely.
     */
    get galleryExtent(): number;
    private _viewingMode;
    private _viewingModeUserConfigured;
    get viewingMode(): "individuals" | "paged" | "continuous";
    set viewingMode(value: 'individuals' | 'paged' | 'continuous');
    pagedOffset: number;
    /**
     * Whether the gallery is expanded to fill the viewer's center column as a
     * thumbnail grid. Orthogonal to {@link dockSide}: expanding renders the
     * gallery as an overlay layer and leaves the dock side untouched, so
     * collapsing restores the strip/rail/window exactly where it was.
     */
    galleryExpanded: boolean;
    galleryPosition: {
        x: number;
        y: number;
    };
    gallerySize: {
        width: number;
        height: number;
    };
    isGalleryDragging: boolean;
    galleryDragOffset: {
        x: number;
        y: number;
    };
    dragOverSide: "left" | "right" | "bottom" | "top" | null;
    galleryCenterPanelRect: DOMRect | null;
    /**
     * Event target for dispatching CustomEvents.
     * Only set by TriiiceratopsViewerElement (web component build).
     * Remains null for Svelte component usage → no events dispatched.
     */
    private eventTarget;
    /**
     * Set the event target for dispatching state change events.
     * Called by TriiiceratopsViewerElement to enable event-driven API.
     */
    setEventTarget(target: EventTarget): void;
    /**
     * Host reporter for the structured `viewererror` channel (ticket 18). Set by
     * `TriiiceratopsViewer.svelte` so state-level actionable failures (search,
     * viewport, content) surface as a typed {@link ViewerError} on the viewer
     * root's `viewererror` event and the `onviewererror` callback instead of
     * only reaching the console. Null in direct/test use → failures are logged
     * through the (silent-by-default) logger only.
     */
    private errorReporter;
    /** Wire the `viewererror` reporter (see {@link errorReporter}). */
    setErrorReporter(reporter: ViewerErrorReporter | null): void;
    /** Deliver a structured viewer failure to the host, if a reporter is wired. */
    private reportError;
    /**
     * Get current state as a plain object snapshot.
     * Safe to use outside Svelte's reactive system.
     * NOTE: We calculate currentCanvasIndex inline to avoid triggering the canvases getter
     * which can cause infinite loops when it auto-sets canvasId.
     */
    getSnapshot(): ViewerStateSnapshot;
    /**
     * Dispatch a state change event to the web component.
     * No-op if eventTarget is null (Svelte component usage).
     *
     * Uses queueMicrotask to dispatch asynchronously AFTER the current
     * reactive cycle completes, preventing infinite update loops.
     */
    private dispatchStateChange;
    constructor(initialManifestId?: string | null, initialCanvasId?: string | null);
    /**
     * The active manifest's cache entry — `{ json, error, isFetching }`.
     *
     * `json` is the **raw IIIF Manifest JSON as fetched**, v2 or v3 as the
     * publisher authored it. This replaced the removed `manifest` getter, which
     * handed out a `manifesto.js` object; there is deliberately no same-named
     * accessor returning raw JSON in its place, so a consumer that used it
     * fails at build time rather than at runtime.
     */
    get manifestEntry(): import("./manifests.svelte.js").ManifestEntry | null | undefined;
    get canvases(): any[];
    get sequenceCount(): number;
    get currentCanvasIndex(): number;
    private getCurrentPagedCanvasGroupIndex;
    get hasNext(): boolean;
    get hasPrevious(): boolean;
    nextCanvas(): void;
    previousCanvas(): void;
    zoomIn(): void;
    zoomOut(): void;
    setSearchProvider(searchProvider: SearchProvider | null): void;
    setManifestRequestConfig(requestConfig?: RequestConfig): void;
    setManifestData(manifestId: string, manifestJson: any, options?: {
        canvasId?: string;
    }): Promise<void>;
    /**
     * The canvas ID specified by the manifest's `start` property (IIIF
     * Presentation 3.0) or its sequence's `startCanvas` (IIIF Presentation 2.x).
     * Used during auto-selection to navigate to the correct initial canvas.
     * Only set once per manifest load; cleared when a new manifest is set.
     */
    startCanvasId: string | null;
    setManifest(manifestId: string, options?: {
        requestConfig?: RequestConfig;
        canvasId?: string;
    }): Promise<void>;
    /**
     * Load a manifest by ID within the current collection context,
     * or directly if no collection is active.
     */
    loadCollectionManifest(manifestId: string): Promise<void>;
    /**
     * Internal: load a manifest by ID and apply its settings.
     */
    private _loadManifest;
    private ensureInitialCanvasSelection;
    private hydrateCollectionItemThumbnails;
    /**
     * Apply manifest-level settings (start canvas, viewing direction, behavior).
     */
    private _applyManifestSettings;
    setCanvas(canvasId: string): void;
    selectChoice(canvasId: string, choiceId: string): void;
    getSelectedChoice(canvasId: string): string | undefined;
    updateConfig(newConfig: ViewerConfig): void;
    toggleAnnotations(): void;
    toggleToolbar(): void;
    toggleThumbnailGallery(): void;
    /**
     * Reference to the main viewer DOM element.
     * Used for fullscreen toggling.
     */
    private viewerElement;
    setViewerElement(element: HTMLElement): void;
    /**
     * Resolve the viewer's style root — where a plugin's global CSS must be
     * installed (ticket 08's `PluginStyleService`). For a light-DOM (Svelte)
     * viewer this is the owning `Document`; for the Web Component it is the
     * shadow root, so plugin styles reach the shadow-scoped tree. Derived from
     * the mount element captured by {@link setViewerElement} via `getRootNode()`;
     * `null` before the element is mounted.
     */
    getStyleRoot(): Document | ShadowRoot | null;
    toggleFullScreen(): void;
    toggleMetadataPanel(): void;
    toggleCanvasInfo(): void;
    setSequenceIndex(index: number): void;
    setInitialCanvasRegion(region: CanvasRegion | null): void;
    toggleStructuresPanel(): void;
    toggleCollectionPanel(): void;
    /** Whether the viewer is currently showing a collection */
    get hasCollection(): boolean;
    /**
     * Parsed IIIF structures (ranges / table of contents) from the current manifest.
     * Returns an empty array if no structures exist.
     */
    get structures(): StructureNode[];
    setViewingMode(mode: 'individuals' | 'paged' | 'continuous'): void;
    togglePagedOffset(): void;
    searchQuery: string;
    pendingSearchQuery: string | null;
    searchResults: SearchResultGroup[];
    isSearching: boolean;
    showSearchPanel: boolean;
    toggleSearchPanel(): void;
    searchAnnotations: any[];
    /**
     * This function now accounts for two-page mode when returning current canvas search annotations offset accordingly.
     */
    get currentCanvasSearchAnnotations(): any[];
    search(query: string): Promise<void>;
    private _performSearch;
    /**
     * Discover a IIIF Content Search service from raw manifest JSON.
     *
     * Reads `service` and `services` — either may be a bare object rather than
     * an array — and matches search v0, v1 and v2 on `profile` or
     * `type`/`@type`. The same JSON serves IIIF Presentation 2.x (`@type`,
     * `@id`) and 3.0 (`type`, `id`). v2 is preferred when several are present.
     *
     * Total: every access is guarded, so no manifest shape makes this throw.
     */
    private discoverSearchService;
    /** Helper to unescape HTML-encoded mark tags */
    private decodeMark;
    /**
     * The display label for a canvas in a search-result group.
     *
     * Delegates to the shared helper rather than repeating the chain. The
     * private copy this replaced read `getLabel()` first and, failing that,
     * only a string or a `[{value}]` array — so a raw IIIF v3 canvas, whose
     * `label` is a language map, fell through to "Canvas N" once canvases
     * stopped being library objects.
     */
    private resolveCanvasLabel;
    /** Ensure a canvas group exists in the map and return it */
    private getOrCreateCanvasGroup;
    private getSearchCanvasIndexes;
    private resolveSearchTargets;
    /**
     * Parse a IIIF Content Search API v0/v1 response.
     * Handles both "hits" format (with before/match/after) and "resources"-only format.
     */
    private parseLegacySearchResponse;
    /**
     * Parse a IIIF Content Search API v2 response.
     * v2 returns an AnnotationPage with `items` (W3C Annotations) and optional
     * `annotations` containing contextualizing/highlighting info via TextQuoteSelector.
     */
    private parseV2SearchResponse;
    private buildSearchAnnotations;
    /** Set (or clear, with null) the currently hovered annotation id. */
    setHoveredAnnotationId(annotationId: string | null): void;
    /**
     * Show or hide a single annotation in the read-only overlay, marking
     * visibility as user-touched so the panel keeps the manual selection.
     */
    setAnnotationVisible(annotationId: string, visible: boolean): void;
    /**
     * Show or hide every annotation on the active canvas at once, marking
     * visibility as user-touched. Mirrors the annotation panel's "toggle all".
     */
    setAllAnnotationsVisible(visible: boolean): void;
    /**
     * Expand the gallery to fill the viewer's center column as a thumbnail
     * grid, or collapse it back to its docked strip / floating window.
     *
     * Expanding implies opening: an expanded-but-hidden gallery is not a state
     * the UI can reach, so maintaining that invariant is why this is a command
     * rather than a field write. Collapsing leaves the gallery open.
     */
    setGalleryExpanded(expanded: boolean): void;
    /** Flip the gallery between expanded and collapsed (see {@link setGalleryExpanded}). */
    toggleGalleryExpanded(): void;
    /** Move the floating (undocked) thumbnail gallery to an absolute position. */
    setGalleryPosition(position: {
        x: number;
        y: number;
    }): void;
    /** Resize the floating (undocked) thumbnail gallery. */
    setGallerySize(size: {
        width: number;
        height: number;
    }): void;
    /**
     * Dock the thumbnail gallery to a side ('top' | 'bottom' | 'left' |
     * 'right') or float it ('none'), keeping the derived docked flags in sync.
     * Maintaining that invariant is why this is a command, not a field write.
     */
    setDockSide(side: string): void;
    /** Plugin-registered menu buttons */
    pluginMenuButtons: PluginMenuButton[];
    /** Plugin-registered panels */
    pluginPanels: PluginPanel[];
    /** Plugin-registered flyouts (compact popovers anchored to the toolbar button) */
    pluginFlyouts: PluginFlyout[];
    /**
     * OpenSeadragon viewer instance (set by OSDViewer at OSD readiness).
     * Observable pass-through state: its existence and ready-timing are core
     * API, but the object's own surface is OpenSeadragon's (ADR 0009).
     */
    osdViewer: OpenSeadragon.Viewer | null;
    /**
     * Per-viewer annotation-edit channel shared by OSDViewer and the annotation
     * editor plugin. Keeping this on ViewerState scopes edit requests and the
     * active edit id to one viewer instance instead of using global listeners.
     */
    annotationEditBus: {
        requestEdit: (annotationId: string) => void;
        activeEditAnnotationId: string | null;
    };
    /**
     * Internal plugin UI state keyed by plugin ID.
     * Keeps panel open state, toolbar visibility, the effective render
     * target, and the effective panel position in one reactive place.
     * `target` and `position` start at the plugin's authored values and can
     * be overridden reactively after mount (via `config.plugins[id].target` /
     * `.position`, or {@link setPluginTarget} / {@link setPluginPosition});
     * the render sites read them through {@link getPluginTarget} and
     * {@link getPluginPosition}, so a plugin moves between chrome and dock
     * position without re-registering.
     */
    private pluginUiState;
    private getPluginUiConfig;
    /**
     * Seed a plugin's UI state from its authored defaults plus any
     * `config.plugins[pluginId]` override, or re-apply the config to an existing
     * entry. Idempotent.
     *
     * Public because the SDK activation path needs the entry to EXIST before the
     * plugin mounts: core runs `view.mount` before {@link registerSdkChrome} (to
     * fail closed — a failed mount renders no button), and the plugin's
     * `PluginSurface` reads open/target during mount. Host-facing, not
     * plugin-facing: plugins go through {@link isPluginOpen} /
     * {@link setPluginOpen} and friends.
     */
    ensurePluginUiState(pluginId: string, defaultTarget?: PluginUiTarget, defaultPosition?: 'left' | 'right' | 'bottom' | 'overlay'): void;
    private applyPluginUiConfig;
    /**
     * The effective render target for a plugin — the authored default unless a
     * config override (`config.plugins[id].target`) or {@link setPluginTarget}
     * changed it. Read reactively by the toolbar (flyout vs plain button) and by
     * each plugin panel's `isVisible`. Defaults to `'panel'` for an unknown id.
     */
    getPluginTarget(pluginId: string): PluginUiTarget;
    /**
     * Move a plugin between its panel and flyout chrome after mount — the
     * imperative sibling of {@link setPluginOpen}, and the same effect as setting
     * `config.plugins[id].target`. A no-op if the plugin is unknown or already on
     * `target`. Switching remounts the plugin's UI in the new container (see
     * {@link PluginUiConfig.target}).
     */
    setPluginTarget(pluginId: string, target: PluginUiTarget): void;
    /**
     * The effective panel dock position for a plugin — the authored default
     * unless a config override (`config.plugins[id].position`) or
     * {@link setPluginPosition} changed it. Read reactively by each of the
     * left/right/bottom/overlay panel render sites. Meaningful only while the
     * plugin's effective {@link getPluginTarget} is `'panel'`; a flyout ignores
     * it. Defaults to `'left'` for an unknown id.
     */
    getPluginPosition(pluginId: string): 'left' | 'right' | 'bottom' | 'overlay';
    /**
     * Move a plugin's panel to a new dock position after mount — the
     * imperative sibling of {@link setPluginTarget}, and the same effect as
     * setting `config.plugins[id].position`. A no-op if the plugin is unknown
     * or already at `position`. Has no visible effect while the plugin's
     * effective target is `'flyout'` (see {@link PluginUiConfig.position}).
     */
    setPluginPosition(pluginId: string, position: 'left' | 'right' | 'bottom' | 'overlay'): void;
    private applyPluginUiConfigToAll;
    /**
     * Is a plugin's panel/flyout currently open? The read half of
     * {@link setPluginOpen}, and the state a plugin's `PluginSurface.isOpen`
     * projects. Reflects every open-state write source alike: the toolbar button
     * ({@link togglePluginOpen}), flyout light-dismiss
     * ({@link closePluginFlyouts}), and `config.plugins[id].open`. Returns
     * `false` for an unknown id.
     */
    isPluginOpen(pluginId: string): boolean;
    /**
     * Open or close a plugin's panel/flyout. A no-op (and no notification) if the
     * plugin is unknown or already in that state, matching
     * {@link setPluginTarget} / {@link setPluginPosition} — a redundant call must
     * not wake every plugin's subscription for a change that did not happen.
     */
    setPluginOpen(pluginId: string, open: boolean): void;
    /**
     * Flip a plugin's open state. This is what the plugin's toolbar button does,
     * so it must notify exactly like {@link setPluginOpen} — a plugin observing
     * its own `PluginSurface.isOpen` reacts to a button press and to a
     * programmatic open identically.
     */
    togglePluginOpen(pluginId: string): void;
    /**
     * Close every open plugin flyout. Used by the toolbar to light-dismiss
     * flyouts on outside click / Escape. No-op (and no event) if none are open.
     *
     * Flyouts declaring `dismiss: 'explicit'` (SPEC.md — Dismiss) are skipped:
     * they close only via their toolbar button, so a live-editing surface is not
     * dismissed by an outside pointer-down. Built-in toolbar dropdowns are
     * unaffected (they are core-owned and light-dismiss elsewhere).
     */
    closePluginFlyouts(): void;
    /**
     * Register the toolbar chrome for an SDK plugin on the core-owned-chrome path
     * (epic restore-plugin-toolbar-chrome, ticket 02). Core renders the button
     * from the plugin's {@link IconDescriptor} and {@link PluginUiTarget}, and the
     * anchored flyout / docked panel container hosts the plugin content via the
     * DOM-mount `mount` thunk. `pluginMenuButtons` +
     * `pluginFlyouts`/`pluginPanels` are the one plugin-chrome rendering path.
     *
     * `id` is the caller-owned plugin id (used for open-state + unregister); it
     * must be passed to {@link unregisterPlugin} on deactivation.
     *
     * `name` is the plugin's package-qualified IDENTITY, kept on the records for
     * diagnostics and as the fallback. `label` — when the caller supplies
     * it — is the DISPLAY COPY: a thunk the render sites call so the label
     * re-resolves on an active-locale change. Chrome with no `label` renders
     * `name` exactly as it did before `label` existed.
     */
    registerSdkChrome(config: {
        id: string;
        name: string;
        label?: () => string;
        icon: IconDescriptor;
        target: PluginUiTarget;
        dismiss: 'light' | 'explicit';
        mount: PluginMountThunk;
        position?: 'left' | 'right' | 'bottom' | 'overlay';
    }): void;
    /**
     * Unregister a plugin's UI components by ID prefix.
     * Note: This cleans up the menu button, panel, and flyout records, but does
     * not run the plugin's own teardown — the plugin's `PluginActivation`
     * (`deactivate()`) owns that.
     */
    unregisterPlugin(pluginId: string): void;
    /**
     * Notify that OSD viewer is ready.
     * With the component-based system, we don't notify plugins individually.
     * Instead, plugins should use the OSDViewer instance from context or listen for 'osd-ready' event (if we emitted one).
     * But since we have direct access to osdViewer in this state, components can just react to it.
     */
    notifyOSDReady(viewer: OpenSeadragon.Viewer): void;
    /**
     * Cleanup everything.
     */
    destroyAllPlugins(): void;
    /**
     * Inventoried members whose changes wake subscribers, derived from the state
     * inventory so the watcher and the inventory cannot drift: `command` and
     * `observable` members notify; `internal` and `query-only` members never do.
     */
    private static readonly WATCHED_MEMBERS;
    /**
     * Subscribe to viewer-state changes. The listener is called — with no
     * arguments — on the flush after any inventoried `command`/`observable`
     * member changes, regardless of write source. Notifications are batched
     * (many changes in one tick collapse to one call) and payload-free: read the
     * state you need, do not reconstruct transitions. Listeners fire in
     * registration order. Returns an unsubscribe function.
     *
     * SSR-safe: calling this on the server registers the listener but starts no
     * effect and delivers no notifications (state reads stay synchronously
     * current everywhere).
     *
     * `onError` (ticket 09) is called with the thrown value if this listener
     * throws during delivery; the throw never stops other listeners or core's
     * own reactions. The SDK passes one per activation so a throwing listener is
     * attributed to its owning plugin (`pluginerror` phase `subscription`).
     */
    subscribe(listener: () => void, onError?: (error: unknown) => void): () => void;
    /**
     * Lazily start the reactivity-driven watcher (browser only, once). Kept out
     * of the constructor so server-side construction never creates an effect and
     * viewers with no subscribers pay nothing.
     */
    private startSubscriptionWatcher;
    /**
     * Read every watched member so the watcher effect depends on all of them.
     * Reading a plain member registers an identity dependency; reactive
     * collections additionally need their mutation version read (via `keys()`,
     * which also covers `.size` changes) so adds, deletes, clears, and same-size
     * content swaps all notify.
     */
    private trackWatchedMembers;
    private notifySubscribers;
    /**
     * Single guarded call site for a subscription listener (ticket 09): a
     * throwing listener is isolated so the remaining listeners and core's own
     * reactions still run. The failure is routed to the listener's own
     * `onError` when one was registered — the SDK uses this to attribute the
     * throw to the owning plugin and raise `pluginerror` phase `subscription` —
     * and otherwise falls back to a console error. `onError` itself is guarded
     * so a faulty reporter cannot break delivery either.
     */
    private invokeSubscriptionListener;
    /**
     * Tear down this viewer state: dispose the subscription watcher's effect
     * root, drop all listeners, and release plugin registrations. After destroy
     * no further notifications are delivered. Idempotent.
     */
    destroy(): void;
}
export declare const VIEWER_STATE_KEY = "triiiceratops:viewerState";
