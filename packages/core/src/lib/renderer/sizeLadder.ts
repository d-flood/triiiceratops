/**
 * The **size-ladder source**: a level0 image service that advertises only fixed
 * whole-image sizes, and can therefore never be tiled.
 *
 * ## Two level0 shapes, one of which is not this one
 *
 * IIIF level0 says "the server serves precomputed derivatives and nothing
 * else". That leaves two genuinely different sources, and the distinction is a
 * type here rather than something derived at runtime:
 *
 * 1. a level0 service that advertises `tiles` is an ordinary **tiled source**
 *    whose level selection is restricted to the advertised scale factors —
 *    which `tilePyramid.buildPyramid` already is, because it builds levels from
 *    `scaleFactors` when the service declares them. Nothing in this module is
 *    involved;
 * 2. a level0 service that advertises only `sizes[]` is a size-ladder source.
 *    There is no tile grid to compute and no region request that would be
 *    answered: the only legal request is a whole image at one of the advertised
 *    widths.
 *
 * `buildPyramid` returning `null` for a service advertising no tiling is the
 * seam between them (see its doc comment), and `planScene` takes this module's
 * branch there.
 *
 * ## What this replaces
 *
 * `components/osdTileSources.applyLevel0LowZoomFullImageStrategy` — 200 lines
 * that reconstruct level0 semantics by monkeypatching a third-party tile
 * source's `getNumTiles`, `getTileUrl`, and `minLevel` at runtime, because that
 * class assumes arbitrary region requests exist. Modelled directly, the whole
 * of shape 2 is the rung list below and one selection rule, and shape 1 needs
 * no code at all. That module survives until ticket 18 because the
 * OpenSeadragon path still uses it.
 *
 * ## URL parity, and the one place it is knowingly broken
 *
 * Which rung is requested at which zoom, and how its size parameter is spelled
 * (`max` / `full` / `w,`), reproduce the OpenSeadragon path exactly. The
 * **quality** parameter does not: this asks for `default` where that path asks
 * for `native` on a version 2 service. `native` was deprecated in Image API 2.1
 * in favour of `default`, a 2.0 document is indistinguishable from a 2.1 one,
 * and `tilePyramid.tileUrl` already committed the renderer to `default` for the
 * same reason. Spelling the same service two different ways depending on
 * whether it happened to advertise tiles would be worse than either answer.
 */

import type { TilePyramid } from './tilePyramid';
import type { ImageServiceFacts } from './types';

/** One advertised whole image. `index` is its position in the ladder. */
export interface LadderRung {
    /** 0 is the coarsest rung; the last is the largest advertised image. */
    index: number;
    width: number;
    height: number;
    /**
     * Full-resolution pixels per rung pixel — the same quantity a
     * `PyramidLevel` carries, so both source kinds pick a level through the
     * identical `minPixelRatio` rule.
     */
    scaleFactor: number;
}

export interface SizeLadder {
    serviceId: string;
    /** Full-resolution image dimensions, from the service. */
    width: number;
    height: number;
    /** Ordered smallest first. Never empty. */
    rungs: LadderRung[];
    /**
     * The service's Image API major version, carried for one reason: the
     * whole-image size parameter is spelled `full` in version 2 and `max` in
     * version 3, and a level0 service serves exactly one of those as a file.
     */
    version: 2 | 3;
    format: string;
}

function getProfileHead(profile: unknown): string | null {
    if (typeof profile === 'string') return profile;
    if (Array.isArray(profile) && typeof profile[0] === 'string') {
        return profile[0];
    }
    return null;
}

/**
 * Whether a declared image-service profile is level0.
 *
 * A first-party copy of the predicate `components/osdTileSources` exports, so
 * nothing outside the OpenSeadragon path has to import from it — ticket 18
 * deletes that module wholesale.
 *
 * Needs no fetch: `resolveCanvasImage` reads the profile straight off the
 * manifest. The renderer itself does not consult it — `buildPyramid` and
 * `buildSizeLadder` decide from what the service actually advertises, which is
 * the fact that matters and is right even when a profile is missing or lies.
 */
export function isLevel0Profile(profile: unknown): boolean {
    const head = getProfileHead(profile);
    if (!head) return false;
    return (
        head === 'level0' ||
        head.endsWith('/level0.json') ||
        head.endsWith('#level0')
    );
}

function usableSizes(
    facts: ImageServiceFacts,
): Array<{ width: number; height: number }> {
    const seen = new Set<number>();
    const sizes: Array<{ width: number; height: number }> = [];

    for (const size of facts.sizes ?? []) {
        if (!(size?.width > 0) || !(size?.height > 0)) continue;
        // Larger than the image itself is not a derivative the server holds.
        if (size.width > facts.width || size.height > facts.height) continue;
        if (seen.has(size.width)) continue;
        seen.add(size.width);
        sizes.push({ width: size.width, height: size.height });
    }

    return sizes.sort((a, b) => a.width - b.width);
}

