import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import type { RequestConfig } from '../types/config';
import { fetchJson } from '../utils/fetchJson';
import {
    getCanvasesForSequence,
    getSequenceCount as countSequences,
} from '../utils/iiifParsing';
import { logger } from '../logging/logger';

/**
 * One manifest's entry in the cache: the **raw JSON as fetched**, the fetch
 * error if there was one, and whether a fetch is in flight. Nothing here is
 * parsed or wrapped — the cache holds the document, and the first-party
 * enumerators in `utils/iiifParsing` read it.
 */
export interface ManifestEntry {
    json?: any;
    error?: any;
    isFetching?: boolean;
}

export class ManifestsState {
    manifests: Record<string, ManifestEntry> = $state({});
    private pendingFetches = new SvelteMap<string, Promise<void>>();

    /**
     * Store a manifest's raw JSON under its id.
     *
     * **A pure store.** It does not parse, validate, or walk the document, and
     * therefore cannot throw. That is a behavior requirement, not an aesthetic
     * one: this is reached from the public `setManifestData`, which has no
     * `try`/`catch`, so a throw here would skip the manifest-id assignment, the
     * ready marking, and the change event — leaving the viewer half-initialized
     * (SPEC → "Failure contract"). Reading the document is every enumerator's
     * job, and each of them is total.
     *
     * `async` is vestigial — the parse it awaited is gone — but the
     * `Promise<void>` signature is public and is kept deliberately.
     */
    async registerManifest(manifestId: string, json: any): Promise<void> {
        this.manifests[manifestId] = {
            json,
            isFetching: false,
        };
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
        return fetchJson(url, requestConfig);
    }

    async fetchManifest(manifestId: string, requestConfig?: RequestConfig) {
        const existing = this.manifests[manifestId];
        if (existing?.isFetching) {
            await this.pendingFetches.get(manifestId);
            return;
        }
        if (existing?.json) {
            return; // Already fetched or fetching
        }

        this.manifests[manifestId] = { isFetching: true };

        const pendingFetch = (async () => {
            const json = await fetchJson(manifestId, requestConfig);
            await this.registerManifest(manifestId, json);
        })();
        this.pendingFetches.set(manifestId, pendingFetch);

        try {
            await pendingFetch;
        } catch (error: any) {
            this.manifests[manifestId] = {
                error: error.message,
                isFetching: false,
            };
        } finally {
            this.pendingFetches.delete(manifestId);
        }
    }

    clearManifest(manifestId: string): void {
        delete this.manifests[manifestId];
    }

    getManifestEntry(manifestId: string): ManifestEntry | undefined {
        return this.manifests[manifestId];
    }

