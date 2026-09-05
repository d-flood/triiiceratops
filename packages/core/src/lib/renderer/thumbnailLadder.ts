/**
 * The **thumbnail tier**'s source resolution: what single small image a canvas
 * shows when it is too small on screen to deserve a pyramid.
 *
 * This is what fills the grey boxes. Scrolling a long manuscript otherwise
 * shows a river of empty rectangles, because only the two or three canvases
 * around the viewport are large enough to hold tiles.
 *
 * ## The ladder, first match wins (spec §Thumbnail resolution)
 *
 * 1. **The Canvas's declared `thumbnail`** — a fixed URL, used **as-is**, the
 *    size ladder ignored. It works for level0, it costs no discovery, and it is
 *    the publisher's own answer to this exact question, so it is always tried
 *    first. It is a **raw-JSON** branch: the Canvas is raw v2/v3 IIIF, read
 *    straight off the manifest (`canvasDescriptors.getDeclaredThumbnailUrl`),
 *    and it must never be replaced by a discovery fetch merely because the
 *    canvas no longer arrives wrapped in a parser object.
 * 2. **A profile of level 1 or 2** — such a service answers any region at any
 *    size by definition, so `{serviceId}/full/{rung},/0/default.{format}` can be
 *    constructed from manifest data alone. No `info.json`.
 * 3. **Otherwise `info.json`**, and then the service's own advertised images.
 *    This fetch is bounded by the tier: only thumbnail-tier canvases ask, only
 *    when the view is stable, and only through the same concurrency cap as the
 *    thumbnails themselves. That bound is the whole difference between this and
 *    a fetch storm that fetches all N regardless of tier.
 * 4. **The whole-image tiles of a level0 tile tree** — the levels whose grid is
 *    1x1, which are files the tile tier is already painting the canvas from —
 *    and otherwise the whole images the service advertises in `sizes[]`. Both
 *    through the same rung selection.
 * 5. **Failing all of that, nothing.** The canvas stays in the **box tier**,
 *    permanently, and is reported once so a developer can see why. It is never
 *    retried: a retry loop across hundreds of canvases against one
 *    badly-behaved institutional server is the worst kind of bug to diagnose
 *    remotely, and "no usable thumbnail" is a fact about the manifest that no
 *    number of requests will change.
 *
 *    Three shapes reach it: a service with no usable dimensions at all; one
 *    whose CHEAPEST advertised image is over `budgets.maxDecodedPixels` — a
 *    level0 master with no derivatives, where the only legal request is a
 *    hundred-megapixel decode to fill a thirty-pixel box; and a level0 tile
 *    tree that advertises no whole image at all (see step 4 at
 *    {@link resolveThumbnail}). All three are properties of the manifest and
 *    the service's facts and of nothing else, which is what keeps
 *    "permanently" honest: the answer does not move with the zoom, so a canvas
 *    cannot flip between a thumbnail and a box as the reader scrolls across a
 *    rung boundary. See {@link fromLadder}.
 *
 * ## Which rung, and why the URL set is small
 *
 * The requested size is **quantized to {@link THUMBNAIL_RUNGS}**, rounding the
 * projection up. Computing the exact projected size is the naive
 * implementation and it is a disaster: every zoom step mints a fresh URL, every
 * one misses the HTTP cache, and a pinch generates a request per frame per
 * canvas.
 *
 * Where a real ladder of advertised images exists, which rung of *that* is
 * taken is `sizeLadder.chooseRung` — the same `minPixelRatio` walk the pyramid
 * uses, which at 0.5 may be as narrow as half the width needed. Deliberately
 * the same rule rather than "the nearest advertised image at or above what is
 * needed": one sharpness budget governs both source kinds, and it is how the
 * previous renderer chose.
 *
 * The quantized rung is what that walk is asked about, not the raw projection,
 * so the URL stays stable across a zoom while the selection rule stays shared.
 */

import {
    buildSizeLadder,
    chooseRung,
    complianceLevel,
    exceedsDecodedPixelCap,
    isLevel0Profile,
    ladderFromPyramid,
    profileVersion,
    rungFallback,
    rungUrl,
    type SizeLadder,
} from './sizeLadder';
import {
    buildPyramid,
    tileFallback,
    tileUrl,
    type TilePyramid,
} from './tilePyramid';
import {
    iiifImageRequestUrl,
    iiifSizeParameter,
} from '../utils/iiifImageRequest';
import type { ImageServiceFacts, SourceDescriptor } from './types';

