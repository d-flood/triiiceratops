import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import { manifestsState } from './manifests.svelte.js';
import type {
    PluginUiConfig,
    RequestConfig,
    SearchProvider,
    SearchResultGroup,
    ViewerConfig,
} from '../types/config';

import type { PluginMenuButton, PluginPanel, PluginDef } from '../types/plugin';
import { parseStructures, type StructureNode } from '../utils/structures';
import {
    isCollection,
    parseCollection,
    getCollectionLabel,
    getCollectionThumbnail,
    sortCollectionItems,
    type CollectionItem,
} from '../utils/collections';
import type { CanvasRegion } from '../utils/contentState';
import {
    getCanvasId,
    getPagedCanvasGroups,
    getVisibleCanvasEntries,
} from '../components/viewerControls';
import { getThumbnailSrc } from '../utils/getThumbnailSrc';

function normalizeIiifBehavior(value: unknown): string {
    const normalized = String(value).trim().toLowerCase();
    const segments = normalized.split(/[#/:]/);
    return segments[segments.length - 1] || normalized;
}

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
    dockSide = $state('bottom');
    visibleAnnotationIds = new SvelteSet<string>();
    annotationVisibilityTouched = $state(false);
    hoveredAnnotationId = $state<string | null>(null);

    private getAnnotationId(annotation: any): string {
        return (
            annotation?.id ||
            annotation?.['@id'] ||
            (typeof annotation?.getId === 'function'
                ? annotation.getId()
                : '') ||
            ''
        );
    }

    showCurrentCanvasAnnotations() {
        this.clearAnnotationVisibility();

        if (!this.manifestId || !this.canvasId) {
            return;
        }

        const annotations = manifestsState.getAnnotations(
            this.manifestId,
            this.canvasId,
        );

        annotations.forEach((annotation: any) => {
            const id = this.getAnnotationId(annotation);
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

    // Map of canvasId -> selected choiceId (Content State)
    selectedChoices = new SvelteMap<string, string>();
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

    get galleryFixedHeight() {
        return this.config.gallery?.fixedHeight ?? 120;
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
        // Also sync to config for consistency
        this.config.viewingMode = value;
    }

    // Pairing offset for paged mode: 0 = default (pairs start at 1+2), 1 = shifted (page 1 alone, pairs start at 2+3)
    pagedOffset = $state(1);

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
     * Get current state as a plain object snapshot.
     * Safe to use outside Svelte's reactive system.
     * NOTE: We calculate currentCanvasIndex inline to avoid triggering the canvases getter
     * which can cause infinite loops when it auto-sets canvasId.
     */
    getSnapshot(): ViewerStateSnapshot {
        // Calculate canvas index without triggering reactive side effects
        let canvasIndex = -1;
        if (this.manifestId && this.canvasId) {
            const canvases = manifestsState.getCanvases(this.manifestId);
            canvasIndex = canvases.findIndex((c: any) => {
                const id =
                    c.id ||
                    c['@id'] ||
                    (c.getCanvasId ? c.getCanvasId() : null) ||
                    (c.getId ? c.getId() : null);
                return id === this.canvasId;
            });
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
        console.log(
            `[ViewerState] Dispatching ${eventName}`,
            JSON.stringify(this.getSnapshot()),
        );
        if (!this.eventTarget) return;

        // Dispatch asynchronously to break reactive loops
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
        initialPlugins: PluginDef[] = [],
    ) {
        this.manifestId = initialManifestId || null;
        this.canvasId = initialCanvasId || null;
        // Fetch manifest immediately
        if (this.manifestId) {
            manifestsState.fetchManifest(
                this.manifestId,
                this.manifestRequestConfig,
            );
        }

        // Register initial plugins
        for (const initialPlugin of initialPlugins) {
            this.registerPlugin(initialPlugin);
        }
    }

    get manifest() {
        if (!this.manifestId) return null;
        return manifestsState.getManifest(this.manifestId);
    }

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

        // Auto-initialize canvasId to first canvas if not set

        return canvases;
    }

    get sequenceCount() {
        if (!this.manifestId) return 0;
        return manifestsState.getSequenceCount(this.manifestId);
    }

    get currentCanvasIndex() {
        if (!this.canvasId) {
            if (this.canvases.length > 0) return 0;
            return -1;
        }

        // Manifesto canvases have an id property, but let's be robust and check multiple possibilities
        return this.canvases.findIndex((c: any) => {
            const id =
                c.id ||
                c['@id'] ||
                (c.getCanvasId ? c.getCanvasId() : null) ||
                (c.getId ? c.getId() : null);
            return id === this.canvasId;
        });
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

    setSearchProvider(searchProvider: SearchProvider | null): void {
        this.searchProvider = searchProvider;
    }

    setManifestRequestConfig(requestConfig?: RequestConfig): void {
        this.manifestRequestConfig = requestConfig;
    }

    async setManifestData(
        manifestId: string,
        manifestJson: any,
    ): Promise<void> {
        this.canvasId = null;
        this.startCanvasId = null;
        this.selectedSequenceIndex = 0;
        await manifestsState.registerManifest(manifestId, manifestJson);
        this.manifestId = manifestId;
        this._applyManifestSettings(manifestId);
        this.ensureInitialCanvasSelection();
    }

    /**
     * The canvas ID specified by the manifest's `start` property (IIIF Presentation 3.0).
     * Used during auto-selection to navigate to the correct initial canvas.
     * Only set once per manifest load; cleared when a new manifest is set.
     */
    startCanvasId: string | null = $state(null);

    async setManifest(
        manifestId: string,
        options?: { requestConfig?: RequestConfig },
    ) {
        this.manifestRequestConfig = options?.requestConfig;

        // Fetch the raw JSON first to detect if it's a Collection
        let json: any;
        try {
            json = await manifestsState.fetchResource(
                manifestId,
                this.manifestRequestConfig,
            );
        } catch (_error: any) {
            // If fetch fails, fall back to normal flow which will handle the error
            this.canvasId = null;
            this.startCanvasId = null;
            this.selectedSequenceIndex = 0;
            await manifestsState.fetchManifest(
                manifestId,
                this.manifestRequestConfig,
            );
            this.manifestId = manifestId;
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
            void this.hydrateCollectionItemThumbnails(manifestId);

            // Auto-load the first manifest in the collection
            const firstManifest = this.collectionItems.find(
                (item) => item.type === 'Manifest',
            );
            if (firstManifest) {
                await this._loadManifest(firstManifest.id);
            }
            this.dispatchStateChange('manifestchange');
            return;
        }

        // Normal manifest flow: register the already-fetched JSON
        this.collectionId = null;
        this.collectionLabel = '';
        this.collectionThumbnail = '';
        this.collectionItems = [];
        this.collectionThumbnailHydrationId += 1;
        this.canvasId = null;
        this.startCanvasId = null;
        await manifestsState.registerManifest(manifestId, json);
        this.manifestId = manifestId;
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
    private async _loadManifest(manifestId: string) {
        this.canvasId = null;
        this.startCanvasId = null;
        this.selectedSequenceIndex = 0;
        await manifestsState.fetchManifest(
            manifestId,
            this.manifestRequestConfig,
        );
        this.manifestId = manifestId;
        this._applyManifestSettings(manifestId);
        this.ensureInitialCanvasSelection();
    }

    private ensureInitialCanvasSelection() {
        if (this.canvasId) {
            return;
        }

        const canvases = this.canvases;
        if (!canvases.length) {
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
        const manifest = manifestsState.getManifest(manifestId);
        if (!manifest) return;

        // 0. Start Canvas (IIIF Presentation 3.0 `start` property)
        try {
            let startId: string | null = null;

            // Check raw JSON first (most reliable for IIIF v3)
            if (manifest.__jsonld?.start) {
                const startObj = manifest.__jsonld.start;
                if (typeof startObj === 'string') {
                    startId = startObj;
                } else if (startObj.id) {
                    startId = startObj.id;
                } else if (startObj['@id']) {
                    startId = startObj['@id'];
                }
            }

            // Fallback: check manifesto accessor
            if (!startId && manifest.getStartCanvas) {
                const sc = manifest.getStartCanvas();
                if (sc) {
                    startId = sc.id || sc['@id'] || null;
                }
            }

            if (startId) {
                // The start property may reference a canvas directly or include
                // a fragment selector (e.g. canvas#t=...). Extract the canvas ID.
                const canvasIdFromStart = startId.split('#')[0];
                // Verify this canvas exists in the manifest
                const canvases = manifestsState.getCanvases(manifestId);
                const exists = canvases.some(
                    (c: any) => getCanvasId(c) === canvasIdFromStart,
                );
                if (exists) {
                    this.startCanvasId = canvasIdFromStart;
                }
            }
        } catch (e) {
            console.warn('Error parsing start canvas', e);
        }

        // 1. Viewing Direction
        let direction: string | null = null;
        try {
            // Check manifest root first
            if (manifest.getViewingDirection) {
                const d = manifest.getViewingDirection();
                if (d) direction = String(d);
            }
            if (!direction && manifest.__jsonld) {
                direction = manifest.__jsonld.viewingDirection;
            }
            // Check sequence if not found (IIIF v2)
            if (!direction) {
                const seq = manifest.getSequences()?.[0];
                if (seq) {
                    if (seq.getViewingDirection) {
                        const d = seq.getViewingDirection();
                        if (d) direction = String(d);
                    }
                    if (!direction && seq.__jsonld) {
                        direction = seq.__jsonld.viewingDirection;
                    }
                }
            }
        } catch (e) {
            console.warn('Error parsing viewing direction', e);
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
            this.viewingDirection = 'left-to-right'; // Default
        }

        // 2. Viewing Mode (Behavior)
        // Only auto-detect from manifest if user hasn't explicitly configured viewingMode
        if (!this._viewingModeUserConfigured) {
            let behaviors: string[] = [];
            try {
                // Check manifest root
                if (manifest.__jsonld && manifest.__jsonld.behavior) {
                    const b = manifest.__jsonld.behavior;
                    behaviors = Array.isArray(b) ? b : [b];
                }

                // Manifesto accessor
                if (behaviors.length === 0 && manifest.getBehavior) {
                    const b = manifest.getBehavior();
                    if (b) {
                        behaviors = Array.isArray(b) ? b : [b];
                    }
                }

                // Check sequence behavior
                const seq = manifest.getSequences()?.[0];
                if (seq) {
                    if (seq.getBehavior) {
                        const b = seq.getBehavior();
                        if (b) {
                            behaviors = behaviors.concat(
                                Array.isArray(b) ? b : [b],
                            );
                        }
                    }

                    if (seq.__jsonld && seq.__jsonld.behavior) {
                        const b = seq.__jsonld.behavior;
                        behaviors = behaviors.concat(
                            Array.isArray(b) ? b : [b],
                        );
                    }
                }

                behaviors = behaviors.map(normalizeIiifBehavior);
            } catch (e) {
                console.warn('Error parsing behavior', e);
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
                // Default to 'individuals' when no behavior is specified in manifest
                this.viewingMode = 'individuals';
            }
        }
    }

    setCanvas(canvasId: string) {
        this.canvasId = canvasId;
        this.tileSourceError = null;

        if (this.showAnnotations) {
            this.clearAnnotationVisibility();
        }

        this.dispatchStateChange('canvaschange');
    }

    selectChoice(canvasId: string, choiceId: string) {
        this.selectedChoices.set(canvasId, choiceId);
        // Force reactivity for $derived blocks that depend on the map
        // Reassigning the map is one way, or using fine-grained signals.
        // Svelte 5 map is reactive, but let's ensure dependent derivations see it.
        // We might need to "bump" a version signal if derivations don't pick it up automatically
        // but they should if they use get().

        this.dispatchStateChange('choicechange');
    }

    getSelectedChoice(canvasId: string): string | undefined {
        return this.selectedChoices.get(canvasId);
    }

    updateConfig(newConfig: ViewerConfig) {
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

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            // Use stored reference if available, fallback to ID lookup (legacy/Svelte-only)
            const el =
                this.viewerElement ||
                document.getElementById('triiiceratops-viewer');
            if (el) {
                el.requestFullscreen().catch((e) => {
                    console.warn('Fullscreen request failed', e);
                });
            } else {
                console.warn(
                    'Cannot toggle fullscreen: Viewer element not found',
                );
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
        this.canvasId = firstCanvas
            ? firstCanvas.id ||
              firstCanvas['@id'] ||
              (firstCanvas.getCanvasId ? firstCanvas.getCanvasId() : null) ||
              (firstCanvas.getId ? firstCanvas.getId() : null)
            : null;
        this.startCanvasId = null;
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
        const manifest = this.manifest;
        if (!manifest) return [];
        return parseStructures(manifest);
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
    get currentCanvasSearchAnnotations() {
        if (!this.canvasId) return [];
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
            let annotations = this.searchAnnotations.filter(
                (a) => a.canvasId === firstEntry.canvasId,
            );

            if (secondEntry) {
                const xOffset = 1.025; // account for small gap between pages
                const annoOffset = firstEntry.canvas.getWidth() * xOffset;
                const nextAnnotations = this.searchAnnotations.filter(
                    (a) => a.canvasId === secondEntry.canvasId,
                );

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
        } else {
            return this.searchAnnotations.filter(
                (a) => a.canvasId === this.canvasId,
            );
        }
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
            const manifest = this.manifest;
            if (!manifest) {
                // Defer search until manifest is loaded
                console.log(
                    '[ViewerState] Manifest not loaded, deferring search:',
                    query,
                );
                this.pendingSearchQuery = query;
                return;
            }

            if (this.searchProvider && this.manifestId) {
                this.searchResults = await this.searchProvider(query, {
                    manifestId: this.manifestId,
                    manifest,
                    canvases: this.canvases,
                    canvasId: this.canvasId,
                });
                this.searchAnnotations = this.buildSearchAnnotations(
                    this.searchResults,
                );
                return;
            }

            const service = this.discoverSearchService(manifest);

            if (!service) {
                console.warn('No IIIF search service found in manifest');
                this.isSearching = false;
                return;
            }

            const searchUrl = `${service.serviceId}?q=${encodeURIComponent(query)}`;

            const response = await fetch(searchUrl);
            if (!response.ok) throw new Error('Search request failed');

            const data = await response.json();

            if (service.version === 2) {
                this.searchResults = this.parseV2SearchResponse(data);
            } else {
                this.searchResults = this.parseLegacySearchResponse(data);
            }

            this.searchAnnotations = this.buildSearchAnnotations(
                this.searchResults,
            );
        } catch (e) {
            console.error('Search error:', e);
            this.isSearching = false;
        } finally {
            // Only stop searching if we are NOT pending (i.e. we finished or failed, but didn't defer)
            if (!this.pendingSearchQuery) {
                this.isSearching = false;
            }
        }
    }

    /**
     * Discover a IIIF Content Search service from the manifest.
     * Supports v0, v1, and v2 services. Prefers v2 when multiple are present.
     */
    private discoverSearchService(
        manifest: any,
    ): { version: 0 | 1 | 2; serviceId: string } | null {
        // First try manifesto's getService for v1/v0
        const v1Service =
            manifest.getService('http://iiif.io/api/search/1/search') ||
            manifest.getService('http://iiif.io/api/search/0/search');

        // Check raw JSON for v2 (and v1/v0 fallback)
        let v2Service: any = null;
        let rawV1Service: any = null;

        if (manifest.__jsonld && manifest.__jsonld.service) {
            const services = Array.isArray(manifest.__jsonld.service)
                ? manifest.__jsonld.service
                : [manifest.__jsonld.service];

            for (const s of services) {
                const sType = s.type || s['@type'];
                if (sType === 'SearchService2') {
                    v2Service = s;
                } else if (
                    !rawV1Service &&
                    (s.profile === 'http://iiif.io/api/search/1/search' ||
                        sType === 'SearchService1' ||
                        s.profile === 'http://iiif.io/api/search/0/search')
                ) {
                    rawV1Service = s;
                }
            }
        }

        // Prefer v2 over v1/v0
        if (v2Service) {
            return {
                version: 2,
                serviceId: v2Service.id || v2Service['@id'],
            };
        }

        if (v1Service) {
            const serviceId = v1Service.id || v1Service['@id'];
            const profile = v1Service.profile || '';
            const version: 0 | 1 =
                profile === 'http://iiif.io/api/search/0/search' ? 0 : 1;
            return { version, serviceId };
        }

        if (rawV1Service) {
            const serviceId = rawV1Service.id || rawV1Service['@id'];
            const profile = rawV1Service.profile || '';
            const version: 0 | 1 =
                profile === 'http://iiif.io/api/search/0/search' ? 0 : 1;
            return { version, serviceId };
        }

        return null;
    }

    /** Helper to parse xywh coordinates from an annotation target */
    private parseXywhSelector(onVal: string | any): number[] | null {
        const val =
            typeof onVal === 'string' ? onVal : onVal['@id'] || onVal.id;
        if (!val) return null;
        const parts = val.split('#xywh=');
        if (parts.length < 2) return null;
        const coords = parts[1].split(',').map(Number);
        if (coords.length === 4) return coords; // [x, y, w, h]
        return null;
    }

    /** Helper to unescape HTML-encoded mark tags */
    private decodeMark(str: string): string {
        if (!str) return '';
        return str
            .replace(/&lt;mark&gt;/g, '<mark>')
            .replace(/&lt;\/mark&gt;/g, '</mark>');
    }

    /** Helper to resolve canvas label from a manifesto canvas object */
    private resolveCanvasLabel(canvas: any, canvasIndex: number): string {
        let label = 'Canvas ' + (canvasIndex + 1);
        try {
            if (canvas.getLabel) {
                const l = canvas.getLabel();
                if (Array.isArray(l) && l.length > 0) label = l[0].value;
                else if (typeof l === 'string') label = l;
            } else if (canvas.label) {
                if (typeof canvas.label === 'string') label = canvas.label;
                else if (Array.isArray(canvas.label))
                    label = canvas.label[0]?.value;
            }
        } catch (_e) {
            /* ignore */
        }
        return String(label);
    }

    /** Ensure a canvas group exists in the map and return it */
    private getOrCreateCanvasGroup(
        resultsByCanvas: SvelteMap<
            number,
            { canvasIndex: number; canvasLabel: string; hits: any[] }
        >,
        canvasIndex: number,
    ): { canvasIndex: number; canvasLabel: string; hits: any[] } {
        if (!resultsByCanvas.has(canvasIndex)) {
            const canvas = this.canvases[canvasIndex];
            resultsByCanvas.set(canvasIndex, {
                canvasIndex,
                canvasLabel: this.resolveCanvasLabel(canvas, canvasIndex),
                hits: [],
            });
        }
        return resultsByCanvas.get(canvasIndex)!;
    }

    /**
     * Parse a IIIF Content Search API v0/v1 response.
     * Handles both "hits" format (with before/match/after) and "resources"-only format.
     */
    private parseLegacySearchResponse(data: any): SearchResultGroup[] {
        const resources = data.resources || [];
        const resultsByCanvas = new SvelteMap<
            number,
            { canvasIndex: number; canvasLabel: string; hits: any[] }
        >();

        if (data.hits) {
            for (const hit of data.hits) {
                const annotations = hit.annotations || [];

                let canvasIndex = -1;
                let bounds: number[] | null = null;
                const allBounds: number[][] = [];

                for (const annoId of annotations) {
                    const annotation = resources.find(
                        (r: any) => r['@id'] === annoId || r.id === annoId,
                    );
                    if (annotation && annotation.on) {
                        const onVal =
                            typeof annotation.on === 'string'
                                ? annotation.on
                                : annotation.on['@id'] || annotation.on.id;
                        const cleanOn = onVal.split('#')[0];
                        const b = this.parseXywhSelector(onVal);

                        const cIndex = this.canvases.findIndex(
                            (c: any) => c.id === cleanOn,
                        );

                        if (cIndex >= 0) {
                            if (canvasIndex === -1) {
                                canvasIndex = cIndex;
                            }
                            if (b) {
                                allBounds.push(b);
                                if (!bounds) bounds = b;
                            }
                        }
                    }
                }

                if (canvasIndex >= 0) {
                    const group = this.getOrCreateCanvasGroup(
                        resultsByCanvas,
                        canvasIndex,
                    );
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
        } else if (resources.length > 0) {
            for (const res of resources) {
                const onVal =
                    typeof res.on === 'string'
                        ? res.on
                        : res.on['@id'] || res.on.id;
                const cleanOn = onVal.split('#')[0];
                const bounds = this.parseXywhSelector(onVal);

                const canvasIndex = this.canvases.findIndex(
                    (c: any) => c.id === cleanOn,
                );
                if (canvasIndex >= 0) {
                    const group = this.getOrCreateCanvasGroup(
                        resultsByCanvas,
                        canvasIndex,
                    );
                    group.hits.push({
                        type: 'resource',
                        match: this.decodeMark(
                            res.resource && res.resource.chars
                                ? res.resource.chars
                                : res.chars || '',
                        ),
                        bounds,
                        allBounds: bounds ? [bounds] : [],
                    });
                }
            }
        }

        return Array.from(resultsByCanvas.values()).sort(
            (a, b) => a.canvasIndex - b.canvasIndex,
        );
    }

    /**
     * Parse a IIIF Content Search API v2 response.
     * v2 returns an AnnotationPage with `items` (W3C Annotations) and optional
     * `annotations` containing contextualizing/highlighting info via TextQuoteSelector.
     */
    private parseV2SearchResponse(data: any): SearchResultGroup[] {
        const items: any[] = data.items || [];
        const resultsByCanvas = new SvelteMap<
            number,
            { canvasIndex: number; canvasLabel: string; hits: any[] }
        >();

        // Build a context map from the annotations section (TextQuoteSelector info)
        // Maps source annotation id -> { before, match, after }
        const contextMap = new SvelteMap<
            string,
            { before: string; match: string; after: string }
        >();

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
                        if (!target || typeof target === 'string') continue;
                        const sourceId = target.source;
                        if (!sourceId) continue;

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

            // Resolve target -> canvas ID and bounds
            const target = item.target;
            let targetStr: string | null = null;

            if (typeof target === 'string') {
                targetStr = target;
            } else if (target && typeof target === 'object') {
                targetStr = target.id || target['@id'] || null;
                // Handle SpecificResource with source
                if (!targetStr && target.source) {
                    targetStr =
                        typeof target.source === 'string'
                            ? target.source
                            : target.source.id || target.source['@id'];
                }
            }

            if (!targetStr) continue;

            const cleanTarget = targetStr.split('#')[0];
            const bounds = this.parseXywhSelector(targetStr);

            const canvasIndex = this.canvases.findIndex(
                (c: any) => c.id === cleanTarget,
            );
            if (canvasIndex < 0) continue;

            // Extract text from body
            let bodyText = '';
            if (item.body) {
                const body = Array.isArray(item.body)
                    ? item.body[0]
                    : item.body;
                if (body && typeof body === 'object') {
                    bodyText = body.value || '';
                } else if (typeof body === 'string') {
                    bodyText = body;
                }
            }

            const group = this.getOrCreateCanvasGroup(
                resultsByCanvas,
                canvasIndex,
            );

            // Check if we have contextualizing/highlighting info for this annotation
            const context = contextMap.get(annoId);
            if (context) {
                group.hits.push({
                    type: 'hit',
                    before: this.decodeMark(context.before),
                    match: this.decodeMark(context.match),
                    after: this.decodeMark(context.after),
                    bounds,
                    allBounds: bounds ? [bounds] : [],
                });
            } else {
                group.hits.push({
                    type: 'resource',
                    match: this.decodeMark(bodyText),
                    bounds,
                    allBounds: bounds ? [bounds] : [],
                });
            }
        }

        return Array.from(resultsByCanvas.values()).sort(
            (a, b) => a.canvasIndex - b.canvasIndex,
        );
    }

    private buildSearchAnnotations(searchResults: SearchResultGroup[]): any[] {
        let annotationIndex = 0;
        return searchResults.flatMap((group) => {
            const canvas = this.canvases[group.canvasIndex];
            if (!canvas?.id) return [];
            return group.hits.flatMap((hit) => {
                const boundsArray =
                    hit.allBounds && hit.allBounds.length > 0
                        ? hit.allBounds
                        : hit.bounds
                          ? [hit.bounds]
                          : [];

                return boundsArray.map((bounds: number[]) => ({
                    '@id': `urn:search-hit:${annotationIndex++}`,
                    '@type': 'oa:Annotation',
                    motivation: 'sc:painting',
                    on: `${canvas.id}#xywh=${bounds.join(',')}`,
                    canvasId: canvas.id,
                    resource: {
                        '@type': 'cnt:ContentAsText',
                        chars: hit.match,
                    },
                    isSearchHit: true,
                }));
            });
        });
    }

    // ==================== PLUGIN STATE ====================

    /** Plugin-registered menu buttons */
    pluginMenuButtons: PluginMenuButton[] = $state([]);

    /** Plugin-registered panels */
    pluginPanels: PluginPanel[] = $state([]);

    /** OpenSeadragon viewer instance (set by OSDViewer) */
    osdViewer: any | null = $state.raw(null);

    /** Event handlers for inter-plugin communication */
    private pluginEventHandlers = new SvelteMap<
        string,
        Set<(data: unknown) => void>
    >();

    /**
     * Internal plugin UI state keyed by plugin ID.
     * Keeps panel open state and toolbar visibility in one reactive place.
     */
    private pluginUiState = new SvelteMap<
        string,
        { open: boolean; visible: boolean }
    >();

    private getPluginUiConfig(pluginId: string): PluginUiConfig | undefined {
        return this.config.plugins?.[pluginId];
    }

    private ensurePluginUiState(pluginId: string): void {
        if (!this.pluginUiState.has(pluginId)) {
            const config = this.getPluginUiConfig(pluginId);
            this.pluginUiState.set(pluginId, {
                open: config?.open ?? false,
                visible: config?.visible ?? true,
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
        });
    }

    private applyPluginUiConfigToAll(): void {
        for (const pluginId of this.pluginUiState.keys()) {
            this.applyPluginUiConfig(pluginId);
        }
    }

    private setPluginOpen(pluginId: string, open: boolean): void {
        const current = this.pluginUiState.get(pluginId);
        if (!current) return;

        this.pluginUiState.set(pluginId, {
            ...current,
            open,
        });
    }

    private togglePluginOpen(pluginId: string): void {
        const current = this.pluginUiState.get(pluginId);
        if (!current) return;

        this.pluginUiState.set(pluginId, {
            ...current,
            open: !current.open,
        });
    }

    // ==================== PLUGIN METHODS ====================

    /**
     * Register a plugin with this viewer instance.
     * Accepts a simple PluginDef object.
     */
    registerPlugin(def: PluginDef): void {
        const id =
            def.id || `plugin-${Math.random().toString(36).substr(2, 9)}`;

        this.ensurePluginUiState(id);

        // Register Menu Button
        const button: PluginMenuButton = {
            id: `${id}:toggle`,
            icon: def.icon,
            tooltip: def.name,
            onClick: () => {
                this.togglePluginOpen(id);
            },
            isActive: () => this.pluginUiState.get(id)?.open ?? false,
            isVisible: () => this.pluginUiState.get(id)?.visible ?? true,
            order: 200, // Default order for simple plugins
        };

        // Register Panel
        const panel: PluginPanel = {
            id: `${id}:panel`,
            component: def.panel,
            position: def.position || 'left',
            isVisible: () => this.pluginUiState.get(id)?.open ?? false,
            props: {
                ...def.props,
                // Pass closer to component
                close: () => {
                    this.setPluginOpen(id, false);
                },
            },
        };

        // Add directly to lists
        this.pluginMenuButtons = [...this.pluginMenuButtons, button];
        this.pluginPanels = [...this.pluginPanels, panel];

        // Execute lifecycle hook if present
        if (def.onInit) {
            def.onInit(this);
        }
    }

    /**
     * Unregister a plugin's UI components by ID prefix.
     * Note: This cleans up the menu button and panel, but doesn't remove listeners attached by the plugin itself
     * since we don't have a handle on the plugin instance or its cleanup function anymore.
     * Plugins should manage their own cleanup via component lifecycle (onDestroy) if possible.
     */
    unregisterPlugin(pluginId: string): void {
        this.pluginMenuButtons = this.pluginMenuButtons.filter(
            (b) => !b.id.startsWith(`${pluginId}:`),
        );
        this.pluginPanels = this.pluginPanels.filter(
            (p) => !p.id.startsWith(`${pluginId}:`),
        );
        this.pluginUiState.delete(pluginId);
    }

    /**
     * Notify that OSD viewer is ready.
     * With the component-based system, we don't notify plugins individually.
     * Instead, plugins should use the OSDViewer instance from context or listen for 'osd-ready' event (if we emitted one).
     * But since we have direct access to osdViewer in this state, components can just react to it.
     */
    notifyOSDReady(viewer: OpenSeadragon.Viewer): void {
        this.osdViewer = viewer;
    }

    /**
     * Cleanup everything.
     */
    destroyAllPlugins(): void {
        this.pluginMenuButtons = [];
        this.pluginPanels = [];
        this.pluginUiState.clear();
        this.pluginEventHandlers.clear();
    }
}

// Context key for providing/injecting ViewerState in components
export const VIEWER_STATE_KEY = 'triiiceratops:viewerState';