    /**
     * External annotation lists already requested, whether or not they have
     * arrived — the in-flight guard for {@link fetchAnnotationList}.
     *
     * The comment on that method's first line always claimed "already fetched or
     * fetching", but `this.manifests[url]` is only written once the response has
     * been parsed, so every call made before then started its own request. That
     * was survivable while annotations were read for one canvas on one navigation;
     * it is not now that the annotation surfaces follow the viewport and a scroll
     * through a manifest asks about each folio as it arrives.
     *
     * A plain `Set`, deliberately not reactive: nothing renders from it.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    private inFlightAnnotationLists = new Set<string>();

    async fetchAnnotationList(url: string) {
        // Already fetched, or fetching.
        if (this.manifests[url] || this.inFlightAnnotationLists.has(url))
            return;

        this.inFlightAnnotationLists.add(url);
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                this.manifests[url] = { json: data };
            } else {
                logger.error(`Failed to fetch annotation list: ${url}`);
            }
        } catch (e) {
            logger.error(`Error fetching annotation list: ${url}`, e);
        } finally {
            // Released either way: a failed list must be retryable, and leaving
            // the url marked would make one network blip permanent.
            this.inFlightAnnotationLists.delete(url);
        }
    }

    private getStructureSequences(manifestId: string): any[][] {
        const manifestEntry = this.getManifestEntry(manifestId);
        const manifestJson = manifestEntry?.json;
        const structures = manifestJson?.structures;

        if (!Array.isArray(structures) || !structures.length) {
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

        // Every canvas the manifest declares, keyed by id, so that a range's
        // canvas references can be resolved to the canvases themselves. Walks
        // the raw JSON through the first-party enumerator; it used to walk
        // `manifesto.js` sequences, which no longer exist in this cache.
        const canvasById = new SvelteMap<string, any>();
        const sequenceCount = countSequences(manifestJson);

        for (let index = 0; index < sequenceCount; index++) {
            for (const canvas of getCanvasesForSequence(manifestJson, index)) {
                const canvasId = canvas?.id || canvas?.['@id'];

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
        const manifestJson = this.getManifestEntry(manifestId)?.json;

        // The enumerated canvases first — the same list the viewer renders, so
        // an annotation is always read against the canvas that is on screen.
        // This walked `manifesto.js` sequences and unwrapped `__jsonld`; the
        // enumerator hands back that same raw JSON directly.
        const sequenceCount = countSequences(manifestJson);
        for (let index = 0; index < sequenceCount; index++) {
            const canvas = getCanvasesForSequence(manifestJson, index).find(
                (candidate) =>
                    (candidate?.id || candidate?.['@id']) === canvasId,
            );
            if (canvas) {
                return canvas;
            }
        }

        // A canvas that is in the manifest but in no sequence — inside a range,
        // a collection member, or an otherwise unenumerated branch.
        return this.findCanvasInJson(manifestJson, canvasId);
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

    /**
     * How many sequences the active manifest offers, as the sequence picker
     * counts them. Ranges with `behavior: "sequence"` define the sequences when
     * the manifest has any; the manifest's own sequences are the fallback.
     */
    getSequenceCount(manifestId: string): number {
        const structureSequences = this.getStructureSequences(manifestId);
        if (structureSequences.length) {
            return structureSequences.length;
        }

        return countSequences(this.getManifestEntry(manifestId)?.json);
    }

    /**
     * The canvases of one sequence, as **raw IIIF Canvas JSON** — v2 or v3 as
     * the manifest authored it, never a library object. Read them with core's
     * version-neutral helpers rather than by branching on IIIF version.
     *
     * Structure-derived sequences take priority, as above. `sequenceIndex` is
     * clamped into range in either case.
     */
    getCanvases(manifestId: string, sequenceIndex: number = 0): any[] {
        const structureSequences = this.getStructureSequences(manifestId);
        if (structureSequences.length) {
            return structureSequences[
                Math.max(
                    0,
                    Math.min(sequenceIndex, structureSequences.length - 1),
                )
            ];
        }

        return getCanvasesForSequence(
            this.getManifestEntry(manifestId)?.json,
            sequenceIndex,
        );
    }

    getAnnotations(manifestId: string, canvasId: string, sourceId?: string) {
        // Manifest-defined annotations only. Plugin-written display state (user
        // annotations) is per-viewer on `ViewerState` now (ADR 0007); the shared
        // manifest cache is not plugin-facing and no longer stores it. The viewer
        // merges its own user annotations on top of this result.
        return this.manualGetAnnotations(manifestId, canvasId, sourceId);
    }

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
                __triiiceratopsAnnotationOrigin: 'manifest',
            };
        };

        const appendItems = (value: any) => {
            const items = Array.isArray(value) ? value : value ? [value] : [];
            for (const item of items) {
                annotations.push(attachCanvasContext(item));
            }
        };

        const collectPages = (
            pages: any[] | undefined,
            inlineField: 'resources' | 'items',
        ) => {
            pages?.forEach((content: any) => {
                if (!this.matchesAnnotationSource(content, sourceId)) {
                    return;
                }

                const id = content['@id'] || content.id;
                const inlineItems = content[inlineField];
                if (id && !inlineItems) {
                    const externalJson = this.manifests[id]?.json;
                    if (externalJson) {
                        appendItems(
                            externalJson.resources || externalJson.items,
                        );
                    } else if (!this.manifests[id]) {
                        this.fetchAnnotationList(id);
                    }
                } else if (inlineItems) {
                    appendItems(inlineItems);
                }
            });
        };

        collectPages(canvasJson.otherContent, 'resources');
        collectPages(canvasJson.annotations, 'items');

        return annotations;
    }
}

export const manifestsState = new ManifestsState();
