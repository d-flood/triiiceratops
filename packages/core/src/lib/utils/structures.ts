/**
 * Parses a manifest's `structures` (Ranges) into a flat tree for a table of
 * contents. IIIF v3 Ranges nest via `items`; IIIF v2 Ranges use `@type:
 * "sc:Range"` with `canvases` / `ranges` arrays.
 */

import type { CanvasRegion } from './contentState';
import { resolveThumbnailResourceSrc } from './getThumbnailSrc';
import { getReferenceId, getResourceId } from './iiifIds';
import { getContainerType, toBehaviorList } from './iiifParsing';
import {
    normalizeIiifTargets,
    parseIiifSelectorTime,
    parseIiifTime,
    toCanvasRegion,
    type NormalizedIiifTarget,
} from './iiifTargets';
import type { IiifTemporalFragment } from './iiifTime';
import { resolveLanguageValue } from './languageMap';

export interface StructureNode {
    /** Range id */
    id: string;
    /** Human-readable label */
    label: string;
    /** Normalized IIIF behaviors applied to this range */
    behaviors: string[];
    /** Depth in the tree (0 = top-level) */
    depth: number;
    /** Canvas IDs directly referenced by this range (not children) */
    canvasIds: string[];
    /**
     * The `#t=` media time each entry of {@link canvasIds} was targeted at,
     * index-aligned with it and `null` where the target carried no time. A
     * range that targets the same canvas twice at different times — the shape
     * chapters of a single recording take — appears twice in both arrays.
     *
     * {@link canvasRegions} holds the same alignment for the spatial half of a
     * target, so a range whose items mix plain canvases, chapters and article
     * regions keeps all three arrays in step: every target pushes one entry to
     * each, whether or not it named a time or a region.
     */
    canvasTimes: (IiifTemporalFragment | null)[];
    /**
     * The `xywh` region each entry of {@link canvasIds} was targeted at,
     * index-aligned with it and `null` where the target named none. The
     * spatial peer of {@link canvasTimes}: a target may carry both, and a
     * newspaper range that names four articles on two pages appears four times
     * in every array.
     */
    canvasRegions: (CanvasRegion | null)[];
    /**
     * The range's own `thumbnail`, resolved to an image URL, or `''` where it
     * declares none. Only a `thumbnail-nav` parent's children are rendered from
     * it, but every range carries it: which parent asks for thumbnails is not
     * known at parse time.
     */
    thumbnail: string;
    /** Nested child ranges */
    children: StructureNode[];
}

/** The three index-aligned arrays a range's targets are recorded into. */
interface RangeTargets {
    canvasIds: string[];
    canvasTimes: (IiifTemporalFragment | null)[];
    canvasRegions: (CanvasRegion | null)[];
}

/**
 * Record one range target, splitting the canvas it resolves by from the
 * fragments that ride alongside it: a canvas id or a `SpecificResource`, with
 * the time and the region each spelled either in a media fragment on the id or
 * in a selector.
 */
function pushCanvasTarget(target: unknown, targets: RangeTargets) {
    const [normalized] = normalizeIiifTargets(target);
    if (!normalized?.canvasId) return;

    targets.canvasIds.push(normalized.canvasId);
    targets.canvasTimes.push(targetTime(normalized));
    targets.canvasRegions.push(toCanvasRegion(normalized.xywh));
}

/** A target's media time, from its selectors or from its own id's fragment. */
function targetTime(target: NormalizedIiifTarget): IiifTemporalFragment | null {
    for (const selector of target.selectors) {
        const time = parseIiifSelectorTime(selector);
        if (time) return time;
    }
    return target.targetId ? parseIiifTime(target.targetId) : null;
}

/**
 * A range's display hints. `behavior` is the v3 spelling and `viewingHint` the
 * v2 one; the v3 spelling wins wherever a document carries both.
 */
function getBehaviors(range: any): string[] {
    return toBehaviorList(range?.behavior ?? range?.viewingHint).filter(
        Boolean,
    );
}

function parseV3Range(range: any, depth: number): StructureNode {
    const id = getResourceId(range) ?? '';
    const label = resolveLanguageValue(range.label);
    const behaviors = getBehaviors(range);
    const targets: RangeTargets = {
        canvasIds: [],
        canvasTimes: [],
        canvasRegions: [],
    };
    const children: StructureNode[] = [];

    if (Array.isArray(range.items)) {
        for (const item of range.items) {
            if (!item) continue;
            const itemType = item.type || item['@type'];

            if (itemType === 'Range') {
                children.push(parseV3Range(item, depth + 1));
            } else if (
                getContainerType(item) ||
                itemType === 'SpecificResource' ||
                typeof item === 'string'
            ) {
                pushCanvasTarget(item, targets);
            }
        }
    }

    return {
        id,
        label,
        behaviors,
        depth,
        ...targets,
        thumbnail: resolveThumbnailResourceSrc(range.thumbnail),
        children,
    };
}

/**
 * v2 ranges have `canvases` (array of canvas URIs) and `ranges` (array of
 * range URIs or embedded ranges).
 */
