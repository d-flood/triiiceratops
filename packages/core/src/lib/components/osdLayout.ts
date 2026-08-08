// Gap (in normalized world units, where a canvas is one unit wide) inserted
// between adjacent canvases in paged/continuous layouts. Deliberately *not*
// exported: this module is the one layout implementation in the repository, so
// a caller that wants the spacing that is actually on screen — the live viewer
// and the export path alike — gets it by omitting the `gap` option rather than
// by importing the number and reconstructing the layout itself. It stays an
// option so a caller with its own spacing (and, later, a configured one) can
// pass it.
//
// A caller laying out in a space where a canvas is NOT one unit wide — the
// Canvas2D renderer, whose world is canvas space, i.e. manifest Canvas pixels —
// must pass its own `gap`, because this number would be a sub-pixel hairline
// there. See `renderer/planScene.layoutCanvases`.
const DEFAULT_MULTI_CANVAS_GAP = 0.0125;

export type ViewingMode = 'individuals' | 'paged' | 'continuous';

export type ViewingDirection =
    | 'left-to-right'
    | 'right-to-left'
    | 'top-to-bottom'
    | 'bottom-to-top';

/**
 * The geometry of one source, as its caller knows it.
 *
 * `sourceWidth`/`sourceHeight` are the dimensions of the thing being laid out,
 * in whatever space the caller works in — only their ratio is used, to give the
 * canvas a height. They are deliberately *not* called `canvasWidth`/
 * `canvasHeight`: those names mean manifest Canvas dimensions elsewhere in this
 * codebase (see `ResolvedCanvasImage`), and a caller may legitimately lay out
 * from a different space. They are passed in rather than read off a tile source
 * so that layout can run before (or entirely without) any image service being
 * fetched. The OpenSeadragon renderer passes resolved image-service dimensions
 * because that is what it has to hand; manifest Canvas dimensions are the
 * authoritative geometry everywhere else.
 */
export interface CanvasGeometry {
    canvasId?: string | null;
    /** Position and extent of this source within its canvas, in world units. */
    x?: number | null;
    y?: number | null;
    width?: number | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
}

/** Where layout placed one source, in world units. */
interface PlacedRect {
    canvasId: string;
    x: number;
    y: number;
    width: number;
}

/** A layout input: geometry plus a payload layout returns untouched. */
export type PositionedTileSource = CanvasGeometry & { tileSource: unknown };

export type DisplayPositionedTileSource = PlacedRect & { tileSource: unknown };

