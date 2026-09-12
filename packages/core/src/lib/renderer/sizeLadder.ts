/**
 * The **size-ladder source**: a level0 image service that advertises only fixed
 * whole-image sizes, and can therefore never be tiled.
 *
 * ## Two level0 shapes, one of which is not this one
 *
 * IIIF level0 says "the server serves precomputed derivatives and nothing
 * else". That leaves two genuinely different sources, and which one a service is
 * is decided once, here, rather than at every request:
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
 * 200 lines that reconstructed level0 semantics by monkeypatching a third-party
 * tile source's `getNumTiles`, `getTileUrl`, and `minLevel` at runtime, because
 * that class assumes arbitrary region requests exist. Modelled directly, the
 * whole of shape 2 is the level list below — a pyramid of one-tile levels, so
 * `tilePyramid` owns every rule that follows from it — and shape 1 needs no code
 * at all.
 *
 * ## URL parity
 *
 * Which level is requested at which zoom, and how its size parameter is spelled
 * (`max` / `full` / `w,`), reproduce the previous renderer exactly. The **one**
 * knowing deviation is the quality parameter: this asks for `default` where that
 * path asks for `native` on a version 2 service, because `native` was deprecated
 * in Image API 2.1 in favour of `default` and a 2.0 document is
 * indistinguishable from a 2.1 one. A frozen pre-2016 static tree is the case
 * that answer gets wrong, and it is the reason every whole-image request carries
 * the `native` spelling as its `TileRequest.fallback` — see
 * `tilePyramid.tileRequest`.
 */

import type { PyramidLevel, TilePyramid } from './tilePyramid';
import type { ImageServiceFacts } from './types';

/**
 * The level-bearing string out of a `profile`, whatever shape it arrived in.
 *
 * All of these appear in the wild: the bare string, an array that mixes the
 * profile URI with a capabilities object in either order, and an object
 * carrying the URI under `value`, `id`, or `@id`. Lowercased because the
 * comparisons that follow are exact, and a server that spells the URI
 * `.../LEVEL0.json` still means level0.
 */
function getProfileHead(profile: unknown): string | null {
    if (typeof profile === 'string') return profile.toLowerCase();
    if (Array.isArray(profile)) {
        for (const entry of profile) {
            const head = getProfileHead(entry);
            if (head) return head;
        }
        return null;
    }
    if (profile && typeof profile === 'object') {
        const record = profile as Record<string, unknown>;
        for (const key of ['value', 'id', '@id']) {
            if (typeof record[key] === 'string') {
                return (record[key] as string).toLowerCase();
            }
        }
    }
    return null;
}

/**
 * The compliance level a profile declares, or `null` when it declares none the
 * renderer recognises.
 *
 * Spelled three ways in the wild and all three are read: the bare version 3
 * token (`level2`), the version 2 profile URI (`…/api/image/2/level2.json`),
 * and the version 1 fragment form (`…#level2`).
 *
 * `null` is a real answer and not a synonym for level0. A missing or
 * unrecognised profile means "we do not know what this service will answer",
 * which is what sends the thumbnail ladder to `info.json` rather than letting
 * it construct a region request a level0 tree would 404.
 */
