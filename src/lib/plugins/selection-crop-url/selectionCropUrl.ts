import { buildIiifImageRequestUrl } from '../../utils/resolveCanvasImage';

export type SelectionRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type SelectionCropUrlResult = {
    url: string | null;
    exact: boolean;
    mode:
        | 'iiif-crop'
        | 'level0-tile'
        | 'full-image'
        | 'unsupported';
    reason:
        | 'empty-selection'
        | 'missing-service'
        | 'missing-tile-source'
        | 'invalid-selection'
        | null;
    region: SelectionRect | null;
    tileLevel: number | null;
    tileX: number | null;
    tileY: number | null;
};

type TileCount = {
    x: number;
    y: number;
};

type TileBounds = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type TileSelectionSource = {
    _id?: string;
    id?: string;
    profile?: unknown;
    minLevel?: number;
    maxLevel?: number;
    width?: number;
    height?: number;
    getNumTiles?: (level: number) => TileCount | number;
    getTileBounds?: (
        level: number,
        x: number,
        y: number,
        isSource?: boolean,
    ) => TileBounds;
    getTileUrl?: (level: number, x: number, y: number) => string | (() => string);
};

type BuildSelectionCropUrlParams = {
    selection: SelectionRect;
    serviceId?: string | null;
    serviceProfile?: string | null;
    tileSource?: TileSelectionSource | null;
    baseRegion?: SelectionRect | null;
    fallbackImageUrl?: string | null;
};

function normalizeServiceId(serviceId: string | null | undefined): string | null {
    if (!serviceId) {
        return null;
    }

    return serviceId.endsWith('/info.json')
        ? serviceId.slice(0, -'/info.json'.length)
        : serviceId;
}

function normalizeTileSourceId(tileSource: TileSelectionSource | null | undefined) {
    return normalizeServiceId(tileSource?._id || tileSource?.id || null);
}

function getProfileHead(profile: unknown): string | null {
    if (typeof profile === 'string') {
        return profile;
    }

    if (Array.isArray(profile) && typeof profile[0] === 'string') {
        return profile[0];
    }

    return null;
}

function isLevel0Profile(profile: unknown): boolean {
    const profileHead = getProfileHead(profile);
    if (!profileHead) {
        return false;
    }

    return (
        profileHead === 'level0' ||
        profileHead.endsWith('/level0.json') ||
        profileHead.endsWith('#level0')
    );
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function normalizeSelection(
    selection: SelectionRect,
    bounds?: { width?: number; height?: number },
): SelectionRect | null {
    if (
        !Number.isFinite(selection.x) ||
        !Number.isFinite(selection.y) ||
        !Number.isFinite(selection.width) ||
        !Number.isFinite(selection.height)
    ) {
        return null;
    }

    const minX = Math.min(selection.x, selection.x + selection.width);
    const minY = Math.min(selection.y, selection.y + selection.height);
    const maxX = Math.max(selection.x, selection.x + selection.width);
    const maxY = Math.max(selection.y, selection.y + selection.height);

    const maxWidth =
        typeof bounds?.width === 'number' && bounds.width > 0
            ? bounds.width
            : maxX;
    const maxHeight =
        typeof bounds?.height === 'number' && bounds.height > 0
            ? bounds.height
            : maxY;

    const x = clampNumber(minX, 0, maxWidth);
    const y = clampNumber(minY, 0, maxHeight);
    const right = clampNumber(maxX, x, maxWidth);
    const bottom = clampNumber(maxY, y, maxHeight);
    const width = right - x;
    const height = bottom - y;

    if (width < 1 || height < 1) {
        return null;
    }

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
    };
}

function addBaseRegion(
    selection: SelectionRect,
    baseRegion: SelectionRect | null | undefined,
): SelectionRect {
    if (!baseRegion) {
        return selection;
    }

    return {
        x: baseRegion.x + selection.x,
        y: baseRegion.y + selection.y,
        width: selection.width,
        height: selection.height,
    };
}

function readTileCount(
    tileSource: TileSelectionSource,
    level: number,
): TileCount | null {
    const raw = tileSource.getNumTiles?.(level);

    if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || raw <= 0) {
            return null;
        }

        return { x: raw, y: raw };
    }

    if (
        raw &&
        typeof raw === 'object' &&
        Number.isFinite(raw.x) &&
        Number.isFinite(raw.y) &&
        raw.x > 0 &&
        raw.y > 0
    ) {
        return { x: raw.x, y: raw.y };
    }

    return null;
}