export interface CanvasDisplayLayout {
    canvasId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The caller's payload for one source, carried through layout unread. */
type SourcePayload = Pick<PositionedTileSource, 'tileSource'>;

interface GroupedSource extends SourcePayload {
    localX: number;
    localY: number;
    localWidth: number;
    localHeight: number | null;
}

interface CanvasGroup {
    canvasId: string;
    sources: GroupedSource[];
    width: number;
    height: number | null;
}

interface CanvasLayoutResult {
    sources: DisplayPositionedTileSource[];
    layouts: CanvasDisplayLayout[];
}

function getDimension(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : null;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function groupSources(sources: PositionedTileSource[]): CanvasGroup[] {
    const groups = new Map<string, CanvasGroup>();

    sources.forEach((source, index) => {
        const canvasId = source.canvasId ?? `canvas-${index}`;
        const localX = source.x ?? 0;
        const localY = source.y ?? 0;
        const localWidth = source.width ?? 1;
        const imageWidth = getDimension(source.sourceWidth);
        const imageHeight = getDimension(source.sourceHeight);
        const localHeight =
            imageWidth && imageHeight
                ? (localWidth * imageHeight) / imageWidth
                : null;

        let group = groups.get(canvasId);
        if (!group) {
            group = { canvasId, sources: [], width: 0, height: null };
            groups.set(canvasId, group);
        }

        group.sources.push({
            tileSource: source.tileSource,
            localX,
            localY,
            localWidth,
            localHeight,
        });
        group.width = Math.max(group.width, localX + localWidth);
        group.height =
            localHeight === null
                ? null
                : Math.max(group.height ?? 0, localY + localHeight);
    });

    return [...groups.values()];
}

function useOriginalPositions(groups: CanvasGroup[]): CanvasLayoutResult {
    return {
        layouts: groups.map((group) => ({
            canvasId: group.canvasId,
            x: 0,
            y: 0,
            width: group.width,
            height: group.height ?? 1,
        })),
        sources: groups.flatMap((group) =>
            group.sources.map((placed) => ({
                tileSource: placed.tileSource,
                x: placed.localX,
                y: placed.localY,
                width: placed.localWidth,
                canvasId: group.canvasId,
            })),
        ),
    };
}

/**
 * Position every canvas in the world, in the caller's own units.
 *
 * ## Why each canvas advances by its own extent
 *
 * A multi-canvas world is laid out by walking the canvases and advancing a
 * cumulative offset. That offset advances by the canvas's **real extent** —
 * `width` along a horizontal axis, `height` along a vertical one — in every
 * mode and whether or not normalization is on.
 *
 * It did not always. When normalization was off (`preserveCanvasScale`, or a
 * sibling with no dimensions), the offset advanced by a fixed **one world
 * unit** per canvas instead. That is only ever right for a caller whose
 * canvases are one unit wide: anything wider (or, on a vertical axis, taller)
 * overlapped its neighbour, and by its whole excess — a canvas-space caller,
 * where a page is a few thousand units across, stacked its entire manifest on
 * one spot. Preserving a canvas's authored scale is a statement about its
 * SIZE; it was never a statement about where the next one goes.
 */
export function getCanvasDisplayLayouts(
    sources: PositionedTileSource[],
    options: {
        mode: ViewingMode;
        direction: ViewingDirection;
        preserveCanvasScale?: boolean;
        /** Defaults to the spacing the viewer itself lays out with. */
        gap?: number;
    },
): CanvasLayoutResult {
    const gap = options.gap ?? DEFAULT_MULTI_CANVAS_GAP;
    const groups = groupSources(sources);

    if (options.mode === 'individuals' || groups.length <= 1) {
        return useOriginalPositions(groups);
    }

    const canNormalize =
        !options.preserveCanvasScale &&
        groups.every((group) => group.height !== null);
    const referenceHeight = canNormalize
        ? median(groups.map((group) => group.height as number))
        : 1;
    const scaled = groups.map((group) => {
        const scale = canNormalize
            ? clamp(referenceHeight / (group.height as number), 0.25, 4)
            : 1;
        return {
            group,
            scale,
            width: group.width * scale,
            height: (group.height ?? 1) * scale,
            x: 0,
            y: 0,
        };
    });

    if (options.mode === 'continuous') {
        let offset = 0;
        const isVertical =
            options.direction === 'top-to-bottom' ||
            options.direction === 'bottom-to-top';
        const isReverse =
            options.direction === 'right-to-left' ||
            options.direction === 'bottom-to-top';

        // Advance by each canvas's OWN extent, always — never by a fixed one
        // world unit when normalization is off. See the note on this function.
        for (const layout of scaled) {
            if (isVertical) {
                layout.y = isReverse ? -offset : offset;
                offset += layout.height + gap;
            } else {
                layout.x = isReverse ? -offset : offset;
                offset += layout.width + gap;
            }
        }
    } else if (options.mode === 'paged') {
        const spreadHeight = Math.max(...scaled.map((layout) => layout.height));
        const isRTL = options.direction === 'right-to-left';

        scaled.forEach((layout, index) => {
            const previous = isRTL
                ? scaled.slice(index + 1)
                : scaled.slice(0, index);
            layout.x = previous.reduce(
                (offset, item) => offset + item.width + gap,
                0,
            );
            layout.y = (spreadHeight - layout.height) / 2;
        });
    }

    return {
        layouts: scaled.map((layout) => ({
            canvasId: layout.group.canvasId,
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: layout.height,
        })),
        sources: scaled.flatMap((layout) =>
            layout.group.sources.map((placed) => ({
                tileSource: placed.tileSource,
                x: layout.x + placed.localX * layout.scale,
                y: layout.y + placed.localY * layout.scale,
                width: placed.localWidth * layout.scale,
                canvasId: layout.group.canvasId,
            })),
        ),
    };
}

export function getContinuousTargetPosition(
    indexOrCanvasId: number | string,
    layouts: CanvasDisplayLayout[],
    direction: ViewingDirection,
) {
    const layout =
        typeof indexOrCanvasId === 'number'
            ? layouts[indexOrCanvasId]
            : layouts.find((item) => item.canvasId === indexOrCanvasId);

    if (!layout) return null;
    return direction === 'top-to-bottom' || direction === 'bottom-to-top'
        ? layout.y
        : layout.x;
}
