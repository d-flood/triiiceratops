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
import { NOTIFYING_MEMBERS } from '../generated/notifyingMembers.js';
import { getLocale } from '../paraglide/runtime.js';
import { logger, isDebugEnabled } from '../logging/logger';
import type { ViewerError, ViewerErrorReporter } from '../types/viewerError';
import type { RendererPort } from '../renderer/rendererPort.js';
import { isRendererPort } from '../renderer/rendererPortBrand.js';
import {
    createPaintLayerRegistry,
    type PaintLayer,
    type RegisteredPaintLayer,
} from '../renderer/paintLayers.js';
import {
    createOverlayLayerRegistry,
    type OverlayLayer,
    type RegisteredOverlayLayer,
} from '../renderer/overlayLayers.js';
import {
    createTransportChromeRegistry,
    type RegisteredTransportChrome,
    type TransportChrome,
} from './transportChrome.js';
import { ZOOM_PER_CLICK as DEFAULT_ZOOM_PER_CLICK } from '../renderer/rendererDefaults.js';
import {
    NEUTRAL_IMAGE_ADJUSTMENTS,
    ZERO_VIEWPORT_INSET,
    type CanvasSize,
    type ContainerSize,
    type ImageAdjustments,
    type ViewportBox,
    type ViewportInset,
    type ViewportPoint,
} from '../types/viewport.js';
import type {
    PluginUiConfig,
    RequestConfig,
    SearchProvider,
    SearchResultGroup,
    ViewerConfig,
} from '../types/config';

import type {
    PluginMenuButton,
    PluginPanel,
    PluginFlyout,
    PluginMountThunk,
    PluginUiTarget,
    IconDescriptor,
} from '../types/plugin';
import { parseStructures, type StructureNode } from '../utils/structures';
import {
    isCollection,
    parseCollection,
    getCollectionLabel,
    getCollectionThumbnail,
    sortCollectionItems,
    type CollectionItem,
} from '../utils/collections';
import { collectCanvasAnnotations } from '../utils/canvasAnnotations';
import {
    buildSearchAnnotations,
    discoverSearchService,
    parseSearchResponse,
} from '../utils/iiifSearch';
import type { CanvasRegion } from '../utils/contentState';
import { parseIiifSelectorTime, parseIiifTime } from '../utils/iiifTargets';
import type { IiifTemporalFragment } from '../utils/iiifTime';
import {
    findCanvasIndexById,
    getAnnotationId,
    getCanvasId,
    getReferenceId,
} from '../utils/iiifIds';
import { getPagedCanvasGroups } from '../components/viewerControls';
import { getThumbnailSrc } from '../utils/getThumbnailSrc';

/**
 * `behavior` (IIIF v3) and `viewingHint` (IIIF v2) may each be a bare string or
 * an array of them. Absent reads as no behaviors at all.
 */
function asBehaviorList(value: unknown): string[] {
    if (value === null || value === undefined || value === '') return [];
    return (Array.isArray(value) ? [...value] : [value]) as string[];
}

