import { SvelteMap, SvelteSet } from 'svelte/reactivity';

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

    private getStructureSequences(manifestId: string): any[][] {
        const manifestEntry = this.getManifestEntry(manifestId);
        const manifestoObject = this.getManifest(manifestId);
        const structures = manifestEntry?.json?.structures;

        if (
            !Array.isArray(structures) ||
            !structures.length ||
            !manifestoObject
        ) {
            return [];
        }

        const sequenceRanges = structures.filter((range: any) => {
            const rawBehavior = range?.behavior;
            const behaviors = Array.isArray(rawBehavior)
                ? rawBehavior
                : rawBehavior
                  ? [rawBehavior]
                  : [];

            return behaviors.some(
                (value: unknown) =>
                    String(value).trim().toLowerCase() === 'sequence',
            );
        });

        if (!sequenceRanges.length) {
            return [];
        }

        const canvasById = new Map<string, any>();
        const manifestoSequences = manifestoObject.getSequences?.() || [];

        for (const sequence of manifestoSequences) {
            const canvases = sequence?.getCanvases?.() || [];
            for (const canvas of canvases) {
                const canvasId =
                    canvas?.id ||
                    canvas?.['@id'] ||
                    canvas?.getCanvasId?.() ||
                    canvas?.getId?.();

                if (canvasId && !canvasById.has(canvasId)) {
                    canvasById.set(canvasId, canvas);
                }
            }
        }

        return sequenceRanges
            .map((range: any) => {
                const items = Array.isArray(range?.items) ? range.items : [];
                return items
                    .map((item: any) => {
                        const canvasId =
                            typeof item === 'string'
                                ? item
                                : item?.type === 'Canvas' ||
                                    item?.['@type'] === 'Canvas'
                                  ? item.id || item['@id']
                                  : null;

                        return canvasId ? canvasById.get(canvasId) : null;
                    })
                    .filter(Boolean);
            })
            .filter((sequence) => sequence.length > 0);
    }

    private findCanvasInJson(resource: any, canvasId: string): any | null {
        if (!resource || typeof resource !== 'object') {
            return null;
        }

        const resourceId = resource.id || resource['@id'];
        const resourceType = resource.type || resource['@type'];

        if (
            resourceId === canvasId &&
            (resourceType === 'Canvas' || resourceType === 'sc:Canvas')
        ) {
            return resource;
        }

        const childCollections = [
            resource.items,
            resource.canvases,
            resource.sequences,
            resource.members,
        ];

        for (const collection of childCollections) {
            if (!Array.isArray(collection)) {
                continue;
            }

            for (const item of collection) {
                const match = this.findCanvasInJson(item, canvasId);
                if (match) {
                    return match;
                }
            }
        }

        return null;
    }

    private getCanvasJson(manifestId: string, canvasId: string): any | null {
        const manifestoObject = this.getManifest(manifestId);
        const manifestEntry = this.getManifestEntry(manifestId);

        if (manifestoObject) {
            const sequences = manifestoObject.getSequences?.() || [];
            for (const sequence of sequences) {
                const canvas = sequence?.getCanvasById?.(canvasId);
                if (canvas?.__jsonld) {
                    return canvas.__jsonld;
                }
            }
        }

        return this.findCanvasInJson(manifestEntry?.json, canvasId);
    }

    private getCanvasAnnotationListRefs(canvasJson: any): string[] {
        const ids = new SvelteSet<string>();

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

    getSequenceCount(manifestId: string) {
        const structureSequences = this.getStructureSequences(manifestId);
        if (structureSequences.length) {
            return structureSequences.length;
        }

        const m = this.getManifest(manifestId);
        if (!m) {
            return 0;
        }

        const sequences = m.getSequences();
        return Array.isArray(sequences) ? sequences.length : 0;
    }

    getCanvases(manifestId: string, sequenceIndex: number = 0) {
        const structureSequences = this.getStructureSequences(manifestId);
        if (structureSequences.length) {
            return structureSequences[
                Math.max(
                    0,
                    Math.min(sequenceIndex, structureSequences.length - 1),
                )
            ];
        }

        const m = this.getManifest(manifestId);
        if (!m) {
            return [];
        }
        const sequences = m.getSequences();
        if (!sequences || !sequences.length) return [];
        const sequence =
            sequences[
                Math.max(0, Math.min(sequenceIndex, sequences.length - 1))
            ];
        const canvases = sequence?.getCanvases?.() || [];
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

        const attachCanvasContext = (annotation: any) => {
            if (!annotation || typeof annotation !== 'object') {
                return annotation;
            }

            return {
                ...annotation,
                __triiiceratopsCanvas: {
                    id: canvasJson.id || canvasJson['@id'] || canvasId,
                    width: canvasJson.width,
                    height: canvasJson.height,
                },
            };
        };

        // Helper to parse list using Manifesto
        const parseList = (listJson: any) => {
            // manifesto.create is not available in 4.3.0 or not exported nicely?
            // Just return raw resources.
            const raw = listJson.resources || listJson.items || [];
            const items = Array.isArray(raw) ? raw : [raw];
            return items.map(attachCanvasContext);
        };

        const ensureArray = (val: any): any[] =>
            (Array.isArray(val) ? val : val ? [val] : []).map(
                attachCanvasContext,
            );

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
                    annotations.push(...ensureArray(content.resources));
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
                    annotations.push(...ensureArray(content.items));
                }
            });
        }

        return annotations;
    }
}

export const manifestsState = new ManifestsState();