/**
 * The quantization ladder, in **device** pixels of requested width.
 *
 * Five rungs over four doublings covers everything between the box threshold
 * and the pyramid threshold on any display, and it is short on purpose: the
 * point of a ladder is that a continuous zoom produces a handful of distinct
 * URLs rather than one per frame, and every extra rung is another cache miss.
 *
 * A fixed contract rather than a tunable, which is why it lives here beside
 * the rule that reads it rather than among the provisional budgets in
 * `rendererDefaults`.
 */
export const THUMBNAIL_RUNGS: readonly number[] = [32, 64, 128, 256, 512];

/**
 * The **base rung** — the cheapest image in the ladder.
 *
 * Required alongside the chosen rung for the same reason a pyramid's base level
 * is required alongside its current level: it is what a canvas paints while its
 * chosen rung is still in flight, so changing zoom re-sharpens rather than
 * blanking. At two kilobytes it costs nothing, and at the derived zoom floor —
 * where every canvas in the residency window is thumbnail tier — it IS the
 * chosen rung, so the two collapse into one request.
 */
export const THUMBNAIL_BASE_RUNG = THUMBNAIL_RUNGS[0];

/**
 * The rung to ask for, given a projected width in **device** pixels.
 *
 * Rounded **up**, so a thumbnail is never asked to cover more pixels than it
 * has; clamped to the top rung.
 *
 * That clamp is a **deliberate softness**, not a coincidence of the thresholds.
 * The tier boundary is `effectiveSize = sqrt(w * h)` in CSS pixels against
 * `budgets.pyramidThreshold`, and the rung is quantized from
 * `rect.width * scale * dpr` in DEVICE pixels: the two diverge by the device
 * pixel ratio and by aspect ratio, so a wide canvas just under the pyramid
 * threshold on a 2x screen really does want more than 512 and is upscaled to
 * fill. The band is narrow — it ends at the pyramid tier, which is a page or
 * two either side of the viewport centre and gets real tiles — and a sixth rung
 * would cost every canvas in it a fresh cache-missing URL for a sharpness
 * nobody is looking at yet. The ladder's fixed contract (32/64/128/256/512)
 * trades the last half-step of sharpness at the top of the tier for a ladder
 * that stays short.
 */
export function quantizeRung(
    projectedWidth: number,
    rungs: readonly number[] = THUMBNAIL_RUNGS,
): number {
    for (const rung of rungs) {
        if (projectedWidth <= rung) return rung;
    }
    return rungs[rungs.length - 1];
}

/** What the ladder resolved to for one canvas at one rung. */
export type ThumbnailSource =
    /** A URL to request, with the alternate spelling if this service has one. */
    | {
          kind: 'url';
          url: string;
          fallback?: { url: string; group: string };
      }
    /** Nothing can be decided without this service's `info.json`. */
    | { kind: 'metadata' }
    /**
     * No usable thumbnail exists. Box tier, permanently — never a request, so
     * never a retry.
     */
    | { kind: 'none' };

export interface ResolveThumbnailInput {
    /** The Canvas's declared `thumbnail`, used as-is when present. */
    thumbnailUrl?: string | null;
    source: SourceDescriptor;
    /** `info.json` facts, if this canvas's service has already been fetched. */
    facts?: ImageServiceFacts;
    /** The quantized rung, in device pixels of width. */
    rung: number;
    /**
     * The pyramid's promotion budget, reused verbatim: it decides which
     * advertised image a real ladder resolves to.
     */
    minPixelRatio: number;
    /**
     * `budgets.maxDecodedPixels`, the one ceiling on how big a single decode may
     * be — and at this tier the ONLY thing that refuses a ladder outright.
     *
     * `chooseRung` already caps against it and degrades to the cheapest rung
     * when every rung is over; here that degradation is refused instead (see
     * {@link resolveThumbnail}, step 5).
     */
    maxDecodedPixels: number;
    /**
     * The service's full-resolution width, when it is known without a fetch —
     * the manifest's Canvas width, which is the same picture's extent for every
     * ordinary IIIF Canvas.
     *
     * Used only to keep a constructed URL legal: `{w},` larger than the image
     * is a 400 in Image API 3.0 (upscaling needs the `^` prefix) and is
     * disallowed in 2.1 as well. `null` where the manifest declares none, which
     * simply means no clamp is applied.
     */
    imageWidth?: number | null;
}

