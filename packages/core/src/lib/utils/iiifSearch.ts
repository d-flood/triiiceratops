/**
 * IIIF Content Search API: service discovery and response parsing.
 *
 * Data in, data out. The functions here take raw manifest/response JSON and the
 * active canvas list, and return plain values — no fetching, no viewer state, no
 * reactivity. `ViewerState.search` supplies the network and assigns the results.
 *
 * The same JSON serves IIIF Presentation 2.x (`@id`, `@type`, `on`, `resource`)
 * and 3.0 (`id`, `type`, `target`, `body`), and search itself has three
 * versions, so every read here is guarded and both spellings are accepted.
 */

import type { SearchHit, SearchResultGroup } from '../types/config/search';
import { bodyText } from './annotationAdapter';
import { getCanvasLabel } from './canvasLabels';
import { segmentHighlights } from './highlightSegments';
import { getCanvasId } from './iiifIds';
import { normalizeIiifTargets } from './iiifTargets';

/** IIIF Content Search API profiles, as declared on a search service. */
const SEARCH_1_PROFILE = 'http://iiif.io/api/search/1/search';
const SEARCH_0_PROFILE = 'http://iiif.io/api/search/0/search';

export interface SearchServiceRef {
    version: 0 | 1 | 2;
    serviceId: string;
}

type CanvasGroup = {
    canvasIndex: number;
    canvasLabel: string;
    hits: SearchHit[];
};

function toArray(value: any): any[] {
    return Array.isArray(value) ? value : value ? [value] : [];
}

/**
 * Discover a IIIF Content Search service from raw manifest JSON.
 *
 * Reads `service` and `services` — either may be a bare object rather than an
 * array — and matches search v0, v1 and v2 on `profile` or `type`/`@type`. v2 is
 * preferred when several are present.
 *
 * Total: every access is guarded, so no manifest shape makes this throw.
 */
export function discoverSearchService(
    manifestJson: any,
): SearchServiceRef | null {
    const services = [
        ...toArray(manifestJson?.service),
        ...toArray(manifestJson?.services),
    ];

    let v2Service: any = null;
    let v1Service: any = null;
    let v0Service: any = null;
    let typedV1Service: any = null;

    for (const service of services) {
        // A service may be a bare id string referencing a definition elsewhere;
        // there is nothing to match on, so skip it.
        if (!service || typeof service !== 'object') continue;

        const type = service.type || service['@type'];
        // `profile` may be an array, and some services spell it
        // `dcterms:conformsTo`.
        const rawProfile = service.profile ?? service['dcterms:conformsTo'];
        const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;

        if (type === 'SearchService2') {
            v2Service = service;
        } else if (!v1Service && profile === SEARCH_1_PROFILE) {
            v1Service = service;
        } else if (!v0Service && profile === SEARCH_0_PROFILE) {
            v0Service = service;
        } else if (!typedV1Service && type === 'SearchService1') {
            typedV1Service = service;
        }
    }

    // Prefer v2 over v1 over v0.
    const resolved: [any, 0 | 1 | 2][] = [
        [v2Service, 2],
        [v1Service, 1],
        [v0Service, 0],
        [typedV1Service, 1],
    ];
    for (const [service, version] of resolved) {
        if (service) {
            return { version, serviceId: service.id || service['@id'] };
        }
    }

    return null;
}

/**
 * Parse a IIIF Content Search response into canvas-grouped hits.
 *
 * `version` selects the shape: v2 returns an AnnotationPage of W3C Annotations
 * with optional contextualizing `annotations`; v0/v1 return `resources` with an
 * optional `hits` section. Hits whose target resolves to no canvas in
 * `canvases` are dropped, and groups come back in canvas order.
 */
export function parseSearchResponse(
    data: any,
    version: 0 | 1 | 2,
    canvases: any[],
): SearchResultGroup[] {
    const canvasIndexes = searchCanvasIndexes(canvases);
    const groups = new Map<number, CanvasGroup>();

    const group = (canvasIndex: number): CanvasGroup => {
        let existing = groups.get(canvasIndex);
        if (!existing) {
            existing = {
                canvasIndex,
                canvasLabel: getCanvasLabel(canvases[canvasIndex], canvasIndex),
                hits: [],
            };
            groups.set(canvasIndex, existing);
        }
        return existing;
    };

    if (version === 2) {
        parseV2(data, canvasIndexes, group);
    } else {
        parseLegacy(data, canvasIndexes, group);
    }

    return Array.from(groups.values()).sort(
        (a, b) => a.canvasIndex - b.canvasIndex,
    );
}

/**
 * Canvas id → index for the active sequence.
 *
 * `getCanvasId`, not `canvas.id`: a raw IIIF v2 canvas spells its identifier
 * `@id`, and every v2 search hit targets that spelling.
 */
function searchCanvasIndexes(canvases: any[]): Map<string, number> {
    const indexes = new Map<string, number>();
    canvases.forEach((canvas: any, index: number) => {
        const canvasId = getCanvasId(canvas);
        if (canvasId && !indexes.has(canvasId)) indexes.set(canvasId, index);
    });
    return indexes;
}

