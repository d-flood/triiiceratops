/**
 * The tile pyramid, as pure geometry and URL construction.
 *
 * A IIIF Image API service is described by `info.json`; this module turns those
 * facts into the thing the planner reasons about — a list of levels, the tile
 * grid at each, and the request URL for any tile — with no I/O and no DOM. It
 * is where every "which tile, at which level, from which URL" decision lives,
 * so all of them are ordinary unit tests.
 *
 * ## Level numbering
 *
 * Level 0 is the **base level**: the coarsest level, the one that covers the
 * whole image in (typically) a single tile. The last level is full resolution.
 * Levels ascend with sharpness, which is what makes "the full chain of coarser
 * levels" a prefix — `0 .. current - 1` — rather than a suffix.
 *
 * ## Coordinates
 *
 * Tile regions are expressed in **full-resolution image pixels**, because that
 * is what a IIIF region parameter takes: a tile at scale factor `s` covers
 * `tileSize * s` full-resolution pixels and is returned scaled down by `s`. The
 * grid is therefore computed on the full-resolution image, not on the level's
 * own dimensions — the two differ by a pixel at the edges under `ceil`, and
 * that pixel is a seam.
 *
 * Image space never escapes the renderer (CONTEXT.md §Image space): callers
 * convert a tile's region into **canvas space** through the canvas's layout
 * rect, which is what `tileCanvasRect` does.
 */

import type { ImageServiceFacts, LayoutRect, TileKey } from './types';

/** One level of the pyramid. */
export interface PyramidLevel {
    /** 0 is the base (coarsest) level; the last is full resolution. */
    level: number;
    /** Full-resolution pixels per level pixel. 1 at full resolution. */
    scaleFactor: number;
    /** The level's own pixel dimensions. */
    width: number;
    height: number;
    /** Tile grid extent at this level. */
    columns: number;
    rows: number;
}

export interface TilePyramid {
    serviceId: string;
    /** Full-resolution image dimensions, from the service. */
    width: number;
    height: number;
    tileSize: number;
    /** Ordered coarsest first. Never empty. */
    levels: PyramidLevel[];
    version: 2 | 3;
    format: string;
}

/** A tile's region, in full-resolution image pixels. */
export interface TileRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A rectangle in canvas space. */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function tileKey(
    canvasId: string,
    level: number,
    column: number,
    row: number,
): TileKey {
    return `${canvasId}#${level}/${column},${row}`;
}

function usableTileSize(facts: ImageServiceFacts): number | null {
    const size = facts.tileSize;
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 1) {
        return null;
    }
    return Math.floor(size);
}

/**
 * The scale factors to build levels from, coarsest first.
 *
 * A service that advertises tiles normally advertises its scale factors too. A
 * service that advertises tiles and *no* factors is taken at its word that it
 * tiles, and the usual power-of-two chain is derived down to the level that
 * fits in one tile — the base level, which is what guarantees the viewer is
 * never blank.
 */
function resolveScaleFactors(
    facts: ImageServiceFacts,
    tileSize: number,
): number[] {
    const declared = (facts.scaleFactors ?? []).filter(
        (factor) => Number.isFinite(factor) && factor >= 1,
    );

    const factors = declared.length > 0 ? [...new Set(declared)] : [];

    if (factors.length === 0) {
        let factor = 1;
        factors.push(factor);
        while (
            Math.ceil(facts.width / factor) > tileSize ||
            Math.ceil(facts.height / factor) > tileSize
        ) {
            factor *= 2;
            factors.push(factor);
        }
    }

    // A factor so large the level is sub-pixel describes nothing, and asking
    // for a 0-wide region is a 400 from a conformant server.
    const usable = factors.filter(
        (factor) =>
            Math.floor(facts.width / factor) >= 1 &&
            Math.floor(facts.height / factor) >= 1,
    );

    return (usable.length > 0 ? usable : [1]).sort((a, b) => b - a);
}

/**
 * The pyramid for an image service, or `null` when it advertises no tiling.
 *
 * `null` is not a failure: a level0 service advertising only fixed whole-image
 * sizes is a **size-ladder source**, which has no pyramid by definition and is
 * ticket 06's job. Returning `null` is what keeps this module from inventing a
 * tile grid the server cannot serve.
 */
export function buildPyramid(
    serviceId: string,
    facts: ImageServiceFacts,
): TilePyramid | null {
    const tileSize = usableTileSize(facts);
    if (!tileSize) return null;
    if (!(facts.width > 0) || !(facts.height > 0)) return null;

    const levels = resolveScaleFactors(facts, tileSize).map(
        (scaleFactor, level): PyramidLevel => ({
            level,
            scaleFactor,
            width: Math.ceil(facts.width / scaleFactor),
            height: Math.ceil(facts.height / scaleFactor),
            // Computed on the FULL-RESOLUTION grid: a tile spans
            // `tileSize * scaleFactor` source pixels, and dividing the level's
            // own (already rounded up) dimensions instead can claim a column
            // that contains no source pixels.
            columns: Math.ceil(facts.width / (tileSize * scaleFactor)),
            rows: Math.ceil(facts.height / (tileSize * scaleFactor)),
        }),
    );

    return {
        serviceId,
        width: facts.width,
        height: facts.height,
        tileSize,
        levels,
        version: facts.version === 2 ? 2 : 3,
        format: facts.format || 'jpg',
    };
}

