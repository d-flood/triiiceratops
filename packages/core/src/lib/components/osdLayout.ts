// Gap (in normalized OSD world units) inserted between adjacent canvases in
// paged/continuous layouts. Exported so anything reconstructing this layout
// outside the live viewer (e.g. an export/download plugin) uses the same
// spacing as what's actually on screen.
export const MULTI_CANVAS_GAP = 0.0125;

export type ViewingMode = 'individuals' | 'paged' | 'continuous';

export type ViewingDirection =
    | 'left-to-right'
    | 'right-to-left'
    | 'top-to-bottom'
    | 'bottom-to-top';

/**
 * The geometry of one source, as its caller knows it.
 *
 * `canvasWidth`/`canvasHeight` are the dimensions of the thing being laid out,
 * in whatever space the caller works in — only their ratio is used, to give the
 * canvas a height. They are passed in rather than read off a tile source so
 * that layout can run before (or entirely without) any image service being
 * fetched. The OpenSeadragon renderer passes resolved image-service dimensions
 * because that is what it has to hand; manifest Canvas dimensions are the
 * authoritative geometry everywhere else.
 */
export interface CanvasGeometry {
    canvasId?: string;
    /** Position and extent of this source within its canvas, in world units. */
    x?: number;
    y?: number;
    width?: number;
    canvasWidth?: number | null;
    canvasHeight?: number | null;
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

/** The caller's payload for one source, carried through layout unread. */
type SourcePayload = Pick<PositionedTileSource, 'tileSource'>;

export interface CanvasDisplayLayout {
    canvasId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface GroupedSource {
    payload: SourcePayload;
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
        const {
            canvasId = `canvas-${index}`,
            x: localX = 0,
            y: localY = 0,
            width: localWidth = 1,
            canvasWidth,
            canvasHeight,
            ...payload
        } = source;
        const imageWidth = getDimension(canvasWidth);
        const imageHeight = getDimension(canvasHeight);
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
            payload,
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
            group.sources.map(({ payload, localX, localY, localWidth }) => ({
                ...payload,
                x: localX,
                y: localY,
                width: localWidth,
                canvasId: group.canvasId,
            })),
        ),
    };
}

export function getCanvasDisplayLayouts(
    sources: PositionedTileSource[],
    options: {
        mode: ViewingMode;
        direction: ViewingDirection;
        preserveCanvasScale?: boolean;
        gap: number;
    },
): CanvasLayoutResult {
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

        for (const layout of scaled) {
            if (isVertical) {
                layout.y = isReverse ? -offset : offset;
                offset += (canNormalize ? layout.height : 1) + options.gap;
            } else {
                layout.x = isReverse ? -offset : offset;
                offset += (canNormalize ? layout.width : 1) + options.gap;
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
                (offset, item) =>
                    offset + (canNormalize ? item.width : 1) + options.gap,
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
            layout.group.sources.map(
                ({ payload, localX, localY, localWidth }) => ({
                    ...payload,
                    x: layout.x + localX * layout.scale,
                    y: layout.y + localY * layout.scale,
                    width: localWidth * layout.scale,
                    canvasId: layout.group.canvasId,
                }),
            ),
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