function resolveSearchTargets(
    target: unknown,
    canvasIndexes: Map<string, number>,
): { canvasIndex: number; bounds: number[] | null; allBounds: number[][] } {
    let canvasIndex = -1;
    let bounds: number[] | null = null;
    const allBounds: number[][] = [];

    for (const normalized of normalizeIiifTargets(target)) {
        const index = normalized.canvasId
            ? canvasIndexes.get(normalized.canvasId)
            : undefined;
        if (index === undefined) continue;
        if (canvasIndex === -1) canvasIndex = index;
        if (normalized.xywh) {
            allBounds.push(normalized.xywh);
            if (!bounds) bounds = normalized.xywh;
        }
    }

    return { canvasIndex, bounds, allBounds };
}

/**
 * v0/v1: `hits` carries before/match/after context, `resources` carries the
 * annotations themselves. A response may have either or both.
 */
function parseLegacy(
    data: any,
    canvasIndexes: Map<string, number>,
    group: (canvasIndex: number) => CanvasGroup,
): void {
    const resources = data?.resources || [];

    if (data?.hits) {
        const resourcesById = new Map<string, any>();
        for (const resource of resources) {
            for (const id of [resource['@id'], resource.id]) {
                if (id && !resourcesById.has(id))
                    resourcesById.set(id, resource);
            }
        }

        for (const hit of data.hits) {
            const targets = (hit.annotations || [])
                .map((id: string) => resourcesById.get(id)?.on)
                .filter(Boolean);
            const { canvasIndex, bounds, allBounds } = resolveSearchTargets(
                targets,
                canvasIndexes,
            );
            if (canvasIndex < 0) continue;

            group(canvasIndex).hits.push({
                type: 'hit',
                before: hit.before || '',
                match: hit.match || '',
                after: hit.after || '',
                bounds,
                allBounds,
            });
        }
        return;
    }

    for (const res of resources) {
        const normalizedTargets = normalizeIiifTargets(res.on);
        const firstTarget = normalizedTargets.find((target) => target.canvasId);
        if (!firstTarget?.canvasId) continue;

        const canvasIndex = canvasIndexes.get(firstTarget.canvasId) ?? -1;
        if (canvasIndex < 0) continue;

        const boundsArray = normalizedTargets
            .map((target) => target.xywh)
            .filter((b): b is [number, number, number, number] => b !== null);

        group(canvasIndex).hits.push({
            type: 'resource',
            // `bodyText`, not `resource.chars` alone: a v2 response may spell
            // the excerpt `cnt:chars`, and the annotation panel already reads
            // all three spellings for the same annotation.
            match: bodyText(res.resource) || bodyText(res),
            bounds: boundsArray[0] || null,
            allBounds: boundsArray,
        });
    }
}

/**
 * v2: `items` are the result annotations; the optional `annotations` section
 * contextualizes them with a `TextQuoteSelector` keyed by source annotation id.
 */
function parseV2(
    data: any,
    canvasIndexes: Map<string, number>,
    group: (canvasIndex: number) => CanvasGroup,
): void {
    const contextMap = new Map<
        string,
        { before: string; match: string; after: string }
    >();

    for (const page of toArray(data?.annotations)) {
        for (const anno of page.items || []) {
            for (const target of toArray(anno.target)) {
                if (!target || typeof target === 'string') continue;
                const sourceId = target.source;
                if (!sourceId) continue;

                for (const sel of toArray(target.selector)) {
                    // Prefer the first contextualizing entry for a source.
                    if (
                        sel.type === 'TextQuoteSelector' &&
                        !contextMap.has(sourceId)
                    ) {
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

    for (const item of data?.items || []) {
        const { canvasIndex, bounds, allBounds } = resolveSearchTargets(
            item.target,
            canvasIndexes,
        );
        if (canvasIndex < 0) continue;

        const context = contextMap.get(item.id || item['@id']);
        group(canvasIndex).hits.push(
            context
                ? { type: 'hit', ...context, bounds, allBounds }
                : {
                      type: 'resource',
                      match: bodyText(
                          Array.isArray(item.body) ? item.body[0] : item.body,
                      ),
                      bounds,
                      allBounds,
                  },
        );
    }
}

/**
 * Project search results into annotation JSON the overlay can render.
 *
 * One annotation per bounding box, in v2 spelling because that is what the
 * annotation adapter and the read-only overlay already consume. `match` is
 * stripped of its `<mark>` delimiters: the annotation panel shows `chars` to the
 * reader as plain text.
 */
export function buildSearchAnnotations(
    searchResults: SearchResultGroup[],
    canvases: any[],
): any[] {
    let annotationIndex = 0;
    return searchResults.flatMap((group) => {
        // Both IIIF versions, for the reason given in `searchCanvasIndexes`.
        const canvasId = getCanvasId(canvases[group.canvasIndex]);
        if (!canvasId) return [];

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
                on: `${canvasId}#xywh=${bounds.join(',')}`,
                canvasId,
                resource: {
                    '@type': 'cnt:ContentAsText',
                    chars: segmentHighlights(hit.match)
                        .map((segment) => segment.text)
                        .join(''),
                },
                isSearchHit: true,
            }));
        });
    });
}