/**
 * The size ladder for a service that advertises no tiling, or `null` if its
 * dimensions are unusable.
 *
 * A service advertising **no sizes either** still gets a ladder — one rung, the
 * whole image. Level0 compliance requires the full-size image to be available
 * at the canonical whole-image URL, so that rung always exists; the alternative
 * is a permanently blank canvas, which is what the OpenSeadragon path does with
 * such a service today.
 */
export function buildSizeLadder(
    serviceId: string,
    facts: ImageServiceFacts,
): SizeLadder | null {
    if (!(facts.width > 0) || !(facts.height > 0)) return null;

    const sizes = usableSizes(facts);
    const rungs = (
        sizes.length > 0
            ? sizes
            : [{ width: facts.width, height: facts.height }]
    ).map(
        (size, index): LadderRung => ({
            index,
            width: size.width,
            height: size.height,
            scaleFactor: facts.width / size.width,
        }),
    );

    return {
        serviceId,
        width: facts.width,
        height: facts.height,
        rungs,
        version: facts.version === 2 ? 2 : 3,
        format: facts.format || 'jpg',
    };
}

/**
 * A tiled source's levels, seen as whole images.
 *
 * Not used for rendering — a tiled source renders as tiles — but the export
 * ladder offers whole images at every level a level0 service can serve, and
 * both level0 shapes therefore answer the same question. Building it from the
 * pyramid rather than from a second reading of `info.json` is what keeps the
 * offered sizes and the requested sizes provably the same list.
 */
export function ladderFromPyramid(pyramid: TilePyramid): SizeLadder {
    return {
        serviceId: pyramid.serviceId,
        width: pyramid.width,
        height: pyramid.height,
        // `levels` is ordered coarsest first, which is already ascending width.
        rungs: pyramid.levels.map(
            (level, index): LadderRung => ({
                index,
                width: level.width,
                height: level.height,
                scaleFactor: level.scaleFactor,
            }),
        ),
        version: pyramid.version,
        format: pyramid.format,
    };
}

/**
 * The IIIF Image API request URL for one rung: a whole image, never a region.
 *
 * The full-resolution rung takes the canonical whole-image size parameter —
 * `max` in version 3, `full` in version 2 — because that, and not `1200,`, is
 * the file a level0 derivative generator writes for the original. Every other
 * rung takes the width-only form, which is what those generators write for the
 * entries in `sizes[]`.
 */
export function rungUrl(ladder: SizeLadder, rung: LadderRung): string {
    // Version 2 compares width alone and version 3 compares both, matching the
    // OpenSeadragon path's whole-image URL exactly.
    const isFullSize =
        ladder.version === 2
            ? rung.width === ladder.width
            : rung.width === ladder.width && rung.height === ladder.height;

    const size = isFullSize
        ? ladder.version === 3
            ? 'max'
            : 'full'
        : `${rung.width},`;

    // `default`, never `native` — see the module comment.
    return `${ladder.serviceId}/full/${size}/0/default.${ladder.format}`;
}

/**
 * The rung to draw at, given `imageScale` — **device** pixels per
 * full-resolution image pixel, exactly as `tilePyramid.chooseLevel` takes it.
 *
 * Two rules, in order:
 *
 * 1. **The decoded-pixel cap.** A size-ladder source at deep zoom otherwise
 *    resolves to the largest advertised image, which for a large manuscript
 *    scan is a 100+ megapixel JPEG: decoding it pins hundreds of megabytes and
 *    can hard-crash a phone. Rungs above the cap are refused and the blur is
 *    accepted. Without this one level0 manifest defeats the memory budget the
 *    rest of the renderer is built around. The smallest rung is always kept, so
 *    a cap below every rung degrades to the cheapest image rather than to
 *    nothing.
 * 2. **The same promotion rule the pyramid uses** — the `minPixelRatio` walk,
 *    finest to coarsest (see `tilePyramid.chooseLevel`). Deliberately the same
 *    rule rather than "the smallest rung at or above what is needed": that is
 *    how the OpenSeadragon path chooses, so which image is requested at which
 *    zoom does not shift, and it means one budget governs sharpness for both
 *    source kinds instead of two that can drift apart.
 */
export function chooseRung(
    ladder: SizeLadder,
    imageScale: number,
    minPixelRatio: number,
    maxDecodedPixels: number,
): LadderRung {
    const { rungs } = ladder;

    const affordable = rungs.filter(
        (rung) => rung.width * rung.height <= maxDecodedPixels,
    );
    const candidates = affordable.length > 0 ? affordable : [rungs[0]];

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const rung = candidates[index];
        if (imageScale * rung.scaleFactor >= minPixelRatio) return rung;
    }

    return candidates[0];
}