function rectContainsRect(outer: TileBounds, inner: SelectionRect): boolean {
    const epsilon = 0.001;
    return (
        inner.x >= outer.x - epsilon &&
        inner.y >= outer.y - epsilon &&
        inner.x + inner.width <= outer.x + outer.width + epsilon &&
        inner.y + inner.height <= outer.y + outer.height + epsilon
    );
}

function getFallbackTile(
    tileSource: TileSelectionSource,
    selection: SelectionRect,
) {
    if (!tileSource.getNumTiles || !tileSource.getTileBounds || !tileSource.getTileUrl) {
        return null;
    }

    const minLevel =
        typeof tileSource.minLevel === 'number' ? tileSource.minLevel : 0;
    const maxLevel =
        typeof tileSource.maxLevel === 'number' ? tileSource.maxLevel : minLevel;

    for (let level = maxLevel; level >= minLevel; level--) {
        const counts = readTileCount(tileSource, level);
        if (!counts || counts.x < 1 || counts.y < 1) {
            continue;
        }

        for (let tileY = 0; tileY < counts.y; tileY++) {
            for (let tileX = 0; tileX < counts.x; tileX++) {
                const bounds = tileSource.getTileBounds(level, tileX, tileY, true);

                if (!bounds || !rectContainsRect(bounds, selection)) {
                    continue;
                }

                const rawUrl = tileSource.getTileUrl(level, tileX, tileY);
                return {
                    url: typeof rawUrl === 'function' ? rawUrl() : rawUrl,
                    level,
                    tileX,
                    tileY,
                };
            }
        }
    }

    return null;
}

export function buildSelectionCropUrl(
    params: BuildSelectionCropUrlParams,
): SelectionCropUrlResult {
    const serviceId =
        normalizeServiceId(params.serviceId) ||
        normalizeTileSourceId(params.tileSource) ||
        null;
    const tileSource = params.tileSource ?? null;
    const itemBounds = params.baseRegion
        ? {
              width: params.baseRegion.width,
              height: params.baseRegion.height,
          }
        : {
              width: tileSource?.width,
              height: tileSource?.height,
          };

    const normalizedSelection = normalizeSelection(params.selection, itemBounds);
    if (!normalizedSelection) {
        return {
            url: null,
            exact: false,
            mode: 'unsupported',
            reason: 'empty-selection',
            region: null,
            tileLevel: null,
            tileX: null,
            tileY: null,
        };
    }

    if (!serviceId && !params.fallbackImageUrl) {
        return {
            url: null,
            exact: false,
            mode: 'unsupported',
            reason: 'missing-service',
            region: null,
            tileLevel: null,
            tileX: null,
            tileY: null,
        };
    }

    const region = addBaseRegion(normalizedSelection, params.baseRegion);

    if (!isLevel0Profile(params.serviceProfile ?? tileSource?.profile)) {
        if (!serviceId) {
            return {
                url: params.fallbackImageUrl ?? null,
                exact: false,
                mode: params.fallbackImageUrl ? 'full-image' : 'unsupported',
                reason: params.fallbackImageUrl ? null : 'missing-service',
                region,
                tileLevel: null,
                tileX: null,
                tileY: null,
            };
        }

        return {
            url: buildIiifImageRequestUrl(serviceId, {
                region: [region.x, region.y, region.width, region.height].join(','),
                size: 'max',
            }),
            exact: true,
            mode: 'iiif-crop',
            reason: null,
            region,
            tileLevel: null,
            tileX: null,
            tileY: null,
        };
    }

    if (tileSource) {
        const fallbackTile = getFallbackTile(tileSource, normalizedSelection);
        if (fallbackTile) {
            return {
                url: fallbackTile.url,
                exact: false,
                mode: 'level0-tile',
                reason: null,
                region,
                tileLevel: fallbackTile.level,
                tileX: fallbackTile.tileX,
                tileY: fallbackTile.tileY,
            };
        }
    }

    if (params.fallbackImageUrl) {
        return {
            url: params.fallbackImageUrl,
            exact: false,
            mode: 'full-image',
            reason: null,
            region,
            tileLevel: null,
            tileX: null,
            tileY: null,
        };
    }

    return {
        url: null,
        exact: false,
        mode: 'unsupported',
        reason: tileSource ? 'missing-service' : 'missing-tile-source',
        region,
        tileLevel: null,
        tileX: null,
        tileY: null,
    };
}