/**
 * A whole-image request for a service that answers arbitrary sizes.
 *
 * The size parameter is the width-only form, EXCEPT when the rung is at or
 * above the image's own width, where it is the canonical whole-image spelling.
 * Without that, a small canvas — a seal, a binding fragment — burns both its
 * attempts plus the `native` fallback and then stays blank with nothing in
 * `unresolvedThumbnails` to explain it, because the ladder genuinely did
 * resolve; it resolved to a URL the server refuses. `iiifSizeParameter` carries
 * the rest of the rule, and `sizeLadder.rungUrl` applies the same one to a
 * ladder's top rung — this is the branch that constructs rather than selects.
 */
function constructedUrl(
    serviceId: string,
    rung: number,
    format: string,
    version: 2 | 3,
    imageWidth: number | null | undefined,
    quality: 'default' | 'native' = 'default',
): string {
    const whole =
        typeof imageWidth === 'number' &&
        Number.isFinite(imageWidth) &&
        imageWidth > 0 &&
        rung >= imageWidth;
    return iiifImageRequestUrl(
        serviceId,
        iiifSizeParameter(rung, whole, version),
        quality,
        format,
    );
}

/**
 * A whole-image request built from manifest data or from `info.json`, for a
 * service that answers arbitrary sizes.
 *
 * Carries the same `native` fallback a size-ladder rung does, for the same
 * reason: the renderer asks every version 2 service for `default`, which is
 * right for every endpoint built since 2016 and wrong for a frozen static tree.
 * A deliberate deviation: one wasted request per broken service buys the
 * answer for the whole service.
 */
function fromConstruction(
    serviceId: string,
    rung: number,
    version: 2 | 3,
    format: string,
    imageWidth: number | null | undefined,
): ThumbnailSource {
    const url = constructedUrl(serviceId, rung, format, version, imageWidth);
    if (version !== 2) return { kind: 'url', url };

    return {
        kind: 'url',
        url,
        fallback: {
            url: constructedUrl(
                serviceId,
                rung,
                format,
                version,
                imageWidth,
                'native',
            ),
            group: serviceId,
        },
    };
}

/**
 * The rung of a real ladder of advertised images, or nothing when even its
 * cheapest image is over the decoded-pixel ceiling.
 *
 * `chooseRung` degrades to the cheapest rung rather than to nothing, because a
 * blurry canvas beats a blank one when the alternative is a pyramid-tier canvas
 * with no pixels at all. At the **thumbnail** tier that trade is inverted: the
 * canvas is at most a few hundred pixels across, and decoding a 100-megapixel
 * master to fill it is precisely the memory failure the tier exists to prevent.
 * A plain layout rect is the spec's own answer for a canvas with no usable
 * thumbnail (user story 31), so this refuses instead of degrading.
 *
 * The refusal is stated in **decoded pixels** and nothing else. Stating it
 * against `minPixelRatio` — "wider than `rung / minPixelRatio`" — reads like a
 * tighter version of the same idea and is not: `chooseRung` guarantees that
 * bound for every rung it selects except its `candidates[0]` fallback, so such
 * a test fires exactly when the SMALLEST image the service advertises is wider
 * than twice the rung, which at a 32 px rung is nearly every real derivative
 * set. A 750x563 JPEG is 1.7 MB decoded and is a perfectly good thumbnail; a
 * 12000x9000 master is 108 megapixels and is the failure being refused. Only
 * the pixel count tells those apart, and only the pixel count is independent of
 * which rung the current zoom happens to ask for — which is what makes "box
 * tier **permanently**, never retried" true rather than an artefact of the
 * viewport (see `ScenePlan.unresolvedThumbnails`).
 */
