// @vitest-environment node
/**
 * A **static level0 tile tree** whose whole-image derivative is spelled with the
 * canonical `full` region.
 *
 * The corpus disagrees about that one URL, so neither spelling can be the only
 * one asked for: the whole-image tile carries the other as its
 * `TileRequest.fallback` and the scheduler learns which one the service holds
 * (see `tilePyramid.tileFallback`).
 *
 * The canonical `full` region is asked first, per Image API 3.0 §4.8. A tree
 * written by `vips dzsave --layout iiif3` — which is what `atomotic/iiif`'s
 * `mkiiif` generates, and what the vendored fixture here came from — answers
 * `full/362,501` and 404s the numeric region, so it is served without a wasted
 * request, as it is by every OpenSeadragon-based viewer. CSNTM is split against
 * itself and supplies the fallback's reason for existing: its 𝔓3 tree answers
 * both spellings, while its 𝔓40 tree answers `0,0,6132,8176/192,256` and 404s
 * `full/192,256` — despite declaring those dimensions in `sizes[]`, which §5.3
 * requires be requestable as `full/w,h`.
 *
 * Node environment, as `planScene.test.ts` is and for its reason: the planner's
 * whole import graph must load with no DOM globals.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { toPlannerCanvases } from './canvasDescriptors';
import { createImageServiceCache, parseImageService } from './imageService';
import { planScene } from './planScene';
import { buildPyramid, tileFallback, tileUrl } from './tilePyramid';
import type { ImageServiceFacts, PlannerBudgets, Viewport } from './types';

const MANIFEST = JSON.parse(
    readFileSync(
        join(
            import.meta.dirname,
            '../test/fixtures/manifests/production/mkiiif-docuverse.json',
        ),
        'utf8',
    ),
);

const SERVICE = 'https://docuver.se/iiif/p3tgsk8jqt/page-001';

/**
 * `page-001/info.json` verbatim, retrieved 2026-08-31.
 *
 * The shape the fix is about: `profile: "level0"`, `tiles` declared, and **no
 * `sizes`**. Inline rather than vendored beside the manifest, because
 * `fixtures/manifests/` is a corpus of Presentation documents that
 * `corpus.smoke.test.ts` enumerates by glob and an Image API document is not one.
 */
const INFO = {
    '@context': 'http://iiif.io/api/image/3/context.json',
    id: SERVICE,
    type: 'ImageService3',
    profile: 'level0',
    protocol: 'http://iiif.io/api/image',
    tiles: [{ scaleFactors: [1, 2, 4], width: 512 }],
    width: 1446,
    height: 2004,
};

const BUDGETS: PlannerBudgets = {
    byteBudget: 64 * 1024 * 1024,
    marginFactor: 1.5,
    pyramidThreshold: 400,
    boxThreshold: 40,
    minPixelRatio: 0.5,
    maxDecodedPixels: 64 * 1024 * 1024,
};

function facts(): ImageServiceFacts {
    return parseImageService(INFO)!;
}

/**
 * The layout half of {@link planScene}'s input. One canvas, so none of it
 * matters here beyond satisfying the contract.
 */
const LAYOUT = {
    mode: 'individuals',
    direction: 'left-to-right',
    preserveCanvasScale: false,
    gapFraction: 0.01,
} as const;

/** The whole 1446x2004 canvas, at full resolution, centred. */
const VIEWPORT: Viewport = {
    width: 1200,
    height: 1600,
    centre: { x: 723, y: 1002 },
    scale: 1,
};

describe('a level0 tile tree that declares tiles and no sizes', () => {
    it('parses as a tiled level0 service rather than a size ladder', () => {
        expect(facts()).toMatchObject({
            width: 1446,
            height: 2004,
            version: 3,
            level0: true,
            tileSize: 512,
            scaleFactors: [1, 2, 4],
        });
        expect(facts().sizes).toBeUndefined();
    });

    it('derives every tile URL from `tiles` alone', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(pyramid.levels.map((level) => level.scaleFactor)).toEqual([
            4, 2, 1,
        ]);
        // The base level is one tile covering the whole image; the finer levels
        // are ordinary regions, and the service serves each of these.
        expect(tileUrl(pyramid, pyramid.levels[1], 0, 0)).toBe(
            `${SERVICE}/0,0,1024,1024/512,512/0/default.jpg`,
        );
        expect(tileUrl(pyramid, pyramid.levels[2], 2, 3)).toBe(
            `${SERVICE}/1024,1536,422,468/422,468/0/default.jpg`,
        );
    });

    it('asks the canonical `full` region first and offers the explicit region as the whole-image tile fallback', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(tileUrl(pyramid, pyramid.levels[0], 0, 0)).toBe(
            `${SERVICE}/full/362,501/0/default.jpg`,
        );
        expect(tileFallback(pyramid, pyramid.levels[0], 0, 0)).toEqual({
            url: `${SERVICE}/0,0,1446,2004/362,501/0/default.jpg`,
            // The SERVICE, so one 404 answers for every whole-image request it
            // will ever be sent — the base level and the thumbnail tier's rungs.
            group: SERVICE,
        });
    });

    it('offers no fallback for a tile that is not the whole image', () => {
        const pyramid = buildPyramid(SERVICE, facts())!;

        expect(tileFallback(pyramid, pyramid.levels[1], 0, 0)).toBeNull();
        expect(tileFallback(pyramid, pyramid.levels[2], 2, 3)).toBeNull();
    });

    it('offers no fallback for a service that answers arbitrary regions', () => {
        // A level 1/2 service computes on demand, so its whole-image tile is
        // already spelled `full/w,` and there is no second spelling to try.
        const dynamic = buildPyramid(SERVICE, {
            ...facts(),
            level0: undefined,
        })!;

        expect(tileFallback(dynamic, dynamic.levels[0], 0, 0)).toBeNull();
    });
});

