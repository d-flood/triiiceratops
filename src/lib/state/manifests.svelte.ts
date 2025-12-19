import * as manifesto from 'manifesto.js';

interface ManifestEntry {
    json?: any;
    manifesto?: any;
    error?: any;
    isFetching?: boolean;
}

export class ManifestsState {
    manifests: Record<string, ManifestEntry> = $state({});

    // User-created annotations (from plugins like annotation editor)
    userAnnotations: Map<string, any[]> = $state(new Map());

    constructor() {}

    // === User Annotations API ===

    private userAnnotationKey(manifestId: string, canvasId: string): string {
        return `${manifestId}::${canvasId}`;
    }

    setUserAnnotations(
        manifestId: string,
        canvasId: string,
        annotations: any[],
    ): void {
        const key = this.userAnnotationKey(manifestId, canvasId);
        // Create a new Map to trigger reactivity
        const newMap = new Map(this.userAnnotations);
        newMap.set(key, annotations);
        this.userAnnotations = newMap;
    }

    clearUserAnnotations(manifestId: string, canvasId: string): void {
        const key = this.userAnnotationKey(manifestId, canvasId);
        if (this.userAnnotations.has(key)) {
            const newMap = new Map(this.userAnnotations);
            newMap.delete(key);
            this.userAnnotations = newMap;
        }
    }

    getUserAnnotations(manifestId: string, canvasId: string): any[] {
        const key = this.userAnnotationKey(manifestId, canvasId);
        return this.userAnnotations.get(key) ?? [];
    }

    // === Manifest Fetching ===

    async fetchManifest(manifestId: string) {
        if (this.manifests[manifestId]) {
            return; // Already fetched or fetching
        }

        this.manifests[manifestId] = { isFetching: true };

        try {
            const response = await fetch(manifestId);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const json = await response.json();
            const manifestoObject = manifesto.parseManifest(json);
            this.manifests[manifestId] = {
                json,
                manifesto: manifestoObject,
                isFetching: false,
            };
        } catch (error: any) {
            this.manifests[manifestId] = {
                error: error.message,
                isFetching: false,
            };
        }
    }

    getManifest(manifestId: string) {
        const entry = this.manifests[manifestId];
        return entry?.manifesto;
    }

    async fetchAnnotationList(url: string) {
        if (this.manifests[url]) return; // Already fetched or fetching

        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                this.manifests[url] = { json: data };
            } else {
                console.error(`Failed to fetch annotation list: ${url}`);
            }
        } catch (e) {
            console.error(`Error fetching annotation list: ${url}`, e);
        }
    }

    getCanvases(manifestId: string) {
        const m = this.getManifest(manifestId);
        if (!m) {
            return [];
        }
        const sequences = m.getSequences();
        if (!sequences || !sequences.length) return [];
        const canvases = sequences[0].getCanvases();
        return canvases;
    }

    getAnnotations(manifestId: string, canvasId: string) {
        // Get manifest annotations
        const manifestAnnos = this.manualGetAnnotations(manifestId, canvasId);
        // Get user-created annotations
        const userAnnos = this.getUserAnnotations(manifestId, canvasId);
        // Merge both sources
        return [...manifestAnnos, ...userAnnos];
    }

    // We can refactor this to use Manifesto's resource handling later if needed.
    manualGetAnnotations(manifestId: string, canvasId: string) {
        const manifestoObject = this.getManifest(manifestId);
        if (!manifestoObject) return [];

        const canvas = manifestoObject
            .getSequences()[0]
            .getCanvasById(canvasId);
        if (!canvas) return [];

        // Manifesto wraps the JSON. We can access the underlying JSON via canvas.__jsonld
        // Or better, use canvas.getContent() if it works, but for external lists manual fetch is robust.
        const canvasJson = canvas.__jsonld;

        let annotations: any[] = [];

        // Helper to parse list using Manifesto
        const parseList = (listJson: any) => {
            // manifesto.create is not available in 4.3.0 or not exported nicely?
            // Just return raw resources.
            return listJson.resources || listJson.items || [];
        };

        // IIIF v2 otherContent
        if (canvasJson.otherContent) {
            canvasJson.otherContent.forEach((content: any) => {
                const id = content['@id'] || content.id;
                if (id && !content.resources) {
                    const externalList = this.manifests[id];
                    if (externalList) {
                        if (externalList.json) {
                            const parsed = parseList(externalList.json);
                            annotations.push(...parsed);
                        }
                    } else {
                        this.fetchAnnotationList(id);
                    }
                } else if (content.resources) {
                    // It's embedded
                    // We can wrap this in manifesto.create too if we wrap it in a list structure?
                    // Or just use raw for embedded for now, but mixed types might be annoying.
                    // Let's rely on the robust parsing I added to Overlay for raw/mixed.
                    // But the user wants library usage.
                    // const r = manifesto.create(content); // might work?
                    annotations.push(...content.resources);
                }
            });
        }

        // IIIF v3 annotations
        if (canvasJson.annotations) {
            canvasJson.annotations.forEach((content: any) => {
                const id = content.id || content['@id'];
                if (id && !content.items) {
                    const externalList = this.manifests[id];
                    if (externalList) {
                        if (externalList.json) {
                            const parsed = parseList(externalList.json);
                            annotations.push(...parsed);
                        }
                    } else {
                        this.fetchAnnotationList(id);
                    }
                } else if (content.items) {
                    annotations.push(...content.items);
                }
            });
        }

        return annotations;
    }
}

export const manifestsState = new ManifestsState();
