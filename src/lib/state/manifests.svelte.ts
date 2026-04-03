import { SvelteMap } from 'svelte/reactivity';

import type { RequestConfig } from '../types/config';
import { loadManifestoModule } from './manifestoRuntime';

export interface ManifestEntry {
    json?: any;
    manifesto?: any;
    error?: any;
    isFetching?: boolean;
}

export class ManifestsState {
    manifests: Record<string, ManifestEntry> = $state({});

    // User-created annotations (from plugins like annotation editor)
    userAnnotations: SvelteMap<string, any[]> = new SvelteMap();

    constructor() {}

    async registerManifest(manifestId: string, json: any): Promise<void> {
        const manifestoModule = await loadManifestoModule();
        const manifestoObject = manifestoModule.parseManifest(json);
        this.manifests[manifestId] = {
            json,
            manifesto: manifestoObject,
            isFetching: false,
        };
    }

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
        this.userAnnotations.set(key, annotations);
    }

    clearUserAnnotations(manifestId: string, canvasId: string): void {
        const key = this.userAnnotationKey(manifestId, canvasId);
        if (this.userAnnotations.has(key)) {
            this.userAnnotations.delete(key);
        }
    }

    getUserAnnotations(manifestId: string, canvasId: string): any[] {
        const key = this.userAnnotationKey(manifestId, canvasId);
        return this.userAnnotations.get(key) ?? [];
    }

    // === Manifest Fetching ===

    /**
     * Fetch a IIIF resource by URL and return the raw JSON.
     * Does not register it as a manifest. Used for collection detection.
     */
    async fetchResource(
        url: string,
        requestConfig?: RequestConfig,
    ): Promise<any> {
        const response = await fetch(url, {
            headers: requestConfig?.headers,
            credentials: requestConfig?.withCredentials
                ? 'include'
                : 'same-origin',
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }

    async fetchManifest(manifestId: string, requestConfig?: RequestConfig) {
        const existing = this.manifests[manifestId];
        if (
            existing &&
            (existing.isFetching || existing.json || existing.manifesto)
        ) {
            return; // Already fetched or fetching
        }

        this.manifests[manifestId] = { isFetching: true };

        try {
            const response = await fetch(manifestId, {
                headers: requestConfig?.headers,
                credentials: requestConfig?.withCredentials
                    ? 'include'
                    : 'same-origin',
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const json = await response.json();
            await this.registerManifest(manifestId, json);
        } catch (error: any) {
            this.manifests[manifestId] = {
                error: error.message,
                isFetching: false,
            };
        }
    }

    clearManifest(manifestId: string): void {
        delete this.manifests[manifestId];
    }

    getManifest(manifestId: string) {
        const entry = this.manifests[manifestId];
        return entry?.manifesto;
    }

    getManifestEntry(manifestId: string): ManifestEntry | undefined {
        return this.manifests[manifestId];
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

    private getCanvasJson(manifestId: string, canvasId: string): any | null {
        const manifestoObject = this.getManifest(manifestId);
        if (!manifestoObject) return null;

        const canvas = manifestoObject
            .getSequences()[0]
            .getCanvasById(canvasId);
        return canvas?.__jsonld || null;
    }

    private getCanvasAnnotationListRefs(canvasJson: any): string[] {
        const ids = new Set<string>();

        canvasJson?.otherContent?.forEach((content: any) => {
            const id = content['@id'] || content.id;
            if (id && !content.resources) {
                ids.add(id);
            }
        });

        canvasJson?.annotations?.forEach((content: any) => {
            const id = content.id || content['@id'];
            if (id && !content.items) {
                ids.add(id);
            }
        });

        return [...ids];
    }

    private matchesAnnotationSource(content: any, sourceId?: string): boolean {
        if (!sourceId) {
            return true;
        }

        return (content?.id || content?.['@id']) === sourceId;
    }

    async ensureCanvasAnnotations(
        manifestId: string,
        canvasId: string,
        sourceId?: string,
    ) {
        const canvasJson = this.getCanvasJson(manifestId, canvasId);
        if (!canvasJson) {
            return [];
        }

        const annotationListRefs = this.getCanvasAnnotationListRefs(
            canvasJson,
        ).filter((id) => !sourceId || id === sourceId);
        await Promise.all(
            annotationListRefs.map(async (url) => {
                if (!this.manifests[url]) {
                    await this.fetchAnnotationList(url);
                }
            }),
        );

        return this.getAnnotations(manifestId, canvasId, sourceId);
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

    getAnnotations(manifestId: string, canvasId: string, sourceId?: string) {
        // Get manifest annotations
        const manifestAnnos = this.manualGetAnnotations(
            manifestId,
            canvasId,
            sourceId,
        );

        if (sourceId) {
            return manifestAnnos;
        }

        // Get user-created annotations
        const userAnnos = this.getUserAnnotations(manifestId, canvasId);
        // Merge both sources
        return [...manifestAnnos, ...userAnnos];
    }

    // We can refactor this to use Manifesto's resource handling later if needed.
    manualGetAnnotations(
        manifestId: string,
        canvasId: string,
        sourceId?: string,
    ) {
        const canvasJson = this.getCanvasJson(manifestId, canvasId);
        if (!canvasJson) return [];

        const annotations: any[] = [];

        // Helper to parse list using Manifesto
        const parseList = (listJson: any) => {
            // manifesto.create is not available in 4.3.0 or not exported nicely?
            // Just return raw resources.
            return listJson.resources || listJson.items || [];
        };

        // IIIF v2 otherContent
        if (canvasJson.otherContent) {
            canvasJson.otherContent.forEach((content: any) => {
                if (!this.matchesAnnotationSource(content, sourceId)) {
                    return;
                }

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
                if (!this.matchesAnnotationSource(content, sourceId)) {
                    return;
                }

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
