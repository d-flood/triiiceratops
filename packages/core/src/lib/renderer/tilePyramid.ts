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
 *
 * ## One level model, two source kinds
 *
 * A **size-ladder source** — a level0 service that advertises only fixed whole
 * images and can therefore never be tiled — is a pyramid whose every level holds
 * one tile (`sizeLadder.buildSizeLadder`). That is not a trick: it is what makes
 * every rule this module and the planner already implement apply to it for free
 * — the `minPixelRatio` walk, the decoded-pixel cap, the coarse chain, the
 * centre-out priority queue, the negative cache, the decoded-byte counter and
 * blur-up paint order. Modelled as a separate "whole image" channel instead,
 * each of those would have to be written a second time. The one thing that does
 * differ is how the `size` parameter is spelled, which is {@link SizeForm}.
 */

import {
    iiifImageRequestUrl,
    iiifSizeParameter,
    iiifWholeImageRequest,
} from '../utils/iiifImageRequest';
import type { ImageServiceFacts, TileKey } from './types';

/**
 * Tile width to use when a level 1/2 service advertises no `tiles` at all.
 *
 * Legal and common — Cantaloupe and IIP both ship configurations that omit the
 * key — and such a service still answers arbitrary regions, so the renderer may
 * pick the grid itself. Lives here rather than with the shipped budgets because
 * it is not policy: it is the one number {@link buildPyramid} cannot derive from
 * the service, and the caller passes it in explicitly so no code path can start
 * inventing a tile grid by accident.
 *
 * 512 rather than 256: at one derived level per power of two, a larger tile
 * means a quarter of the requests for the same pixels, against a server whose
 * per-request cost is a fresh crop-and-scale of the master.
 */
export const DERIVED_TILE_SIZE = 512;

/**
 * How a level's `size` parameter is spelled — the one difference between the
 * three request shapes a IIIF image source answers to.
 *
 * - `width`: `{w},`, available from compliance level 1 upwards. A dynamic
 *   service, and the tiles of a version 2 static tree.
 * - `widthHeight`: `{w},{h}`, the canonical size the specification's tile
 *   calculation gives a version 3 static tile tree — the exact file it
 *   advertised.
 * - `wholeImage`: the canonical whole-image spelling (`max` in version 3,
 *   `full` in version 2) at the image's own extent and `{w},` below it. A
 *   **size-ladder source**, whose every level is one advertised whole image and
 *   therefore one file.
 */
export type SizeForm = 'width' | 'widthHeight' | 'wholeImage';

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
    /**
     * The service's Image API major version. It governs the canonical
     * whole-image size parameter (`full` in version 2, `max` in version 3) and
     * whether a deprecated `native` quality is worth trying.
     */
    version: 2 | 3;
    format: string;
    /** How this source's `size` parameter is spelled. */
    sizeForm: SizeForm;
    /**
     * Advertised whole-image widths, ascending, for a **level0** service — and
     * `null` for every other service.
     *
     * A level0 endpoint is a tree of pre-generated files: it holds a whole-image
     * derivative only for the entries in `sizes[]`. The base level of a level0
     * pyramid is a single tile covering the whole image, so its request is a
     * whole-image request, and `ceil(width / scaleFactor)` is not guaranteed to
     * be one of those entries — with `width: 1201` and factors `[1,2,4,8]` the
     * base level asks for `151,` while the generator wrote `150,`. That is a
     * permanent 404 behind the negative cache, i.e. a blank base level, i.e. a
     * canvas with no blur-up at all. Snapping to the nearest advertised width
     * (see {@link tileUrl}) is what keeps the request to a file that exists.
     *
     * `null` for level 1/2 because those services compute on demand: any width
     * is a real answer there, and snapping would silently coarsen it.
     */
    wholeImageWidths: number[] | null;
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

/**
 * A tile's stable identity: the canvas, the **service** its pixels come from,
 * and its position in that service's grid.
 *
 * The service is in the key because a canvas id is not a stable name for a
 * picture — `imageRequests` says the same thing for whole decoded images.
 * Selecting a different Choice on a canvas resolves it to a different service,
 * and a key without the service is identical for both alternatives: every tile
 * the reader has already is "resident and required", so nothing is requested and
 * the first alternative is painted forever.
 *
 * The canvas is still in it as well. Two canvases painted by one service really
 * could share these pixels, but making that dedupe happen here would silently
 * change what the residency counters count and what the byte budget evicts, for
 * a case no manifest in the corpus exercises.
 */
export function tileKey(
    canvasId: string,
    serviceId: string,
    level: number,
    column: number,
    row: number,
): TileKey {
    return `${canvasId}@${serviceId}#${level}/${column},${row}`;
}

