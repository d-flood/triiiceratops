import { SvelteSet, SvelteMap } from 'svelte/reactivity';
import { manifestsState } from './manifests.svelte.js';
import type { ViewerConfig } from '../types/config';

import type { PluginMenuButton, PluginPanel, PluginDef } from '../types/plugin';

/**
 * Snapshot of viewer state for external consumers.
 * Used by web component events to expose state without Svelte reactivity.
 */
export interface ViewerStateSnapshot {
    manifestId: string | null;
    canvasId: string | null;
    currentCanvasIndex: number;
    showAnnotations: boolean;
    showThumbnailGallery: boolean;
    showSearchPanel: boolean;
    toolbarOpen: boolean;
    searchQuery: string;
    isFullScreen: boolean;
    dockSide: string;
    viewingMode: 'individuals' | 'paged';
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
    showMetadataDialog = $state(false);
    dockSide = $state('bottom');
    visibleAnnotationIds = new SvelteSet<string>();

    // UI Configuration
    config: ViewerConfig = $state({});

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
    private _viewingMode = $state<'individuals' | 'paged'>('individuals');

    get viewingMode() {
        return this._viewingMode;
    }
    set viewingMode(value: 'individuals' | 'paged') {
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
            showThumbnailGallery: this.showThumbnailGallery,
            showSearchPanel: this.showSearchPanel,
            toolbarOpen: this.toolbarOpen,
            searchQuery: this.searchQuery,
            isFullScreen: this.isFullScreen,
            dockSide: this.dockSide,
            viewingMode: this.viewingMode,
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
            manifestsState.fetchManifest(this.manifestId);
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
        const canvases = manifestsState.getCanvases(this.manifestId);

        // Auto-initialize canvasId to first canvas if not set

        return canvases;
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

    get hasNext() {
        if (this.viewingMode === 'paged') {
            // Account for paged offset: with offset 1, page 1 is single, pairs start at 2+3
            const singlePages = this.pagedOffset;
            if (this.currentCanvasIndex < singlePages) {
                return this.currentCanvasIndex < this.canvases.length - 1;
            }
            return this.currentCanvasIndex < this.canvases.length - 2;
        } else {
            return this.currentCanvasIndex < this.canvases.length - 1;
        }
    }

    get hasPrevious() {
        return this.currentCanvasIndex > 0;
    }

    nextCanvas() {
        if (this.hasNext) {
            if (this.viewingMode === 'paged') {
                // Single pages at the start: pagedOffset (default 0, shifted = 1)
                const singlePages = this.pagedOffset;
                const nextIndex =
                    this.currentCanvasIndex < singlePages
                        ? this.currentCanvasIndex + 1
                        : this.currentCanvasIndex + 2;
                const canvas = this.canvases[nextIndex];
                this.setCanvas(canvas.id);
            } else {
                const nextIndex = this.currentCanvasIndex + 1;
                const canvas = this.canvases[nextIndex];
                this.setCanvas(canvas.id);
            }
        }
    }

    previousCanvas() {
        if (this.hasPrevious) {
            if (this.viewingMode === 'paged') {
                // Single pages at the start: pagedOffset (default 0, shifted = 1)
                const singlePages = this.pagedOffset;
                let prevIndex: number;
                if (this.currentCanvasIndex <= singlePages) {
                    // Going back within single pages or to a single page
                    prevIndex = this.currentCanvasIndex - 1;
                } else {
                    // Going back in paired pages, but don't go past the last single page
                    prevIndex = Math.max(
                        this.currentCanvasIndex - 2,
                        singlePages,
                    );
                }
                const canvas = this.canvases[prevIndex];
                this.setCanvas(canvas.id);
            } else {
                const prevIndex = this.currentCanvasIndex - 1;
                const canvas = this.canvases[prevIndex];
                this.setCanvas(canvas.id);
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

    setManifest(manifestId: string) {
        this.manifestId = manifestId;
        this.canvasId = null;
        manifestsState.fetchManifest(manifestId);
        this.dispatchStateChange('manifestchange');
    }

    setCanvas(canvasId: string) {
        this.canvasId = canvasId;
        this.dispatchStateChange('canvaschange');
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
                this.showAnnotations = newConfig.annotations.open;
            }
        }
        // NOTE: We intentionally do NOT dispatch events here.
        // Config updates are external configuration, not user-initiated state changes.
        // Dispatching here would cause infinite loops when the consumer re-renders.
    }

    toggleAnnotations() {
        this.showAnnotations = !this.showAnnotations;
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

    toggleMetadataDialog() {
        this.showMetadataDialog = !this.showMetadataDialog;
    }

    setViewingMode(mode: 'individuals' | 'paged') {
        this.viewingMode = mode;
        if (mode === 'paged') {
            const singlePages = this.pagedOffset;
            // If we're past the single pages, check if we're on a right-hand page
            if (this.currentCanvasIndex >= singlePages) {
                // Calculate position relative to where pairs start
                const pairPosition =
                    (this.currentCanvasIndex - singlePages) % 2;
                if (pairPosition === 1) {
                    // We're on a right-hand page, move back one
                    const newIndex = this.currentCanvasIndex - 1;
                    const canvas = this.canvases[newIndex];
                    this.setCanvas(canvas.id);
                }
            }
        }
        this.dispatchStateChange();
    }

    togglePagedOffset() {
        this.pagedOffset = this.pagedOffset === 0 ? 1 : 0;
        this.config.pagedViewOffset = this.pagedOffset === 1;
        // Adjust current canvas position if needed
        const singlePages = this.pagedOffset;
        if (this.currentCanvasIndex >= singlePages) {
            const pairPosition = (this.currentCanvasIndex - singlePages) % 2;
            if (pairPosition === 1) {
                // We're now on a right-hand page after the shift, move back
                const newIndex = this.currentCanvasIndex - 1;
                const canvas = this.canvases[newIndex];
                this.setCanvas(canvas.id);
            }
        }
        this.dispatchStateChange();
    }

    searchQuery = $state('');
    pendingSearchQuery = $state<string | null>(null);
    searchResults: any[] = $state([]);
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
            let annotations = this.searchAnnotations.filter(
                (a) => a.canvasId === this.canvasId,
            );
            const currentIndex = this.currentCanvasIndex;
            const singlePages = this.pagedOffset;
            // Only include next canvas annotations if we're in a two-page spread
            if (currentIndex >= singlePages) {
                const nextIndex = currentIndex + 1;
                if (nextIndex < this.canvases.length) {
                    const nextCanvas = this.canvases[nextIndex];
                    const nextCanvasId = nextCanvas.id || nextCanvas['@id'];
                    const xOffset = 1.025; // account for small gap between pages
                    const annoOffset =
                        this.canvases[currentIndex].getWidth() * xOffset;
                    const nextAnnotations = this.searchAnnotations.filter(
                        (a) => a.canvasId === nextCanvasId,
                    );

                    // update x coordinates for display on the right side in two-page mode
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

            let service =
                manifest.getService('http://iiif.io/api/search/1/search') ||
                manifest.getService('http://iiif.io/api/search/0/search');

            if (!service) {
                // Fallback: check json directly if manifesto fails me
                if (manifest.__jsonld && manifest.__jsonld.service) {
                    const services = Array.isArray(manifest.__jsonld.service)
                        ? manifest.__jsonld.service
                        : [manifest.__jsonld.service];
                    service = services.find(
                        (s: any) =>
                            s.profile ===
                                'http://iiif.io/api/search/1/search' ||
                            s.profile === 'http://iiif.io/api/search/0/search',
                    );
                }
            }

            if (!service) {
                console.warn('No IIIF search service found in manifest');
                // Ensure we stop searching if no service found
                this.isSearching = false;
                return;
            }

            // Handle service object which might be a manifesto object or raw json
            const serviceId = service.id || service['@id'];

            const searchUrl = `${serviceId}?q=${encodeURIComponent(query)}`;

            const response = await fetch(searchUrl);
            if (!response.ok) throw new Error('Search request failed');

            const data = await response.json();
            const resources = data.resources || [];

            // Group results by canvas index
            const resultsByCanvas = new SvelteMap<
                number,
                {
                    canvasIndex: number;
                    canvasLabel: string;
                    hits: any[];
                }
            >();

            // Helper to parse xywh
            const parseSelector = (onVal: string | any) => {
                const val =
                    typeof onVal === 'string'
                        ? onVal
                        : onVal['@id'] || onVal.id;
                if (!val) return null;
                const parts = val.split('#xywh=');
                if (parts.length < 2) return null;
                const coords = parts[1].split(',').map(Number);
                if (coords.length === 4) return coords; // [x, y, w, h]
                return null;
            };

            // Helper to unescape mark tags
            const decodeMark = (str: string) => {
                if (!str) return '';
                return str
                    .replace(/&lt;mark&gt;/g, '<mark>')
                    .replace(/&lt;\/mark&gt;/g, '</mark>');
            };

            if (data.hits) {
                for (const hit of data.hits) {
                    // hits have property 'annotations' which is array of ids
                    const annotations = hit.annotations || [];

                    // We need to determine which canvas this hit belongs to.
                    // A hit might technically span annotations on multiple canvases (unlikely for IIIF Content Search),
                    // but usually it's associated with specific annotations on one canvas.
                    // We will take the first valid canvas we find for the annotations.

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
                            const b = parseSelector(onVal);

                            const cIndex = this.canvases.findIndex(
                                (c: any) => c.id === cleanOn,
                            );

                            if (cIndex >= 0) {
                                // If we haven't set a canvas yet, set it
                                if (canvasIndex === -1) {
                                    canvasIndex = cIndex;
                                }
                                // If we found bounds, add them
                                if (b) {
                                    allBounds.push(b);
                                    if (!bounds) bounds = b;
                                }
                            }
                        }
                    }

                    if (canvasIndex >= 0) {
                        if (!resultsByCanvas.has(canvasIndex)) {
                            const canvas = this.canvases[canvasIndex];
                            let label = 'Canvas ' + (canvasIndex + 1);
                            try {
                                if (canvas.getLabel) {
                                    const l = canvas.getLabel();
                                    if (Array.isArray(l) && l.length > 0)
                                        label = l[0].value;
                                    else if (typeof l === 'string') label = l;
                                } else if (canvas.label) {
                                    // Fallback if raw object
                                    if (typeof canvas.label === 'string')
                                        label = canvas.label;
                                    else if (Array.isArray(canvas.label))
                                        label = canvas.label[0]?.value;
                                }
                            } catch (_e) {
                                /* ignore */
                            }
                            resultsByCanvas.set(canvasIndex, {
                                canvasIndex,
                                canvasLabel: String(label),
                                hits: [],
                            });
                        }

                        resultsByCanvas.get(canvasIndex)!.hits.push({
                            type: 'hit',
                            before: decodeMark(hit.before),
                            match: decodeMark(hit.match),
                            after: decodeMark(hit.after),
                            bounds,
                            allBounds,
                        });
                    }
                }
            } else if (resources.length > 0) {
                // No hits (Basic level?), just annotations
                for (const res of resources) {
                    const onVal =
                        typeof res.on === 'string'
                            ? res.on
                            : res.on['@id'] || res.on.id;
                    const cleanOn = onVal.split('#')[0];
                    const bounds = parseSelector(onVal);

                    const canvasIndex = this.canvases.findIndex(
                        (c: any) => c.id === cleanOn,
                    );
                    if (canvasIndex >= 0) {
                        const canvas = this.canvases[canvasIndex];
                        let label = 'Canvas ' + (canvasIndex + 1);
                        try {
                            if (canvas.getLabel) {
                                const l = canvas.getLabel();
                                if (Array.isArray(l) && l.length > 0)
                                    label = l[0].value;
                                else if (typeof l === 'string') label = l;
                            } else if (canvas.label) {
                                // Fallback if raw object
                                if (typeof canvas.label === 'string')
                                    label = canvas.label;
                                else if (Array.isArray(canvas.label))
                                    label = canvas.label[0]?.value;
                            }
                        } catch (_e) {
                            /* ignore */
                        }

                        if (!resultsByCanvas.has(canvasIndex)) {
                            resultsByCanvas.set(canvasIndex, {
                                canvasIndex,
                                canvasLabel: String(label),
                                hits: [],
                            });
                        }

                        resultsByCanvas.get(canvasIndex)!.hits.push({
                            type: 'resource',
                            match: decodeMark(
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

            // Convert Map to Array and Sort
            this.searchResults = Array.from(resultsByCanvas.values()).sort(
                (a, b) => a.canvasIndex - b.canvasIndex,
            );

            // Generate ephemeral search annotations
            // We need to flatten our grouped structure to generate the annotations list
            let annotationIndex = 0;
            this.searchAnnotations = this.searchResults.flatMap((group) => {
                const canvas = this.canvases[group.canvasIndex];
                return group.hits.flatMap((hit: any) => {
                    const boundsArray =
                        hit.allBounds && hit.allBounds.length > 0
                            ? hit.allBounds
                            : hit.bounds
                              ? [hit.bounds]
                              : [];

                    return boundsArray.map((bounds: number[]) => {
                        const on = `${canvas.id}#xywh=${bounds.join(',')}`;
                        return {
                            '@id': `urn:search-hit:${annotationIndex++}`,
                            '@type': 'oa:Annotation',
                            motivation: 'sc:painting',
                            on: on,
                            canvasId: canvas.id,
                            resource: {
                                '@type': 'cnt:ContentAsText',
                                chars: hit.match,
                            },
                            // Flag to identify styling in Overlay?
                            // Or just standard rendering.
                            isSearchHit: true,
                        };
                    });
                });
            });
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

    // ==================== PLUGIN METHODS ====================

    /**
     * Register a plugin with this viewer instance.
     * Accepts a simple PluginDef object.
     */
    registerPlugin(def: PluginDef): void {
        const id =
            def.id || `plugin-${Math.random().toString(36).substr(2, 9)}`;

        // Create reactive state for this plugin's panel
        // Svelte 5's $state works fine in closures if consumed in reactive context
        let isOpen = $state(false);

        // Register Menu Button
        const button: PluginMenuButton = {
            id: `${id}:toggle`,
            icon: def.icon,
            tooltip: def.name,
            onClick: () => {
                isOpen = !isOpen;
            },
            isActive: () => isOpen,
            order: 200, // Default order for simple plugins
        };

        // Register Panel
        const panel: PluginPanel = {
            id: `${id}:panel`,
            component: def.panel,
            position: def.position || 'left',
            isVisible: () => isOpen,
            props: {
                ...def.props,
                // Pass closer to component
                close: () => {
                    isOpen = false;
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
        this.pluginEventHandlers.clear();
    }
}

// Context key for providing/injecting ViewerState in components
export const VIEWER_STATE_KEY = 'triiiceratops:viewerState';