export function complianceLevel(profile: unknown): 0 | 1 | 2 | null {
    const head = getProfileHead(profile);
    if (!head) return null;

    // Anchored, not a substring test: a path like `/level0-compat/.../level2.json`
    // declares level2, and matching `level0` loosely anywhere read it as level0.
    const stem = head.replace(/[?#].*$/, '');
    for (const level of [0, 1, 2] as const) {
        if (
            head === `level${level}` ||
            stem.endsWith(`/level${level}.json`) ||
            head.endsWith(`#level${level}`)
        ) {
            return level;
        }
    }

    return null;
}

/**
 * Which Image API major version a declared **profile** implies.
 *
 * A weaker question than `imageService.parseVersion`, which reads a whole
 * `info.json`: this is what the manifest alone can say, and it is asked only
 * where the thumbnail ladder builds a URL without fetching. Only the version 2
 * profile URI carries the version; the bare `level2` token is version 3
 * syntax, and version 3 is the safe default because it is the only one of the
 * two whose `quality` spelling has no deprecated alternative.
 */
export function profileVersion(profile: unknown): 2 | 3 {
    return (getProfileHead(profile) ?? '').includes('/image/2/') ? 2 : 3;
}

/**
 * Whether a declared image-service profile is level0.
 *
 * First-party, where the previous renderer read the same fact through its own
 * tile-source module.
 *
 * Needs no fetch: `resolveCanvasImage` reads the profile straight off the
 * manifest. The renderer itself does not consult it — `buildPyramid` and
 * `buildSizeLadder` decide from what the service actually advertises, which is
 * the fact that matters and is right even when a profile is missing or lies.
 */
export function isLevel0Profile(profile: unknown): boolean {
    return complianceLevel(profile) === 0;
}

function usableSizes(
    facts: ImageServiceFacts,
): Array<{ width: number; height: number }> {
    // Keyed on BOTH dimensions, matching `imageExport`'s export ladder. Width
    // alone would silently drop the second of two derivatives a service really
    // does hold separately — `{1000, 750}` and `{1000, 563}` are two files, and
    // the offered sizes and the requested sizes have to stay the same list.
    const seen = new Set<string>();
    const sizes: Array<{ width: number; height: number }> = [];

    for (const size of facts.sizes ?? []) {
        if (!(size?.width > 0) || !(size?.height > 0)) continue;
        // Larger than the image itself is not a derivative the server holds.
        if (size.width > facts.width || size.height > facts.height) continue;
        const key = `${size.width}x${size.height}`;
        if (seen.has(key)) continue;
        seen.add(key);
        sizes.push({ width: size.width, height: size.height });
    }

    return sizes.sort((a, b) => a.width - b.width);
}

/**
 * The size ladder for a **level0** service that advertises no tiling, as a
 * pyramid whose every level holds one tile — or `null` if its dimensions are
 * unusable.
 *
 * Level0 is the caller's precondition, not this function's guess — see
 * `planScene`, which will not take this branch for a service that merely omitted
 * `tiles`. A level 1/2 service can answer any region at any size, so a ladder
 * for one would turn "no tiles advertised" into a full-resolution whole-image
 * download that no budget can refuse.
 *
 * A level0 service advertising **no sizes either** still gets a ladder — one
 * level, the whole image. Level0 compliance requires the full-size image to be
 * available at the canonical whole-image URL, so that level always exists; the
 * alternative is a permanently blank canvas, which is what the previous renderer
 * did with such a service.
 */
export function buildSizeLadder(
    serviceId: string,
    facts: ImageServiceFacts,
): TilePyramid | null {
    if (!(facts.width > 0) || !(facts.height > 0)) return null;

    const sizes = usableSizes(facts);
    const levels = (
        sizes.length > 0
            ? sizes
            : [{ width: facts.width, height: facts.height }]
    ).map(
        (size, level): PyramidLevel => ({
            level,
            width: size.width,
            height: size.height,
            // Full-resolution pixels per level pixel — the same quantity a
            // tiled level carries, so both source kinds pick a level through
            // the identical `minPixelRatio` walk.
            scaleFactor: facts.width / size.width,
            columns: 1,
            rows: 1,
        }),
    );

    return {
        // `info.json` owns the base URI for image requests. It can differ from
        // the URI that fetched the document when an auth gateway signs access.
        serviceId: facts.requestBaseUri ?? serviceId,
        width: facts.width,
        height: facts.height,
        tileSize: wholeImageTileSize(facts.width, facts.height),
        levels,
        version: facts.version === 2 ? 2 : 3,
        format: facts.format || 'jpg',
        sizeForm: 'wholeImage',
        // Never read for a `wholeImage` source: every level already IS an
        // advertised whole image, so there is nothing to snap to.
        wholeImageWidths: null,
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
export function ladderFromPyramid(pyramid: TilePyramid): TilePyramid {
    return {
        ...pyramid,
        tileSize: wholeImageTileSize(pyramid.width, pyramid.height),
        // `levels` is ordered coarsest first, which is already ascending width.
        levels: pyramid.levels.map((level) => ({
            ...level,
            columns: 1,
            rows: 1,
        })),
        sizeForm: 'wholeImage',
        wholeImageWidths: null,
    };
}

/**
 * The tile width that makes every level of a whole-image source a single tile.
 *
 * The grid is computed from `tileSize * scaleFactor` against the
 * full-resolution image and a level's scale factor is at least 1, so one tile
 * covers the image as long as the tile spans the LONGER edge — the width alone
 * leaves a portrait image two rows deep.
 */
function wholeImageTileSize(width: number, height: number): number {
    return Math.max(width, height);
}
