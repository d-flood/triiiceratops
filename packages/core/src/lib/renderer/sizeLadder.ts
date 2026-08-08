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
 * 200 lines that reconstructed level0 semantics by monkeypatching a third-party
 * tile source's `getNumTiles`, `getTileUrl`, and `minLevel` at runtime, because
 * that class assumes arbitrary region requests exist. Modelled directly, the
 * whole of shape 2 is the rung list below and one selection rule, and shape 1
 * needs no code at all.
 *
 * ## URL parity, and the one place it is knowingly broken
 *
 * Which rung is requested at which zoom, and how its size parameter is spelled
 * (`max` / `full` / `w,`), reproduce the previous renderer exactly. The
 * **quality** parameter does not: this asks for `default` where that path asks
 * for `native` on a version 2 service. `native` was deprecated in Image API 2.1
 * in favour of `default`, a 2.0 document is indistinguishable from a 2.1 one,
 * and `tilePyramid.tileUrl` already committed the renderer to `default` for the
 * same reason. Spelling the same service two different ways depending on
 * whether it happened to advertise tiles would be worse than either answer.
 *
 * The one case that answer gets wrong is a **frozen pre-2016 static tree**,
 * whose files are all spelled `native` and which therefore 404s every rung. A
 * ladder has no coarser fallback there — the whole ladder dies and the canvas
 * is blank for the life of the page — so `rungUrl` can also spell a version 2
 * rung `native`, and every rung request carries that spelling as its
 * `TileRequest.fallback`. The scheduler tries it once, per service, only after
 * `default` has actually failed (see `tileScheduler`): the happy path still
 * asks one way.
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

    for (const level of [0, 1, 2] as const) {
        if (
            head === `level${level}` ||
            head.endsWith(`/level${level}.json`) ||
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
 * The size ladder for a **level0** service that advertises no tiling, or `null`
 * if its dimensions are unusable.
 *
 * Level0 is the caller's precondition, not this function's guess — see
 * `planScene`, which will not take this branch for a service that merely
 * omitted `tiles`. A level 1/2 service can answer any region at any size, so a
 * ladder for one would turn "no tiles advertised" into a full-resolution
 * whole-image download that no budget can refuse.
 *
 * A level0 service advertising **no sizes either** still gets a ladder — one
 * rung, the whole image. Level0 compliance requires the full-size image to be
 * available at the canonical whole-image URL, so that rung always exists; the
 * alternative is a permanently blank canvas, which is what the previous
 * renderer did with such a service.
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
 *
 * `quality` is `default` everywhere in the happy path (see the module comment).
 * The only caller that passes anything else is the one building the `native`
 * fallback a version 2 request carries, which is reached only after `default`
 * has failed.
 */
export function rungUrl(
    ladder: SizeLadder,
    rung: LadderRung,
    quality: 'default' | 'native' = 'default',
): string {
    // Version 2 compares width alone and version 3 compares both, matching the
    // previous renderer's whole-image URL exactly.
    const isFullSize =
        ladder.version === 2
            ? rung.width === ladder.width
            : rung.width === ladder.width && rung.height === ladder.height;

    const size = isFullSize
        ? ladder.version === 3
            ? 'max'
            : 'full'
        : `${rung.width},`;

    return `${ladder.serviceId}/full/${size}/0/${quality}.${ladder.format}`;
}

/**
 * The `native`-quality spelling of a rung, and the scope the answer is
 * remembered for — or `null` when there is no plausible second spelling.
 *
 * Only a version 2 service has one: `native` belongs to Image API 1 and 2.0,
 * and version 3 never had it. See {@link rungUrl} and `TileRequest.fallback`.
 */
export function rungFallback(
    ladder: SizeLadder,
    rung: LadderRung,
): { url: string; group: string } | null {
    if (ladder.version !== 2) return null;
    return {
        url: rungUrl(ladder, rung, 'native'),
        // The service, not the rung: one 404 answers the question for the whole
        // ladder, which is the difference between one wasted request and one
        // per rung.
        group: ladder.serviceId,
    };
}

/**
 * Whether even the cheapest image this service offers is over the
 * decoded-pixel ceiling.
 *
 * {@link chooseRung} degrades to that rung anyway — a blank canvas is worse
 * than one oversized decode, and there is nothing coarser to fall back to — so
 * this is how the override is made **diagnosable** instead of silent. The
 * planner reports it as `ScenePlan.overCapCanvases`.
 */
export function exceedsDecodedPixelCap(
    ladder: SizeLadder,
    maxDecodedPixels: number,
): boolean {
    const cheapest = ladder.rungs[0];
    return cheapest.width * cheapest.height > maxDecodedPixels;
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
 *    nothing — reported, not silent: see {@link exceedsDecodedPixelCap}.
 *
 *    The affordable set is the **contiguous prefix** up to the first rung over
 *    the cap, not every rung under it. `sizes[]` has no required ordering by
 *    area — `{800x8000}` then `{1000x1000}` is legal — so filtering would leave
 *    a gapped set whose chain (`planScene.planSizeLadder` requires everything
 *    below the chosen rung) reintroduces exactly the image the cap refused.
 *    Cut at the first refusal and the chain is bounded too: ladders are
 *    geometric in practice, so it sums to roughly 4/3 of the chosen rung.
 * 2. **The same promotion rule the pyramid uses** — the `minPixelRatio` walk,
 *    finest to coarsest (see `tilePyramid.chooseLevel`): the largest rung that
 *    is not oversampled past `minPixelRatio` device pixels per rung pixel, so
 *    at 0.5 the chosen rung may be as much as half the width actually needed
 *    and the last half-step of sharpness is traded for the smaller decode.
 *    Deliberately this rather than "the smallest rung at or above what is
 *    needed": that is how the previous renderer chose, so which image is
 *    requested at which zoom does not shift, and it means one budget governs
 *    sharpness for both source kinds instead of two that can drift apart. The
 *    consequence — a gapped ladder can leave a rung visibly upscaled — is a
 *    recorded deviation from the spec's earlier wording (TRACKER Notes).
 */
export function chooseRung(
    ladder: SizeLadder,
    imageScale: number,
    minPixelRatio: number,
    maxDecodedPixels: number,
): LadderRung {
    const { rungs } = ladder;

    let affordableCount = 0;
    while (
        affordableCount < rungs.length &&
        rungs[affordableCount].width * rungs[affordableCount].height <=
            maxDecodedPixels
    ) {
        affordableCount += 1;
    }

    const candidates =
        affordableCount > 0 ? rungs.slice(0, affordableCount) : [rungs[0]];

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const rung = candidates[index];
        if (imageScale * rung.scaleFactor >= minPixelRatio) return rung;
    }

    return candidates[0];
}