describe('a canvas of it that genuinely cannot be rendered', () => {
    /*
     * The residual case the fix leaves: the tiles are derivable from `tiles`
     * alone, so the only way this canvas has no pixels is that its `info.json`
     * never arrived. That is the existing per-canvas error path — the renderer
     * writes `canvasErrors[canvasId]` from exactly these two queries
     * (`canvasRenderer.ensureImageService`) and paints the placeholder — and it
     * is asserted here over the mkiiif service so a level0 tile tree is not the
     * one shape that fails silently.
     */
    it('is reported through the image-service failure the host paints from', async () => {
        const cache = createImageServiceCache({
            fetchJson: async () => ({ status: 404, json: null }),
            maxAttempts: 1,
        });

        expect(await cache.ensure(SERVICE)).toBeNull();
        expect(cache.failure(SERVICE)).toBe('load');
        expect(cache.spent(SERVICE)).toBe(true);
    });

    it('is still laid out and still asks for its metadata', () => {
        const canvases = toPlannerCanvases(MANIFEST.items.slice(0, 1));
        const plan = planScene({
            canvases,
            viewport: VIEWPORT,
            budgets: BUDGETS,
            ...LAYOUT,
            knownMetadata: {},
        });

        expect(plan.layout.map((rect) => rect.canvasId)).toEqual([
            canvases[0].id,
        ]);
        // Named by CANVAS: a failure is recorded against the canvas the reader
        // is looking at, not against the service.
        expect(plan.metadataRequests).toEqual([canvases[0].id]);
        expect(plan.tileRequests).toEqual([]);
    });
});

describe('the mkiiif manifest, whose painting body does not resolve', () => {
    it('renders from the tile pyramid regardless', () => {
        const canvases = toPlannerCanvases(MANIFEST.items.slice(0, 1));
        // The body `full/1446,2004/0/default.jpg` is a 404 the generator wrote;
        // what the renderer acts on is the service beside it.
        expect(canvases[0].images[0].source).toEqual({
            kind: 'service',
            serviceId: SERVICE,
            profile: 'level0',
        });

        const plan = planScene({
            canvases,
            viewport: VIEWPORT,
            budgets: BUDGETS,
            ...LAYOUT,
            knownMetadata: { [SERVICE]: facts() },
        });

        expect(plan.tiers[canvases[0].id]).toBe('pyramid');
        // Every level of the tree, base to full resolution. Each request names a
        // two-dimensional size; the region is `full` for the one tile that
        // covers the image and an explicit region for every partial tile.
        expect([
            ...new Set(plan.tileRequests.map((request) => request.level)),
        ]).toEqual([0, 1, 2]);
        for (const request of plan.tileRequests) {
            expect(request.url).toMatch(
                new RegExp(
                    `^${SERVICE}/(full|\\d+,\\d+,\\d+,\\d+)/\\d+,\\d+/0/default\\.jpg$`,
                ),
            );
        }
        expect(plan.tileRequests[0].url).toBe(
            `${SERVICE}/full/362,501/0/default.jpg`,
        );
        expect(plan.tileRequests.map((request) => request.url)).toContain(
            `${SERVICE}/1024,1536,422,468/422,468/0/default.jpg`,
        );
    });

    it('carries the fallback spelling on the whole-image tile only', () => {
        const canvases = toPlannerCanvases(MANIFEST.items.slice(0, 1));
        const plan = planScene({
            canvases,
            viewport: VIEWPORT,
            budgets: BUDGETS,
            ...LAYOUT,
            knownMetadata: { [SERVICE]: facts() },
        });

        const base = plan.tileRequests.find((request) => request.level === 0)!;
        expect(base.fallback).toEqual({
            url: `${SERVICE}/0,0,1446,2004/362,501/0/default.jpg`,
            group: SERVICE,
        });
        expect(
            plan.tileRequests
                .filter((request) => request.level > 0)
                .every((request) => request.fallback === undefined),
        ).toBe(true);
    });
});