function fromLadder(
    ladder: SizeLadder,
    rung: number,
    minPixelRatio: number,
    maxDecodedPixels: number,
    tiles: TilePyramid | null,
): ThumbnailSource {
    // Rung-independent, so this answer is a fact about the manifest and the
    // service rather than about the current zoom.
    if (exceedsDecodedPixelCap(ladder, maxDecodedPixels)) {
        return { kind: 'none' };
    }

    // Asked about the QUANTIZED rung rather than the raw projection, which is
    // what keeps a zoom sweep on a handful of URLs while leaving the selection
    // rule identical to the pyramid's — cap included, which is the capping this
    // tier needs and already has.
    const imageScale = rung / ladder.width;
    const chosen = chooseRung(
        ladder,
        imageScale,
        minPixelRatio,
        maxDecodedPixels,
    );

    if (tiles) {
        // Every rung of a tile-tree ladder is a level whose single tile IS the
        // whole image, so the request is a tile request and `tileUrl` spells it
        // — including the explicit region and two-dimensional size a static
        // version 3 tree requires. Asking it rather than reimplementing it is
        // what keeps this tier on URLs the tile tier is already painting from,
        // which is the whole point of {@link ladderFromSingleTileLevels}.
        //
        // The fallback is `tileFallback`'s, not `rungFallback`'s: a whole-image
        // tile is exactly the request two static trees spell differently, and
        // its group is the service, so the answer the tile tier bought is the
        // one this tier uses.
        const level = tiles.levels[chosen.index];
        const fallback = tileFallback(tiles, level, 0, 0);
        return {
            kind: 'url',
            url: tileUrl(tiles, level, 0, 0),
            ...(fallback ? { fallback } : {}),
        };
    }

    const fallback = rungFallback(ladder, chosen);
    return {
        kind: 'url',
        url: rungUrl(ladder, chosen),
        ...(fallback ? { fallback } : {}),
    };
}

/**
 * The thumbnail rungs of a level0 **tile tree**: every level coarse enough that
 * the whole image fits in one tile, or `null` when no level does.
 *
 * A static tile tree holds its tiles. At a coarse enough scale factor the grid
 * is 1x1 and that single tile is a whole-image derivative — a real file, at a
 * size this tier wants, needing no compositing. Those levels are the ladder.
 *
 * Multi-tile levels are deliberately excluded rather than stitched: this tier is
 * "a single small image, two entries never more" (see `planScene.planThumbnail`)
 * and assembling one would break the budget model it is built on. The cost is a
 * ceiling at the largest single-tile level, so a service with a small `tileSize`
 * can leave the top of the tier's range mildly upscaled — `chooseRung` returns
 * the largest affordable rung and it is drawn soft — until the canvas grows past
 * `pyramidThreshold` and the tile tier takes over with the real grid.
 *
 * The single-tile levels are a **prefix** of `levels` and no filtering is needed
 * to find them: `levels` is ordered coarsest first, and a level's column and row
 * counts never decrease as the scale factor shrinks, so once one level needs two
 * tiles no finer one is single-tile either. That is also what keeps each rung's
 * `index` a valid index into `pyramid.levels`, which is how `fromLadder` gets
 * back to the level it must build a tile URL for.
 */
function ladderFromSingleTileLevels(pyramid: TilePyramid): SizeLadder | null {
    let count = 0;
    while (
        count < pyramid.levels.length &&
        pyramid.levels[count].columns === 1 &&
        pyramid.levels[count].rows === 1
    ) {
        count += 1;
    }
    if (count === 0) return null;

    const ladder = ladderFromPyramid(pyramid);
    return { ...ladder, rungs: ladder.rungs.slice(0, count) };
}

/**
 * The ladder for one canvas at one rung. Pure: no DOM, no I/O, deterministic in
 * its inputs, which is what makes "never retried" a property rather than a
 * hope.
 */
