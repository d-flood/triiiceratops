// `SvelteSet`/`SvelteMap` are the runtime collections behind the four public
// collection members below, but those members are ANNOTATED with the plain
// built-ins (`Set`/`Map`, which `SvelteSet`/`SvelteMap` extend) so that
// `svelte/reactivity` never reaches the published declaration graph. Svelte must
// not be a type-time requirement for a React or Vue framework wrapper consumer
// (SPEC.md — "Core corrections this work depends on"). The invariant that these
// members must HOLD reactive collections is enforced by the state inventory and
// its capability tests (`state-inventory.ts`, `state-inventory.test.ts`) rather
// than by the type system; ADR 0007 already documents direct assignment onto
// `ViewerState` as an unsupported escape hatch. `src/packaging/dtsSvelteImports.ts`
// fails `build:lib` if a Svelte type import reappears in the public declarations.
import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import { flushSync, untrack } from 'svelte';
import { manifestsState } from './manifests.svelte.js';
import { STATE_INVENTORY } from './state-inventory.js';
import { getLocale } from '../paraglide/runtime.js';
import { logger, isDebugEnabled } from '../logging/logger';
import { parseStructures } from '../utils/structures';
import { isCollection, parseCollection, getCollectionLabel, getCollectionThumbnail, sortCollectionItems, } from '../utils/collections';
import { getCanvasLabel } from '../utils/canvasLabels';
import { findCanvasIndexById, getAnnotationId, getCanvasId, getReferenceId, } from '../utils/iiifIds';
import { normalizeIiifTargets } from '../utils/iiifTargets';
import { getPagedCanvasGroups, getVisibleCanvasEntries, } from '../components/viewerControls';
import { getThumbnailSrc } from '../utils/getThumbnailSrc';
/** IIIF Content Search API profiles, as declared on a search service. */
const SEARCH_1_PROFILE = 'http://iiif.io/api/search/1/search';
const SEARCH_0_PROFILE = 'http://iiif.io/api/search/0/search';
/**
 * `behavior` (IIIF v3) and `viewingHint` (IIIF v2) may each be a bare string or
 * an array of them. Absent reads as no behaviors at all.
 */
