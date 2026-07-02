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

export interface PositionedTileSource {
    canvasId?: string;
    x?: number;
    y?: number;
    width?: number;
    tileSource?: unknown;
}

export interface CanvasDisplayLayout {
    canvasId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DisplayPositionedTileSource {
    tileSource: unknown;
    x: number;
    y: number;
    width: number;
    canvasId: string;
}

interface CanvasGroup {
    canvasId: string;
    sources: Array<{
        source: PositionedTileSource | unknown;
        tileSource: unknown;
        localX: number;
        localY: number;
        localWidth: number;
        localHeight: number | null;
    }>;
    width: number;
    height: number | null;
}

interface CanvasLayoutResult {
    sources: DisplayPositionedTileSource[];
    layouts: CanvasDisplayLayout[];
}

function isPositionedSource(source: unknown): source is PositionedTileSource {
    return !!source && typeof source === 'object' && 'tileSource' in source;
}

function getDimension(tileSource: unknown, key: 'width' | 'height') {
    if (!tileSource || typeof tileSource !== 'object') return null;
    const value = (tileSource as Record<string, unknown>)[key];
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

function groupSources(sources: unknown[]): CanvasGroup[] {
    const groups = new Map<string, CanvasGroup>();

    sources.forEach((source, index) => {
        const positioned = isPositionedSource(source);
        const tileSource = positioned ? source.tileSource : source;
        const canvasId = positioned ? (source.canvasId ?? `canvas-${index}`) : `canvas-${index}`;
        const localX = positioned ? (source.x ?? 0) : 0;
        const localY = positioned ? (source.y ?? 0) : 0;
        const localWidth = positioned ? (source.width ?? 1) : 1;
        const imageWidth = getDimension(tileSource, 'width');
        const imageHeight = getDimension(tileSource, 'height');
        const localHeight = imageWidth && imageHeight ? (localWidth * imageHeight) / imageWidth : null;

        let group = groups.get(canvasId);
        if (!group) {
            group = { canvasId, sources: [], width: 0, height: null };
            groups.set(canvasId, group);
        }

        group.sources.push({ source, tileSource, localX, localY, localWidth, localHeight });
        group.width = Math.max(group.width, localX + localWidth);
        group.height = localHeight === null ? null : Math.max(group.height ?? 0, localY + localHeight);
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
            group.sources.map(({ tileSource, localX, localY, localWidth }) => ({
                tileSource,
                x: localX,
                y: localY,
                width: localWidth,
                canvasId: group.canvasId,
            })),
        ),
    };
}

export function getCanvasDisplayLayouts(
    sources: unknown[],
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
        const isVertical = options.direction === 'top-to-bottom' || options.direction === 'bottom-to-top';
        const isReverse = options.direction === 'right-to-left' || options.direction === 'bottom-to-top';

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
            layout.group.sources.map(({ tileSource, localX, localY, localWidth }) => ({
                tileSource,
                x: layout.x + localX * layout.scale,
                y: layout.y + localY * layout.scale,
                width: localWidth * layout.scale,
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