function usableTileSize(size: number | null | undefined): number | null {
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
 * The pyramid for an image service, or `null` when no tile grid may be built
 * for it.
 *
 * `null` is not a failure: a level0 service advertising only fixed whole-image
 * sizes is a **size-ladder source**, which has no pyramid by definition.
 * Returning `null` is what keeps this module from inventing a tile grid the
 * server cannot serve.
 *
 * `fallbackTileSize` is for the *other* tile-less service — a level 1/2
 * endpoint that simply does not advertise `tiles`, which is legal and common
 * (Cantaloupe and IIP both ship configurations that omit it). Such a service
 * answers arbitrary regions, so the renderer may choose the grid itself:
 * `resolveScaleFactors` derives the usual power-of-two chain and the caller
 * supplies the tile width. It is deliberately **not** applied when the service
 * declares level0 — there the missing `tiles` key is the whole of the meaning,
 * and any region request would 404.
 */
export function buildPyramid(
    serviceId: string,
    facts: ImageServiceFacts,
    fallbackTileSize?: number,
): TilePyramid | null {
    // The service was caught serving a different extent than it declares, so
    // there is no grid here to build: a region derived from either the
    // advertised tiling or a derived one falls outside the real image. It
    // renders from whole-image requests instead (`imageService`,
    // `planScene.isSizeLadderSource`).
    if (facts.regionsUntrusted) return null;

    const tileSize =
        usableTileSize(facts.tileSize) ??
        (facts.level0 ? null : usableTileSize(fallbackTileSize));
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
        // `info.json` owns the base URI for image requests. It can differ from
        // the URI that fetched the document when an auth gateway signs access.
        serviceId: facts.requestBaseUri ?? serviceId,
        width: facts.width,
        height: facts.height,
        tileSize,
        levels,
        version: facts.version === 2 ? 2 : 3,
        format: facts.format || 'jpg',
        // A level0 version 3 service is a directory of files, not a scaling
        // server, and the specification's tile calculation names those files by
        // both dimensions.
        sizeForm: facts.level0 && facts.version !== 2 ? 'widthHeight' : 'width',
        wholeImageWidths: facts.level0
            ? [
                  ...new Set(
                      (facts.sizes ?? [])
                          .map((size) => size.width)
                          .filter((width) => width > 0),
                  ),
              ].sort((a, b) => a - b)
            : null,
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
 * The advertised whole-image width closest to `width`, or `width` itself when
 * the service advertises none to choose from. Ties go to the smaller, which is
 * the cheaper decode.
 */
function snapWholeImageWidth(pyramid: TilePyramid, width: number): number {
    const widths = pyramid.wholeImageWidths;
    if (!widths || widths.length === 0) return width;

    let best = widths[0];
    for (const candidate of widths) {
        if (Math.abs(candidate - width) < Math.abs(best - width)) {
            best = candidate;
        }
    }
    return best;
}

/** What one tile's request URL is assembled from. */
interface TileRequestParts {
    /** The tile covers the entire image, so `full` is a legal region for it. */
    isWholeImage: boolean;
    region: string;
    /** The tile's own pixel dimensions, which are its canonical size. */
    width: number;
    height: number;
}

function tileRequestParts(
    pyramid: TilePyramid,
    level: PyramidLevel,
    column: number,
    row: number,
): TileRequestParts {
    const region = tileRegion(pyramid, level, column, row);

    return {
        isWholeImage:
            region.x === 0 &&
            region.y === 0 &&
            region.width === pyramid.width &&
            region.height === pyramid.height,
        region: `${region.x},${region.y},${region.width},${region.height}`,
        width: Math.max(1, Math.ceil(region.width / level.scaleFactor)),
        height: Math.max(1, Math.ceil(region.height / level.scaleFactor)),
    };
}

/**
 * Whether a level is the image at its own full extent, which is what the
 * canonical whole-image size parameter names.
 *
 * Version 2 compares width alone and version 3 both dimensions. That asymmetry
 * is the previous renderer's whole-image URL exactly, and a level0 service
 * serves one of those spellings as a file.
 */
function isFullExtent(pyramid: TilePyramid, level: PyramidLevel): boolean {
    return pyramid.version === 2
        ? level.width === pyramid.width
        : level.width === pyramid.width && level.height === pyramid.height;
}

/** The `size` parameter for one tile, per {@link SizeForm}. */
function sizeParameter(
    pyramid: TilePyramid,
    level: PyramidLevel,
    parts: TileRequestParts,
): string {
    if (pyramid.sizeForm === 'widthHeight') {
        return `${parts.width},${parts.height}`;
    }

    if (pyramid.sizeForm === 'wholeImage') {
        // The level's own advertised dimensions, not the region divided by the
        // scale factor: two derivatives can share a width and not a height
        // (`{1000,750}` and `{1000,563}` are two files), so only the level
        // knows its own extent.
        return iiifSizeParameter(
            level.width,
            isFullExtent(pyramid, level),
            pyramid.version,
        );
    }

    return `${parts.isWholeImage ? snapWholeImageWidth(pyramid, parts.width) : parts.width},`;
}

/**
 * The IIIF Image API request for one tile: the URL to ask for, and the other
 * spelling of the same pixels where the corpus does not agree on one.
 *
 * Every whole-image request is spelled with the canonical `full` region,
 * whatever the service. Image API 3.0 §4.8 names `full` the canonical region for
 * a request covering the whole image and gives static file trees as the reason
 * the canonical form matters: such a tree "will have only a single URI at which
 * the content is available". Which size parameter joins it is {@link SizeForm}'s
 * business, and a version 2 level0 tile tree additionally snaps a whole-image
 * width to an advertised one (see {@link TilePyramid.wholeImageWidths}).
 *
 * The quality is `default`, never `native`. Version 2.1 deprecated `native` and
 * requires `default` from compliance level 1 upwards, and a 2.0 document is
 * indistinguishable from a 2.1 one — same `@context`, same profile URIs — so
 * asking for `native` on a strictly-2.1 endpoint 404s every tile in the pyramid.
 *
 * ## The two alternate spellings
 *
 * A `wholeImage` source's alternative is the deprecated **quality**: a frozen
 * pre-2016 static tree spells all of its files `native`, and unlike a tile tree
 * a size ladder has nothing coarser to fall back to — the whole ladder dies and
 * the canvas is blank for the life of the page. `iiifWholeImageRequest` carries
 * the rest of that reasoning.
 *
 * A static version 3 tile tree's alternative is the explicit **region**, for a
 * whole-image tile only. A tile tree is a directory of files, and the corpus
 * does not agree on what to name that one file. `vips dzsave --layout iiif3` —
 * and therefore every page `mkiiif` generates — writes only the canonical
 * `full/362,501`. CSNTM is split against itself: its 𝔓3 tree serves both
 * spellings, while its 𝔓40 tree serves `0,0,6132,8176/192,256` and 404s
 * `full/192,256`, even though it declares those dimensions in `sizes[]` and §5.3
 * requires the `full/w,h` form for a declared size. The explicit region names
 * the same pixels, so it is the spelling tried when the canonical one is absent.
 *
 * Both are scoped to the **service**, not the tile: every request a tree
 * receives is spelled by the same generator, so one 404 settles all of them.
 * Neither applies to a partial tile — its region is mandatory and unambiguous —
 * and a level 1/2 service scales on demand, so it has no alternative at all.
 */
export function tileRequest(
    pyramid: TilePyramid,
    level: PyramidLevel,
    column: number,
    row: number,
): { url: string; fallback: { url: string; group: string } | null } {
    const parts = tileRequestParts(pyramid, level, column, row);
    const size = sizeParameter(pyramid, level, parts);

    if (pyramid.sizeForm === 'wholeImage') {
        return iiifWholeImageRequest(
            pyramid.serviceId,
            size,
            pyramid.format,
            pyramid.version,
        );
    }

    return {
        url: iiifImageRequestUrl(
            pyramid.serviceId,
            size,
            'default',
            pyramid.format,
            parts.isWholeImage ? 'full' : parts.region,
        ),
        fallback:
            parts.isWholeImage && pyramid.sizeForm === 'widthHeight'
                ? {
                      url: iiifImageRequestUrl(
                          pyramid.serviceId,
                          size,
                          'default',
                          pyramid.format,
                          parts.region,
                      ),
                      group: pyramid.serviceId,
                  }
                : null,
    };
}

/** {@link tileRequest}'s URL, for a caller that cannot use a fallback. */
export function tileUrl(
    pyramid: TilePyramid,
    level: PyramidLevel,
    column: number,
    row: number,
): string {
    return tileRequest(pyramid, level, column, row).url;
}

/**
 * Where a tile lands in **canvas space**, given the box its image paints into.
 *
 * That box is the canvas's layout rect for an ordinary canvas-filling image and
 * the painting annotation's `#xywh=` target for one that paints a sub-region —
 * which is why this takes a bare {@link Box} rather than a `LayoutRect`. A
 * pyramid tiles the picture it belongs to, not the canvas that picture sits on.
 */
export function tileCanvasRect(
    pyramid: TilePyramid,
    level: PyramidLevel,
    column: number,
    row: number,
    rect: Box,
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
 * Whether even the cheapest image this source offers is over the decoded-pixel
 * ceiling.
 *
 * {@link chooseLevel} degrades to the base level anyway for a canvas the reader
 * is looking at — a blank canvas is worse than one oversized decode, and there
 * is nothing coarser to fall back to. It is asked here so the **thumbnail** tier
 * can refuse instead: a thumbnail is one of fifty on screen at the zoom floor,
 * where the same decode is not a considered trade but fifty of them
 * (`thumbnailLadder`, which reports the refusal as
 * `ScenePlan.unresolvedThumbnails`).
 */
export function exceedsDecodedPixelCap(
    pyramid: TilePyramid,
    maxDecodedPixels: number,
): boolean {
    const base = pyramid.levels[0];
    return base.width * base.height > maxDecodedPixels;
}

/**
 * The level to draw at, given `imageScale` — **device** pixels per
 * full-resolution image pixel.
 *
 * Device pixels, not CSS pixels: the backing store is sized in device pixels, so
 * on a 2x screen a level chosen from CSS pixels carries a quarter of the detail
 * the display can actually resolve and full resolution is never reached.
 *
 * Two rules, in order:
 *
 * 1. **The decoded-pixel cap.** A size-ladder source at deep zoom otherwise
 *    resolves to the largest advertised image, which for a large manuscript scan
 *    is a 100+ megapixel JPEG: decoding it pins hundreds of megabytes and can
 *    hard-crash a phone. Levels above the cap are refused and the blur is
 *    accepted. Without this one level0 manifest defeats the memory budget the
 *    rest of the renderer is built around. The base level is always kept, so a
 *    cap below every level degrades to the cheapest image rather than to
 *    nothing — reported, not silent: see {@link exceedsDecodedPixelCap}.
 *
 *    The affordable set is the **contiguous prefix** up to the first level over
 *    the cap, not every level under it. A ladder's `sizes[]` has no required
 *    ordering by area — `{800x8000}` then `{1000x1000}` is legal — so filtering
 *    would leave a gapped set whose chain (`planScene.planPyramid` requires
 *    everything below the chosen level) reintroduces exactly the image the cap
 *    refused. Cut at the first refusal and the chain is bounded too: ladders are
 *    geometric in practice, so it sums to roughly 4/3 of the chosen level.
 *
 *    A level is affordable by its own pixel count, which is its decode only
 *    where one request is the whole level. A caller holding a tiled source
 *    therefore does not pass a cap at all — no single tile is ever the whole
 *    picture there, and the decoded-byte budget governs tiles instead.
 *
 * 2. **The promotion rule**, carried forward from the previous renderer
 *    unchanged so sharpness-versus-speed does not visibly shift: walk **finest
 *    to coarsest** and take the first level that is not oversampled past
 *    `minPixelRatio` device pixels per level pixel. At 0.5 that means up to 2x
 *    oversampling — a level carrying twice the density the screen can show — is
 *    tolerated before dropping to the next coarser one. A *higher*
 *    `minPixelRatio` therefore accepts a blurrier level, which is the direction
 *    the previous renderer documented.
 *
 *    Deliberately this rather than "the smallest level at or above what is
 *    needed", for a ladder as much as for a pyramid: one budget governs
 *    sharpness for both source kinds instead of two that can drift apart. The
 *    consequence — a gapped ladder can leave a level visibly upscaled — is a
 *    deliberate deviation from the spec's earlier wording.
 *
 * Below the base level's ratio there is nothing coarser to fall back to, so the
 * base level is the floor — which is what keeps the viewer never blank.
 */
export function chooseLevel(
    pyramid: TilePyramid,
    imageScale: number,
    minPixelRatio: number,
    maxDecodedPixels = Number.POSITIVE_INFINITY,
): PyramidLevel {
    const { levels } = pyramid;

    let affordable = 0;
    while (
        affordable < levels.length &&
        levels[affordable].width * levels[affordable].height <= maxDecodedPixels
    ) {
        affordable += 1;
    }

    for (let index = Math.max(0, affordable - 1); index >= 0; index -= 1) {
        const level = levels[index];
        // One level pixel spans `scaleFactor` full-resolution pixels, so this
        // is device pixels per level pixel.
        if (imageScale * level.scaleFactor >= minPixelRatio) return level;
    }

    return levels[0];
}

/**
 * The tiles of a level intersecting a canvas-space box, as grid coordinates.
 *
 * A `null` box means the whole level. Only the **base** level asks for that,
 * and it is one tile by construction; every other level — the coarse chain
 * included — is restricted to viewport-plus-margin, because a whole level costs
 * O(image area) while the viewport costs O(viewport area) (see
 * `planScene.planPyramid`).
 *
 * `rect` is the box the pyramid's image paints into, which is a bare
 * {@link Box} for the reason {@link tileCanvasRect}'s is.
 */
export function tilesIntersecting(
    pyramid: TilePyramid,
    level: PyramidLevel,
    rect: Box,
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
