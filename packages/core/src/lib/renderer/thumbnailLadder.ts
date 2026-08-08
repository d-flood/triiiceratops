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
 *    the fetch storm the epic exists to remove — the storm was fetching all N
 *    regardless of tier.
 * 4. **The advertised-scale-factor whole images** for a level0 service that
 *    tiles, through the same rung selection.
 * 5. **Failing all of that, nothing.** The canvas stays in the **box tier**,
 *    permanently, and is reported once so a developer can see why. It is never
 *    retried: a retry loop across hundreds of canvases against one
 *    badly-behaved institutional server is the worst kind of bug to diagnose
 *    remotely, and "no usable thumbnail" is a fact about the manifest that no
 *    number of requests will change.
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
 * needed" (TRACKER, knowing deviation for ticket 06): one sharpness budget
 * governs both source kinds, and it is how the OpenSeadragon path chose.
 *
 * The quantized rung is what that walk is asked about, not the raw projection,
 * so the URL stays stable across a zoom while the selection rule stays shared.
 */

import {
    buildSizeLadder,
    chooseRung,
    complianceLevel,
    isLevel0Profile,
    ladderFromPyramid,
    profileVersion,
    rungFallback,
    rungUrl,
    type SizeLadder,
} from './sizeLadder';
import { buildPyramid } from './tilePyramid';
import type { ImageServiceFacts, SourceDescriptor } from './types';

/**
 * The quantization ladder, in **device** pixels of requested width.
 *
 * Five rungs over four doublings covers everything between the box threshold
 * and the pyramid threshold on any display, and it is short on purpose: the
 * point of a ladder is that a continuous zoom produces a handful of distinct
 * URLs rather than one per frame, and every extra rung is another cache miss.
 *
 * Stated by the ticket's contract rather than tuned, which is why it lives here
 * beside the rule that reads it rather than among the provisional budgets in
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
 * has; clamped to the top rung, above which the canvas is about to become
 * pyramid tier anyway.
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
     * The pyramid's promotion budget, reused verbatim. It decides which
     * advertised image a real ladder resolves to, and — through
     * {@link tooCoarseForThumbnail} — whether that ladder can serve a thumbnail
     * at all.
     */
    minPixelRatio: number;
}

/** `{serviceId}/full/{rung},/0/default.{format}` — the level 1/2 construction. */
function constructedUrl(
    serviceId: string,
    rung: number,
    format: string,
    quality: 'default' | 'native' = 'default',
): string {
    return `${serviceId}/full/${rung},/0/${quality}.${format}`;
}

/**
 * A whole-image request built from manifest data or from `info.json`, for a
 * service that answers arbitrary sizes.
 *
 * Carries the same `native` fallback a size-ladder rung does, for the same
 * reason: the renderer asks every version 2 service for `default`, which is
 * right for every endpoint built since 2016 and wrong for a frozen static tree
 * (TRACKER, knowing deviation for ticket 06). One wasted request per broken
 * service buys the answer for the whole service.
 */
function fromConstruction(
    serviceId: string,
    rung: number,
    version: 2 | 3,
    format: string,
): ThumbnailSource {
    const url = constructedUrl(serviceId, rung, format);
    if (version !== 2) return { kind: 'url', url };

    return {
        kind: 'url',
        url,
        fallback: {
            url: constructedUrl(serviceId, rung, format, 'native'),
            group: serviceId,
        },
    };
}

/**
 * Whether the smallest image this ladder can serve is too big to be a
 * thumbnail.
 *
 * `chooseRung` degrades to the cheapest rung rather than to nothing, because a
 * blurry canvas beats a blank one when the alternative is a pyramid-tier canvas
 * with no pixels at all. At the **thumbnail** tier that trade is inverted: the
 * canvas is at most a few hundred pixels across, and decoding a 100-megapixel
 * master to fill it is precisely the memory failure the tier exists to prevent.
 * A plain layout rect is the spec's own answer for a canvas with no usable
 * thumbnail (user story 31), so this refuses instead.
 *
 * The threshold is `minPixelRatio` restated as a hard limit rather than a
 * preference: `chooseRung` accepts a rung no wider than `rung / minPixelRatio`,
 * so anything wider than that is a rung the walk did not want either and only
 * returned because there was nothing else.
 */
function tooCoarseForThumbnail(
    width: number,
    rung: number,
    minPixelRatio: number,
): boolean {
    return minPixelRatio > 0 && width > rung / minPixelRatio;
}

function fromLadder(
    ladder: SizeLadder,
    rung: number,
    minPixelRatio: number,
): ThumbnailSource {
    // Asked about the QUANTIZED rung rather than the raw projection, which is
    // what keeps a zoom sweep on a handful of URLs while leaving the selection
    // rule identical to the pyramid's.
    const imageScale = rung / ladder.width;
    // No decoded-pixel cap here: `tooCoarseForThumbnail` below is strictly
    // tighter at this tier, and passing a cap as well would let the ladder
    // return an image the cap kept but this tier still cannot use.
    const chosen = chooseRung(ladder, imageScale, minPixelRatio, Infinity);

    if (tooCoarseForThumbnail(chosen.width, rung, minPixelRatio)) {
        return { kind: 'none' };
    }

    const fallback = rungFallback(ladder, chosen);
    return {
        kind: 'url',
        url: rungUrl(ladder, chosen),
        ...(fallback ? { fallback } : {}),
    };
}

/**
 * The ladder for one canvas at one rung. Pure: no DOM, no I/O, deterministic in
 * its inputs, which is what makes "never retried" a property rather than a
 * hope.
 */
export function resolveThumbnail(
    input: ResolveThumbnailInput,
): ThumbnailSource {
    const { source, facts, rung, minPixelRatio } = input;

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
        return fromConstruction(serviceId, rung, version, format);
    }

    // 4. A level0 service serves only files it generated. If it advertises
    //    sizes those are the files; if it advertises tiles instead, its
    //    scale-factor whole images are (`ladderFromPyramid`, the strategy
    //    ticket 06 built for exactly this shape).
    const pyramid =
        (facts.sizes?.length ?? 0) > 0 ? null : buildPyramid(serviceId, facts);
    const ladder = pyramid
        ? ladderFromPyramid(pyramid)
        : buildSizeLadder(serviceId, facts);

    // 5. Nothing usable. Box tier, permanently.
    if (!ladder) return { kind: 'none' };

    return fromLadder(ladder, rung, minPixelRatio);
}