function asBehaviorList(value) {
    if (value === null || value === undefined || value === '')
        return [];
    return (Array.isArray(value) ? [...value] : [value]);
}
function normalizeIiifBehavior(value) {
    const normalized = String(value).trim().toLowerCase();
    const segments = normalized.split(/[#/:]/);
    return segments[segments.length - 1] || normalized;
}
export class ViewerState {
    manifestId = $state(null);
    canvasId = $state(null);
    showAnnotations = $state(false);
    showThumbnailGallery = $state(false);
    toolbarOpen = $state(false);
    isGalleryDockedBottom = $state(false);
    isGalleryDockedRight = $state(false);
    isFullScreen = $state(false);
    showMetadataPanel = $state(false);
    showCanvasInfo = $state(false);
    showStructuresPanel = $state(false);
    initialCanvasRegion = $state(null);
    dockSide = $state('bottom');
    /** Reactive collection declared as a plain `Set` — see the note on the `svelte/reactivity` import. */
    visibleAnnotationIds = new SvelteSet();
    annotationVisibilityTouched = $state(false);
    hoveredAnnotationId = $state(null);
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
    userAnnotations = new SvelteMap();
    /**
     * Manifest ids this viewer has finished loading/registering. Observable: core
     * adds to it when a manifest becomes ready, giving subscribers a
     * manifest-readiness notification (queryable via {@link isManifestReady}).
     *
     * Reactive collection declared as a plain `Set` — see the note on the
     * `svelte/reactivity` import.
     */
    loadedManifestIds = new SvelteSet();
    userAnnotationKey(manifestId, canvasId) {
        return `${manifestId}::${canvasId}`;
    }
    /**
     * Replace this viewer's displayed user annotations for one canvas. The
     * supported write path for plugin display sync (ADR 0001, amended): the
     * annotation-editor store calls this after each successful persistence op.
     */
    setUserAnnotations(manifestId, canvasId, annotations) {
        this.userAnnotations.set(this.userAnnotationKey(manifestId, canvasId), annotations);
    }
    /** Drop this viewer's displayed user annotations for one canvas. */
    clearUserAnnotations(manifestId, canvasId) {
        const key = this.userAnnotationKey(manifestId, canvasId);
        if (this.userAnnotations.has(key)) {
            this.userAnnotations.delete(key);
        }
    }
    /** This viewer's displayed user annotations for one canvas (never null). */
    getUserAnnotations(manifestId, canvasId) {
        return (this.userAnnotations.get(this.userAnnotationKey(manifestId, canvasId)) ?? []);
    }
    /**
     * Annotations for a canvas: manifest-defined annotations from the shared
     * cache merged with this viewer's own user annotations (ADR 0007). Plugins
     * reach annotation data through this query rather than importing the manifest
     * cache. A `sourceId` restricts the result to one annotation list and skips
     * the user-annotation merge, mirroring the manifest cache's behavior.
     */
    getAnnotations(manifestId, canvasId, sourceId) {
        const manifestAnnos = manifestsState.getAnnotations(manifestId, canvasId, sourceId);
        if (sourceId) {
            return manifestAnnos;
        }
        const userAnnos = this.getUserAnnotations(manifestId, canvasId).map((annotation) => {
            if (!annotation || typeof annotation !== 'object') {
                return annotation;
            }
            return {
                ...annotation,
                __triiiceratopsAnnotationOrigin: 'user',
            };
        });
        return [...manifestAnnos, ...userAnnos];
    }
    /**
     * Canvases of a manifest (from the shared cache). Plugins reach canvas data
     * through this query rather than importing the manifest cache.
     */
    getCanvases(manifestId, sequenceIndex = 0) {
        return manifestsState.getCanvases(manifestId, sequenceIndex);
    }
    /**
     * Ensure a canvas's external annotation lists are fetched, then return the
     * per-viewer merged annotations for it. Plugin-facing wrapper over the shared
     * cache's fetch-and-return.
     */
    async ensureCanvasAnnotations(manifestId, canvasId, sourceId) {
        await manifestsState.ensureCanvasAnnotations(manifestId, canvasId, sourceId);
        return this.getAnnotations(manifestId, canvasId, sourceId);
    }
    /** Whether this viewer has finished loading the given manifest. */
    isManifestReady(manifestId) {
        return this.loadedManifestIds.has(manifestId);
    }
    /** Record that a manifest is ready, notifying manifest-readiness subscribers. */
    markManifestReady(manifestId) {
        this.loadedManifestIds.add(manifestId);
    }
    showCurrentCanvasAnnotations() {
        this.clearAnnotationVisibility();
        if (!this.manifestId || !this.canvasId) {
            return;
        }
        const annotations = this.getAnnotations(this.manifestId, this.canvasId);
        annotations.forEach((annotation) => {
            const id = getAnnotationId(annotation);
            if (id) {
                this.visibleAnnotationIds.add(id);
            }
        });
    }
    clearAnnotationVisibility() {
        this.annotationVisibilityTouched = false;
        this.visibleAnnotationIds.clear();
    }
    setAnnotationsPanelOpen(isOpen) {
        this.showAnnotations = isOpen;
        this.clearAnnotationVisibility();
        if (isOpen) {
            this.showCurrentCanvasAnnotations();
        }
    }
    // Error state for tile source fetching and image load failures.
    tileSourceError = $state(null);
    // Map of canvasId -> selected choiceId (Content State).
    // Reactive collection declared as a plain `Map` — see the note on the
    // `svelte/reactivity` import.
    selectedChoices = new SvelteMap();
    selectedSequenceIndex = $state(0);
    // Collection state
    collectionId = $state(null);
    collectionLabel = $state('');
    collectionThumbnail = $state('');
    collectionItems = $state([]);
    showCollectionPanel = $state(false);
    collectionThumbnailHydrationId = 0;
    _viewingDirection = $state('left-to-right');
    get viewingDirection() {
        return this._viewingDirection;
    }
    set viewingDirection(value) {
        this._viewingDirection = value;
        this.config.viewingDirection = value;
    }
    // UI Configuration
    config = $state({});
    searchProvider = $state.raw(null);
    manifestRequestConfig = $state.raw(undefined);
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
    activeLocale = $state(getLocale());
    // Derived configuration specific getters
    get showToggle() {
        return this.config.showToggle ?? true;
    }
    get showCanvasNav() {
        return this.config.showCanvasNav ?? true;
    }
    get showZoomControls() {
        return this.config.showZoomControls ?? true;
    }
    get preserveCanvasScale() {
        return this.config.preserveCanvasScale ?? false;
    }
    /**
     * `gallery.size` — the docked band's height or the docked rail's width, and the
     * knob every thumbnail dimension is derived from. See `galleryGeometry`.
     *
     * Not named `gallerySize`: that is already the floating window's width and
     * height, which is a different thing entirely.
     */
    get galleryExtent() {
        return this.config.gallery?.size ?? 100;
    }
    // Dedicated reactive state for viewingMode to ensure proper reactivity
    // when accessed in $derived expressions (tileSources computation)
    _viewingMode = $state('individuals');
    // Track whether viewingMode was explicitly set via config (user preference)
    // When true, manifest behavior detection is skipped to respect user configuration
    _viewingModeUserConfigured = $state(false);
    get viewingMode() {
        return this._viewingMode;
    }
    set viewingMode(value) {
        this._viewingMode = value;
        // Also sync to config for consistency
        this.config.viewingMode = value;
    }
    // Pairing offset for paged mode: 0 = default (pairs start at 1+2), 1 = shifted (page 1 alone, pairs start at 2+3)
    pagedOffset = $state(1);
    /**
     * Whether the gallery is expanded to fill the viewer's center column as a
     * thumbnail grid. Orthogonal to {@link dockSide}: expanding renders the
     * gallery as an overlay layer and leaves the dock side untouched, so
     * collapsing restores the strip/rail/window exactly where it was.
     */
    galleryExpanded = $state(false);
    // Gallery State (Lifted for persistence during re-docking)
    galleryPosition = $state({ x: 20, y: 100 });
    gallerySize = $state({ width: 300, height: 400 });
    isGalleryDragging = $state(false);
    galleryDragOffset = $state({ x: 0, y: 0 });
    dragOverSide = $state(null);
    galleryCenterPanelRect = $state(null);
    // ==================== EVENT DISPATCH (Web Component Only) ====================
    /**
     * Event target for dispatching CustomEvents.
     * Only set by TriiiceratopsViewerElement (web component build).
     * Remains null for Svelte component usage → no events dispatched.
     */
    eventTarget = null;
    /**
     * Set the event target for dispatching state change events.
     * Called by TriiiceratopsViewerElement to enable event-driven API.
     */
    setEventTarget(target) {
        this.eventTarget = target;
    }
    /**
     * Host reporter for the structured `viewererror` channel (ticket 18). Set by
     * `TriiiceratopsViewer.svelte` so state-level actionable failures (search,
     * viewport, content) surface as a typed {@link ViewerError} on the viewer
     * root's `viewererror` event and the `onviewererror` callback instead of
     * only reaching the console. Null in direct/test use → failures are logged
     * through the (silent-by-default) logger only.
     */
    errorReporter = null;
    /** Wire the `viewererror` reporter (see {@link errorReporter}). */
    setErrorReporter(reporter) {
        this.errorReporter = reporter;
    }
    /** Deliver a structured viewer failure to the host, if a reporter is wired. */
    reportError(error) {
        this.errorReporter?.(error);
    }
    /**
     * Get current state as a plain object snapshot.
     * Safe to use outside Svelte's reactive system.
     * NOTE: We calculate currentCanvasIndex inline to avoid triggering the canvases getter
     * which can cause infinite loops when it auto-sets canvasId.
     */
    getSnapshot() {
        // Calculate canvas index without triggering reactive side effects
        let canvasIndex = -1;
        if (this.manifestId && this.canvasId) {
            const canvases = manifestsState.getCanvases(this.manifestId);
            canvasIndex = findCanvasIndexById(canvases, this.canvasId);
        }
        return {
            manifestId: this.manifestId,
            canvasId: this.canvasId,
            currentCanvasIndex: canvasIndex,
            showAnnotations: this.showAnnotations,
            showInformationPanel: this.showMetadataPanel,
            showThumbnailGallery: this.showThumbnailGallery,
            showSearchPanel: this.showSearchPanel,
            showStructuresPanel: this.showStructuresPanel,
            toolbarOpen: this.toolbarOpen,
            searchQuery: this.searchQuery,
            isFullScreen: this.isFullScreen,
            dockSide: this.dockSide,
            viewingMode: this.viewingMode,
            viewingDirection: this.viewingDirection,
            preserveCanvasScale: this.preserveCanvasScale,
            galleryExpanded: this.galleryExpanded,
            galleryPosition: this.galleryPosition,
            gallerySize: this.gallerySize,
        };
    }
    /**
     * Dispatch a state change event to the web component.
     * No-op if eventTarget is null (Svelte component usage).
     *
     * Uses queueMicrotask to dispatch asynchronously AFTER the current
     * reactive cycle completes, preventing infinite update loops.
     */
    dispatchStateChange(eventName = 'statechange') {
        // Gate the snapshot build behind the debug check: this fires on every
        // state change, so it must cost nothing when debug is off.
        if (isDebugEnabled()) {
            logger.debug(`Dispatching ${eventName}`, JSON.stringify(this.getSnapshot()));
        }
        if (!this.eventTarget)
            return;
        // Dispatch asynchronously to break reactive loops
        queueMicrotask(() => {
            this.eventTarget?.dispatchEvent(new CustomEvent(eventName, {
                detail: this.getSnapshot(),
                bubbles: true,
                composed: true,
            }));
        });
    }
    constructor(initialManifestId = null, initialCanvasId = null) {
        this.manifestId = initialManifestId || null;
        this.canvasId = initialCanvasId || null;
        // Fetch manifest immediately
        if (this.manifestId) {
            manifestsState.fetchManifest(this.manifestId, this.manifestRequestConfig);
        }
    }
    /**
     * The active manifest's cache entry — `{ json, error, isFetching }`.
     *
     * `json` is the **raw IIIF Manifest JSON as fetched**, v2 or v3 as the
     * publisher authored it. This replaced the removed `manifest` getter, which
     * handed out a `manifesto.js` object; there is deliberately no same-named
     * accessor returning raw JSON in its place, so a consumer that used it
     * fails at build time rather than at runtime.
     */
    get manifestEntry() {
        if (!this.manifestId)
            return null;
        return manifestsState.getManifestEntry(this.manifestId);
    }
    get canvases() {
        if (!this.manifestId)
            return [];
        const canvases = manifestsState.getCanvases(this.manifestId, this.selectedSequenceIndex);
        return canvases;
    }
    get sequenceCount() {
        if (!this.manifestId)
            return 0;
        return manifestsState.getSequenceCount(this.manifestId);
    }
    get currentCanvasIndex() {
        if (!this.canvasId) {
            return -1;
        }
        // Manifesto canvases have an id property, but let's be robust and check multiple possibilities
        return findCanvasIndexById(this.canvases, this.canvasId);
    }
    getCurrentPagedCanvasGroupIndex() {
        if (this.viewingMode !== 'paged' || this.currentCanvasIndex < 0) {
            return -1;
        }
        const groups = getPagedCanvasGroups(this.canvases, this.pagedOffset);
        return groups.findIndex(({ startIndex, endIndex }) => this.currentCanvasIndex >= startIndex &&
            this.currentCanvasIndex <= endIndex);
    }
    get hasNext() {
        if (this.currentCanvasIndex < 0) {
            return false;
        }
        if (this.viewingMode === 'paged') {
            const groupIndex = this.getCurrentPagedCanvasGroupIndex();
            const groups = getPagedCanvasGroups(this.canvases, this.pagedOffset);
            return groupIndex >= 0 && groupIndex < groups.length - 1;
        }
        else {
            return this.currentCanvasIndex < this.canvases.length - 1;
        }
    }
    get hasPrevious() {
        if (this.currentCanvasIndex < 0) {
            return false;
        }
        if (this.viewingMode === 'paged') {
            return this.getCurrentPagedCanvasGroupIndex() > 0;
        }
        return this.currentCanvasIndex > 0;
    }
    nextCanvas() {
        if (this.hasNext) {
            if (this.viewingMode === 'paged') {
                const groups = getPagedCanvasGroups(this.canvases, this.pagedOffset);
                const canvasId = groups[this.getCurrentPagedCanvasGroupIndex() + 1]
                    ?.entries[0]?.canvasId;
                if (canvasId)
                    this.setCanvas(canvasId);
            }
            else {
                const nextIndex = this.currentCanvasIndex + 1;
                const canvas = this.canvases[nextIndex];
                const canvasId = getCanvasId(canvas);
                if (canvasId)
                    this.setCanvas(canvasId);
            }
        }
    }
    previousCanvas() {
        if (this.hasPrevious) {
            if (this.viewingMode === 'paged') {
                const groups = getPagedCanvasGroups(this.canvases, this.pagedOffset);
                const canvasId = groups[this.getCurrentPagedCanvasGroupIndex() - 1]
                    ?.entries[0]?.canvasId;
                if (canvasId)
                    this.setCanvas(canvasId);
            }
            else {
                const prevIndex = this.currentCanvasIndex - 1;
                const canvas = this.canvases[prevIndex];
                const canvasId = getCanvasId(canvas);
                if (canvasId)
                    this.setCanvas(canvasId);
            }
        }
    }
    zoomIn() {
        if (this.osdViewer && this.osdViewer.viewport) {
            this.osdViewer.viewport.zoomBy(1.2);
            this.osdViewer.viewport.applyConstraints();
        }
    }
    zoomOut() {
        if (this.osdViewer && this.osdViewer.viewport) {
            this.osdViewer.viewport.zoomBy(0.8);
            this.osdViewer.viewport.applyConstraints();
        }
    }
    setSearchProvider(searchProvider) {
        this.searchProvider = searchProvider;
    }
    setManifestRequestConfig(requestConfig) {
        this.manifestRequestConfig = requestConfig;
    }
    async setManifestData(manifestId, manifestJson, options) {
        this.startCanvasId = null;
        this.selectedSequenceIndex = 0;
        await manifestsState.registerManifest(manifestId, manifestJson);
        this.manifestId = manifestId;
        this.markManifestReady(manifestId);
        if (options?.canvasId) {
            this.setCanvas(options.canvasId);
        }
        this._applyManifestSettings(manifestId);
        this.ensureInitialCanvasSelection();
    }
    /**
     * The canvas ID specified by the manifest's `start` property (IIIF
     * Presentation 3.0) or its sequence's `startCanvas` (IIIF Presentation 2.x).
     * Used during auto-selection to navigate to the correct initial canvas.
     * Only set once per manifest load; cleared when a new manifest is set.
     */
    startCanvasId = $state(null);
    async setManifest(manifestId, options) {
        this.manifestRequestConfig = options?.requestConfig;
        // Fetch the raw JSON first to detect if it's a Collection
        let json;
        try {
            json = await manifestsState.fetchResource(manifestId, this.manifestRequestConfig);
        }
        catch (_error) {
            // If fetch fails, fall back to normal flow which will handle the error
            this.startCanvasId = null;
            this.selectedSequenceIndex = 0;
            await manifestsState.fetchManifest(manifestId, this.manifestRequestConfig);
            this.manifestId = manifestId;
            this.markManifestReady(manifestId);
            if (options?.canvasId) {
                this.setCanvas(options.canvasId);
            }
            this._applyManifestSettings(manifestId);
            this.ensureInitialCanvasSelection();
            this.dispatchStateChange('manifestchange');
            return;
        }
        // Check if the resource is a Collection
        if (isCollection(json)) {
            this.collectionId = manifestId;
            this.collectionLabel = getCollectionLabel(json);
            this.collectionThumbnail = getCollectionThumbnail(json) || '';
            this.collectionItems = sortCollectionItems(parseCollection(json));
            // Auto-load the first manifest in the collection
            const firstManifest = this.collectionItems.find((item) => item.type === 'Manifest');
            if (firstManifest) {
                await this._loadManifest(firstManifest.id, options?.canvasId);
            }
            void this.hydrateCollectionItemThumbnails(manifestId);
            this.dispatchStateChange('manifestchange');
            return;
        }
        // Normal manifest flow: register the already-fetched JSON
        this.collectionId = null;
        this.collectionLabel = '';
        this.collectionThumbnail = '';
        this.collectionItems = [];
        this.collectionThumbnailHydrationId += 1;
        // Keep the current canvasId: a consumer may have requested a canvas
        // before the manifest finished loading. ensureInitialCanvasSelection
        // keeps it when the manifest contains it and falls back otherwise.
        this.startCanvasId = null;
        await manifestsState.registerManifest(manifestId, json);
        this.manifestId = manifestId;
        this.markManifestReady(manifestId);
        if (options?.canvasId) {
            this.setCanvas(options.canvasId);
        }
        this._applyManifestSettings(manifestId);
        this.ensureInitialCanvasSelection();
        this.dispatchStateChange('manifestchange');
    }
    /**
     * Load a manifest by ID within the current collection context,
     * or directly if no collection is active.
     */
    async loadCollectionManifest(manifestId) {
        await this._loadManifest(manifestId);
        this.dispatchStateChange('manifestchange');
    }
    /**
     * Internal: load a manifest by ID and apply its settings.
     */
    async _loadManifest(manifestId, canvasId) {
        this.startCanvasId = null;
        this.selectedSequenceIndex = 0;
        await manifestsState.fetchManifest(manifestId, this.manifestRequestConfig);
        this.manifestId = manifestId;
        this.markManifestReady(manifestId);
        if (canvasId) {
            this.setCanvas(canvasId);
        }
        this._applyManifestSettings(manifestId);
        this.ensureInitialCanvasSelection();
    }
    ensureInitialCanvasSelection() {
        const canvases = this.canvases;
        if (!canvases.length) {
            return;
        }
        if (this.canvasId &&
            findCanvasIndexById(canvases, this.canvasId) >= 0) {
            return;
        }
        if (this.startCanvasId) {
            this.setCanvas(this.startCanvasId);
            return;
        }
        const firstCanvasId = getCanvasId(canvases[0]);
        if (firstCanvasId) {
            this.setCanvas(firstCanvasId);
        }
    }
    async hydrateCollectionItemThumbnails(collectionId) {
        const hydrationId = ++this.collectionThumbnailHydrationId;
        const manifestItems = this.collectionItems.filter((item) => item.type === 'Manifest' && !item.thumbnail);
        await Promise.allSettled(manifestItems.map(async (item) => {
            await manifestsState.fetchManifest(item.id, this.manifestRequestConfig);
            if (this.collectionId !== collectionId ||
                this.collectionThumbnailHydrationId !== hydrationId) {
                return;
            }
            const firstCanvas = manifestsState.getCanvases(item.id)[0];
            const thumbnail = firstCanvas
                ? getThumbnailSrc(firstCanvas)
                : '';
            if (thumbnail) {
                item.thumbnail = thumbnail;
            }
        }));
    }
    /**
     * Apply manifest-level settings (start canvas, viewing direction, behavior).
     */
    _applyManifestSettings(manifestId) {
        // Raw IIIF Manifest JSON, v2 or v3 as authored. Each of the three
        // scalars below reads BOTH versions' spellings first-party; the
        // `manifesto.js` fallback ladders that used to sit under them are gone.
        const rawManifest = manifestsState.getManifestEntry(manifestId)?.json;
        if (!rawManifest)
            return;
        // IIIF Presentation 2.x hangs three of these four scalars off the first
        // sequence rather than off the manifest. Presentation 3.0 has no
        // `sequences` at all, so this is `undefined` there and every v2 read
        // below is a no-op. A `sequences` that is a bare object rather than an
        // array occurs in the wild, hence the `Array.isArray` guard.
        const rawSequence = Array.isArray(rawManifest?.sequences)
            ? rawManifest.sequences[0]
            : undefined;
        // 0. Start Canvas: the manifest-level `start` property (IIIF
        // Presentation 3.0) or the sequence-level `startCanvas` (IIIF
        // Presentation 2.x).
        try {
            let startId = null;
            // IIIF v3 — `start` on the manifest itself.
            if (rawManifest?.start) {
                startId = getReferenceId(rawManifest.start);
            }
            // IIIF v2 — the start canvas hangs off the sequence.
            if (!startId) {
                startId = getReferenceId(rawSequence?.startCanvas);
            }
            if (startId) {
                // The start property may reference a canvas directly or include
                // a fragment selector (e.g. canvas#t=...). Extract the canvas ID.
                const canvasIdFromStart = startId.split('#')[0];
                // Verify this canvas exists in the manifest
                const canvases = manifestsState.getCanvases(manifestId);
                const exists = canvases.some((c) => getCanvasId(c) === canvasIdFromStart);
                if (exists) {
                    this.startCanvasId = canvasIdFromStart;
                }
            }
        }
        catch (e) {
            logger.warn('Error parsing start canvas', e);
        }
        // 1. Viewing Direction
        let direction = null;
        try {
            // IIIF v2 — the sequence carries the direction, and it WINS over
            // the manifest root. Presentation 2.1 is explicit: a manifest's
            // direction "applies to all of its sequences unless the sequence
            // specifies its own viewing direction". `manifesto.js` implemented
            // this cascade correctly in `Sequence.getViewingDirection`; this
            // call site used to override it by asking the manifest first.
            if (rawSequence?.viewingDirection) {
                direction = rawSequence.viewingDirection;
            }
            // IIIF v3 root — and IIIF v2 manifests that declare it at the root,
            // which is legal in Presentation 2.x too. v3 has no sequences, so
            // this is the only read that fires for v3.
            if (!direction && rawManifest?.viewingDirection) {
                direction = rawManifest.viewingDirection;
            }
        }
        catch (e) {
            logger.warn('Error parsing viewing direction', e);
        }
        if (direction &&
            [
                'left-to-right',
                'right-to-left',
                'top-to-bottom',
                'bottom-to-top',
            ].includes(direction)) {
            this.viewingDirection = direction;
        }
        else {
            this.viewingDirection = 'left-to-right'; // Default
        }
        // 2. Viewing Mode (Behavior)
        // Only auto-detect from manifest if user hasn't explicitly configured viewingMode
        if (!this._viewingModeUserConfigured) {
            let behaviors = [];
            try {
                // IIIF v3 — `behavior`, on the manifest root and on the
                // sequence.
                behaviors = [
                    ...asBehaviorList(rawManifest?.behavior),
                    ...asBehaviorList(rawSequence?.behavior),
                ];
                // IIIF v2 — `viewingHint` is the v2 spelling of the same idea.
                // Sequence first, then the root, matching how viewing direction
                // resolves above. Presentation 2.1 states no precedence for
                // `viewingHint`, so this follows the cascade it *does* state
                // for `viewingDirection` rather than inventing a second rule:
                // the more specific declaration wins.
                if (behaviors.length === 0) {
                    behaviors = asBehaviorList(rawSequence?.viewingHint);
                }
                if (behaviors.length === 0) {
                    behaviors = asBehaviorList(rawManifest?.viewingHint);
                }
                behaviors = behaviors.map(normalizeIiifBehavior);
            }
            catch (e) {
                logger.warn('Error parsing behavior', e);
            }
            if (behaviors.includes('continuous')) {
                this.viewingMode = 'continuous';
            }
            else if (behaviors.includes('individuals') ||
                behaviors.includes('non-paged')) {
                this.viewingMode = 'individuals';
            }
            else if (behaviors.includes('paged') ||
                behaviors.includes('facing-pages')) {
                this.viewingMode = 'paged';
            }
            else {
                // Default to 'individuals' when no behavior is specified in manifest
                this.viewingMode = 'individuals';
            }
        }
    }
    setCanvas(canvasId) {
        this.canvasId = canvasId;
        this.tileSourceError = null;
        if (this.showAnnotations) {
            this.clearAnnotationVisibility();
        }
        this.dispatchStateChange('canvaschange');
    }
    selectChoice(canvasId, choiceId) {
        this.selectedChoices.set(canvasId, choiceId);
        // Force reactivity for $derived blocks that depend on the map
        // Reassigning the map is one way, or using fine-grained signals.
        // Svelte 5 map is reactive, but let's ensure dependent derivations see it.
        // We might need to "bump" a version signal if derivations don't pick it up automatically
        // but they should if they use get().
        this.dispatchStateChange('choicechange');
    }
    getSelectedChoice(canvasId) {
        return this.selectedChoices.get(canvasId);
    }
    updateConfig(newConfig) {
        const oldConfig = this.config;
        this.config = newConfig;
        // Sync state from config
        if (newConfig.toolbarOpen !== undefined) {
            this.toolbarOpen = newConfig.toolbarOpen;
        }
        if (newConfig.viewingMode) {
            // direct assignment works because of the setter
            this.viewingMode = newConfig.viewingMode;
            // Mark as user-configured so manifest behavior detection is skipped
            this._viewingModeUserConfigured = true;
        }
        if (newConfig.viewingDirection) {
            this.viewingDirection = newConfig.viewingDirection;
        }
        if (newConfig.pagedViewOffset !== undefined) {
            this.pagedOffset = newConfig.pagedViewOffset ? 1 : 0;
        }
        if (newConfig.gallery) {
            if (newConfig.gallery.open !== undefined) {
                this.showThumbnailGallery = newConfig.gallery.open;
            }
            if (newConfig.gallery.dockPosition !== undefined) {
                this.dockSide = newConfig.gallery.dockPosition;
            }
            if (newConfig.gallery.width !== undefined) {
                this.gallerySize.width = newConfig.gallery.width;
            }
            if (newConfig.gallery.height !== undefined) {
                this.gallerySize.height = newConfig.gallery.height;
            }
            if (newConfig.gallery.x !== undefined) {
                this.galleryPosition.x = newConfig.gallery.x;
            }
            if (newConfig.gallery.y !== undefined) {
                this.galleryPosition.y = newConfig.gallery.y;
            }
            // Applied after `open` so `expanded: true` wins the implication
            // regardless of key order in the host's config object.
            if (newConfig.gallery.expanded !== undefined) {
                this.galleryExpanded = newConfig.gallery.expanded;
                if (newConfig.gallery.expanded) {
                    this.showThumbnailGallery = true;
                }
            }
        }
        if (newConfig.search) {
            if (newConfig.search.open !== undefined) {
                this.showSearchPanel = newConfig.search.open;
            }
            // Only search if the CONFIG has changed its query requirement.
            // This prevents stale config updates (e.g. from other property changes)
            // from overwriting a newer internal search state.
            const newQuery = newConfig.search.query;
            const oldQuery = oldConfig.search?.query;
            if (newQuery !== undefined &&
                newQuery !== oldQuery &&
                newQuery !== this.searchQuery) {
                this._performSearch(newQuery);
            }
        }
        if (newConfig.annotations) {
            if (newConfig.annotations.open !== undefined) {
                if (newConfig.annotations.open !== this.showAnnotations) {
                    this.setAnnotationsPanelOpen(newConfig.annotations.open);
                }
                else {
                    this.showAnnotations = newConfig.annotations.open;
                }
            }
        }
        if (newConfig.information) {
            if (newConfig.information.open !== undefined) {
                this.showMetadataPanel = newConfig.information.open;
            }
        }
        if (newConfig.structures) {
            if (newConfig.structures.open !== undefined) {
                this.showStructuresPanel = newConfig.structures.open;
            }
        }
        if (newConfig.collection) {
            if (newConfig.collection.open !== undefined) {
                this.showCollectionPanel = newConfig.collection.open;
            }
        }
        this.applyPluginUiConfigToAll();
        // NOTE: We intentionally do NOT dispatch events here.
        // Config updates are external configuration, not user-initiated state changes.
        // Dispatching here would cause infinite loops when the consumer re-renders.
    }
    toggleAnnotations() {
        this.setAnnotationsPanelOpen(!this.showAnnotations);
        this.dispatchStateChange();
    }
    toggleToolbar() {
        this.toolbarOpen = !this.toolbarOpen;
        this.dispatchStateChange();
    }
    toggleThumbnailGallery() {
        this.showThumbnailGallery = !this.showThumbnailGallery;
        // Closing the gallery drops the expanded state: leaving it set would
        // make the next open blow straight to full-column, which is never what
        // the toggle button appears to promise.
        if (!this.showThumbnailGallery) {
            this.galleryExpanded = false;
        }
        this.dispatchStateChange();
    }
    /**
     * Reference to the main viewer DOM element.
     * Used for fullscreen toggling.
     */
    viewerElement = null;
    setViewerElement(element) {
        this.viewerElement = element;
    }
    /**
     * Resolve the viewer's style root — where a plugin's global CSS must be
     * installed (ticket 08's `PluginStyleService`). For a light-DOM (Svelte)
     * viewer this is the owning `Document`; for the Web Component it is the
     * shadow root, so plugin styles reach the shadow-scoped tree. Derived from
     * the mount element captured by {@link setViewerElement} via `getRootNode()`;
     * `null` before the element is mounted.
     */
    getStyleRoot() {
        const root = this.viewerElement?.getRootNode();
        // nodeType 9 = DOCUMENT_NODE, 11 = DOCUMENT_FRAGMENT_NODE (shadow root);
        // nodeType is realm- and engine-safe where `instanceof` is not.
        if (root && (root.nodeType === 9 || root.nodeType === 11)) {
            return root;
        }
        return null;
    }
    toggleFullScreen() {
        if (!document.fullscreenElement) {
            // Use stored reference if available, fallback to ID lookup (legacy/Svelte-only)
            const el = this.viewerElement ||
                document.getElementById('triiiceratops-viewer');
            if (el) {
                el.requestFullscreen().catch((e) => {
                    logger.warn('Fullscreen request failed', e);
                    this.reportError({
                        severity: 'warning',
                        scope: 'viewport',
                        code: 'fullscreen-failed',
                        message: 'Fullscreen request failed.',
                        error: e,
                    });
                });
            }
            else {
                logger.warn('Cannot toggle fullscreen: Viewer element not found');
                this.reportError({
                    severity: 'warning',
                    scope: 'viewport',
                    code: 'fullscreen-element-missing',
                    message: 'Cannot toggle fullscreen: viewer element not found.',
                });
            }
        }
        else {
            document.exitFullscreen();
        }
    }
    toggleMetadataPanel() {
        this.showMetadataPanel = !this.showMetadataPanel;
        this.dispatchStateChange();
    }
    toggleCanvasInfo() {
        this.showCanvasInfo = !this.showCanvasInfo;
    }
    setSequenceIndex(index) {
        const maxIndex = Math.max(0, this.sequenceCount - 1);
        this.selectedSequenceIndex = Math.max(0, Math.min(index, maxIndex));
        const nextCanvases = this.canvases;
        const firstCanvas = nextCanvases[0];
        // Raw IIIF Canvas JSON: `id` in v3, `@id` in v2.
        this.canvasId = firstCanvas
            ? firstCanvas.id || firstCanvas['@id'] || null
            : null;
        this.startCanvasId = null;
        this.dispatchStateChange();
    }
    setInitialCanvasRegion(region) {
        this.initialCanvasRegion = region;
    }
    toggleStructuresPanel() {
        this.showStructuresPanel = !this.showStructuresPanel;
        this.dispatchStateChange();
    }
    toggleCollectionPanel() {
        this.showCollectionPanel = !this.showCollectionPanel;
        this.dispatchStateChange();
    }
    /** Whether the viewer is currently showing a collection */
    get hasCollection() {
        return this.collectionId !== null && this.collectionItems.length > 0;
    }
    /**
     * Parsed IIIF structures (ranges / table of contents) from the current manifest.
     * Returns an empty array if no structures exist.
     */
    get structures() {
        // Raw manifest JSON. `parseStructures` reads `structures` off the
        // document itself and handles both the v2 (`sc:Range`) and the v3
        // (`Range`) spelling, so this is a plain-JSON read for both versions —
        // not a branch deletion (SPEC → "The governing rule for the whole
        // epic").
        const manifestJson = this.manifestEntry?.json;
        if (!manifestJson)
            return [];
        return parseStructures(manifestJson);
    }
    setViewingMode(mode) {
        this.viewingMode = mode;
        if (mode === 'paged') {
            const groupIndex = this.getCurrentPagedCanvasGroupIndex();
            const canvasId = groupIndex >= 0
                ? getPagedCanvasGroups(this.canvases, this.pagedOffset)[groupIndex]?.entries[0]?.canvasId
                : null;
            if (canvasId && this.canvasId !== canvasId) {
                this.setCanvas(canvasId);
            }
        }
        this.dispatchStateChange();
    }
    togglePagedOffset() {
        this.pagedOffset = this.pagedOffset === 0 ? 1 : 0;
        this.config.pagedViewOffset = this.pagedOffset === 1;
        const groupIndex = this.getCurrentPagedCanvasGroupIndex();
        const canvasId = groupIndex >= 0
            ? getPagedCanvasGroups(this.canvases, this.pagedOffset)[groupIndex]?.entries[0]?.canvasId
            : null;
        if (canvasId && this.canvasId !== canvasId) {
            this.setCanvas(canvasId);
        }
        this.dispatchStateChange();
    }
    searchQuery = $state('');
    pendingSearchQuery = $state(null);
    searchResults = $state([]);
    isSearching = $state(false);
    showSearchPanel = $state(false);
    toggleSearchPanel() {
        this.showSearchPanel = !this.showSearchPanel;
        if (!this.showSearchPanel) {
            // Clear ephemeral annotations when closing search
            this.searchAnnotations = [];
        }
        this.dispatchStateChange();
    }
    searchAnnotations = $state([]);
    /**
     * This function now accounts for two-page mode when returning current canvas search annotations offset accordingly.
     */
    get currentCanvasSearchAnnotations() {
        if (!this.canvasId)
            return [];
        if (this.viewingMode === 'paged') {
            const visibleEntries = getVisibleCanvasEntries({
                canvases: this.canvases,
                currentCanvasId: this.canvasId,
                currentCanvasIndex: this.currentCanvasIndex,
                viewingMode: this.viewingMode,
                pagedOffset: this.pagedOffset,
            });
            if (!visibleEntries.length) {
                return [];
            }
            const [firstEntry, secondEntry] = visibleEntries;
            let annotations = this.searchAnnotations.filter((a) => a.canvasId === firstEntry.canvasId);
            if (secondEntry) {
                const xOffset = 1.025; // account for small gap between pages
                // Raw IIIF Canvas JSON spells this `width` in both v2 and v3.
                // This read used to be `canvas.getWidth()` with no fallback,
                // which is a TypeError now that canvases are raw JSON.
                const canvasWidth = firstEntry.canvas?.width ?? 0;
                const annoOffset = canvasWidth * xOffset;
                const nextAnnotations = this.searchAnnotations.filter((a) => a.canvasId === secondEntry.canvasId);
                const nextAnnotationsUpdated = nextAnnotations.map((a) => {
                    const parts = a.on.split('#xywh=');
                    const coords = parts[1].split(',').map(Number);
                    const shiftedX = coords[0] + annoOffset;
                    return {
                        ...a,
                        on: `${parts[0]}#xywh=${shiftedX},${coords[1]},${coords[2]},${coords[3]}`,
                    };
                });
                annotations = annotations.concat(nextAnnotationsUpdated);
            }
            return annotations;
        }
        else {
            return this.searchAnnotations.filter((a) => a.canvasId === this.canvasId);
        }
    }
    async search(query) {
        this.dispatchStateChange();
        await this._performSearch(query);
        this.dispatchStateChange();
    }
    async _performSearch(query) {
        if (!query.trim())
            return;
        this.isSearching = true;
        this.searchQuery = query;
        this.searchResults = [];
        try {
            const manifestJson = this.manifestEntry?.json;
            if (!manifestJson) {
                // Defer search until manifest is loaded
                logger.debug('Manifest not loaded, deferring search:', query);
                this.pendingSearchQuery = query;
                return;
            }
            if (this.searchProvider && this.manifestId) {
                this.searchResults = await this.searchProvider(query, {
                    manifestId: this.manifestId,
                    manifestJson,
                    canvases: this.canvases,
                    canvasId: this.canvasId,
                });
                this.searchAnnotations = this.buildSearchAnnotations(this.searchResults);
                return;
            }
            const service = this.discoverSearchService(manifestJson);
            if (!service) {
                logger.warn('No IIIF search service found in manifest');
                this.reportError({
                    severity: 'warning',
                    scope: 'search',
                    code: 'search-service-missing',
                    message: 'No IIIF search service found in manifest.',
                    detail: { query },
                });
                this.isSearching = false;
                return;
            }
            const searchUrl = `${service.serviceId}?q=${encodeURIComponent(query)}`;
            const response = await fetch(searchUrl);
            if (!response.ok)
                throw new Error('Search request failed');
            const data = await response.json();
            if (service.version === 2) {
                this.searchResults = this.parseV2SearchResponse(data);
            }
            else {
                this.searchResults = this.parseLegacySearchResponse(data);
            }
            this.searchAnnotations = this.buildSearchAnnotations(this.searchResults);
        }
        catch (e) {
            logger.error('Search error:', e);
            this.reportError({
                severity: 'error',
                scope: 'search',
                code: 'search-failed',
                message: 'Search request failed.',
                error: e,
                detail: { query },
            });
            this.isSearching = false;
        }
        finally {
            // Only stop searching if we are NOT pending (i.e. we finished or failed, but didn't defer)
            if (!this.pendingSearchQuery) {
                this.isSearching = false;
            }
        }
    }
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
    discoverSearchService(manifestJson) {
        const toArray = (value) => Array.isArray(value) ? value : value ? [value] : [];
        const services = [
            ...toArray(manifestJson?.service),
            ...toArray(manifestJson?.services),
        ];
        let v2Service = null;
        let v1Service = null;
        let v0Service = null;
        let typedV1Service = null;
        for (const service of services) {
            // A service may be a bare id string referencing a definition
            // elsewhere; there is nothing to match on, so skip it.
            if (!service || typeof service !== 'object')
                continue;
            const type = service.type || service['@type'];
            // `profile` may be an array, and some services spell it
            // `dcterms:conformsTo`.
            const rawProfile = service.profile ?? service['dcterms:conformsTo'];
            const profile = Array.isArray(rawProfile)
                ? rawProfile[0]
                : rawProfile;
            if (type === 'SearchService2') {
                v2Service = service;
            }
            else if (!v1Service && profile === SEARCH_1_PROFILE) {
                v1Service = service;
            }
            else if (!v0Service && profile === SEARCH_0_PROFILE) {
                v0Service = service;
            }
            else if (!typedV1Service && type === 'SearchService1') {
                typedV1Service = service;
            }
        }
        // Prefer v2 over v1 over v0.
        if (v2Service) {
            return {
                version: 2,
                serviceId: v2Service.id || v2Service['@id'],
            };
        }
        if (v1Service) {
            return {
                version: 1,
                serviceId: v1Service.id || v1Service['@id'],
            };
        }
        if (v0Service) {
            return {
                version: 0,
                serviceId: v0Service.id || v0Service['@id'],
            };
        }
        if (typedV1Service) {
            return {
                version: 1,
                serviceId: typedV1Service.id || typedV1Service['@id'],
            };
        }
        return null;
    }
    /** Helper to unescape HTML-encoded mark tags */
    decodeMark(str) {
        if (!str)
            return '';
        return str
            .replace(/&lt;mark&gt;/g, '<mark>')
            .replace(/&lt;\/mark&gt;/g, '</mark>');
    }
    /**
     * The display label for a canvas in a search-result group.
     *
     * Delegates to the shared helper rather than repeating the chain. The
     * private copy this replaced read `getLabel()` first and, failing that,
     * only a string or a `[{value}]` array — so a raw IIIF v3 canvas, whose
     * `label` is a language map, fell through to "Canvas N" once canvases
     * stopped being library objects.
     */
    resolveCanvasLabel(canvas, canvasIndex) {
        return getCanvasLabel(canvas, canvasIndex);
    }
    /** Ensure a canvas group exists in the map and return it */
    getOrCreateCanvasGroup(resultsByCanvas, canvasIndex) {
        if (!resultsByCanvas.has(canvasIndex)) {
            const canvas = this.canvases[canvasIndex];
            resultsByCanvas.set(canvasIndex, {
                canvasIndex,
                canvasLabel: this.resolveCanvasLabel(canvas, canvasIndex),
                hits: [],
            });
        }
        return resultsByCanvas.get(canvasIndex);
    }
    getSearchCanvasIndexes() {
        const indexes = new SvelteMap();
        this.canvases.forEach((canvas, index) => {
            // `getCanvasId`, not `canvas.id`: a raw IIIF v2 canvas spells its
            // identifier `@id`, and every v2 search hit targets that spelling.
            const canvasId = getCanvasId(canvas);
            if (canvasId && !indexes.has(canvasId))
                indexes.set(canvasId, index);
        });
        return indexes;
    }
    resolveSearchTargets(target, canvasIndexes) {
        let canvasIndex = -1;
        let bounds = null;
        const allBounds = [];
        for (const normalized of normalizeIiifTargets(target)) {
            const index = normalized.canvasId
                ? canvasIndexes.get(normalized.canvasId)
                : undefined;
            if (index === undefined)
                continue;
            if (canvasIndex === -1)
                canvasIndex = index;
            if (normalized.xywh) {
                allBounds.push(normalized.xywh);
                if (!bounds)
                    bounds = normalized.xywh;
            }
        }
        return { canvasIndex, bounds, allBounds };
    }
    /**
     * Parse a IIIF Content Search API v0/v1 response.
     * Handles both "hits" format (with before/match/after) and "resources"-only format.
     */
    parseLegacySearchResponse(data) {
        const resources = data.resources || [];
        const canvasIndexes = this.getSearchCanvasIndexes();
        const resourcesById = new SvelteMap();
        for (const resource of resources) {
            for (const id of [resource['@id'], resource.id]) {
                if (id && !resourcesById.has(id)) {
                    resourcesById.set(id, resource);
                }
            }
        }
        const resultsByCanvas = new SvelteMap();
        if (data.hits) {
            for (const hit of data.hits) {
                const annotations = hit.annotations || [];
                const targets = annotations
                    .map((id) => resourcesById.get(id)?.on)
                    .filter(Boolean);
                const { canvasIndex, bounds, allBounds } = this.resolveSearchTargets(targets, canvasIndexes);
                if (canvasIndex >= 0) {
                    const group = this.getOrCreateCanvasGroup(resultsByCanvas, canvasIndex);
                    group.hits.push({
                        type: 'hit',
                        before: this.decodeMark(hit.before),
                        match: this.decodeMark(hit.match),
                        after: this.decodeMark(hit.after),
                        bounds,
                        allBounds,
                    });
                }
            }
        }
        else if (resources.length > 0) {
            for (const res of resources) {
                const normalizedTargets = normalizeIiifTargets(res.on);
                const firstTarget = normalizedTargets.find((target) => target.canvasId);
                if (!firstTarget?.canvasId) {
                    continue;
                }
                const canvasIndex = canvasIndexes.get(firstTarget.canvasId) ?? -1;
                if (canvasIndex >= 0) {
                    const boundsArray = normalizedTargets
                        .map((target) => target.xywh)
                        .filter((bounds) => bounds !== null);
                    const group = this.getOrCreateCanvasGroup(resultsByCanvas, canvasIndex);
                    group.hits.push({
                        type: 'resource',
                        match: this.decodeMark(res.resource && res.resource.chars
                            ? res.resource.chars
                            : res.chars || ''),
                        bounds: boundsArray[0] || null,
                        allBounds: boundsArray,
                    });
                }
            }
        }
        return Array.from(resultsByCanvas.values()).sort((a, b) => a.canvasIndex - b.canvasIndex);
    }
    /**
     * Parse a IIIF Content Search API v2 response.
     * v2 returns an AnnotationPage with `items` (W3C Annotations) and optional
     * `annotations` containing contextualizing/highlighting info via TextQuoteSelector.
     */
    parseV2SearchResponse(data) {
        const items = data.items || [];
        const canvasIndexes = this.getSearchCanvasIndexes();
        const resultsByCanvas = new SvelteMap();
        // Build a context map from the annotations section (TextQuoteSelector info)
        // Maps source annotation id -> { before, match, after }
        const contextMap = new SvelteMap();
        if (data.annotations) {
            // annotations can be an array of AnnotationPages or a single AnnotationPage
            const annoPages = Array.isArray(data.annotations)
                ? data.annotations
                : [data.annotations];
            for (const page of annoPages) {
                const pageItems = page.items || [];
                for (const anno of pageItems) {
                    // Each annotation targets a source annotation with a TextQuoteSelector
                    const targets = Array.isArray(anno.target)
                        ? anno.target
                        : [anno.target];
                    for (const target of targets) {
                        if (!target || typeof target === 'string')
                            continue;
                        const sourceId = target.source;
                        if (!sourceId)
                            continue;
                        const selectors = Array.isArray(target.selector)
                            ? target.selector
                            : target.selector
                                ? [target.selector]
                                : [];
                        for (const sel of selectors) {
                            if (sel.type === 'TextQuoteSelector') {
                                // Don't overwrite if we already have context for this source
                                // (prefer first contextualizing entry)
                                if (!contextMap.has(sourceId)) {
                                    contextMap.set(sourceId, {
                                        before: sel.prefix || '',
                                        match: sel.exact || '',
                                        after: sel.suffix || '',
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        // Process each result annotation in items
        for (const item of items) {
            const annoId = item.id || item['@id'];
            const { canvasIndex, bounds, allBounds } = this.resolveSearchTargets(item.target, canvasIndexes);
            if (canvasIndex < 0)
                continue;
            // Extract text from body
            let bodyText = '';
            if (item.body) {
                const body = Array.isArray(item.body)
                    ? item.body[0]
                    : item.body;
                if (body && typeof body === 'object') {
                    bodyText = body.value || '';
                }
                else if (typeof body === 'string') {
                    bodyText = body;
                }
            }
            const group = this.getOrCreateCanvasGroup(resultsByCanvas, canvasIndex);
            // Check if we have contextualizing/highlighting info for this annotation
            const context = contextMap.get(annoId);
            if (context) {
                group.hits.push({
                    type: 'hit',
                    before: this.decodeMark(context.before),
                    match: this.decodeMark(context.match),
                    after: this.decodeMark(context.after),
                    bounds,
                    allBounds,
                });
            }
            else {
                group.hits.push({
                    type: 'resource',
                    match: this.decodeMark(bodyText),
                    bounds,
                    allBounds,
                });
            }
        }
        return Array.from(resultsByCanvas.values()).sort((a, b) => a.canvasIndex - b.canvasIndex);
    }
    buildSearchAnnotations(searchResults) {
        let annotationIndex = 0;
        return searchResults.flatMap((group) => {
            const canvas = this.canvases[group.canvasIndex];
            // Both IIIF versions, for the reason given in
            // `getSearchCanvasIndexes`.
            const canvasId = getCanvasId(canvas);
            if (!canvasId)
                return [];
            return group.hits.flatMap((hit) => {
                const boundsArray = hit.allBounds && hit.allBounds.length > 0
                    ? hit.allBounds
                    : hit.bounds
                        ? [hit.bounds]
                        : [];
                return boundsArray.map((bounds) => ({
                    '@id': `urn:search-hit:${annotationIndex++}`,
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    on: `${canvasId}#xywh=${bounds.join(',')}`,
                    canvasId,
                    resource: {
                        '@type': 'cnt:ContentAsText',
                        chars: hit.match,
                    },
                    isSearchHit: true,
                }));
            });
        });
    }
    // ==================== PARITY COMMANDS (ticket 03) ====================
    // Supported mutation methods for viewer behaviors the chrome previously
    // performed only through direct field assignment. Added for the parity rule
    // (see state-inventory.ts). Core components keep their direct writes; those
    // remain a legitimate internal escape hatch and notification completeness is
    // ticket 04's reactivity-driven concern (ADR 0008). These commands therefore
    // mirror the components' direct-assignment behavior and, like those chrome
    // interactions, do not dispatch legacy web-component events.
    /** Set (or clear, with null) the currently hovered annotation id. */
    setHoveredAnnotationId(annotationId) {
        this.hoveredAnnotationId = annotationId;
    }
    /**
     * Show or hide a single annotation in the read-only overlay, marking
     * visibility as user-touched so the panel keeps the manual selection.
     */
    setAnnotationVisible(annotationId, visible) {
        this.annotationVisibilityTouched = true;
        if (visible) {
            this.visibleAnnotationIds.add(annotationId);
        }
        else {
            this.visibleAnnotationIds.delete(annotationId);
        }
    }
    /**
     * Show or hide every annotation on the active canvas at once, marking
     * visibility as user-touched. Mirrors the annotation panel's "toggle all".
     */
    setAllAnnotationsVisible(visible) {
        this.annotationVisibilityTouched = true;
        this.visibleAnnotationIds.clear();
        if (!visible || !this.manifestId || !this.canvasId) {
            return;
        }
        const annotations = this.getAnnotations(this.manifestId, this.canvasId);
        annotations.forEach((annotation) => {
            const id = getAnnotationId(annotation);
            if (id) {
                this.visibleAnnotationIds.add(id);
            }
        });
    }
    /**
     * Expand the gallery to fill the viewer's center column as a thumbnail
     * grid, or collapse it back to its docked strip / floating window.
     *
     * Expanding implies opening: an expanded-but-hidden gallery is not a state
     * the UI can reach, so maintaining that invariant is why this is a command
     * rather than a field write. Collapsing leaves the gallery open.
     */
    setGalleryExpanded(expanded) {
        this.galleryExpanded = expanded;
        if (expanded) {
            this.showThumbnailGallery = true;
        }
        this.dispatchStateChange();
    }
    /** Flip the gallery between expanded and collapsed (see {@link setGalleryExpanded}). */
    toggleGalleryExpanded() {
        this.setGalleryExpanded(!this.galleryExpanded);
    }
    /** Move the floating (undocked) thumbnail gallery to an absolute position. */
    setGalleryPosition(position) {
        this.galleryPosition = position;
    }
    /** Resize the floating (undocked) thumbnail gallery. */
    setGallerySize(size) {
        this.gallerySize = size;
    }
    /**
     * Dock the thumbnail gallery to a side ('top' | 'bottom' | 'left' |
     * 'right') or float it ('none'), keeping the derived docked flags in sync.
     * Maintaining that invariant is why this is a command, not a field write.
     */
    setDockSide(side) {
        this.dockSide = side;
        this.isGalleryDockedBottom = side === 'bottom';
        this.isGalleryDockedRight = side === 'right';
    }
    // ==================== PLUGIN STATE ====================
    /** Plugin-registered menu buttons */
    pluginMenuButtons = $state([]);
    /** Plugin-registered panels */
    pluginPanels = $state([]);
    /** Plugin-registered flyouts (compact popovers anchored to the toolbar button) */
    pluginFlyouts = $state([]);
    /**
     * OpenSeadragon viewer instance (set by OSDViewer at OSD readiness).
     * Observable pass-through state: its existence and ready-timing are core
     * API, but the object's own surface is OpenSeadragon's (ADR 0009).
     */
    osdViewer = $state.raw(null);
    /**
     * Per-viewer annotation-edit channel shared by OSDViewer and the annotation
     * editor plugin. Keeping this on ViewerState scopes edit requests and the
     * active edit id to one viewer instance instead of using global listeners.
     */
    annotationEditBus = $state({
        requestEdit: (_annotationId) => { },
        activeEditAnnotationId: null,
    });
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
    pluginUiState = new SvelteMap();
    getPluginUiConfig(pluginId) {
        return this.config.plugins?.[pluginId];
    }
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
    ensurePluginUiState(pluginId, defaultTarget = 'panel', defaultPosition = 'left') {
        if (!this.pluginUiState.has(pluginId)) {
            const config = this.getPluginUiConfig(pluginId);
            this.pluginUiState.set(pluginId, {
                open: config?.open ?? false,
                visible: config?.visible ?? true,
                target: config?.target ?? defaultTarget,
                position: config?.position ?? defaultPosition,
            });
            return;
        }
        this.applyPluginUiConfig(pluginId);
    }
    applyPluginUiConfig(pluginId) {
        const current = this.pluginUiState.get(pluginId);
        if (!current)
            return;
        const config = this.getPluginUiConfig(pluginId);
        this.pluginUiState.set(pluginId, {
            open: config?.open ?? current.open,
            visible: config?.visible ?? current.visible,
            target: config?.target ?? current.target,
            position: config?.position ?? current.position,
        });
    }
    /**
     * The effective render target for a plugin — the authored default unless a
     * config override (`config.plugins[id].target`) or {@link setPluginTarget}
     * changed it. Read reactively by the toolbar (flyout vs plain button) and by
     * each plugin panel's `isVisible`. Defaults to `'panel'` for an unknown id.
     */
    getPluginTarget(pluginId) {
        return this.pluginUiState.get(pluginId)?.target ?? 'panel';
    }
    /**
     * Move a plugin between its panel and flyout chrome after mount — the
     * imperative sibling of {@link setPluginOpen}, and the same effect as setting
     * `config.plugins[id].target`. A no-op if the plugin is unknown or already on
     * `target`. Switching remounts the plugin's UI in the new container (see
     * {@link PluginUiConfig.target}).
     */
    setPluginTarget(pluginId, target) {
        const current = this.pluginUiState.get(pluginId);
        if (!current || current.target === target)
            return;
        this.pluginUiState.set(pluginId, { ...current, target });
        this.dispatchStateChange();
    }
    /**
     * The effective panel dock position for a plugin — the authored default
     * unless a config override (`config.plugins[id].position`) or
     * {@link setPluginPosition} changed it. Read reactively by each of the
     * left/right/bottom/overlay panel render sites. Meaningful only while the
     * plugin's effective {@link getPluginTarget} is `'panel'`; a flyout ignores
     * it. Defaults to `'left'` for an unknown id.
     */
    getPluginPosition(pluginId) {
        return this.pluginUiState.get(pluginId)?.position ?? 'left';
    }
    /**
     * Move a plugin's panel to a new dock position after mount — the
     * imperative sibling of {@link setPluginTarget}, and the same effect as
     * setting `config.plugins[id].position`. A no-op if the plugin is unknown
     * or already at `position`. Has no visible effect while the plugin's
     * effective target is `'flyout'` (see {@link PluginUiConfig.position}).
     */
    setPluginPosition(pluginId, position) {
        const current = this.pluginUiState.get(pluginId);
        if (!current || current.position === position)
            return;
        this.pluginUiState.set(pluginId, { ...current, position });
        this.dispatchStateChange();
    }
    applyPluginUiConfigToAll() {
        for (const pluginId of this.pluginUiState.keys()) {
            this.applyPluginUiConfig(pluginId);
        }
    }
    /**
     * Is a plugin's panel/flyout currently open? The read half of
     * {@link setPluginOpen}, and the state a plugin's `PluginSurface.isOpen`
     * projects. Reflects every open-state write source alike: the toolbar button
     * ({@link togglePluginOpen}), flyout light-dismiss
     * ({@link closePluginFlyouts}), and `config.plugins[id].open`. Returns
     * `false` for an unknown id.
     */
    isPluginOpen(pluginId) {
        return this.pluginUiState.get(pluginId)?.open ?? false;
    }
    /**
     * Open or close a plugin's panel/flyout. A no-op (and no notification) if the
     * plugin is unknown or already in that state, matching
     * {@link setPluginTarget} / {@link setPluginPosition} — a redundant call must
     * not wake every plugin's subscription for a change that did not happen.
     */
    setPluginOpen(pluginId, open) {
        const current = this.pluginUiState.get(pluginId);
        if (!current || current.open === open)
            return;
        this.pluginUiState.set(pluginId, {
            ...current,
            open,
        });
        this.dispatchStateChange();
    }
    /**
     * Flip a plugin's open state. This is what the plugin's toolbar button does,
     * so it must notify exactly like {@link setPluginOpen} — a plugin observing
     * its own `PluginSurface.isOpen` reacts to a button press and to a
     * programmatic open identically.
     */
    togglePluginOpen(pluginId) {
        const current = this.pluginUiState.get(pluginId);
        if (!current)
            return;
        this.pluginUiState.set(pluginId, {
            ...current,
            open: !current.open,
        });
        this.dispatchStateChange();
    }
    /**
     * Close every open plugin flyout. Used by the toolbar to light-dismiss
     * flyouts on outside click / Escape. No-op (and no event) if none are open.
     *
     * Flyouts declaring `dismiss: 'explicit'` (SPEC.md — Dismiss) are skipped:
     * they close only via their toolbar button, so a live-editing surface is not
     * dismissed by an outside pointer-down. Built-in toolbar dropdowns are
     * unaffected (they are core-owned and light-dismiss elsewhere).
     */
    closePluginFlyouts() {
        let changed = false;
        for (const flyout of this.pluginFlyouts) {
            // Every plugin registers both a panel and a flyout entry; only the
            // one matching the effective target is live. Skip flyouts whose
            // plugin is currently rendering as a panel — a panel is not
            // light-dismissed by an outside pointer-down.
            if (this.getPluginTarget(flyout.pluginId) !== 'flyout')
                continue;
            if (flyout.dismiss === 'explicit')
                continue;
            const current = this.pluginUiState.get(flyout.pluginId);
            if (current?.open) {
                this.pluginUiState.set(flyout.pluginId, {
                    ...current,
                    open: false,
                });
                changed = true;
            }
        }
        if (changed)
            this.dispatchStateChange();
    }
    // ==================== PLUGIN METHODS ====================
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
    registerSdkChrome(config) {
        const { id, name, label, icon, target, dismiss, mount } = config;
        this.ensurePluginUiState(id, target, config.position ?? 'left');
        const domId = `tri-flyout-${id}`;
        // Always carries `flyoutDomId`; the toolbar anchors the flyout only when
        // the effective target is 'flyout'. Both a panel and a flyout entry are
        // always registered, so the effective target can change reactively after
        // mount without re-registering (like `open`/`visible`).
        const button = {
            id: `${id}:toggle`,
            pluginId: id,
            iconDescriptor: icon,
            tooltip: name,
            label,
            flyoutDomId: domId,
            onClick: () => {
                this.togglePluginOpen(id);
            },
            isActive: () => this.isPluginOpen(id),
            isVisible: () => this.pluginUiState.get(id)?.visible ?? true,
            order: 200,
        };
        // Both entries share the one core-owned `mount` thunk. Only the entry
        // matching the effective target is ever live, so the thunk is called by
        // at most one container at a time; a target switch re-parents the
        // plugin's content element between the panel and flyout container.
        const flyout = {
            id: `${id}:flyout`,
            domId,
            pluginId: id,
            name,
            label,
            iconDescriptor: icon,
            mount,
            dismiss,
        };
        const panel = {
            id: `${id}:panel`,
            pluginId: id,
            name,
            label,
            iconDescriptor: icon,
            mount,
            isVisible: () => this.getPluginTarget(id) === 'panel' && this.isPluginOpen(id),
        };
        this.pluginMenuButtons = [...this.pluginMenuButtons, button];
        this.pluginPanels = [...this.pluginPanels, panel];
        this.pluginFlyouts = [...this.pluginFlyouts, flyout];
    }
    /**
     * Unregister a plugin's UI components by ID prefix.
     * Note: This cleans up the menu button, panel, and flyout records, but does
     * not run the plugin's own teardown — the plugin's `PluginActivation`
     * (`deactivate()`) owns that.
     */
    unregisterPlugin(pluginId) {
        this.pluginMenuButtons = this.pluginMenuButtons.filter((b) => !b.id.startsWith(`${pluginId}:`));
        this.pluginPanels = this.pluginPanels.filter((p) => !p.id.startsWith(`${pluginId}:`));
        this.pluginFlyouts = this.pluginFlyouts.filter((f) => !f.id.startsWith(`${pluginId}:`));
        this.pluginUiState.delete(pluginId);
    }
    /**
     * Notify that OSD viewer is ready.
     * With the component-based system, we don't notify plugins individually.
     * Instead, plugins should use the OSDViewer instance from context or listen for 'osd-ready' event (if we emitted one).
     * But since we have direct access to osdViewer in this state, components can just react to it.
     */
    notifyOSDReady(viewer) {
        this.osdViewer = viewer;
    }
    /**
     * Cleanup everything.
     */
    destroyAllPlugins() {
        this.pluginMenuButtons = [];
        this.pluginPanels = [];
        this.pluginFlyouts = [];
        this.pluginUiState.clear();
    }
    // ==================== FRAMEWORK-NEUTRAL SUBSCRIPTIONS (ADR 0008) ==========
    //
    // `subscribe` gives plugins a reactivity-driven, batched, payload-free
    // notification independent of the Web Component event target above. A single
    // `$effect.root`-based watcher reads every inventoried `command` and
    // `observable` member; any write source — command, core-internal Svelte
    // binding, or unsupported direct assignment — re-runs it on the next flush
    // and wakes subscribers. Completeness is structural (nobody has to remember
    // to call `notify()`); the price is timing: notifications are batched and
    // delivered on the microtask flush, never synchronously inside a mutator.
    // Selectors (ticket 07) and `pluginerror` attribution (ticket 09) build on
    // top of this; `invokeSubscriptionListener` is the seam ticket 09 replaces.
    /**
     * Inventoried members whose changes wake subscribers, derived from the state
     * inventory so the watcher and the inventory cannot drift: `command` and
     * `observable` members notify; `internal` and `query-only` members never do.
     */
    static WATCHED_MEMBERS = STATE_INVENTORY.filter((entry) => entry.classification === 'command' ||
        entry.classification === 'observable').map((entry) => entry.member);
    // These are ECMAScript #private fields (not TS `private`) on purpose: they
    // carry no plugin contract and must stay invisible to the state inventory's
    // enumerable-member reflection, so no `state-inventory.ts` entry is needed.
    /**
     * Registered subscription listeners, kept in registration order. Each entry
     * pairs the listener with an optional per-subscription error handler
     * (ticket 09): when the listener throws, the guard routes to `onError` if
     * present so the SDK can attribute the failure to the owning plugin
     * (`pluginerror` phase `subscription`); otherwise it falls back to a console
     * error. Core's own subscriptions register no `onError` and keep the
     * console-error behavior.
     */
    #subscriptionListeners = [];
    /** Disposes the reactive watcher's effect root; null until lazily started. */
    #disposeSubscriptionWatcher = null;
    /** True once the watcher's priming run has established its dependencies. */
    #subscriptionWatcherPrimed = false;
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
    subscribe(listener, onError) {
        const entry = { listener, onError };
        this.#subscriptionListeners.push(entry);
        this.startSubscriptionWatcher();
        return () => {
            const index = this.#subscriptionListeners.indexOf(entry);
            if (index !== -1) {
                this.#subscriptionListeners.splice(index, 1);
            }
        };
    }
    /**
     * Lazily start the reactivity-driven watcher (browser only, once). Kept out
     * of the constructor so server-side construction never creates an effect and
     * viewers with no subscribers pay nothing.
     */
    startSubscriptionWatcher() {
        // SSR-safe: never create effects on the server.
        if (this.#disposeSubscriptionWatcher || typeof window === 'undefined') {
            return;
        }
        this.#subscriptionWatcherPrimed = false;
        this.#disposeSubscriptionWatcher = $effect.root(() => {
            $effect(() => {
                // Establish a reactive dependency on every watched member.
                this.trackWatchedMembers();
                if (this.#subscriptionWatcherPrimed) {
                    // Deliver outside the tracking context so a listener's own
                    // state reads never become watcher dependencies.
                    untrack(() => this.notifySubscribers());
                }
                else {
                    // First run only registers dependencies; it must not notify.
                    this.#subscriptionWatcherPrimed = true;
                }
            });
        });
        // Prime synchronously so dependencies exist before the caller mutates;
        // otherwise the effect's initial run would swallow the first change.
        // `flushSync` throws when Svelte is already flushing (e.g. subscribing
        // from inside an effect) — tolerate that: the scheduled effect still
        // primes on the in-progress flush.
        try {
            flushSync();
        }
        catch {
            /* already flushing — priming happens on the current flush */
        }
    }
    /**
     * Read every watched member so the watcher effect depends on all of them.
     * Reading a plain member registers an identity dependency; reactive
     * collections additionally need their mutation version read (via `keys()`,
     * which also covers `.size` changes) so adds, deletes, clears, and same-size
     * content swaps all notify.
     */
    trackWatchedMembers() {
        const self = this;
        for (const member of ViewerState.WATCHED_MEMBERS) {
            const value = self[member];
            if (value instanceof SvelteSet || value instanceof SvelteMap) {
                value.keys();
            }
        }
    }
    notifySubscribers() {
        // Snapshot so a listener that (un)subscribes during delivery does not
        // disturb this pass; a newly added listener sees the next notification.
        for (const entry of [...this.#subscriptionListeners]) {
            this.invokeSubscriptionListener(entry);
        }
    }
    /**
     * Single guarded call site for a subscription listener (ticket 09): a
     * throwing listener is isolated so the remaining listeners and core's own
     * reactions still run. The failure is routed to the listener's own
     * `onError` when one was registered — the SDK uses this to attribute the
     * throw to the owning plugin and raise `pluginerror` phase `subscription` —
     * and otherwise falls back to a console error. `onError` itself is guarded
     * so a faulty reporter cannot break delivery either.
     */
    invokeSubscriptionListener(entry) {
        try {
            entry.listener();
        }
        catch (error) {
            if (entry.onError) {
                try {
                    entry.onError(error);
                }
                catch (reportError) {
                    // triiiceratops-console-allow: ticket 09 subscription
                    // isolation last-resort fallback (tested in
                    // viewer.subscribe.onError.test.ts). A throwing error
                    // reporter has no other channel; delivery must continue.
                    console.error('[ViewerState] A subscription error reporter threw; delivery continues.', reportError);
                }
            }
            else {
                // triiiceratops-console-allow: ticket 09 subscription isolation
                // last-resort fallback (tested in
                // viewer.subscribe.onError.test.ts). An unguarded listener throw
                // with no `onError` reporter has no structured channel.
                console.error('[ViewerState] A subscription listener threw; other listeners are unaffected.', error);
            }
        }
    }
    /**
     * Tear down this viewer state: dispose the subscription watcher's effect
     * root, drop all listeners, and release plugin registrations. After destroy
     * no further notifications are delivered. Idempotent.
     */
    destroy() {
        this.#disposeSubscriptionWatcher?.();
        this.#disposeSubscriptionWatcher = null;
        this.#subscriptionWatcherPrimed = false;
        this.#subscriptionListeners = [];
        this.destroyAllPlugins();
    }
}
// Context key for providing/injecting ViewerState in components
export const VIEWER_STATE_KEY = 'triiiceratops:viewerState';
