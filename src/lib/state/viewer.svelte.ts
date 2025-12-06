import { manifestsState } from './manifests.svelte.js';

export class ViewerState {
    manifestId: string | null = $state(null);
    canvasId: string | null = $state(null);
    showAnnotations = $state(false);
    showThumbnailGallery = $state(false);
    isGalleryDockedBottom = $state(false);
    isGalleryDockedRight = $state(false);
    isFullScreen = $state(false);
    showMetadataDialog = $state(false);

    constructor(initialManifestId?: string | null) {
        this.manifestId = initialManifestId || null;
        // Fetch manifest immediately
        if (this.manifestId) {
            manifestsState.fetchManifest(this.manifestId);
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
            this.canvasId = canvas.id;
        }
    }

    previousCanvas() {
        if (this.hasPrevious) {
            const prevIndex = this.currentCanvasIndex - 1;
            const canvas = this.canvases[prevIndex];
            this.canvasId = canvas.id;
        }
    }

    setManifest(manifestId: string) {
        this.manifestId = manifestId;
        this.canvasId = null;
        manifestsState.fetchManifest(manifestId);
    }

    toggleAnnotations() {
        this.showAnnotations = !this.showAnnotations;
    }

    toggleThumbnailGallery() {
        this.showThumbnailGallery = !this.showThumbnailGallery;
    }

    toggleFullScreen() {
        if (!document.fullscreenElement) {
            const el = document.getElementById("mirador-viewer");
            if (el) {
                el.requestFullscreen().catch((e) => {
                    console.warn("Fullscreen request failed", e);
                });
            }
        } else {
            document.exitFullscreen();
        }
    }

    toggleMetadataDialog() {
        this.showMetadataDialog = !this.showMetadataDialog;
    }

    searchQuery = $state("");
    searchResults: any[] = $state([]);
    isSearching = $state(false);
    showSearchPanel = $state(false);

    toggleSearchPanel() {
        this.showSearchPanel = !this.showSearchPanel;
        if (!this.showSearchPanel) {
             // Clear ephemeral annotations when closing search
             this.searchAnnotations = [];
        }
    }

    targetBounds: number[] | null = $state(null);
    searchAnnotations: any[] = $state([]);

    get currentCanvasSearchAnnotations() {
        if (!this.canvasId) return [];
        return this.searchAnnotations.filter((a) => a.canvasId === this.canvasId);
    }

    async search(query: string) {
        if (!query.trim()) return;
        this.isSearching = true;
        this.searchQuery = query;
        this.searchResults = [];

        try {
            const manifest = this.manifest;
            if (!manifest) throw new Error("No manifest loaded");

            let service =
                manifest.getService("http://iiif.io/api/search/1/search") ||
                manifest.getService("http://iiif.io/api/search/0/search");

            if (!service) {
                // Fallback: check json directly if manifesto fails me
                if (manifest.__jsonld && manifest.__jsonld.service) {
                    const services = Array.isArray(manifest.__jsonld.service)
                        ? manifest.__jsonld.service
                        : [manifest.__jsonld.service];
                    service = services.find(
                        (s: any) =>
                            s.profile === "http://iiif.io/api/search/1/search" ||
                            s.profile === "http://iiif.io/api/search/0/search",
                    );
                }
            }

            if (!service) {
                console.warn("No IIIF search service found in manifest");
                this.isSearching = false;
                return;
            }

            // Handle service object which might be a manifesto object or raw json
            const serviceId = service.id || service["@id"];

            const searchUrl = `${serviceId}?q=${encodeURIComponent(query)}`;
            console.log("Searching:", searchUrl);

            const response = await fetch(searchUrl);
            if (!response.ok) throw new Error("Search request failed");

            const data = await response.json();
            const resources = data.resources || [];
            
            const processedResults = [];

            // Helper to parse xywh
            const parseSelector = (onVal: string | any) => {
                const val = typeof onVal === 'string' ? onVal : onVal['@id'] || onVal.id;
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
                         const annotation = resources.find((r: any) => r['@id'] === annoId || r.id === annoId);
                         if (annotation && annotation.on) {
                             // annotation.on can be "canvas-id" or "canvas-id#xywh=..."
                             const onVal = typeof annotation.on === 'string' ? annotation.on : annotation.on['@id'] || annotation.on.id;
                             const cleanOn = onVal.split('#')[0];
                             const bounds = parseSelector(onVal);
                             
                             const canvasIndex = this.canvases.findIndex((c: any) => c.id === cleanOn);
                             if (canvasIndex >= 0) {
                                 const canvas = this.canvases[canvasIndex];
                                 // Try to get a label
                                 let label = "Canvas " + (canvasIndex + 1);
                                 try {
                                     if (canvas.getLabel) {
                                        const l = canvas.getLabel();
                                        if (Array.isArray(l) && l.length > 0) label = l[0].value;
                                        else if (typeof l === 'string') label = l;
                                     } else if (canvas.label) {
                                         // Fallback if raw object
                                         if (typeof canvas.label === 'string') label = canvas.label;
                                         else if (Array.isArray(canvas.label)) label = canvas.label[0]?.value;
                                     }
                                 } catch(e) { /* ignore */ }
                                 
                                 processedResults.push({
                                     type: 'hit',
                                     before: hit.before,
                                     match: hit.match,
                                     after: hit.after,
                                     canvasIndex,
                                     canvasLabel: String(label),
                                     bounds
                                 });
                             }
                         }
                    }
                }
            } else if (resources.length > 0) {
                 // No hits (Basic level?), just annotations
                 for (const res of resources) {
                      const onVal = typeof res.on === 'string' ? res.on : res.on['@id'] || res.on.id;
                      const cleanOn = onVal.split('#')[0];
                      const bounds = parseSelector(onVal);
                      
                      const canvasIndex = this.canvases.findIndex((c: any) => c.id === cleanOn);
                      if (canvasIndex >= 0) {
                           const canvas = this.canvases[canvasIndex];
                            let label = "Canvas " + (canvasIndex + 1);
                             try {
                                 if (canvas.getLabel) {
                                    const l = canvas.getLabel();
                                    if (Array.isArray(l) && l.length > 0) label = l[0].value;
                                    else if (typeof l === 'string') label = l;
                                 } else if (canvas.label) {
                                     // Fallback if raw object
                                     if (typeof canvas.label === 'string') label = canvas.label;
                                     else if (Array.isArray(canvas.label)) label = canvas.label[0]?.value;
                                 }
                             } catch(e) { /* ignore */ }
                           
                           processedResults.push({
                               type: 'resource',
                               match: res.resource && res.resource.chars ? res.resource.chars : (res.chars || ''),
                               canvasIndex,
                               canvasLabel: String(label),
                               bounds
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
                    const on = `${canvas.id}#xywh=${r.bounds.join(",")}`;

                    return {
                        "@id": `urn:search-hit:${i}`,
                        "@type": "oa:Annotation",
                        motivation: "sc:painting",
                        on: on,
                        canvasId: canvas.id,
                        resource: {
                            "@type": "cnt:ContentAsText",
                            chars: r.match,
                        },
                        // Flag to identify styling in Overlay? 
                        // Or just standard rendering.
                        isSearchHit: true
                    };
                });
            
        } catch (e) {
            console.error("Search error:", e);
        } finally {
            this.isSearching = false;
        }
    }
}

// Create a singleton instance, though we could also instantiate it in App or MiradorViewer
export const viewerState = new ViewerState();