/** The region one tile covers, in full-resolution image pixels. */
export function tileRegion(
    pyramid: TilePyramid,
    level: PyramidLevel,
    column: number,
    row: number,
): TileRegion {
    const span = pyramid.tileSize * level.scaleFactor;
    const x = column * span;
    const y = row * span;

    return {
        x,
        y,
        // Clipped to the image: the last column and row are partial, and a
        // region running past the edge is out of spec.
        width: Math.min(span, pyramid.width - x),
        height: Math.min(span, pyramid.height - y),
    };
}

/**
 * The IIIF Image API request URL for one tile.
 *
 * The size parameter is the width-only form (`w,`), which is required from
 * level 1 upwards — the `w,h` form is a level 2 feature, and nothing here needs
 * it since the aspect ratio of a clipped edge tile is preserved either way.
 */
export function tileUrl(
    pyramid: TilePyramid,
    level: PyramidLevel,
    column: number,
    row: number,
): string {
    const region = tileRegion(pyramid, level, column, row);

    const isWholeImage =
        region.x === 0 &&
        region.y === 0 &&
        region.width === pyramid.width &&
        region.height === pyramid.height;

    const regionParameter = isWholeImage
        ? 'full'
        : `${region.x},${region.y},${region.width},${region.height}`;

    const size = Math.max(1, Math.ceil(region.width / level.scaleFactor));
    const quality = pyramid.version === 2 ? 'native' : 'default';

    return `${pyramid.serviceId}/${regionParameter}/${size},/0/${quality}.${pyramid.format}`;
}

/** Where a tile lands in **canvas space**, given its canvas's layout rect. */
export function tileCanvasRect(
    pyramid: TilePyramid,
    level: PyramidLevel,
    column: number,
    row: number,
    rect: LayoutRect,
): Box {
    const region = tileRegion(pyramid, level, column, row);
    const scaleX = rect.width / pyramid.width;
    const scaleY = rect.height / pyramid.height;

    return {
        x: rect.x + region.x * scaleX,
        y: rect.y + region.y * scaleY,
        width: region.width * scaleX,
        height: region.height * scaleY,
    };
}

/**
 * The coarsest level sharp enough for `imageScale`, in screen pixels per
 * full-resolution image pixel.
 *
 * `minPixelRatio` is how blurry a level may be before the next is promoted: at
 * 0.5 a level carrying half the density the screen could show is accepted,
 * which is the OpenSeadragon value carried forward unchanged so
 * sharpness-versus-speed does not visibly shift.
 */
export function chooseLevel(
    pyramid: TilePyramid,
    imageScale: number,
    minPixelRatio: number,
): PyramidLevel {
    const { levels } = pyramid;
    const wanted = imageScale * minPixelRatio;

    for (const level of levels) {
        if (1 / level.scaleFactor >= wanted) return level;
    }

    return levels[levels.length - 1];
}

/**
 * The tiles of a level intersecting a canvas-space box, as grid coordinates.
 *
 * A `null` box means the whole level — which is what the coarse chain asks
 * for, since a coarse level is a handful of tiles and holding all of it is what
 * makes zooming *out* instant.
 */
export function tilesIntersecting(
    pyramid: TilePyramid,
    level: PyramidLevel,
    rect: LayoutRect,
    box: Box | null,
): Array<{ column: number; row: number }> {
    let firstColumn = 0;
    let lastColumn = level.columns - 1;
    let firstRow = 0;
    let lastRow = level.rows - 1;

    if (box) {
        const span = pyramid.tileSize * level.scaleFactor;
        // Canvas space → full-resolution image space, then → grid coordinates.
        const scaleX = pyramid.width / rect.width;
        const scaleY = pyramid.height / rect.height;
        const left = (box.x - rect.x) * scaleX;
        const top = (box.y - rect.y) * scaleY;
        const right = (box.x + box.width - rect.x) * scaleX;
        const bottom = (box.y + box.height - rect.y) * scaleY;

        firstColumn = Math.max(0, Math.floor(left / span));
        lastColumn = Math.min(
            level.columns - 1,
            Math.floor((right - 1e-9) / span),
        );
        firstRow = Math.max(0, Math.floor(top / span));
        lastRow = Math.min(level.rows - 1, Math.floor((bottom - 1e-9) / span));
    }

    const tiles: Array<{ column: number; row: number }> = [];
    for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
            tiles.push({ column, row });
        }
    }
    return tiles;
}