function normalizeIiifBehavior(value: unknown): string {
    const normalized = String(value).trim().toLowerCase();
    const segments = normalized.split(/[#/:]/);
    return segments[segments.length - 1] || normalized;
}

/**
 * The media time a navigation carried, and the canvas it belongs to.
 *
 * Core parses and carries it; only a claimant of that canvas interprets it, as
 * a seek and never as autoplay. `endSeconds` — a chapter range's end — is
 * carried but never enforced: nothing in core stops playback at it.
 */
export type TemporalOffset = IiifTemporalFragment & { canvasId: string };

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
    viewingDirection:
        | 'left-to-right'
        | 'right-to-left'
        | 'top-to-bottom'
        | 'bottom-to-top';
    preserveCanvasScale: boolean;
    galleryExpanded: boolean;
    galleryPosition: { x: number; y: number };
    gallerySize: { width: number; height: number };
}

export class ViewerState {
    manifestId: string | null = $state(null);
    canvasId: string | null = $state(null);
    showAnnotations = $state(false);
    showThumbnailGallery = $state(false);
    toolbarOpen = $state(false);
    isGalleryDockedBottom = $state(false);
    isGalleryDockedRight = $state(false);
    isFullScreen = $state(false);
    showMetadataPanel = $state(false);
    showCanvasInfo = $state(false);
    showStructuresPanel = $state(false);
    initialCanvasRegion = $state<CanvasRegion | null>(null);

    /**
     * The media time the last navigation carried (a structure item's `#t=`, a
     * manifest `start`, a content-state target), or `null` when it carried
     * none. Replaced whole by every navigation, so a subscriber reads the
     * current value rather than consuming a queue: there is no auto-clear and
     * no consume-once semantics.
     */
    temporalOffset = $state<TemporalOffset | null>(null);
    dockSide = $state('bottom');
    /** Reactive collection declared as a plain `Set` — see the note on the `svelte/reactivity` import. */
    visibleAnnotationIds: Set<string> = new SvelteSet<string>();
    annotationVisibilityTouched = $state(false);
    hoveredAnnotationId = $state<string | null>(null);

    /**
     * The **selected** annotation, or `null` for none — what a reader picked
     * rather than what a pointer is passing over.
     *
     * Distinct from {@link hoveredAnnotationId}, and deliberately not folded
     * into it: hover is transient and follows the pointer, while a selection
     * persists after the pointer has gone somewhere else. That difference is the
     * whole point of it — the panel keeps the row marked and the connector line
     * keeps its shape tied to that row, neither of which a hover can do.
     *
     * Set by tapping a shape on the image (the gesture the renderer reserves for
     * exactly this) and cleared by tapping the same shape again or the image
     * beside it. Command state: {@link setActiveAnnotationId}.
     */
    activeAnnotationId = $state<string | null>(null);

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
    userAnnotations: Map<string, any[]> = new SvelteMap<string, any[]>();

    /**
     * Manifest ids this viewer has finished loading/registering. Observable: core
     * adds to it when a manifest becomes ready, giving subscribers a
     * manifest-readiness notification (queryable via {@link isManifestReady}).
     *
     * Reactive collection declared as a plain `Set` — see the note on the
     * `svelte/reactivity` import.
     */
    loadedManifestIds: Set<string> = new SvelteSet<string>();

    private userAnnotationKey(manifestId: string, canvasId: string): string {
        return `${manifestId}::${canvasId}`;
    }

    /**
     * Replace this viewer's displayed user annotations for one canvas. The
     * supported write path for plugin display sync (ADR 0001, amended): the
     * annotation-editor store calls this after each successful persistence op.
     */
    setUserAnnotations(
        manifestId: string,
        canvasId: string,
        annotations: any[],
    ): void {
        this.userAnnotations.set(
            this.userAnnotationKey(manifestId, canvasId),
            annotations,
        );
    }

    /** Drop this viewer's displayed user annotations for one canvas. */
    clearUserAnnotations(manifestId: string, canvasId: string): void {
        const key = this.userAnnotationKey(manifestId, canvasId);
        if (this.userAnnotations.has(key)) {
            this.userAnnotations.delete(key);
        }
    }

    /** This viewer's displayed user annotations for one canvas (never null). */
    getUserAnnotations(manifestId: string, canvasId: string): any[] {
        return (
            this.userAnnotations.get(
                this.userAnnotationKey(manifestId, canvasId),
            ) ?? []
        );
    }

    /**
     * Annotations for a canvas: manifest-defined annotations from the shared
     * cache merged with this viewer's own user annotations (ADR 0007). Plugins
     * reach annotation data through this query rather than importing the manifest
     * cache. A `sourceId` restricts the result to one annotation list and skips
     * the user-annotation merge, mirroring the manifest cache's behavior.
     */
    getAnnotations(
        manifestId: string,
        canvasId: string,
        sourceId?: string,
    ): any[] {
        const manifestAnnos = manifestsState.getAnnotations(
            manifestId,
            canvasId,
            sourceId,
        );

        if (sourceId) {
            return manifestAnnos;
        }

        const userAnnos = this.getUserAnnotations(manifestId, canvasId).map(
            (annotation) => {
                if (!annotation || typeof annotation !== 'object') {
                    return annotation;
                }
                return {
                    ...annotation,
                    __triiiceratopsAnnotationOrigin: 'user',
                };
            },
        );

        return [...manifestAnnos, ...userAnnos];
    }

    /**
     * Canvases of a manifest (from the shared cache). Plugins reach canvas data
     * through this query rather than importing the manifest cache.
     */
    getCanvases(manifestId: string, sequenceIndex: number = 0): any[] {
        return manifestsState.getCanvases(manifestId, sequenceIndex);
    }

    /**
     * Ensure a canvas's external annotation lists are fetched, then return the
     * per-viewer merged annotations for it. Plugin-facing wrapper over the shared
     * cache's fetch-and-return.
     */
    async ensureCanvasAnnotations(
        manifestId: string,
        canvasId: string,
        sourceId?: string,
    ): Promise<any[]> {
        await manifestsState.ensureCanvasAnnotations(
            manifestId,
            canvasId,
            sourceId,
        );
        return this.getAnnotations(manifestId, canvasId, sourceId);
    }

    /** Whether this viewer has finished loading the given manifest. */
    isManifestReady(manifestId: string): boolean {
        return this.loadedManifestIds.has(manifestId);
    }

    /** Record that a manifest is ready, notifying manifest-readiness subscribers. */
    private markManifestReady(manifestId: string): void {
        this.loadedManifestIds.add(manifestId);
    }

    /**
     * Show every annotation on every canvas the reader is looking at — the
     * default the panel opens with, and the one that has to be re-applied when a
     * canvas scrolls into view.
     *
     * Clears the visibility set first, `annotationVisibilityTouched` included, so
     * this is the *default* state and not a user choice: core calls it only while
     * the reader has not touched visibility themselves.
     *
     * Distinct from {@link showCurrentCanvasAnnotations}, which is about ONE
     * canvas and stays as it was. In `paged` the facing page's annotations would
     * otherwise arrive hidden — drawn nowhere, and a panel row whose eye says
     * "hidden" for something the reader never hid.
     */
    showVisibleCanvasAnnotations() {
        this.clearAnnotationVisibility();

        if (!this.manifestId) return;

        for (const entry of collectCanvasAnnotations({
            manifestId: this.manifestId,
            canvasIds: this.annotatableCanvasIds,
            getAnnotations: (manifestId, canvasId) =>
                this.getAnnotations(manifestId, canvasId),
            searchAnnotations: this.searchAnnotations,
        })) {
            for (const annotation of entry.annotations) {
                const id = getAnnotationId(annotation);
                // A search hit is always drawn and never toggled, so it is not
                // part of the visibility set.
                if (id && !entry.searchHitIds.has(id)) {
                    this.visibleAnnotationIds.add(id);
                }
            }
        }
    }

    showCurrentCanvasAnnotations() {
        this.clearAnnotationVisibility();

        if (!this.manifestId || !this.canvasId) {
            return;
        }

        const annotations = this.getAnnotations(this.manifestId, this.canvasId);

        annotations.forEach((annotation: any) => {
            const id = getAnnotationId(annotation);
            if (id) {
                this.visibleAnnotationIds.add(id);
            }
        });
    }

    private clearAnnotationVisibility() {
        this.annotationVisibilityTouched = false;
        this.visibleAnnotationIds.clear();
    }

    private setAnnotationsPanelOpen(isOpen: boolean) {
        this.showAnnotations = isOpen;
        this.clearAnnotationVisibility();

        if (isOpen) {
            this.showCurrentCanvasAnnotations();
        }
    }

    // Error state for tile source fetching and image load failures.
    tileSourceError:
        | { type: 'auth' }
        | { type: 'load'; message?: string; details?: string }
        | null = $state(null);

    // Map of canvasId -> selected choiceId (Content State).
    // Reactive collection declared as a plain `Map` — see the note on the
    // `svelte/reactivity` import.
    selectedChoices: Map<string, string> = new SvelteMap<string, string>();
    selectedSequenceIndex = $state(0);

    // Collection state
    collectionId: string | null = $state(null);
    collectionLabel: string = $state('');
    collectionThumbnail: string = $state('');
    collectionItems: CollectionItem[] = $state([]);
    showCollectionPanel = $state(false);
    private collectionThumbnailHydrationId = 0;

    private _viewingDirection = $state<
        'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
    >('left-to-right');
    get viewingDirection() {
        return this._viewingDirection;
    }
    set viewingDirection(
        value:
            | 'left-to-right'
            | 'right-to-left'
            | 'top-to-bottom'
            | 'bottom-to-top',
    ) {
        this._viewingDirection = value;
        this.config.viewingDirection = value;
    }

    // UI Configuration
    config: ViewerConfig = $state({});
    searchProvider: SearchProvider | null = $state.raw(null);
    manifestRequestConfig: RequestConfig | undefined = $state.raw(undefined);

    /**
     * This viewer's active locale (BCP-47) — its `config.locale` if set,
     * otherwise the page default (CONTEXT.md **Active locale**).
     * Observable state: readable and notifying, with no plugin-facing mutator.
     * Locale is *set* through `config.locale`; core (the viewer root) mirrors the
     * resolved value onto this field whenever the config or the page locale
     * changes, exactly as it mirrors other external facts (e.g. `isFullScreen`),
     * so the reactivity-driven watcher (ADR 0008) notifies subscribers. All of
     * the viewer's chrome renders in this locale (via the i18n context).
     * Defaults to the page locale at construction so a server render and a
     * subscriber-less viewer both read a correct value before the first mirror
     * runs.
     */
    activeLocale = $state<string>(getLocale());

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
    private _viewingMode = $state<'individuals' | 'paged' | 'continuous'>(
        'individuals',
    );

    // Track whether viewingMode was explicitly set via config (user preference)
    // When true, manifest behavior detection is skipped to respect user configuration
    private _viewingModeUserConfigured = $state(false);

    get viewingMode() {
        return this._viewingMode;
    }
    set viewingMode(value: 'individuals' | 'paged' | 'continuous') {
        this._viewingMode = value;
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
    dragOverSide = $state<'top' | 'bottom' | 'left' | 'right' | null>(null);
    galleryCenterPanelRect = $state<DOMRect | null>(null);

    // ==================== EVENT DISPATCH (Web Component Only) ====================

    /**
     * Event target for dispatching CustomEvents.
     * Only set by TriiiceratopsViewerElement (web component build).
     * Remains null for Svelte component usage → no events dispatched.
     */
    private eventTarget: EventTarget | null = null;

    /**
     * Set the event target for dispatching state change events.
     * Called by TriiiceratopsViewerElement to enable event-driven API.
     */
    setEventTarget(target: EventTarget): void {
        this.eventTarget = target;
    }

    /**
     * Host reporter for the structured `viewererror` channel. Set by
     * `TriiiceratopsViewer.svelte` so state-level actionable failures (search,
     * viewport, content) surface as a typed {@link ViewerError} on the viewer
     * root's `viewererror` event and the `onviewererror` callback instead of
     * only reaching the console. Null in direct/test use → failures are logged
     * through the (silent-by-default) logger only.
     */
    private errorReporter: ViewerErrorReporter | null = null;

    /** Wire the `viewererror` reporter (see {@link errorReporter}). */
    setErrorReporter(reporter: ViewerErrorReporter | null): void {
        this.errorReporter = reporter;
    }

    /** Deliver a structured viewer failure to the host, if a reporter is wired. */
    private reportError(error: ViewerError): void {
        this.errorReporter?.(error);
    }

    /**
     * Get current state as a plain object snapshot.
     * Safe to use outside Svelte's reactive system.
     * NOTE: We calculate currentCanvasIndex inline to avoid triggering the canvases getter
     * which can cause infinite loops when it auto-sets canvasId.
     */
    getSnapshot(): ViewerStateSnapshot {
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
    private dispatchStateChange(eventName: string = 'statechange'): void {
        // Gate the snapshot build behind the debug check: this fires on every
        // state change, so it must cost nothing when debug is off.
        if (isDebugEnabled()) {
            logger.debug(
                `Dispatching ${eventName}`,
                JSON.stringify(this.getSnapshot()),
            );
        }
        if (!this.eventTarget) return;

        queueMicrotask(() => {
            this.eventTarget?.dispatchEvent(
                new CustomEvent(eventName, {
                    detail: this.getSnapshot(),
                    bubbles: true,
                    composed: true,
                }),
            );
        });
    }

    constructor(
        initialManifestId: string | null = null,
        initialCanvasId: string | null = null,
    ) {
        this.manifestId = initialManifestId || null;
        this.canvasId = initialCanvasId || null;
        if (this.manifestId) {
            manifestsState.fetchManifest(
                this.manifestId,
                this.manifestRequestConfig,
            );
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
        if (!this.manifestId) return null;
        return manifestsState.getManifestEntry(this.manifestId);
    }

    get canvases() {
        if (!this.manifestId) return [];
        const canvases = manifestsState.getCanvases(
            this.manifestId,
            this.selectedSequenceIndex,
        );

        return canvases;
    }

    get sequenceCount() {
        if (!this.manifestId) return 0;
        return manifestsState.getSequenceCount(this.manifestId);
    }

    get currentCanvasIndex() {
        if (!this.canvasId) {
            return -1;
        }

        return findCanvasIndexById(this.canvases, this.canvasId);
    }

    private getCurrentPagedCanvasGroupIndex(): number {
        if (this.viewingMode !== 'paged' || this.currentCanvasIndex < 0) {
            return -1;
        }

        const groups = getPagedCanvasGroups(this.canvases, this.pagedOffset);
        return groups.findIndex(
            ({ startIndex, endIndex }) =>
                this.currentCanvasIndex >= startIndex &&
                this.currentCanvasIndex <= endIndex,
        );
    }

    get hasNext() {
        if (this.currentCanvasIndex < 0) {
            return false;
        }

        if (this.viewingMode === 'paged') {
            const groupIndex = this.getCurrentPagedCanvasGroupIndex();
            const groups = getPagedCanvasGroups(
                this.canvases,
                this.pagedOffset,
            );
            return groupIndex >= 0 && groupIndex < groups.length - 1;
        } else {
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
                const groups = getPagedCanvasGroups(
                    this.canvases,
                    this.pagedOffset,
                );
                const canvasId =
                    groups[this.getCurrentPagedCanvasGroupIndex() + 1]
                        ?.entries[0]?.canvasId;
                if (canvasId) this.setCanvas(canvasId);
            } else {
                const nextIndex = this.currentCanvasIndex + 1;
                const canvas = this.canvases[nextIndex];
                const canvasId = getCanvasId(canvas);
                if (canvasId) this.setCanvas(canvasId);
            }
        }
    }

    previousCanvas() {
        if (this.hasPrevious) {
            if (this.viewingMode === 'paged') {
                const groups = getPagedCanvasGroups(
                    this.canvases,
                    this.pagedOffset,
                );
                const canvasId =
                    groups[this.getCurrentPagedCanvasGroupIndex() - 1]
                        ?.entries[0]?.canvasId;
                if (canvasId) this.setCanvas(canvasId);
            } else {
                const prevIndex = this.currentCanvasIndex - 1;
                const canvas = this.canvases[prevIndex];
                const canvasId = getCanvasId(canvas);
                if (canvasId) this.setCanvas(canvasId);
            }
        }
    }

    // ==================== VIEWPORT (SPEC.md §Public API) ======================
    //
    // Command state for the viewport, and query-only state beside it. These
    // replace the renderer pass-through: the parity rule says anything the
    // viewer's own chrome can do to the viewport a plugin can do too, and the
    // chrome's zoom buttons, fit control, and keyboard bindings all land here.
    //
    // Every command is a no-op before a renderer is attached rather than a
    // throw. A plugin activating during mount would otherwise have to guard
    // every call, and "the surface is not sized yet" is a timing fact, not a
    // caller error — {@link rendererReady} is how a caller that cares waits.
    //
    // Coordinates are canvas space (the IIIF Canvas's own dimensions) and
    // screen space (the surface's CSS pixels). Image space stays inside core.

    /**
     * The mounted renderer's command/query seam, or `null` before one mounts.
     *
     * Deliberately NOT reactive: it is set once per mount, plugins never see
     * it, and making it `$state` would put a renderer handle on the batched
     * notification path — a pass-through this state is meant to avoid.
     * {@link rendererReady} is the notifying signal.
     */
    private rendererPort: RendererPort | null = null;

    /** Frame-cadence fan-out; see {@link subscribeFrame}. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    private frameListeners = new Set<() => void>();

    /** Detach from the port's animation events; set while we are attached. */
    private unsubscribeFrame: (() => void) | null = null;

    /** The port {@link unsubscribeFrame} belongs to, so a swap is noticed. */
    private tickingPort: RendererPort | null = null;

    /** Surface-tap fan-out; see {@link subscribeSurfaceTap}. */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    private surfaceTapListeners = new Set<(point: ViewportPoint) => void>();

    /**
     * Detach from the port's tap events; set while a renderer is attached.
     *
     * Subscribed for the whole life of the attachment rather than lazily, the
     * way {@link subscribeFrame} is: laziness there keeps a per-frame loop off an
     * idle viewer, and a tap is a human-rate event with no loop behind it.
     */
    private unsubscribeSurfaceTap: (() => void) | null = null;

    /**
     * The canvases the reader is looking at, in layout order — the scope every
     * annotation surface works over.
     *
     * In `individuals` that is one canvas; in `paged` it is the whole spread,
     * facing page included; in `continuous` it is the folios the viewport
     * actually meets, which is **not** {@link canvasId} — a scroll moves the
     * viewport and leaves the navigated canvas behind. Empty before a renderer
     * has a sized surface, and it falls back to {@link canvasId} for a caller
     * that reads it then (see {@link annotatableCanvasIds}).
     *
     * Observable: only the renderer can answer it, so core writes it. It is
     * republished when the set CHANGES rather than per frame, which is both what
     * makes it safe to notify on and the cadence a panel following a scroll
     * should update at.
     */
    visibleCanvasIds: string[] = $state.raw([]);

    /**
     * {@link visibleCanvasIds}, or the current canvas while no renderer has
     * answered yet, minus every canvas a plugin has claimed.
     *
     * The annotation panel and the shape overlay both read this, so they cannot
     * disagree about which canvases they are describing — and a viewer whose
     * surface is not sized yet still lists the annotations of the canvas it
     * opened on rather than nothing at all.
     *
     * A **canvas claim** takes the canvas out of the set: the claimant owns
     * what is rendered there, so core has no painting of its own for a comment
     * to be anchored against. Excluding it here excludes it from every
     * annotation surface at once — including the annotation editor plugin,
     * which gates its drawing layer on this list.
     *
     * The returned array is REFERENCE-STABLE while the ids are unchanged, which
     * the selector runtime's stability contract requires of anything a host
     * wires into a React `getSnapshot`: a fresh-but-equal array every read
     * would re-render every annotation surface on every unrelated state change,
     * for the whole session, on any manifest holding a claim.
     */
    get annotatableCanvasIds(): string[] {
        const inScope =
            this.visibleCanvasIds.length > 0
                ? this.visibleCanvasIds
                : this.canvasId
                  ? [this.canvasId]
                  : [];

        // No claims at all: `visibleCanvasIds` is itself `$state.raw`, so it is
        // already the stable reference and needs no memo.
        if (this.#claimedCanvases.size === 0) return inScope;

        const filtered = inScope.filter((id) => !this.#claimedCanvases.has(id));
        const previous = this.#annotatableMemo;
        if (
            previous.length === filtered.length &&
            previous.every((id, index) => id === filtered[index])
        ) {
            return previous;
        }
        this.#annotatableMemo = filtered;
        return filtered;
    }

    /** Last array {@link annotatableCanvasIds} handed out, for its memo. */
    #annotatableMemo: string[] = [];

    /**
     * Whether a renderer has a sized surface and accepts viewport commands.
     *
     * **A new signal, not the old readiness renamed.** The old one meant "the
     * third-party object exists, you may touch it"; with no pass-through there
     * is nothing to hand over. This one is about the viewer being able to obey:
     * before it, viewport commands are no-ops and the viewport queries answer
     * with zeroes and `null`s.
     *
     * Observable state — core writes it, subscribers are woken by it.
     */
    rendererReady: boolean = $state(false);

    /**
     * Image adjustments currently applied to the rendered image.
     *
     * Command state: changed through {@link setImageAdjustments} and
     * {@link resetImageAdjustments}, which is what replaces reaching into the
     * renderer's DOM node to set a CSS filter string. Because the set lives
     * here rather than on a node, it survives a renderer remount, is readable,
     * and is testable with no renderer at all.
     */
    imageAdjustments: ImageAdjustments = $state.raw(NEUTRAL_IMAGE_ADJUSTMENTS);

    /**
     * Edges of the surface a plugin has reserved, which **fits** frame into.
     *
     * Command state: changed through {@link setViewportInset} and
     * {@link resetViewportInset}, exactly as {@link imageAdjustments} is. The
     * renderer reads it when it fits, so an inset set before a renderer mounted
     * is honoured by that renderer's first fit with no replay machinery, and
     * `RendererPort` needs nothing added to it.
     *
     * Setting it does **not** move the current view: the next fit uses it. One
     * inset per viewer — a second setter wins.
     */
    viewportInset: ViewportInset = $state.raw(ZERO_VIEWPORT_INSET);

    /**
     * Attach the mounted renderer. **Core-internal** — the host↔state seam, not
     * part of the supported plugin API, and it takes a fixed first-party
     * interface rather than a renderer object.
     *
     * Returns a detach function the host calls on teardown. Attaching replays
     * the current image adjustments, so a renderer that mounts after they were
     * set shows them.
     *
     * **`@internal` is documentation; the guard below is the enforcement.** The
     * API report is a d.ts snapshot of the whole published declaration graph,
     * not an api-extractor run, so this method reaches the shipped `.d.ts` and
     * is typed and callable from a plugin. Only a port core itself built is
     * accepted (`renderer/rendererPortBrand.ts`, whose brand is a
     * module-private symbol no consumer can obtain) — otherwise a plugin could
     * hand in an object of the right shape and become the renderer for the
     * whole viewer, serving the chrome's own zoom buttons and every other
     * plugin's viewport queries with the real renderer unreachable. A refused
     * attach changes nothing and returns a no-op detach.
     *
     * @internal
     */
    attachRenderer(port: RendererPort): () => void {
        if (!isRendererPort(port)) {
            logger.warn(
                'attachRenderer ignored a port core did not create. It is an internal host seam, not a plugin API; use the viewport commands and queries on ViewerState.',
            );
            return () => {};
        }

        this.rendererPort = port;
        port.applyImageAdjustments(this.imageAdjustments);
        this.syncFrameSource();
        this.unsubscribeSurfaceTap?.();
        this.unsubscribeSurfaceTap = port.onTap((point) => {
            for (const listener of [...this.surfaceTapListeners]) {
                listener(point);
            }
        });
        this.rendererReady = true;

        let detached = false;
        return () => {
            if (detached || this.rendererPort !== port) return;
            detached = true;
            this.rendererPort = null;
            this.syncFrameSource();
            this.unsubscribeSurfaceTap?.();
            this.unsubscribeSurfaceTap = null;
            this.rendererReady = false;
        };
    }

    /**
     * Hear a **single tap** on the image surface, at a screen-space point.
     *
     * The one gesture the viewport does not consume: it is reserved for
     * annotation selection, and it arrives already filtered by the renderer's
     * single arbitration point — never for a drag, a pinch, or a gesture
     * suppressed by an input claim. What was tapped is the subscriber's
     * question to answer, from geometry it already holds; core's own annotation
     * overlay answers it with the shapes it projected for the current frame.
     *
     * Unsubscribing is idempotent, and a listener survives a renderer remount:
     * the subscription is to the viewer, not to a renderer instance.
     */
    subscribeSurfaceTap(listener: (point: ViewportPoint) => void): () => void {
        this.surfaceTapListeners.add(listener);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.surfaceTapListeners.delete(listener);
        };
    }

    /**
     * Wake up on the renderer's own animation events — the `frame` selector
     * cadence's source (CONTEXT.md **Selector cadence**). The listener receives
     * no payload: it means "the viewport moved, read what you need".
     *
     * Attached to the renderer lazily and detached when the last listener
     * leaves, so an idle viewer pays nothing and no polling loop is ever
     * created. Unsubscribing is idempotent.
     */
    subscribeFrame(listener: () => void): () => void {
        this.frameListeners.add(listener);
        this.syncFrameSource();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.frameListeners.delete(listener);
            this.syncFrameSource();
        };
    }

    /**
     * Attach to (or detach from) the port's animation events so that we are
     * subscribed exactly when a port exists AND somebody is listening.
     */
    private syncFrameSource(): void {
        // Keyed on the PORT, not on a boolean: a renderer swap (the flag
        // switching hosts, a remount) leaves the count non-zero on both sides,
        // and a boolean check would leave the ticker on the renderer that just
        // went away — which reads as a viewport that has silently stopped
        // moving.
        const wanted = this.frameListeners.size > 0 ? this.rendererPort : null;
        if (wanted === this.tickingPort) return;

        this.unsubscribeFrame?.();
        this.unsubscribeFrame = null;
        this.tickingPort = wanted;
        if (wanted) {
            this.unsubscribeFrame = wanted.onFrame(() => this.emitFrame());
        }
    }

    /**
     * Deliver a frame tick. Isolated per listener: no core guard sits on the
     * renderer's event path, so one consumer's throw must not abort the rest
     * (or land inside the renderer's own dispatch).
     */
    private emitFrame(): void {
        for (const listener of [...this.frameListeners]) {
            try {
                listener();
            } catch (error) {
                logger.error('viewer frame listener failed', error);
            }
        }
    }

    // ---- The paint hook ------------------------------------------------------

    /**
     * How many times the layer list has changed — the one notifying signal the
     * registry needs.
     *
     * The renderer host watches it so a layer registered while the viewport is
     * idle is drawn immediately rather than at whatever unrelated repaint comes
     * next. It changes when a layer is added or removed, which is a handful of
     * times per session, so reactivity costs nothing here — where making the
     * LIST itself reactive would wake the batched state watcher from inside the
     * frame loop, sixty times a second, which is the cost the `frame` cadence
     * exists to avoid.
     *
     * @internal
     */
    paintLayerRevision: number = $state(0);

    /**
     * The registered paint layers, ordered.
     *
     * Held in viewer state rather than in the renderer host for two reasons: a
     * consumer may register a layer before any renderer has mounted, and a
     * renderer remount must not silently drop every layer.
     */
    private paintLayerRegistry = createPaintLayerRegistry({
        onChange: () => {
            this.paintLayerRevision += 1;
        },
        onRefused: (message) => logger.warn(message),
    });

    /**
     * Register an ordered layer drawn into the image surface each frame, after
     * the tiles, with the 2D context and the transform the tiles were drawn
     * with — so an overlay drawn here cannot desync from the image.
     *
     * Returns an idempotent unregister. A layer whose `id` is not a non-empty
     * string, whose `draw` is not a function, or whose `id` is already taken is
     * refused with a warning and a no-op unregister, so a caller never has to
     * branch on whether registration worked.
     *
     * Lower `order` draws first; layers sharing an `order` are called in
     * registration order. A layer that throws is reported once and skipped for
     * the rest of that frame; it never stops the renderer painting.
     *
     * **Painted pixels are invisible to assistive technology.** Anything a
     * reader must perceive or operate needs a DOM element with an accessible
     * name beside the picture — the canvas paints pixels, a parallel DOM layer
     * carries the focusable, labelled targets. A layer registered here is
     * decoration, or a second rendering of geometry the DOM already carries.
     *
     * The first-party renderer is the only renderer, so a registered layer is
     * always drawn once a host is mounted; before that, registration succeeds
     * and nothing is drawn, because there is no context to hand over yet.
     */
    registerPaintLayer(layer: PaintLayer): () => void {
        return this.paintLayerRegistry.register(layer);
    }

    /**
     * The layers to draw this frame, in call order. Read by the renderer host
     * once per frame.
     *
     * @internal
     */
    get paintLayers(): readonly RegisteredPaintLayer[] {
        return this.paintLayerRegistry.layers;
    }

    // ---- Overlay layers ------------------------------------------------------

    /**
     * How many times the overlay layer list has changed — the one notifying
     * signal that registry needs.
     *
     * Deliberately the same shape as {@link paintLayerRevision}, down to the
     * counter rather than a reactive list: the two registries are meant to be
     * structurally identical so there is one idiom to learn. The render site
     * touches this to establish a dependency and then returns
     * {@link overlayLayers}, which reads as a mistake to be tidied away unless
     * you know that is what the counter is for. It is.
     *
     * @internal
     */
    overlayLayerRevision: number = $state(0);

    /**
     * The registered overlay layers, in registration order.
     *
     * Held in viewer state rather than at the render site for two reasons: a
     * plugin may register a layer before any renderer has mounted, and a
     * renderer remount must not silently drop every layer.
     */
    private overlayLayerRegistry = createOverlayLayerRegistry({
        onChange: () => {
            this.overlayLayerRevision += 1;
        },
        // A refusal is an author error the developer must be told about, so it
        // goes out on the STRUCTURED channel as well as the debug log: `logger`
        // is a no-op unless `ViewerConfig.debug` is on, so a warning alone would
        // leave a plugin whose layer was refused rendering nothing, silently, in
        // every default viewer. Same shape as the other author-facing refusals
        // here (see `toggleFullScreen`): log for the console, report for the host.
        onRefused: (message) => {
            logger.warn(message);
            this.reportError({
                severity: 'warning',
                scope: 'plugin',
                code: 'overlay-layer-refused',
                message,
            });
        },
        // Answered from plugin UI state, NOT from the chrome records. Core mounts
        // a plugin's view before {@link registerSdkChrome} deliberately (a failed
        // mount renders no button), and a plugin registers its layer from inside
        // that mount — so `pluginMenuButtons` and friends do not know it yet,
        // while `ensurePluginUiState` has already seeded this. Validating against
        // the chrome would refuse every legitimate layer.
        isKnownPlugin: (pluginId) => this.pluginUiState.has(pluginId),
    });

    /**
     * Register a DOM container over the image, for a plugin to render into and
     * own.
     *
     * Core creates the container, places it in the viewer's stage beside the
     * renderer, and calls `mount` with it; the cleanup `mount` returns runs when
     * the layer is disposed. Returns an idempotent dispose, so releasing from
     * both a mount cleanup and a teardown path is safe.
     *
     * **`id` must be `` `${pluginId}:${name}` ``** — the plugin id this viewer
     * knows the caller by, the same convention its chrome ids follow. That is
     * what makes ids collision-free across plugins and lets
     * {@link unregisterPlugin} release a layer whose plugin forgot to. Releasing
     * it from the plugin's own `view.mount` cleanup remains the primary path;
     * unregistration is the backstop.
     *
     * A layer whose `id` names no known plugin, whose `mount` is not a function,
     * or whose `id` is already taken is refused and registers nothing; the
     * returned dispose is a no-op, so a caller never has to branch on whether
     * registration worked. A refusal is reported to the host on the structured
     * `viewererror` channel with code `overlay-layer-refused` and scope `plugin`
     * (and logged when `ViewerConfig.debug` is on) — it is an author error, and
     * the symptom without the report is a layer that renders nothing.
     *
     * **The container's origin is `canvasToScreen`'s origin**, so a plugin
     * positions an element straight from a projected point with no offset
     * correction. Re-placing on the `frame` cadence
     * ({@link subscribeFrame}) puts the write in the same frame the image is
     * painted in; re-placing after the plugin's own state changed is the
     * plugin's own `requestAnimationFrame`'s job.
     *
     * **The container is transparent to pointer events**; a plugin's children opt
     * in with `pointer-events: auto`, so the space between markers still pans the
     * image. A full-surface SVG (connector lines, for instance) must stay
     * transparent or it swallows every gesture.
     *
     * The container is created once on registration and removed once on dispose
     * — never remounted in between, including across a renderer remount, which
     * is what a manifest change causes. Registering before any renderer has
     * mounted is valid; the container exists regardless. Clearing content that
     * was scoped to the old manifest is the plugin's own concern, since core
     * cannot know which of a plugin's DOM that is.
     *
     * Layers render in registration order and stack below the viewer's own
     * annotation shapes. There is no ordering field: cross-plugin ordering
     * cannot be coordinated, and a plugin needing internal stacking uses one
     * container with `z-index` on its own children.
     */
    registerOverlayLayer(layer: OverlayLayer): () => void {
        return this.overlayLayerRegistry.register(layer);
    }

    /**
     * The registered layers, in registration order. Read by the render site.
     *
     * `@internal`, so it carries no contract — a test (core's own, or a plugin's)
     * that reads it back to prove register/release symmetry is reading an
     * internal, exactly as with {@link paintLayers}.
     *
     * @internal
     */
    get overlayLayers(): readonly RegisteredOverlayLayer[] {
        return this.overlayLayerRegistry.layers;
    }

    // ---- Transport chrome ----------------------------------------------------

    /**
     * How many times the registered transport chrome has changed — the one
     * notifying signal that registry needs, the same shape as
     * {@link overlayLayerRevision} and for the same reason.
     *
     * @internal
     */
    transportChromeRevision: number = $state(0);

    private transportChromeRegistry = createTransportChromeRegistry({
        onChange: () => {
            this.transportChromeRevision += 1;
        },
        onRefused: (message) => {
            logger.warn(message);
            this.reportError({
                severity: 'warning',
                scope: 'plugin',
                code: 'transport-chrome-refused',
                message,
            });
        },
        // Answered from plugin UI state, not from the chrome records, for the
        // reason `overlayLayerRegistry` gives above.
        isKnownPlugin: (pluginId) => this.pluginUiState.has(pluginId),
    });

    /**
     * Register **transport chrome**: a view model of playback facts and a port
     * of playback commands, which core renders as playback controls inside its
     * own control bar (CONTEXT.md **Transport chrome**).
     *
     * The seam is deliberately media-agnostic. Core learns about a thing that
     * plays, pauses, seeks and may offer alternative text tracks; it renders the
     * controls with its own primitives, in its own theme. The claimant supplies
     * the pictures (as the sanitized {@link IconDescriptor}s its toolbar buttons
     * already use) and every string, so its vocabulary and its locales stay its
     * own.
     *
     * **`id` must be `` `${pluginId}:${name}` ``**, the same convention the
     * plugin's chrome ids and overlay layers follow, so
     * {@link unregisterPlugin} can release chrome a plugin forgot. Chrome whose
     * id names no known plugin, or which is missing any of its members, or whose
     * id is already taken, is refused and registers nothing; the returned
     * dispose is a no-op, so a caller never has to branch. A refusal is reported
     * on the structured `viewererror` channel with code
     * `transport-chrome-refused`.
     *
     * `view()` is read on core's own cadence and its result is never held across
     * a frame; `subscribe` is how the claimant tells core to re-read. A view
     * with `present: false` renders no controls, which is the transient case
     * (the reader navigated to something this claimant does not drive) and is
     * why navigation does not churn the registration.
     *
     * **The bar renders one chrome.** With two live registrations the first
     * wins and the second is inert — there is no `order` field, for the reason
     * the overlay-layer registry gives.
     *
     * While chrome is registered the control bar spans its full available width
     * so the scrubber can take the slack. `nav.align` has nowhere to align in
     * that arrangement and is inert until the chrome deregisters; every other
     * bar setting — `controls`, `nav.style`, `nav.edge`, the inset — goes on
     * meaning what it meant.
     */
    registerTransportChrome(chrome: TransportChrome): () => void {
        return this.transportChromeRegistry.register(chrome);
    }

    /**
     * The registered chrome, in registration order. Read by the render site,
     * which renders the first.
     *
     * @internal
     */
    get transportChrome(): readonly RegisteredTransportChrome[] {
        return this.transportChromeRegistry.entries;
    }

    // ---- Canvas claims -------------------------------------------------------

    /**
     * The **canvas claim** set: canvas id → the plugin id owning that canvas's
     * non-image content (CONTEXT.md; ADR 0017).
     *
     * Reactive collection declared as a plain `Map` — see the note on the
     * `svelte/reactivity` import.
     */
    #claimedCanvases: Map<string, string> = new SvelteMap<string, string>();

    /**
     * Who holds which canvas, to read — never to write.
     *
     * Private behind a getter for the reason the overlay-layer registry is:
     * one claimant per canvas is an invariant {@link claimCanvas} maintains, and
     * a writable collection on the plugin-facing state object would let any
     * plugin holding `context.state` `set` itself over a canvas another plugin
     * is rendering into, or `clear` the lot. `ReadonlyViewerState` freezes the
     * property, not the collection behind it. Claim and release are the only
     * ways in.
     */
    get claimedCanvases(): ReadonlyMap<string, string> {
        return this.#claimedCanvases;
    }

    /**
     * Take ownership of one canvas's non-image content, for the plugin named by
     * `pluginId`. Returns an idempotent release.
     *
     * The claim suppresses exactly the **unsupported presentation** for that
     * canvas and its AV glyph in the thumbnail strip, leaving a clean box the
     * claimant renders over through the overlay-layer and paint-hook
     * substrates. It carries no payload and changes nothing else: core keeps
     * painting the canvas's IMAGE bodies through the whole tile pipeline —
     * which is what makes a composite image+video canvas compose — and layout,
     * navigation, residency, and coordinate projection are untouched.
     *
     * **One claimant per canvas.** A second claim is refused and reported on
     * the structured `viewererror` channel with code `canvas-claim-refused`,
     * exactly as a refused overlay layer is; the first claimant keeps the
     * canvas. Last-writer-wins would let a plugin silently take a canvas
     * another one is already rendering into.
     *
     * A claim against a canvas id the current manifest does not carry is
     * **inert and kept**, and applies if that id later appears: a plugin claims
     * from inside its own `view.mount`, which may well run before the manifest
     * it cares about is loaded.
     *
     * **`pluginId` must be the id this viewer knows the caller by** — the
     * activation's `surface.id`, the same id its chrome and its overlay-layer
     * ids are prefixed with — and a claim naming any other is refused, exactly
     * as an overlay layer whose id names no known plugin is. It is what lets
     * {@link unregisterPlugin} release a claim whose plugin forgot to, so a
     * departed plugin cannot suppress a treatment for the rest of the session;
     * a claim under a name nothing will ever unregister would outlive its
     * activation silently, leaving a canvas with no placard and nothing
     * rendering over it. Releasing from the plugin's own cleanup remains the
     * primary path.
     */
    claimCanvas(canvasId: string, pluginId: string): () => void {
        const canvas = typeof canvasId === 'string' ? canvasId.trim() : '';
        const owner = typeof pluginId === 'string' ? pluginId.trim() : '';
        if (!canvas || !owner) {
            this.refuseCanvasClaim(
                "claimCanvas needs a non-empty canvas id and the claiming plugin's id.",
            );
            return () => {};
        }

        // Answered from plugin UI state for the reason the overlay-layer
        // registry's `isKnownPlugin` is: it is seeded before a plugin's
        // `view.mount` runs — which is where a plugin claims from — while the
        // chrome records are not populated until after it.
        if (!this.pluginUiState.has(owner)) {
            this.refuseCanvasClaim(
                `claimCanvas ignored a claim on canvas "${canvas}" from "${owner}": the claimant must be a plugin of this viewer, so the claim is released when that plugin is.`,
            );
            return () => {};
        }

        const held = this.#claimedCanvases.get(canvas);
        if (held !== undefined) {
            this.refuseCanvasClaim(
                `claimCanvas ignored a second claim on canvas "${canvas}" from "${owner}"; it is already claimed by "${held}".`,
            );
            return () => {};
        }

        this.#claimedCanvases.set(canvas, owner);

        // Idempotent, and keyed on the claim still being THIS one: a release
        // that arrives after the claim was dropped by `unregisterPlugin` and
        // the canvas claimed afresh must not evict the new claimant.
        let released = false;
        return () => {
            if (released) return;
            released = true;
            if (this.#claimedCanvases.get(canvas) === owner) {
                this.#claimedCanvases.delete(canvas);
            }
        };
    }

    /** Whether a plugin owns this canvas's non-image content. */
    isCanvasClaimed(canvasId: string): boolean {
        return this.#claimedCanvases.has(canvasId);
    }

    /**
     * A refused claim is an author error the developer must be told about, so
     * it goes out on the structured channel as well as the debug log — the same
     * shape, and for the same reason, as a refused overlay layer.
     */
    private refuseCanvasClaim(message: string): void {
        logger.warn(message);
        this.reportError({
            severity: 'warning',
            scope: 'plugin',
            code: 'canvas-claim-refused',
            message,
        });
    }

    /** Zoom in one step, about the viewport centre. The toolbar's `+`. */
    zoomIn(): void {
        this.rendererPort?.zoomBy(this.zoomPerClick);
    }

    /** Zoom out one step, about the viewport centre. The toolbar's `−`. */
    zoomOut(): void {
        this.rendererPort?.zoomBy(1 / this.zoomPerClick);
    }

    /**
     * Zoom to an absolute scale — screen pixels per canvas-space unit, the same
     * units {@link viewportScale} reads. Clamped by the renderer to the zoom
     * range it derives from the layout; a caller cannot escape those limits.
     */
    zoomTo(scale: number): void {
        if (!Number.isFinite(scale) || scale <= 0) return;
        this.rendererPort?.zoomTo(scale);
    }

    /** Centre the viewport on a canvas-space point. */
    panTo(centre: ViewportPoint, canvasId?: string): void {
        this.rendererPort?.panTo(centre, canvasId);
    }

    /**
     * Fit a canvas-space box into the viewport.
     *
     * A degenerate or non-finite box is refused rather than obeyed, the same
     * way {@link zoomTo} refuses a scale that is not usable: a zero-width box
     * has no scale that frames it, and the arithmetic below would otherwise
     * fall through to a nominal one and teleport the viewport. The resulting
     * scale is clamped to the renderer's zoom range like every other one, so
     * this cannot be used to escape the limits {@link zoomTo} documents.
     */
    fitBounds(bounds: ViewportBox, canvasId?: string): void {
        if (
            !bounds ||
            !Number.isFinite(bounds.x) ||
            !Number.isFinite(bounds.y) ||
            !Number.isFinite(bounds.width) ||
            !Number.isFinite(bounds.height) ||
            bounds.width <= 0 ||
            bounds.height <= 0
        ) {
            return;
        }
        this.rendererPort?.fitBounds(bounds, canvasId);
    }

    /**
     * Fit a whole canvas — the current one unless named. The `0`/`Home` path,
     * and what canvas navigation does in continuous mode.
     */
    fitCanvas(canvasId?: string): void {
        this.rendererPort?.fitCanvas(canvasId);
    }

    /**
     * Apply image adjustments, merging over the current set. Members left out
     * keep their current value; {@link resetImageAdjustments} returns to
     * neutral.
     */
    setImageAdjustments(adjustments: Partial<ImageAdjustments>): void {
        const next: ImageAdjustments = {
            ...this.imageAdjustments,
            ...adjustments,
        };
        this.imageAdjustments = next;
        this.rendererPort?.applyImageAdjustments(next);
    }

    /**
     * Reserve edges of the surface for a plugin's own UI, merging over the
     * current inset. Edges left out keep their current value;
     * {@link resetViewportInset} returns them all to zero.
     *
     * **Fit targets only.** `fitCanvas`, `fitBounds`, and canvas navigation
     * frame their box into what is left of the surface; nothing else moves. Pan,
     * zoom, the coordinate helpers, and the viewport queries are about the whole
     * surface and stay that way — an overlay layer spans the full surface, so an
     * inset that changed the coordinate mapping would misplace every plugin's
     * markers.
     *
     * **This does not re-frame the current view**, deliberately: the next fit
     * uses the inset, and a plugin that wants to be re-framed now issues a fit
     * itself. Core animating the viewport because a panel opened would be
     * surprising, and wrong whenever the reader has deliberately zoomed in.
     *
     * A negative or non-finite edge is refused whole and logged — an author
     * error at any surface size, refused the way {@link zoomTo} refuses an
     * unusable scale. An inset that leaves no room on an axis is a different
     * matter: the window shrank, and that axis silently falls back to the full
     * surface at fit time, so a reader can always zoom out to a whole canvas.
     *
     * An edge given explicitly as `undefined` means the same as an omitted one.
     * `exactOptionalPropertyTypes` is off across this package, so
     * `setViewportInset({ bottom: open ? 200 : undefined })` type-checks and is
     * the first thing an author writes for a panel that toggles; spreading that
     * `undefined` over the stored edge would fail the finiteness check and
     * refuse the whole set, with a warning naming a problem the author does not
     * have.
     */
    setViewportInset(inset: Partial<ViewportInset>): void {
        const given = Object.fromEntries(
            Object.entries(inset).filter(([, value]) => value !== undefined),
        ) as Partial<ViewportInset>;
        const next: ViewportInset = { ...this.viewportInset, ...given };
        if (
            !Number.isFinite(next.top) ||
            !Number.isFinite(next.right) ||
            !Number.isFinite(next.bottom) ||
            !Number.isFinite(next.left) ||
            next.top < 0 ||
            next.right < 0 ||
            next.bottom < 0 ||
            next.left < 0
        ) {
            logger.warn(
                'setViewportInset ignored an inset with a negative or non-finite edge:',
                next,
            );
            return;
        }
        this.viewportInset = next;
    }

    /** Return every edge to zero — fits frame into the whole surface again. */
    resetViewportInset(): void {
        this.viewportInset = ZERO_VIEWPORT_INSET;
    }

    /** Return the image to exactly how it was decoded. */
    resetImageAdjustments(): void {
        this.imageAdjustments = NEUTRAL_IMAGE_ADJUSTMENTS;
        this.rendererPort?.applyImageAdjustments(NEUTRAL_IMAGE_ADJUSTMENTS);
    }

    // ---- Query-only viewport state ------------------------------------------
    //
    // Per-frame values, readable on demand and deliberately NON-notifying
    // (CONTEXT.md **Query-only state**): mirroring them into notifying state
    // would wake every subscriber on every pointer sample. Reading them
    // reactively is a `frame`-cadence selector — a cadence choice, not a
    // reclassification.

    /**
     * Screen pixels per canvas-space unit — the single number relating the two
     * spaces. `0` before a renderer has a sized surface.
     */
    get viewportScale(): number {
        return this.rendererPort?.getScale() ?? 0;
    }

    /**
     * The canvas-space point at the middle of the viewport, or `null` before a
     * renderer has a sized surface.
     */
    get viewportCentre(): ViewportPoint | null {
        return this.rendererPort?.getCentre() ?? null;
    }

    /**
     * The canvas-space box the viewport currently shows, or `null` before a
     * renderer has a sized surface. Extends past the canvas's own bounds when
     * the canvas is zoomed out far enough to sit inside the viewport.
     */
    get viewportBounds(): ViewportBox | null {
        return this.rendererPort?.getVisibleBounds() ?? null;
    }

    /**
     * The extent of a canvas's own coordinate space — the box a canvas-space
     * point runs from `(0, 0)` to — for the current canvas unless named, or
     * `null` when the mounted renderer does not lay that canvas out.
     *
     * Usually the manifest's declared size, and the reason it is asked rather
     * than read is the case where there is none. A Canvas may declare no
     * `width`/`height` — a duration-only audio canvas does not — and is still
     * laid out, from its siblings' median. Its rect is then its canvas space,
     * and this reports it, so a plugin placing DOM over such a canvas projects
     * the box the viewer is actually drawing instead of inventing dimensions
     * the coordinate helpers would then disagree with.
     */
    canvasSize(canvasId?: string): CanvasSize | null {
        return this.rendererPort?.getCanvasSize(canvasId) ?? null;
    }

    /**
     * The viewer surface's size in CSS pixels — what an export path asks in
     * order to request an image sized to what the reader is looking at. Zeroes
     * before the surface is measured.
     */
    get containerSize(): ContainerSize {
        return this.rendererPort?.getContainerSize() ?? { width: 0, height: 0 };
    }

    /**
     * Canvas space → screen space, for the current canvas unless named.
     *
     * `null` when there is no renderer, or when the named canvas is not one the
     * mounted renderer can place — never a point answered for a different
     * canvas.
     */
    canvasToScreen(
        point: ViewportPoint,
        canvasId?: string,
    ): ViewportPoint | null {
        return this.rendererPort?.canvasToScreen(point, canvasId) ?? null;
    }

    /** Screen space → canvas space, for the current canvas unless named. */
    screenToCanvas(
        point: ViewportPoint,
        canvasId?: string,
    ): ViewportPoint | null {
        return this.rendererPort?.screenToCanvas(point, canvasId) ?? null;
    }

    /** The configured multiplicative zoom step, with the shipped default. */
    private get zoomPerClick(): number {
        const configured = this.config?.renderer?.zoomPerClick;
        return typeof configured === 'number' &&
            Number.isFinite(configured) &&
            configured > 1
            ? configured
            : DEFAULT_ZOOM_PER_CLICK;
    }

    setSearchProvider(searchProvider: SearchProvider | null): void {
        this.searchProvider = searchProvider;
    }

    setManifestRequestConfig(requestConfig?: RequestConfig): void {
        this.manifestRequestConfig = requestConfig;
    }

    async setManifestData(
        manifestId: string,
        manifestJson: any,
        options?: { canvasId?: string },
    ): Promise<void> {
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
    startCanvasId: string | null = $state(null);

    /**
     * The media time the manifest's `start` named, held between parsing it and
     * the auto-selection that navigates to {@link startCanvasId}. Rewritten by
     * every manifest load, so it never outlives the start canvas it belongs to.
     */
    private startTemporalOffset: IiifTemporalFragment | null = null;

    async setManifest(
        manifestId: string,
        options?: { requestConfig?: RequestConfig; canvasId?: string },
    ) {
        this.manifestRequestConfig = options?.requestConfig;

        let json: any;
        try {
            json = await manifestsState.fetchResource(
                manifestId,
                this.manifestRequestConfig,
            );
        } catch (_error: any) {
            this.startCanvasId = null;
            this.selectedSequenceIndex = 0;
            await manifestsState.fetchManifest(
                manifestId,
                this.manifestRequestConfig,
            );
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

        if (isCollection(json)) {
            this.collectionId = manifestId;
            this.collectionLabel = getCollectionLabel(json);
            this.collectionThumbnail = getCollectionThumbnail(json) || '';
            this.collectionItems = sortCollectionItems(parseCollection(json));

            const firstManifest = this.collectionItems.find(
                (item) => item.type === 'Manifest',
            );
            if (firstManifest) {
                await this._loadManifest(firstManifest.id, options?.canvasId);
            }
            void this.hydrateCollectionItemThumbnails(manifestId);
            this.dispatchStateChange('manifestchange');
            return;
        }

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
    async loadCollectionManifest(manifestId: string) {
        await this._loadManifest(manifestId);
        this.dispatchStateChange('manifestchange');
    }

    /**
     * Internal: load a manifest by ID and apply its settings.
     */
    private async _loadManifest(manifestId: string, canvasId?: string) {
        this.startCanvasId = null;
        this.selectedSequenceIndex = 0;
        await manifestsState.fetchManifest(
            manifestId,
            this.manifestRequestConfig,
        );
        this.manifestId = manifestId;
        this.markManifestReady(manifestId);
        if (canvasId) {
            this.setCanvas(canvasId);
        }
        this._applyManifestSettings(manifestId);
        this.ensureInitialCanvasSelection();
    }

    private ensureInitialCanvasSelection() {
        const canvases = this.canvases;
        if (!canvases.length) {
            return;
        }

        if (
            this.canvasId &&
            findCanvasIndexById(canvases, this.canvasId) >= 0
        ) {
            return;
        }

        if (this.startCanvasId) {
            this.setCanvas(this.startCanvasId, this.startTemporalOffset);
            return;
        }

        const firstCanvasId = getCanvasId(canvases[0]);
        if (firstCanvasId) {
            this.setCanvas(firstCanvasId);
        }
    }

    private async hydrateCollectionItemThumbnails(collectionId: string) {
        const hydrationId = ++this.collectionThumbnailHydrationId;
        const manifestItems = this.collectionItems.filter(
            (item) => item.type === 'Manifest' && !item.thumbnail,
        );

        await Promise.allSettled(
            manifestItems.map(async (item) => {
                await manifestsState.fetchManifest(
                    item.id,
                    this.manifestRequestConfig,
                );

                if (
                    this.collectionId !== collectionId ||
                    this.collectionThumbnailHydrationId !== hydrationId
                ) {
                    return;
                }

                const firstCanvas = manifestsState.getCanvases(item.id)[0];
                const thumbnail = firstCanvas
                    ? getThumbnailSrc(firstCanvas)
                    : '';

                if (thumbnail) {
                    item.thumbnail = thumbnail;
                }
            }),
        );
    }

    /**
     * Apply manifest-level settings (start canvas, viewing direction, behavior).
     */
    private _applyManifestSettings(manifestId: string) {
        // Raw IIIF Manifest JSON, v2 or v3 as authored. Each of the three
        // scalars below reads BOTH versions' spellings first-party; the
        // `manifesto.js` fallback ladders that used to sit under them are gone.
        const rawManifest = manifestsState.getManifestEntry(manifestId)?.json;
        if (!rawManifest) return;

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
        this.startTemporalOffset = null;
        try {
            let startId: string | null = null;
            let startSelectorTime: IiifTemporalFragment | null = null;

            // IIIF v3 — `start` on the manifest itself.
            if (rawManifest?.start) {
                startId = getReferenceId(rawManifest.start);
                startSelectorTime = parseIiifSelectorTime(
                    rawManifest.start?.selector,
                );
            }

            // IIIF v2 — the start canvas hangs off the sequence.
            if (!startId) {
                startId = getReferenceId(rawSequence?.startCanvas);
            }

            if (startId) {
                // The start property may reference a canvas directly or include
                // a media fragment (e.g. canvas#t=...): the canvas resolves by
                // the stripped id, the time rides along to auto-selection.
                const canvasIdFromStart = startId.split('#')[0];
                // Verify this canvas exists in the manifest
                const canvases = manifestsState.getCanvases(manifestId);
                const exists = canvases.some(
                    (c: any) => getCanvasId(c) === canvasIdFromStart,
                );
                if (exists) {
                    this.startCanvasId = canvasIdFromStart;
                    // A SpecificResource selector and a `#t=` on the id are
                    // alternative spellings; the selector is the explicit one
                    // and wins in the (unattested) case of both.
                    this.startTemporalOffset =
                        startSelectorTime ?? parseIiifTime(startId);
                }
            }
        } catch (e) {
            logger.warn('Error parsing start canvas', e);
        }

        // 1. Viewing Direction
        let direction: string | null = null;
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
        } catch (e) {
            logger.warn('Error parsing viewing direction', e);
        }

        if (
            direction &&
            [
                'left-to-right',
                'right-to-left',
                'top-to-bottom',
                'bottom-to-top',
            ].includes(direction)
        ) {
            this.viewingDirection = direction as any;
        } else {
            this.viewingDirection = 'left-to-right';
        }

        // 2. Viewing Mode (Behavior)
        if (!this._viewingModeUserConfigured) {
            let behaviors: string[] = [];
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
            } catch (e) {
                logger.warn('Error parsing behavior', e);
            }

            if (behaviors.includes('continuous')) {
                this.viewingMode = 'continuous';
            } else if (
                behaviors.includes('individuals') ||
                behaviors.includes('non-paged')
            ) {
                this.viewingMode = 'individuals';
            } else if (
                behaviors.includes('paged') ||
                behaviors.includes('facing-pages')
            ) {
                this.viewingMode = 'paged';
            } else {
                this.viewingMode = 'individuals';
            }
        }
    }

    setCanvas(canvasId: string, temporalOffset?: IiifTemporalFragment | null) {
        this.canvasId = canvasId;
        this.temporalOffset = temporalOffset
            ? { canvasId, ...temporalOffset }
            : null;
        this.tileSourceError = null;

        if (this.showAnnotations) {
            this.clearAnnotationVisibility();
        }

        this.dispatchStateChange('canvaschange');
    }

    selectChoice(canvasId: string, choiceId: string) {
        this.selectedChoices.set(canvasId, choiceId);
        this.dispatchStateChange('choicechange');
    }

    getSelectedChoice(canvasId: string): string | undefined {
        return this.selectedChoices.get(canvasId);
    }

    updateConfig(newConfig: ViewerConfig) {
        const oldConfig = this.config;
        this.config = newConfig;

        if (newConfig.toolbarOpen !== undefined) {
            this.toolbarOpen = newConfig.toolbarOpen;
        }

        if (newConfig.viewingMode) {
            this.viewingMode = newConfig.viewingMode;
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

            if (
                newQuery !== undefined &&
                newQuery !== oldQuery &&
                newQuery !== this.searchQuery
            ) {
                this._performSearch(newQuery);
            }
        }

        if (newConfig.annotations) {
            if (newConfig.annotations.open !== undefined) {
                if (newConfig.annotations.open !== this.showAnnotations) {
                    this.setAnnotationsPanelOpen(newConfig.annotations.open);
                } else {
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
    private viewerElement: HTMLElement | null = null;

    setViewerElement(element: HTMLElement) {
        this.viewerElement = element;
    }

    /**
     * Resolve the viewer's style root — where a plugin's global CSS must be
     * installed. For a light-DOM (Svelte)
     * viewer this is the owning `Document`; for the Web Component it is the
     * shadow root, so plugin styles reach the shadow-scoped tree. Derived from
     * the mount element captured by {@link setViewerElement} via `getRootNode()`;
     * `null` before the element is mounted.
     */
    getStyleRoot(): Document | ShadowRoot | null {
        const root = this.viewerElement?.getRootNode();
        // nodeType 9 = DOCUMENT_NODE, 11 = DOCUMENT_FRAGMENT_NODE (shadow root);
        // nodeType is realm- and engine-safe where `instanceof` is not.
        if (root && (root.nodeType === 9 || root.nodeType === 11)) {
            return root as Document | ShadowRoot;
        }
        return null;
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            // Use stored reference if available, fallback to ID lookup (legacy/Svelte-only)
            const el =
                this.viewerElement ||
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
            } else {
                logger.warn(
                    'Cannot toggle fullscreen: Viewer element not found',
                );
                this.reportError({
                    severity: 'warning',
                    scope: 'viewport',
                    code: 'fullscreen-element-missing',
                    message:
                        'Cannot toggle fullscreen: viewer element not found.',
                });
            }
        } else {
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

    setSequenceIndex(index: number) {
        const maxIndex = Math.max(0, this.sequenceCount - 1);
        this.selectedSequenceIndex = Math.max(0, Math.min(index, maxIndex));

        const nextCanvases = this.canvases;
        const firstCanvas = nextCanvases[0];
        // Raw IIIF Canvas JSON: `id` in v3, `@id` in v2.
        this.canvasId = firstCanvas
            ? firstCanvas.id || firstCanvas['@id'] || null
            : null;
        this.startCanvasId = null;
        // A sequence switch is a navigation carrying no time. v2 sequences are
        // alternative orderings of the same canvases, so a stale offset would
        // often still name the canvas landed on and read as a live seek.
        this.temporalOffset = null;
        this.dispatchStateChange();
    }

    setInitialCanvasRegion(region: CanvasRegion | null) {
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
    get hasCollection(): boolean {
        return this.collectionId !== null && this.collectionItems.length > 0;
    }

    /**
     * Parsed IIIF structures (ranges / table of contents) from the current manifest.
     * Returns an empty array if no structures exist.
     */
    get structures(): StructureNode[] {
        // Raw manifest JSON. `parseStructures` reads `structures` off the
        // document itself and handles both the v2 (`sc:Range`) and the v3
        // (`Range`) spelling, so this is a plain-JSON read for both versions.
        const manifestJson = this.manifestEntry?.json;
        if (!manifestJson) return [];
        return parseStructures(manifestJson);
    }

    setViewingMode(mode: 'individuals' | 'paged' | 'continuous') {
        this.viewingMode = mode;
        if (mode === 'paged') {
            const groupIndex = this.getCurrentPagedCanvasGroupIndex();
            const canvasId =
                groupIndex >= 0
                    ? getPagedCanvasGroups(this.canvases, this.pagedOffset)[
                          groupIndex
                      ]?.entries[0]?.canvasId
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
        const canvasId =
            groupIndex >= 0
                ? getPagedCanvasGroups(this.canvases, this.pagedOffset)[
                      groupIndex
                  ]?.entries[0]?.canvasId
                : null;

        if (canvasId && this.canvasId !== canvasId) {
            this.setCanvas(canvasId);
        }
        this.dispatchStateChange();
    }

    searchQuery = $state('');
    pendingSearchQuery = $state<string | null>(null);
    searchResults: SearchResultGroup[] = $state([]);
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

    searchAnnotations: any[] = $state([]);

    /**
     * This function now accounts for two-page mode when returning current canvas search annotations offset accordingly.
     */
    /**
     * Search hits on the current canvas, in canvas space.
     *
     * Kept for callers that ask specifically about the current canvas. Core's own
     * annotation surfaces do NOT use it: they read {@link searchAnnotations} for
     * every canvas on screen through `collectCanvasAnnotations`, which is what
     * puts a hit on the facing page of a spread on that page.
     *
     * It used to shift a facing page's hits sideways by `canvasWidth * 1.025` and
     * hand them back as if they belonged to the current canvas — a hand-rolled
     * offset standing in for multi-canvas layout, and wrong by construction: the
     * renderer's inter-canvas gap is 1.25% of a page, not 2.5%, and the guess only
     * ever covered two pages. Coordinates here are now each hit's own, unshifted,
     * to be projected through its own canvas.
     */
    get currentCanvasSearchAnnotations() {
        if (!this.canvasId) return [];
        return this.searchAnnotations.filter(
            (a) => a.canvasId === this.canvasId,
        );
    }

    async search(query: string) {
        this.dispatchStateChange();
        await this._performSearch(query);
        this.dispatchStateChange();
    }

    private async _performSearch(query: string) {
        if (!query.trim()) return;
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
                this.searchAnnotations = buildSearchAnnotations(
                    this.searchResults,
                    this.canvases,
                );
                return;
            }

            const service = discoverSearchService(manifestJson);

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
            if (!response.ok) throw new Error('Search request failed');

            const data = await response.json();

            this.searchResults = parseSearchResponse(
                data,
                service.version,
                this.canvases,
            );
            this.searchAnnotations = buildSearchAnnotations(
                this.searchResults,
                this.canvases,
            );
        } catch (e) {
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
        } finally {
            // Only stop searching if we are NOT pending (i.e. we finished or failed, but didn't defer)
            if (!this.pendingSearchQuery) {
                this.isSearching = false;
            }
        }
    }

    // ==================== PARITY COMMANDS ====================
    // Supported mutation methods for viewer behaviors the parity rule requires
    // (see state-inventory.ts). The chrome calls these rather than writing the
    // fields directly, so each member has ONE write path and an invariant here
    // cannot be skipped by a component that assigns around it. Direct
    // assignment remains physically possible for trusted code (ADR 0007) and
    // still notifies, since notification is reactivity-driven rather than
    // command-driven (ADR 0008).
    //
    // They deliberately do NOT dispatch the legacy web-component `statechange`
    // event: these are hover- and drag-rate interactions, and the chrome never
    // dispatched for them.

    /** Set (or clear, with null) the currently hovered annotation id. */
    setHoveredAnnotationId(annotationId: string | null): void {
        this.hoveredAnnotationId = annotationId;
    }

    /**
     * Select an annotation, or clear the selection with `null`.
     *
     * Selecting one that is already selected clears it, so the same tap that
     * picks a shape also puts it down again.
     */
    setActiveAnnotationId(annotationId: string | null): void {
        this.activeAnnotationId =
            annotationId !== null && annotationId === this.activeAnnotationId
                ? null
                : annotationId;
    }

    /**
     * Show or hide a single annotation in the read-only overlay, marking
     * visibility as user-touched so the panel keeps the manual selection.
     */
    setAnnotationVisible(annotationId: string, visible: boolean): void {
        this.annotationVisibilityTouched = true;
        if (visible) {
            this.visibleAnnotationIds.add(annotationId);
        } else {
            this.visibleAnnotationIds.delete(annotationId);
        }
    }

    /**
     * Show or hide every toggleable annotation at once, marking visibility as
     * user-touched. The annotation panel's "toggle all".
     *
     * The set is every annotation the reader is looking at — one canvas in
     * `individuals`, the whole spread in `paged`, the folios the viewport meets
     * in `continuous` — minus search hits, which are always drawn and never
     * toggled. Reading only the current canvas, as this once did, left a facing
     * page's annotations untouched by a control that says "all".
     */
    setAllAnnotationsVisible(visible: boolean): void {
        if (visible) {
            this.showVisibleCanvasAnnotations();
        } else {
            this.visibleAnnotationIds.clear();
        }
        // After, not before: `showVisibleCanvasAnnotations` clears the flag.
        this.annotationVisibilityTouched = true;
    }

    /**
     * Expand the gallery to fill the viewer's center column as a thumbnail
     * grid, or collapse it back to its docked strip / floating window.
     *
     * Expanding implies opening: an expanded-but-hidden gallery is not a state
     * the UI can reach, so maintaining that invariant is why this is a command
     * rather than a field write. Collapsing leaves the gallery open.
     */
    setGalleryExpanded(expanded: boolean): void {
        this.galleryExpanded = expanded;
        if (expanded) {
            this.showThumbnailGallery = true;
        }
        this.dispatchStateChange();
    }

    /** Flip the gallery between expanded and collapsed (see {@link setGalleryExpanded}). */
    toggleGalleryExpanded(): void {
        this.setGalleryExpanded(!this.galleryExpanded);
    }

    /** Move the floating (undocked) thumbnail gallery to an absolute position. */
    setGalleryPosition(position: { x: number; y: number }): void {
        this.galleryPosition = position;
    }

    /** Resize the floating (undocked) thumbnail gallery. */
    setGallerySize(size: { width: number; height: number }): void {
        this.gallerySize = size;
    }

    /**
     * Dock the thumbnail gallery to a side ('top' | 'bottom' | 'left' |
     * 'right') or float it ('none'), keeping the derived docked flags in sync.
     * Maintaining that invariant is why this is a command, not a field write.
     */
    setDockSide(side: string): void {
        this.dockSide = side;
        this.isGalleryDockedBottom = side === 'bottom';
        this.isGalleryDockedRight = side === 'right';
    }

    // ==================== PLUGIN STATE ====================

    /** Plugin-registered menu buttons */
    pluginMenuButtons: PluginMenuButton[] = $state([]);

    /** Plugin-registered panels */
    pluginPanels: PluginPanel[] = $state([]);

    /** Plugin-registered flyouts (compact popovers anchored to the toolbar button) */
    pluginFlyouts: PluginFlyout[] = $state([]);

    /**
     * Per-viewer annotation-edit channel shared by the annotation shape overlay
     * and the annotation-editor plugin. Keeping this on ViewerState scopes edit requests and the
     * active edit id to one viewer instance instead of using global listeners.
     */
    annotationEditBus: {
        requestEdit: (annotationId: string) => void;
        activeEditAnnotationId: string | null;
    } = $state({
        requestEdit: (_annotationId: string) => {},
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
    private pluginUiState = new SvelteMap<
        string,
        {
            open: boolean;
            visible: boolean;
            target: PluginUiTarget;
            position: 'left' | 'right' | 'bottom' | 'overlay';
        }
    >();

    private getPluginUiConfig(pluginId: string): PluginUiConfig | undefined {
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
    ensurePluginUiState(
        pluginId: string,
        defaultTarget: PluginUiTarget = 'panel',
        defaultPosition: 'left' | 'right' | 'bottom' | 'overlay' = 'left',
    ): void {
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

    private applyPluginUiConfig(pluginId: string): void {
        const current = this.pluginUiState.get(pluginId);
        if (!current) return;

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
    getPluginTarget(pluginId: string): PluginUiTarget {
        return this.pluginUiState.get(pluginId)?.target ?? 'panel';
    }

    /**
     * Move a plugin between its panel and flyout chrome after mount — the
     * imperative sibling of {@link setPluginOpen}, and the same effect as setting
     * `config.plugins[id].target`. A no-op if the plugin is unknown or already on
     * `target`. Switching remounts the plugin's UI in the new container (see
     * {@link PluginUiConfig.target}).
     */
    setPluginTarget(pluginId: string, target: PluginUiTarget): void {
        const current = this.pluginUiState.get(pluginId);
        if (!current || current.target === target) return;

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
    getPluginPosition(
        pluginId: string,
    ): 'left' | 'right' | 'bottom' | 'overlay' {
        return this.pluginUiState.get(pluginId)?.position ?? 'left';
    }

    /**
     * Move a plugin's panel to a new dock position after mount — the
     * imperative sibling of {@link setPluginTarget}, and the same effect as
     * setting `config.plugins[id].position`. A no-op if the plugin is unknown
     * or already at `position`. Has no visible effect while the plugin's
     * effective target is `'flyout'` (see {@link PluginUiConfig.position}).
     */
    setPluginPosition(
        pluginId: string,
        position: 'left' | 'right' | 'bottom' | 'overlay',
    ): void {
        const current = this.pluginUiState.get(pluginId);
        if (!current || current.position === position) return;

        this.pluginUiState.set(pluginId, { ...current, position });
        this.dispatchStateChange();
    }

    private applyPluginUiConfigToAll(): void {
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
    isPluginOpen(pluginId: string): boolean {
        return this.pluginUiState.get(pluginId)?.open ?? false;
    }

    /**
     * Open or close a plugin's panel/flyout. A no-op (and no notification) if the
     * plugin is unknown or already in that state, matching
     * {@link setPluginTarget} / {@link setPluginPosition} — a redundant call must
     * not wake every plugin's subscription for a change that did not happen.
     */
    setPluginOpen(pluginId: string, open: boolean): void {
        const current = this.pluginUiState.get(pluginId);
        if (!current || current.open === open) return;

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
    togglePluginOpen(pluginId: string): void {
        const current = this.pluginUiState.get(pluginId);
        if (!current) return;

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
    closePluginFlyouts(): void {
        let changed = false;
        for (const flyout of this.pluginFlyouts) {
            // Every plugin registers both a panel and a flyout entry; only the
            // one matching the effective target is live. Skip flyouts whose
            // plugin is currently rendering as a panel — a panel is not
            // light-dismissed by an outside pointer-down.
            if (this.getPluginTarget(flyout.pluginId) !== 'flyout') continue;
            if (flyout.dismiss === 'explicit') continue;
            const current = this.pluginUiState.get(flyout.pluginId);
            if (current?.open) {
                this.pluginUiState.set(flyout.pluginId, {
                    ...current,
                    open: false,
                });
                changed = true;
            }
        }
        if (changed) this.dispatchStateChange();
    }

    // ==================== PLUGIN METHODS ====================

    /**
     * Register the toolbar chrome for an SDK plugin on the core-owned-chrome path.
     * Core renders the button
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
    }): void {
        const { id, name, label, icon, target, dismiss, mount } = config;

        this.ensurePluginUiState(id, target, config.position ?? 'left');

        const domId = `tri-flyout-${id}`;

        // Always carries `flyoutDomId`; the toolbar anchors the flyout only when
        // the effective target is 'flyout'. Both a panel and a flyout entry are
        // always registered, so the effective target can change reactively after
        // mount without re-registering (like `open`/`visible`).
        const button: PluginMenuButton = {
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
        const flyout: PluginFlyout = {
            id: `${id}:flyout`,
            domId,
            pluginId: id,
            name,
            label,
            iconDescriptor: icon,
            mount,
            dismiss,
        };

        const panel: PluginPanel = {
            id: `${id}:panel`,
            pluginId: id,
            name,
            label,
            iconDescriptor: icon,
            mount,
            isVisible: () =>
                this.getPluginTarget(id) === 'panel' && this.isPluginOpen(id),
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
     *
     * Its **overlay layers**, its **canvas claims** and its **published state**
     * are the exception, and are released here: a layer is DOM on the image, so
     * a plugin whose cleanup misses its dispose would leave orphaned markers
     * sitting over the picture with nothing left to remove them; a claim left
     * behind would suppress a canvas's unsupported presentation for the rest of
     * the session with nothing rendering in its place; and a published state
     * left behind would hand hosts a live command surface addressing a
     * torn-down plugin. All three name their plugin
     * ({@link registerOverlayLayer}, {@link claimCanvas},
     * {@link publishPluginState}), which is what makes that possible.
     *
     * This is the backstop, not the documented path — a plugin releases its own
     * layers, claims and publication from its `view.mount` cleanup — and it is
     * where the claim's and the publication's "released when the activation
     * ends" contract is honoured,
     * because the viewer takes this path on deactivation, on retry, and on a
     * failed setup or mount alike. Doing both is safe: every dispose is
     * idempotent.
     */
    unregisterPlugin(pluginId: string): void {
        this.pluginMenuButtons = this.pluginMenuButtons.filter(
            (b) => !b.id.startsWith(`${pluginId}:`),
        );
        this.pluginPanels = this.pluginPanels.filter(
            (p) => !p.id.startsWith(`${pluginId}:`),
        );
        this.pluginFlyouts = this.pluginFlyouts.filter(
            (f) => !f.id.startsWith(`${pluginId}:`),
        );
        this.overlayLayerRegistry.disposeOwnedBy(pluginId);
        this.transportChromeRegistry.disposeOwnedBy(pluginId);
        for (const [canvasId, owner] of [...this.#claimedCanvases]) {
            if (owner === pluginId) this.#claimedCanvases.delete(canvasId);
        }
        this.publishedPluginStates.delete(pluginId);
        this.pluginUiState.delete(pluginId);
    }

    /**
     * Cleanup everything.
     *
     * Including every overlay layer, every canvas claim and every published
     * state, for the reason {@link unregisterPlugin} gives.
     */
    destroyAllPlugins(): void {
        this.pluginMenuButtons = [];
        this.pluginPanels = [];
        this.pluginFlyouts = [];
        this.overlayLayerRegistry.disposeAll();
        this.transportChromeRegistry.disposeAll();
        this.#claimedCanvases.clear();
        this.publishedPluginStates.clear();
        this.pluginUiState.clear();
    }

    // ---- Published plugin state (ADR 0018) -----------------------------------
    //
    // A plugin whose UI performs actions must make them externally commandable —
    // the parity rule does not stop at core's own chrome. An activation
    // therefore publishes ONE state object here, and hosts reach it only through
    // {@link getPluginState}: ViewerState stays the sole state surface, and core
    // ships no commands it cannot implement. Core never reads INTO a published
    // object — its members, their classification, and their notification are the
    // publishing plugin's contract, checked by the SDK's conformance kit.

    /**
     * Published state by plugin id. A reactive map so publish and retire wake
     * the batched watcher: the set of published ids is what a wrapper observes
     * to decide whether to render a plugin's controls at all.
     */
    private publishedPluginStates = new SvelteMap<string, unknown>();

    /**
     * Publish this activation's state object under the plugin id this viewer
     * knows it by (the same `<pluginId>` its chrome and overlay-layer ids carry).
     *
     * At most one per plugin, and the id is FIRST COME: publishing over an id
     * that already holds someone else's object is refused, registers nothing,
     * and returns a no-op handle, so a caller never has to branch on whether it
     * worked. Retiring is what frees the id — which is why the SDK's own
     * `context.publishState` retires before it publishes, and so gets the
     * documented "publishing again replaces the previous object" for free.
     * Without the refusal a second publication would silently orphan the first:
     * its retire handle, being identity-based, would no-op forever and its
     * object would stay reachable under an id it no longer owns. A refusal is
     * reported to the host on the structured `viewererror` channel with code
     * `plugin-state-refused` and scope `plugin`, the same way a refused overlay
     * layer is (see {@link registerOverlayLayer}) — it is an author error whose
     * only other symptom is a host commanding the wrong object.
     *
     * The returned retire handle is idempotent and identity-checked, so a plugin
     * that re-published and later runs its original cleanup does not retire its
     * own successor. {@link unregisterPlugin} and {@link destroyAllPlugins}
     * retire whatever is still published, the same backstop overlay layers get —
     * but the activation's own cleanup is the documented path, because that is
     * what makes the state absent the moment the activation is.
     */
    publishPluginState(pluginId: string, published: unknown): () => void {
        if (
            this.publishedPluginStates.has(pluginId) &&
            this.publishedPluginStates.get(pluginId) !== published
        ) {
            const message = `Plugin "${pluginId}" already has published state; this publication was refused. Retire the first before publishing again.`;
            logger.warn(message);
            this.reportError({
                severity: 'warning',
                scope: 'plugin',
                code: 'plugin-state-refused',
                message,
            });
            return () => {};
        }

        this.publishedPluginStates.set(pluginId, published);
        let retired = false;
        return () => {
            if (retired) return;
            retired = true;
            if (this.publishedPluginStates.get(pluginId) === published) {
                this.publishedPluginStates.delete(pluginId);
            }
        };
    }

    /**
     * The state a plugin has published, or `null` when it has published none —
     * which is the answer whenever its activation is absent, failed, or
     * retrying, since a publication lives exactly as long as its activation.
     *
     * Deliberately `unknown`: the concrete interface (`AVState`, say) and a
     * typed accessor ship in the plugin package a host commanding that plugin
     * already depends on. Core never grows a union of every plugin's state type.
     */
    getPluginState(pluginId: string): unknown {
        return this.publishedPluginStates.get(pluginId) ?? null;
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
    // Selectors and `pluginerror` attribution build on top of this;
    // `invokeSubscriptionListener` is the guarded call site for delivery.

    /**
     * Inventoried members whose changes wake subscribers: `command` and
     * `observable` members notify; `internal` and `query-only` members never do.
     *
     * The list is GENERATED from `state-inventory.ts` at build time rather than
     * derived from it here, because that derivation pulled the inventory's
     * review prose — classifications, mutator lists, and 72 explanatory notes —
     * into the shipped bundle for the sake of ~49 strings. Generating it means
     * the inventory is the single source: adding or reclassifying a member is
     * one edit, and drift is not expressible rather than merely tested for.
     */
    private static readonly WATCHED_MEMBERS: readonly string[] =
        NOTIFYING_MEMBERS;

    // These are ECMAScript #private fields (not TS `private`) on purpose: they
    // carry no plugin contract and must stay invisible to the state inventory's
    // enumerable-member reflection, so no `state-inventory.ts` entry is needed.

    /**
     * Registered subscription listeners, kept in registration order. Each entry
     * pairs the listener with an optional per-subscription error handler:
     * when the listener throws, the guard routes to `onError` if
     * present so the SDK can attribute the failure to the owning plugin
     * (`pluginerror` phase `subscription`); otherwise it falls back to a console
     * error. Core's own subscriptions register no `onError` and keep the
     * console-error behavior.
     */
    #subscriptionListeners: Array<{
        listener: () => void;
        onError?: (error: unknown) => void;
    }> = [];

    /** Disposes the reactive watcher's effect root; null until lazily started. */
    #disposeSubscriptionWatcher: (() => void) | null = null;

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
     * `onError` is called with the thrown value if this listener
     * throws during delivery; the throw never stops other listeners or core's
     * own reactions. The SDK passes one per activation so a throwing listener is
     * attributed to its owning plugin (`pluginerror` phase `subscription`).
     */
    subscribe(
        listener: () => void,
        onError?: (error: unknown) => void,
    ): () => void {
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
    private startSubscriptionWatcher(): void {
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
                } else {
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
        } catch {
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
    private trackWatchedMembers(): void {
        const self = this as unknown as Record<string, unknown>;
        for (const member of ViewerState.WATCHED_MEMBERS) {
            const value = self[member];
            if (value instanceof SvelteSet || value instanceof SvelteMap) {
                value.keys();
            }
        }
    }

    private notifySubscribers(): void {
        // Snapshot so a listener that (un)subscribes during delivery does not
        // disturb this pass; a newly added listener sees the next notification.
        for (const entry of [...this.#subscriptionListeners]) {
            this.invokeSubscriptionListener(entry);
        }
    }

    /**
     * Single guarded call site for a subscription listener: a
     * throwing listener is isolated so the remaining listeners and core's own
     * reactions still run. The failure is routed to the listener's own
     * `onError` when one was registered — the SDK uses this to attribute the
     * throw to the owning plugin and raise `pluginerror` phase `subscription` —
     * and otherwise falls back to a console error. `onError` itself is guarded
     * so a faulty reporter cannot break delivery either.
     */
    private invokeSubscriptionListener(entry: {
        listener: () => void;
        onError?: (error: unknown) => void;
    }): void {
        try {
            entry.listener();
        } catch (error) {
            if (entry.onError) {
                try {
                    entry.onError(error);
                } catch (reportError) {
                    // triiiceratops-console-allow: subscription
                    // isolation last-resort fallback (tested in
                    // viewer.subscribe.onError.test.ts). A throwing error
                    // reporter has no other channel; delivery must continue.
                    console.error(
                        '[ViewerState] A subscription error reporter threw; delivery continues.',
                        reportError,
                    );
                }
            } else {
                // triiiceratops-console-allow: subscription isolation
                // last-resort fallback (tested in
                // viewer.subscribe.onError.test.ts). An unguarded listener throw
                // with no `onError` reporter has no structured channel.
                console.error(
                    '[ViewerState] A subscription listener threw; other listeners are unaffected.',
                    error,
                );
            }
        }
    }

    /**
     * Tear down this viewer state: dispose the subscription watcher's effect
     * root, drop all listeners, and release plugin registrations. After destroy
     * no further notifications are delivered. Idempotent.
     */
    destroy(): void {
        this.#disposeSubscriptionWatcher?.();
        this.#disposeSubscriptionWatcher = null;
        this.#subscriptionWatcherPrimed = false;
        this.#subscriptionListeners = [];
        this.destroyAllPlugins();
    }
}

// Context key for providing/injecting ViewerState in components
export const VIEWER_STATE_KEY = 'triiiceratops:viewerState';