function parseV2Range(
    range: any,
    depth: number,
    allRangesById: Map<string, any>,
): StructureNode {
    const id = getResourceId(range) ?? '';
    const label = resolveLanguageValue(range.label);
    const behaviors = getBehaviors(range);
    const targets: RangeTargets = {
        canvasIds: [],
        canvasTimes: [],
        canvasRegions: [],
    };
    const children: StructureNode[] = [];

    if (Array.isArray(range.canvases)) {
        for (const c of range.canvases) {
            pushCanvasTarget(getReferenceId(c) ?? '', targets);
        }
    }

    // Members (alternative v2 format)
    if (Array.isArray(range.members)) {
        for (const member of range.members) {
            const memberType = member['@type'] || member.type;
            if (memberType === 'sc:Canvas' || memberType === 'Canvas') {
                pushCanvasTarget(getResourceId(member) ?? '', targets);
            } else if (memberType === 'sc:Range' || memberType === 'Range') {
                const memberId = getResourceId(member) ?? '';
                const childRange = allRangesById.get(memberId) || member;
                children.push(
                    parseV2Range(childRange, depth + 1, allRangesById),
                );
            }
        }
    }

    // Sub-ranges
    if (Array.isArray(range.ranges)) {
        for (const r of range.ranges) {
            if (typeof r === 'string') {
                const childRange = allRangesById.get(r);
                if (childRange) {
                    children.push(
                        parseV2Range(childRange, depth + 1, allRangesById),
                    );
                }
            } else {
                children.push(parseV2Range(r, depth + 1, allRangesById));
            }
        }
    }

    return {
        id,
        label,
        behaviors,
        depth,
        ...targets,
        thumbnail: resolveThumbnailResourceSrc(range.thumbnail),
        children,
    };
}

/**
 * The ranges a conventional table of contents may show. Two behaviors take a
 * range out of one, for opposite reasons (Presentation 3.0, `behavior`):
 *
 * - `no-nav` must not appear in a navigation hierarchy at all — unnamed dead
 *   air, blank leaves — and its descendants inherit that, so the subtree goes
 *   with it.
 * - `thumbnail-nav` asks for a visual alternative instead, which clients
 *   "should not" render as a table of contents. It is served by
 *   {@link thumbnailNavKeyframes} on the scrubber, so it is dropped here rather
 *   than shown twice.
 */
export function tableOfContentsRanges(nodes: StructureNode[]): StructureNode[] {
    return nodes
        .filter(
            (node) =>
                !node.behaviors.includes('no-nav') &&
                !node.behaviors.includes('thumbnail-nav'),
        )
        .map((node) =>
            node.children.length > 0
                ? { ...node, children: tableOfContentsRanges(node.children) }
                : node,
        );
}

/**
 * The thumbnails a `thumbnail-nav` range offers for one canvas, each at the
 * second its own range starts and under its own label — keyframes along the
 * timeline, which is the visual navigation the behavior asks for.
 *
 * Sorted by time rather than trusting document order: the scrubber picks the
 * last keyframe at or before the pointer, which needs an ordered list.
 *
 * A `no-nav` child is skipped here as well as in the table of contents. The
 * strip is navigation too, and the behavior exists for exactly the dead air
 * 0229 opens with — a title card nobody should be sent to.
 */
export function thumbnailNavKeyframes(
    nodes: StructureNode[],
    canvasId: string | null,
): { seconds: number; src: string; label: string }[] {
    if (!canvasId) return [];

    const frames: { seconds: number; src: string; label: string }[] = [];
    const collect = (list: StructureNode[]): void => {
        for (const node of list) {
            if (!node.behaviors.includes('thumbnail-nav')) {
                collect(node.children);
                continue;
            }
            for (const child of node.children) {
                const index = child.canvasIds.indexOf(canvasId);
                if (
                    index < 0 ||
                    !child.thumbnail ||
                    child.behaviors.includes('no-nav')
                )
                    continue;
                frames.push({
                    seconds: child.canvasTimes[index]?.seconds ?? 0,
                    src: child.thumbnail,
                    label: child.label,
                });
            }
        }
    };
    collect(nodes);

    return frames.sort((a, b) => a.seconds - b.seconds);
}

/**
 * Parse a manifest's `structures` into the TOC tree.
 *
 * Takes **raw IIIF Manifest JSON**, v2 or v3 as authored; both Range spellings
 * are handled below. Returns an array of top-level StructureNodes.
 */
export function parseStructures(manifest: any): StructureNode[] {
    if (!manifest) return [];

    const structures = manifest.structures;
    if (!Array.isArray(structures) || structures.length === 0) return [];

    // Detect v2 vs v3 by checking the first structure's type
    const firstType = structures[0].type || structures[0]['@type'] || '';
    const isV2 =
        firstType === 'sc:Range' ||
        (firstType.includes('Range') && !!structures[0]['@type']);

    if (isV2) {
        // Build a lookup map of all ranges by id for resolving references
        const allRangesById = new Map<string, any>();
        for (const s of structures) {
            const sid = getResourceId(s);
            if (sid) allRangesById.set(sid, s);
        }

        // v2: the first range with `viewingHint: "top"` is the root range,
        // otherwise treat all as top-level
        const topRanges = structures.filter(
            (s: any) => s.viewingHint === 'top',
        );
        const roots = topRanges.length > 0 ? topRanges : [structures[0]];

        return roots.map((r: any) => parseV2Range(r, 0, allRangesById));
    }

    // v3: each item in structures is a top-level Range
    return structures.map((r: any) => parseV3Range(r, 0));
}

export function findRangeForCanvas(
    canvasId: string,
    nodes: StructureNode[],
): StructureNode | null {
    for (const node of nodes) {
        if (node.canvasIds.includes(canvasId)) return node;
        const found = findRangeForCanvas(canvasId, node.children);
        if (found) return found;
    }
    return null;
}

export function isStructureNodeActive(
    node: StructureNode,
    canvasId: string | null,
): boolean {
    if (!canvasId) return false;
    return node.canvasIds.includes(canvasId);
}

export function getSequenceNodeIndexById(
    nodes: StructureNode[],
    nodeId: string,
): number | undefined {
    const sequenceNodes = nodes.filter((node) =>
        node.behaviors.includes('sequence'),
    );
    const index = sequenceNodes.findIndex((node) => node.id === nodeId);
    return index >= 0 ? index : undefined;
}
