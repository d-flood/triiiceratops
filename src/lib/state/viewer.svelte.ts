import { manifestsState } from './manifests.svelte.js';
import type { ViewerConfig } from '../types/config';

import type {
    TriiiceratopsPlugin,
    PluginContext,
    PluginMenuButton,
    PluginPanel,
} from '../types/plugin';

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
    isFullScreen: boolean;
    dockSide: string;
}

export class ViewerState {
    manifestId: string | null = $state(null);
    canvasId: string | null = $state(null);
    showAnnotations = $state(false);
    showThumbnailGallery = $state(false);
    isGalleryDockedBottom = $state(false);
    isGalleryDockedRight = $state(false);
    isFullScreen = $state(false);
    showMetadataDialog = $state(false);
    dockSide = $state('bottom');
    visibleAnnotationIds = $state(new Set<string>());

    // UI Configuration
    config: ViewerConfig = $state({});

    // Derived configuration specific getters
    get showRightMenu() {
        return this.config.showRightMenu ?? true;
    }
    get showLeftMenu() {
        return this.config.showLeftMenu ?? true;
    }
    get showCanvasNav() {
        return this.config.showCanvasNav ?? true;
    }

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
            canvasIndex = canvases.findIndex(
                (c: any) => c.id === this.canvasId,
            );
        }

        return {
            manifestId: this.manifestId,
            canvasId: this.canvasId,
            currentCanvasIndex: canvasIndex,
            showAnnotations: this.showAnnotations,
            showThumbnailGallery: this.showThumbnailGallery,
            showSearchPanel: this.showSearchPanel,
            isFullScreen: this.isFullScreen,
            dockSide: this.dockSide,
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
        initialPlugins: TriiiceratopsPlugin[] = [],
    ) {
        this.manifestId = initialManifestId || null;
        this.canvasId = initialCanvasId || null;
        // Fetch manifest immediately
        if (this.manifestId) {
            manifestsState.fetchManifest(this.manifestId);
        }

        // Register initial plugins
        for (const plugin of initialPlugins) {
            this.registerPlugin(plugin);
        }
    }

    get manifest() {
        if (!this.manifestId) return null;
        return manifestsState.getManifest(this.manifestId);
    }

    get canvases() {
        if (!this.manifestId) return [];
        const canvases = manifestsState.getCanvases(this.manifestId);

        // Auto-initialize canvasId to first canvas if not set
        if (canvases.length > 0 && !this.canvasId) {
            // Use setTimeout to avoid updating state during a derived computation
            setTimeout(() => {
                if (!this.canvasId && canvases.length > 0) {
                    this.canvasId = canvases[0].id;
                }
            }, 0);
        }

        return canvases;
    }

    get currentCanvasIndex() {
        if (!this.canvasId) {
            if (this.canvases.length > 0) return 0;
            return -1;
        }
        // Manifesto canvases have an id property
        return this.canvases.findIndex((c: any) => c.id === this.canvasId);
    }

    get hasNext() {
        return this.currentCanvasIndex < this.canvases.length - 1;
    }

    get hasPrevious() {
        return this.currentCanvasIndex > 0;
    }

    nextCanvas() {
        if (this.hasNext) {
            const nextIndex = this.currentCanvasIndex + 1;
            const canvas = this.canvases[nextIndex];
            this.setCanvas(canvas.id);
        }
    }

    previousCanvas() {
        if (this.hasPrevious) {
            const prevIndex = this.currentCanvasIndex - 1;
            const canvas = this.canvases[prevIndex];
            this.setCanvas(canvas.id);
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
        this.config = newConfig;

        // Sync state from config
        if (newConfig.gallery) {
            if (newConfig.gallery.open !== undefined) {
                this.showThumbnailGallery = newConfig.gallery.open;
            }
            if (newConfig.gallery.dockPosition !== undefined) {
                this.dockSide = newConfig.gallery.dockPosition;
            }
        }

        if (newConfig.search) {
            if (newConfig.search.open !== undefined) {
                this.showSearchPanel = newConfig.search.open;
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

    toggleThumbnailGallery() {
        this.showThumbnailGallery = !this.showThumbnailGallery;
        this.dispatchStateChange();
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            const el = document.getElementById('triiiceratops-viewer');
            if (el) {
                el.requestFullscreen().catch((e) => {
                    console.warn('Fullscreen request failed', e);
                });
            }
        } else {
            document.exitFullscreen();
        }
    }

    toggleMetadataDialog() {
        this.showMetadataDialog = !this.showMetadataDialog;
    }

    searchQuery = $state('');
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

    get currentCanvasSearchAnnotations() {
        if (!this.canvasId) return [];
        return this.searchAnnotations.filter(
            (a) => a.canvasId === this.canvasId,
        );
    }

    async search(query: string) {
        if (!query.trim()) return;
        this.isSearching = true;
        this.searchQuery = query;
        this.searchResults = [];

        try {
            const manifest = this.manifest;
            if (!manifest) throw new Error('No manifest loaded');

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

            const processedResults = [];

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

            if (data.hits) {
                for (const hit of data.hits) {
                    // hits have property 'annotations' which is array of ids
                    const annotations = hit.annotations || [];
                    for (const annoId of annotations) {
                        const annotation = resources.find(
                            (r: any) => r['@id'] === annoId || r.id === annoId,
                        );
                        if (annotation && annotation.on) {
                            // annotation.on can be "canvas-id" or "canvas-id#xywh=..."
                            const onVal =
                                typeof annotation.on === 'string'
                                    ? annotation.on
                                    : annotation.on['@id'] || annotation.on.id;
                            const cleanOn = onVal.split('#')[0];
                            const bounds = parseSelector(onVal);

                            const canvasIndex = this.canvases.findIndex(
                                (c: any) => c.id === cleanOn,
                            );
                            if (canvasIndex >= 0) {
                                const canvas = this.canvases[canvasIndex];
                                // Try to get a label
                                let label = 'Canvas ' + (canvasIndex + 1);
                                try {
                                    if (canvas.getLabel) {
                                        const l = canvas.getLabel();
                                        if (Array.isArray(l) && l.length > 0)
                                            label = l[0].value;
                                        else if (typeof l === 'string')
                                            label = l;
                                    } else if (canvas.label) {
                                        // Fallback if raw object
                                        if (typeof canvas.label === 'string')
                                            label = canvas.label;
                                        else if (Array.isArray(canvas.label))
                                            label = canvas.label[0]?.value;
                                    }
                                } catch (e) {
                                    /* ignore */
                                }

                                processedResults.push({
                                    type: 'hit',
                                    before: hit.before,
                                    match: hit.match,
                                    after: hit.after,
                                    canvasIndex,
                                    canvasLabel: String(label),
                                    bounds,
                                });
                            }
                        }
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
                        } catch (e) {
                            /* ignore */
                        }

                        processedResults.push({
                            type: 'resource',
                            match:
                                res.resource && res.resource.chars
                                    ? res.resource.chars
                                    : res.chars || '',
                            canvasIndex,
                            canvasLabel: String(label),
                            bounds,
                        });
                    }
                }
            }

            this.searchResults = processedResults;

            // Generate ephemeral search annotations
            this.searchAnnotations = processedResults
                .filter((r) => r.bounds)
                .map((r, i) => {
                    const canvas = this.canvases[r.canvasIndex];
                    const on = `${canvas.id}#xywh=${r.bounds.join(',')}`;

                    return {
                        '@id': `urn:search-hit:${i}`,
                        '@type': 'oa:Annotation',
                        motivation: 'sc:painting',
                        on: on,
                        canvasId: canvas.id,
                        resource: {
                            '@type': 'cnt:ContentAsText',
                            chars: r.match,
                        },
                        // Flag to identify styling in Overlay?
                        // Or just standard rendering.
                        isSearchHit: true,
                    };
                });
        } catch (e) {
            console.error('Search error:', e);
        } finally {
            this.isSearching = false;
        }
    }

    // ==================== PLUGIN STATE ====================

    /** Registered plugins */
    plugins: TriiiceratopsPlugin[] = $state([]);

    /** Plugin-registered menu buttons */
    pluginMenuButtons: PluginMenuButton[] = $state([]);

    /** Plugin-registered panels */
    pluginPanels: PluginPanel[] = $state([]);

    /** OpenSeadragon viewer instance (set by OSDViewer) */
    osdViewer: any | null = $state(null);

    /** Event handlers for inter-plugin communication */
    private pluginEventHandlers = new Map<
        string,
        Set<(data: unknown) => void>
    >();

    // ==================== PLUGIN METHODS ====================

    /**
     * Create plugin context - the stable API surface for plugins.
     */
    private createPluginContext(): PluginContext {
        const self = this;
        return {
            viewerState: self,

            getOSDViewer: () => self.osdViewer,

            registerMenuButton(button: PluginMenuButton) {
                if (!self.pluginMenuButtons.find((b) => b.id === button.id)) {
                    self.pluginMenuButtons = [
                        ...self.pluginMenuButtons,
                        button,
                    ];
                }
            },

            unregisterMenuButton(buttonId: string) {
                self.pluginMenuButtons = self.pluginMenuButtons.filter(
                    (b) => b.id !== buttonId,
                );
            },

            registerPanel(panel: PluginPanel) {
                if (!self.pluginPanels.find((p) => p.id === panel.id)) {
                    self.pluginPanels = [...self.pluginPanels, panel];
                }
            },

            unregisterPanel(panelId: string) {
                self.pluginPanels = self.pluginPanels.filter(
                    (p) => p.id !== panelId,
                );
            },

            emit(eventName: string, data?: unknown) {
                const handlers = self.pluginEventHandlers.get(eventName);
                handlers?.forEach((handler) => handler(data));
            },

            on(eventName: string, handler: (data: unknown) => void) {
                if (!self.pluginEventHandlers.has(eventName)) {
                    self.pluginEventHandlers.set(eventName, new Set());
                }
                self.pluginEventHandlers.get(eventName)!.add(handler);
                return () => {
                    self.pluginEventHandlers.get(eventName)?.delete(handler);
                };
            },
        };
    }

    /**
     * Register a plugin with this viewer instance.
     */
    registerPlugin(plugin: TriiiceratopsPlugin): void {
        if (this.plugins.find((p) => p.id === plugin.id)) {
            console.warn(
                `[Triiiceratops] Plugin "${plugin.id}" already registered`,
            );
            return;
        }

        this.plugins = [...this.plugins, plugin];
        plugin.onRegister(this.createPluginContext());

        // If OSD already ready, notify immediately
        if (this.osdViewer && plugin.onViewerReady) {
            plugin.onViewerReady(this.osdViewer);
        }
    }

    /**
     * Unregister a plugin by ID.
     */
    unregisterPlugin(pluginId: string): void {
        const plugin = this.plugins.find((p) => p.id === pluginId);
        if (plugin) {
            plugin.onDestroy?.();
            this.plugins = this.plugins.filter((p) => p.id !== pluginId);
            // Remove plugin's UI registrations
            this.pluginMenuButtons = this.pluginMenuButtons.filter(
                (b) => !b.id.startsWith(`${pluginId}:`),
            );
            this.pluginPanels = this.pluginPanels.filter(
                (p) => !p.id.startsWith(`${pluginId}:`),
            );
        }
    }

    /**
     * Called by OSDViewer when OpenSeadragon is ready.
     */
    notifyOSDReady(viewer: any): void {
        this.osdViewer = viewer;
        for (const plugin of this.plugins) {
            plugin.onViewerReady?.(viewer);
        }
    }

    /**
     * Destroy all plugins (called on viewer unmount).
     */
    destroyAllPlugins(): void {
        for (const plugin of this.plugins) {
            plugin.onDestroy?.();
        }
        this.plugins = [];
        this.pluginMenuButtons = [];
        this.pluginPanels = [];
        this.pluginEventHandlers.clear();
    }
}

// Context key for providing/injecting ViewerState in components
export const VIEWER_STATE_KEY = 'triiiceratops:viewerState';