export function resolveThumbnail(
    input: ResolveThumbnailInput,
): ThumbnailSource {
    const { source, facts, rung, minPixelRatio, maxDecodedPixels } = input;

    // 1. The publisher's own answer, used as-is. Tried ahead of everything,
    //    including for a source kind that has no ladder at all.
    if (input.thumbnailUrl) {
        return { kind: 'url', url: input.thumbnailUrl };
    }

    // A static source is one fixed image and has no ladder to walk: there is no
    // smaller version of it to ask for. The host paints it whole (see
    // `CanvasHost.loadStaticImages`), so this is not a failure and is not
    // reported as one.
    if (source.kind !== 'service') return { kind: 'none' };

    const { serviceId, profile } = source;

    if (!facts) {
        // 2. A level 1 or 2 service answers any size, so the URL is knowable
        //    from the manifest alone. This is what makes an ordinary manifest
        //    cost ZERO `info.json` requests to fill its grey boxes.
        const level = complianceLevel(profile);
        if (level === 1 || level === 2) {
            return fromConstruction(
                serviceId,
                rung,
                profileVersion(profile),
                'jpg',
                // The manifest's Canvas width is the only figure available
                // without a fetch, and it is the right conservative bound: for
                // an ordinary Canvas it IS the image's width, and where it is
                // not, clamping early costs a marginally softer thumbnail while
                // not clamping costs a 400.
                input.imageWidth,
            );
        }

        // 3. Level0, or a profile that says nothing. Either way what this
        //    service will actually serve is not knowable without asking.
        return { kind: 'metadata' };
    }

    const format = facts.format || 'jpg';
    const version = facts.version === 2 ? 2 : 3;
    const level0 = facts.level0 === true || isLevel0Profile(profile);

    if (!level0) {
        // The service admits to serving arbitrary sizes — whether or not it
        // advertises tiles, which is a separate question this tier never asks.
        // `info.json` knows the real width, so the clamp uses it rather than
        // the manifest's guess at it.
        return fromConstruction(
            facts.requestBaseUri ?? serviceId,
            rung,
            version,
            format,
            facts.width,
        );
    }

    // 4. A level0 service serves only files it generated, and which files those
    //    are depends on what it advertises.
    //
    //    Tiles first, and only for the levels that are one tile: those tiles are
    //    files the server certainly holds, because they are the same files the
    //    tile tier is already painting this canvas from.
    //
    //    Reading `sizes[]` first was the bug. The two keys are not alternatives
    //    — a service may advertise both, and the shapes in the wild do — and a
    //    static version 3 tree holds no `full/{w},` whole-image derivative for a
    //    size in that list, canonical form being `full/{w},{h}` and this tree
    //    keying its derivatives by explicit region besides. Every rung but the
    //    largest 404'd, version 3 has no second spelling to fall back on
    //    (`rungFallback`), and the canvas sat on its error placeholder while the
    //    tile tier beside it drew the same picture perfectly.
    //
    //    Then `sizes[]`, which is the other list of files the service has
    //    stated it holds.
    //
    //    And nothing else. A tree whose grid is never 1x1 — a 3300px page over
    //    512px tiles stopping at scale factor 4 — has advertised no whole image
    //    at all, and neither key gives grounds to name one. Its scale-factor
    //    widths are not whole-image derivatives: a multi-tile level exists only
    //    as its tiles, so `full/{levelWidth},` is a file such a tree does not
    //    write. Nor is the master a fallback, though level0 compliance does
    //    guarantee it: at this tier it would be several megabytes fetched to
    //    fill a box a few hundred pixels across, of a picture the viewer
    //    already holds as tiles — the same trade the decoded-pixel cap refuses
    //    one order of magnitude further up. A tile-LESS level0 keeps that rung
    //    (`buildSizeLadder`) because there the master is the only thing the
    //    canvas can be drawn from at any tier, so the thumbnail costs nothing
    //    the pyramid tier was not fetching anyway.
    const pyramid = buildPyramid(serviceId, facts);
    const tiled = pyramid ? ladderFromSingleTileLevels(pyramid) : null;
    const advertisesSizes = (facts.sizes?.length ?? 0) > 0;
    const ladder =
        tiled ??
        (pyramid && !advertisesSizes
            ? null
            : buildSizeLadder(serviceId, facts));

    // 5. Nothing usable. Box tier, permanently.
    if (!ladder) return { kind: 'none' };

    return fromLadder(
        ladder,
        rung,
        minPixelRatio,
        maxDecodedPixels,
        tiled ? pyramid : null,
    );
}
