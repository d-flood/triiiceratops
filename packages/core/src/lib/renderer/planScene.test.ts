// @vitest-environment node
/**
 * Seam 1 — the scene planner (spec §Testing Decisions).
 *
 * Data in, data out: no DOM, no network, no canvas. Every threshold is supplied
 * by the test rather than read from a shipped default, so tuning the defaults
 * can never silently rewrite what these assert.
 *
 * This file pins itself to the **node** environment rather than the suite-wide
 * `happy-dom`. That is the assertion, not a preference: the planner and its
 * whole import graph must load and run with no DOM globals at all, which is
 * what keeps server-rendered first paint available as later work. Under
 * `happy-dom` a stray `document` reference would pass unnoticed.
 */

import { describe, expect, it } from 'vitest';

import { planScene, planViewportLimits } from './planScene';
import { tileKey } from './tilePyramid';
import type {
    ImageServiceFacts,
    PlannerBudgets,
    PlannerCanvas,
    Viewport,
} from './types';

const BUDGETS: PlannerBudgets = {
    byteBudget: 64 * 1024 * 1024,
    marginFactor: 1.5,
    pyramidThreshold: 400,
    boxThreshold: 40,
    minPixelRatio: 0.5,
    // Generous by default, so only the tests that are about the cap see it.
    maxDecodedPixels: 64 * 1024 * 1024,
};

function staticCanvas(
    id: string,
    width: number,
    height: number,
): PlannerCanvas {
    return {
        id,
        width,
        height,
        source: { kind: 'static', url: `https://example.test/${id}.jpg` },
    };
}

function serviceCanvas(
    id: string,
    width: number,
    height: number,
): PlannerCanvas {
    return {
        id,
        width,
        height,
        source: {
            kind: 'service',
            serviceId: `https://images.test/${id}`,
            profile: 'level2',
        },
    };
}

/**
 * A 4096x4096 service tiled at 512: five levels, the base one tile square.
 * Chosen so every level's grid is an exact power of two and a hand-worked
 * expectation is checkable.
 */
const FACTS: ImageServiceFacts = {
    width: 4096,
    height: 4096,
    tileSize: 512,
    scaleFactors: [1, 2, 4, 8],
    version: 3,
};

/**
 * An 8192-square service: five levels, so the coarse chain is long enough for
 * "the chain is a fraction of the current level" to be a real measurement rather
 * than an artefact of a two-level pyramid.
 */
const BIG_FACTS: ImageServiceFacts = {
    width: 8192,
    height: 8192,
    tileSize: 512,
    scaleFactors: [1, 2, 4, 8, 16],
    version: 3,
};

function countByLevel(requests: Array<{ level: number }>): Map<number, number> {
    const byLevel = new Map<number, number>();
    for (const request of requests) {
        byLevel.set(request.level, (byLevel.get(request.level) ?? 0) + 1);
    }
    return byLevel;
}

function viewport(overrides: Partial<Viewport> = {}): Viewport {
    return {
        width: 800,
        height: 600,
        centre: { x: 500, y: 375 },
        scale: 1,
        ...overrides,
    };
}

function plan(
    canvases: PlannerCanvas[],
    overrides: Partial<Parameters<typeof planScene>[0]> = {},
) {
    return planScene({
        canvases,
        mode: 'individuals',
        direction: 'left-to-right',
        preserveCanvasScale: false,
        viewport: viewport(),
        knownMetadata: {},
        budgets: BUDGETS,
        ...overrides,
    });
}

describe('planScene', () => {
    it('runs with no DOM globals present', () => {
        // Guards the environment this file relies on: if the suite ever gained
        // a DOM here, every assertion below would stop proving DOM-freedom.
        expect(typeof globalThis.window).toBe('undefined');
        expect(typeof globalThis.document).toBe('undefined');

        expect(plan([staticCanvas('c1', 1000, 750)]).layout).toHaveLength(1);
    });

    it('lays a single canvas out at the canvas-space origin, at its manifest size', () => {
        const result = plan([staticCanvas('c1', 1000, 750)]);

        expect(result.layout).toEqual([
            { canvasId: 'c1', x: 0, y: 0, width: 1000, height: 750 },
        ]);
    });

    it('returns an empty plan for no canvases rather than throwing', () => {
        const result = plan([]);

        expect(result.layout).toEqual([]);
        expect(result.tiers).toEqual({});
        expect(result.minZoom).toBe(0);
    });

    it('assigns the pyramid tier to a canvas projected above the pyramid threshold', () => {
        // 1000x750 at scale 1 → effectiveSize = sqrt(1000 * 750) ≈ 866 > 400.
        const result = plan([staticCanvas('c1', 1000, 750)]);

        expect(result.tiers).toEqual({ c1: 'pyramid' });
    });

    it('assigns the thumbnail tier between the two thresholds', () => {
        // effectiveSize ≈ 866 * 0.2 ≈ 173: below 400, above 40.
        const result = plan([staticCanvas('c1', 1000, 750)], {
            viewport: viewport({ scale: 0.2 }),
        });

        expect(result.tiers).toEqual({ c1: 'thumbnail' });
    });

    it('assigns the box tier below the box threshold', () => {
        // effectiveSize ≈ 866 * 0.02 ≈ 17: below 40.
        const result = plan([staticCanvas('c1', 1000, 750)], {
            viewport: viewport({ scale: 0.02 }),
        });

        expect(result.tiers).toEqual({ c1: 'box' });
    });

    it('decides the tier identically for a portrait and a landscape canvas of equal projected area', () => {
        // The measure is the geometric mean, so orientation cannot change it.
        const portrait = plan([staticCanvas('p', 600, 1350)], {
            viewport: viewport({ scale: 0.4 }),
        });
        const landscape = plan([staticCanvas('l', 1350, 600)], {
            viewport: viewport({ scale: 0.4 }),
        });

        expect(portrait.tiers.p).toBe(landscape.tiers.l);
        expect(portrait.tiers.p).toBe('thumbnail');
    });

    it('derives the zoom floor from where the median canvas reaches the box threshold', () => {
        // Median effective canvas-space size is sqrt(1000 * 750) ≈ 866.03;
        // the floor is the scale at which that projects to `boxThreshold`.
        const result = plan([staticCanvas('c1', 1000, 750)]);

        expect(result.minZoom).toBeCloseTo(40 / Math.sqrt(1000 * 750), 10);
    });

    it('scales the derived zoom floor with the manifest rather than a fixed percentage', () => {
        const small = plan([staticCanvas('c1', 100, 100)]);
        const large = plan([staticCanvas('c1', 10_000, 10_000)]);

        expect(small.minZoom).toBeGreaterThan(large.minZoom);
    });

    it('requests no tiles, thumbnails, or metadata for a static-image source', () => {
        // A canvas with no image service has nothing to discover: its one URL
        // is already known, so it must never emit a fetch the planner cannot
        // satisfy (spec, user story 29).
        const result = plan([staticCanvas('c1', 1000, 750)]);

        expect(result.tileRequests).toEqual([]);
        expect(result.thumbnailRequests).toEqual([]);
        expect(result.metadataRequests).toEqual([]);
    });

    it('holds nothing evictable while every canvas is required', () => {
        const result = plan([staticCanvas('c1', 1000, 750)]);

        expect(result.evictable).toEqual([]);
    });

    it('marks a box-tier canvas evictable: it has left the required set', () => {
        const result = plan([staticCanvas('c1', 1000, 750)], {
            viewport: viewport({ scale: 0.02 }),
        });

        expect(result.evictable).toEqual(['c1']);
    });

    it('ignores canvases with unusable dimensions rather than laying out NaN', () => {
        const result = plan([staticCanvas('c1', 0, 750)]);

        expect(result.layout).toEqual([]);
        expect(result.tiers).toEqual({});
    });

    it('is deterministic: the same input produces an equal plan', () => {
        const canvases = [staticCanvas('c1', 1000, 750)];

        expect(plan(canvases)).toEqual(plan(canvases));
    });
});

describe('planScene — tiled sources', () => {
    /** A viewport showing the whole 1000x1000 canvas, and then some. */
    const fit = viewport({ centre: { x: 500, y: 500 }, scale: 0.6 });

    it('asks for a pyramid-tier canvas’s metadata, and asks once', () => {
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
        });

        expect(result.metadataRequests).toEqual(['c1']);
        // Nothing can be planned from a service whose facts are unknown, and
        // guessing a tile grid would produce URLs the server cannot serve.
        expect(result.tileRequests).toEqual([]);
        expect(result.tileDraws).toEqual([]);
    });

    it('stops asking once the metadata is known', () => {
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
            knownMetadata: { c1: FACTS },
        });

        expect(result.metadataRequests).toEqual([]);
    });

    it('asks for no metadata below the pyramid tier: the level rules nest inside the canvas tier', () => {
        // Applied without the tier gate, "the base level is never evicted"
        // would mean one resident base tile per canvas across a whole manifest.
        const thumbnail = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ scale: 0.2 }),
        });
        const box = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ scale: 0.01 }),
        });

        expect(thumbnail.tiers.c1).toBe('thumbnail');
        expect(thumbnail.metadataRequests).toEqual([]);
        expect(box.tiers.c1).toBe('box');
        expect(box.metadataRequests).toEqual([]);
    });

    it('keeps the coarse chain over viewport-plus-margin, not over the whole image', () => {
        // Zoomed into the top-left corner at full resolution. Every level —
        // coarse chain included — is restricted to the same box; only the base
        // level, one tile by construction, is held whole.
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 60, y: 60 }, scale: 16 }),
            knownMetadata: { c1: FACTS },
        });

        const byLevel = countByLevel(result.tileRequests);

        expect(byLevel.get(0)).toBe(1);
        // Held whole these would be the full 2x2 and 4x4 grids.
        expect(byLevel.get(1)).toBe(1);
        expect(byLevel.get(2)).toBe(1);
        // The current level (8x8 = 64 tiles) is restricted to the corner too.
        expect(byLevel.get(3)).toBeLessThan(64);
        expect(byLevel.get(3)).toBeGreaterThan(0);
    });

    it('keeps the coarse chain a fraction of the current level, not a function of image size', () => {
        // The claim the spec's arithmetic rests on: geometric level sizes make
        // the whole chain roughly a third of the current level. That is only
        // true when every level is measured over the SAME box. Held whole, the
        // chain costs O(image area) against the current level's O(viewport
        // area) — here 85 tiles against 16, and far worse as the scan grows,
        // with no later budget able to touch it: the required set is by
        // definition never evicted.
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({
                width: 1200,
                height: 800,
                centre: { x: 500, y: 500 },
                scale: 8,
            }),
            knownMetadata: { c1: BIG_FACTS },
        });

        const byLevel = countByLevel(result.tileRequests);
        const current = Math.max(...byLevel.keys());
        const chain = [...byLevel]
            .filter(([level]) => level < current)
            .reduce((total, [, count]) => total + count, 0);

        expect(byLevel.get(current)).toBeGreaterThan(4);
        expect(chain).toBeLessThan(byLevel.get(current)!);
    });

    it('always includes the base level, so there is always something to paint', () => {
        for (const scale of [0.5, 1, 4, 16]) {
            const result = plan([serviceCanvas('c1', 1000, 1000)], {
                viewport: viewport({ centre: { x: 500, y: 500 }, scale }),
                knownMetadata: { c1: FACTS },
            });

            expect(
                result.tileRequests.some(
                    (request) => request.key === tileKey('c1', 0, 0, 0),
                ),
                `no base tile at scale ${scale}`,
            ).toBe(true);
        }
    });

    it('promotes the level as the canvas is magnified, and never past full resolution', () => {
        const levelAt = (scale: number) =>
            Math.max(
                ...plan([serviceCanvas('c1', 1000, 1000)], {
                    viewport: viewport({
                        centre: { x: 500, y: 500 },
                        scale,
                    }),
                    knownMetadata: { c1: FACTS },
                }).tileRequests.map((request) => request.level),
            );

        expect(levelAt(0.5)).toBe(0);
        expect(levelAt(1)).toBeGreaterThan(levelAt(0.5));
        expect(levelAt(4)).toBeGreaterThan(levelAt(1));
        // Four levels exist; there is nothing sharper to promote to.
        expect(levelAt(1000)).toBe(3);
    });

    it('reaches full resolution sooner on a HiDPI screen, because it can be seen', () => {
        // The same view in CSS pixels. Level selection is a question about
        // pixels the display can resolve, so the backing-store ratio is a
        // planner input: without it a 2× screen tops out four times short of
        // what it could show.
        const levelAt = (dpr: number) =>
            Math.max(
                ...plan([serviceCanvas('c1', 1000, 1000)], {
                    viewport: viewport({
                        centre: { x: 500, y: 500 },
                        scale: 1,
                    }),
                    knownMetadata: { c1: FACTS },
                    dpr,
                }).tileRequests.map((request) => request.level),
            );

        expect(levelAt(2)).toBeGreaterThan(levelAt(1));
        // Absent, it is the CSS-pixel screen — a caller that does not know its
        // backing store gets the conservative answer, not a broken one.
        expect(levelAt(1)).toBe(
            Math.max(
                ...plan([serviceCanvas('c1', 1000, 1000)], {
                    viewport: viewport({
                        centre: { x: 500, y: 500 },
                        scale: 1,
                    }),
                    knownMetadata: { c1: FACTS },
                }).tileRequests.map((request) => request.level),
            ),
        );
    });

    it('honours the supplied minimum pixel ratio rather than a shipped default', () => {
        const at = (minPixelRatio: number) =>
            Math.max(
                ...plan([serviceCanvas('c1', 1000, 1000)], {
                    viewport: viewport({
                        centre: { x: 500, y: 500 },
                        scale: 4,
                    }),
                    knownMetadata: { c1: FACTS },
                    budgets: { ...BUDGETS, minPixelRatio },
                }).tileRequests.map((request) => request.level),
            );

        // The ratio is device pixels per LEVEL pixel: a higher one accepts a
        // blurrier level, which is OpenSeadragon's direction carried forward
        // with the value.
        expect(at(2)).toBeLessThan(at(0.25));
    });

    it('orders tiles centre-out, not in discovery order', () => {
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 4 }),
            knownMetadata: { c1: FACTS },
        });

        const priorities = result.tileRequests.map(
            (request) => request.priority,
        );
        expect(priorities.length).toBeGreaterThan(4);
        for (let i = 1; i < priorities.length; i += 1) {
            expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1]);
        }
    });

    it('re-sorts as the viewport moves: the nearest tile changes with the centre', () => {
        // Read at the CURRENT level: every covering tile contains the viewport
        // centre and is therefore at distance 0, so the coarse chain is
        // deliberately indistinguishable here — that is the previous test's
        // subject, not this one's.
        const nearest = (centre: { x: number; y: number }) => {
            const requests = plan([serviceCanvas('c1', 1000, 1000)], {
                viewport: viewport({ centre, scale: 4 }),
                knownMetadata: { c1: FACTS },
            }).tileRequests;
            const current = Math.max(...requests.map((entry) => entry.level));
            return requests.find((entry) => entry.level === current)!.key;
        };

        expect(nearest({ x: 100, y: 100 })).not.toBe(
            nearest({ x: 900, y: 900 }),
        );
    });

    it('measures distance to the tile, not to its centre, so a covering tile is fetched first', () => {
        // Off-centre entry — a deep link, or a programmatic view. A coarse tile
        // is huge in canvas space, so measured centre-to-centre the base tile
        // that guarantees the viewer is never blank sits behind dozens of
        // current-level tiles, and with an in-flight window of six it arrives
        // last. Entering at fit hides this completely: there the base tile's
        // centre IS the viewport centre.
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 120, y: 880 }, scale: 12 }),
            knownMetadata: { c1: FACTS },
        });

        expect(result.tileRequests[0].key).toBe(tileKey('c1', 0, 0, 0));
        expect(result.tileRequests[0].priority).toBe(0);
    });

    it('builds a IIIF Image API request URL per tile', () => {
        // Zoomed out far enough that only the base level is wanted.
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 0.5 }),
            knownMetadata: { c1: FACTS },
        });

        expect(result.tileRequests).toHaveLength(1);
        expect(result.tileRequests[0].url).toBe(
            'https://images.test/c1/full/512,/0/default.jpg',
        );
    });

    it('draws only tiles the host actually holds', () => {
        const withNothing = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
            knownMetadata: { c1: FACTS },
        });
        expect(withNothing.tileDraws).toEqual([]);

        const withBase = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
            knownMetadata: { c1: FACTS },
            residentTiles: new Set([tileKey('c1', 0, 0, 0)]),
        });
        expect(withBase.tileDraws.map((draw) => draw.key)).toEqual([
            tileKey('c1', 0, 0, 0),
        ]);
        // Fitted into the manifest-declared box, not the service's dimensions.
        expect(withBase.tileDraws[0]).toMatchObject({
            x: 0,
            y: 0,
            width: 1000,
            height: 1000,
        });
    });

    it('orders draws coarsest first, so a finer tile paints over the blur-up beneath it', () => {
        const resident = new Set([
            tileKey('c1', 2, 1, 1),
            tileKey('c1', 0, 0, 0),
            tileKey('c1', 1, 0, 0),
        ]);

        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 300, y: 300 }, scale: 1.6 }),
            knownMetadata: { c1: FACTS },
            residentTiles: resident,
        });

        const levels = result.tileDraws.map((draw) => draw.level);
        expect(levels.length).toBeGreaterThan(1);
        for (let i = 1; i < levels.length; i += 1) {
            expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
        }
    });

    it('does not draw resident tiles that are off screen: the margin prefetches, it does not paint', () => {
        // A generous margin, so there are tiles that are required and held but
        // outside the viewport — which is exactly the case a painter that drew
        // "everything resident" would get wrong.
        const onScreen = tileKey('c1', 3, 0, 0);
        const inMarginOnly = tileKey('c1', 3, 1, 0);

        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 60, y: 60 }, scale: 16 }),
            knownMetadata: { c1: FACTS },
            budgets: { ...BUDGETS, marginFactor: 4 },
            residentTiles: new Set([onScreen, inMarginOnly]),
        });

        const required = result.tileRequests.map((request) => request.key);
        expect(required).toContain(inMarginOnly);

        const drawn = result.tileDraws.map((draw) => draw.key);
        expect(drawn).toContain(onScreen);
        expect(drawn).not.toContain(inMarginOnly);
    });
});

/**
 * The **size-ladder source**: a level0 service that advertises only fixed whole
 * images (spec §Source kinds). No tiling, ever — the nearest advertised whole
 * image at or above what is needed, capped against a decoded-pixel ceiling.
 */
describe('planScene — size-ladder sources', () => {
    /**
     * A level0 service with a geometric ladder over a 4096-square image. No
     * `tileSize`, which is what makes it a ladder rather than a pyramid.
     */
    const LADDER_FACTS: ImageServiceFacts = {
        width: 4096,
        height: 4096,
        version: 3,
        sizes: [
            { width: 512, height: 512 },
            { width: 1024, height: 1024 },
            { width: 2048, height: 2048 },
            { width: 4096, height: 4096 },
        ],
    };

    /**
     * The advertised `sizes[]` is what makes this a ladder: the profile says
     * level2, and a service publishing prepared whole images can be asked for
     * one whatever its compliance level.
     */
    const ladderCanvas = serviceCanvas('c1', 1000, 1000);

    /**
     * The other evidence a tile-less service is a size-ladder source: a
     * declared level0 profile, read off the manifest with no fetch at all.
     * Used for the services that advertise no sizes either.
     */
    const level0Canvas: PlannerCanvas = {
        ...ladderCanvas,
        source: {
            kind: 'service',
            serviceId: 'https://images.test/c1',
            profile: 'level0',
        },
    };

    function ladderPlan(
        scale: number,
        budgets: Partial<PlannerBudgets> = {},
        residentTiles?: Set<string>,
        facts: ImageServiceFacts = LADDER_FACTS,
    ) {
        return plan([ladderCanvas], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale }),
            knownMetadata: { c1: facts },
            budgets: { ...BUDGETS, ...budgets },
            residentTiles,
        });
    }

    /** The width in the whole-image request each rung asks for. */
    function requestedWidths(requests: Array<{ url: string }>): string[] {
        return requests.map((request) => request.url.split('/full/')[1]);
    }

    it('requests whole images, never a region, and only at advertised sizes', () => {
        const result = ladderPlan(1);

        // Every URL is `{service}/full/{size}/0/{quality}.{format}` — region
        // `full`, because that is the only region a level0 service serves.
        for (const request of result.tileRequests) {
            expect(request.url.startsWith('https://images.test/c1/full/')).toBe(
                true,
            );
        }
        expect(requestedWidths(result.tileRequests)).toEqual([
            '512,/0/default.jpg',
            '1024,/0/default.jpg',
        ]);
    });

    it('promotes through the ladder as the canvas grows on screen', () => {
        // The canvas is 1000 units wide, so `scale` is device pixels per 1000
        // image pixels. Each step doubles the projection and the ladder follows.
        const widthsAt = (scale: number) =>
            requestedWidths(ladderPlan(scale).tileRequests);

        expect(widthsAt(0.5)).toEqual(['512,/0/default.jpg']);
        expect(widthsAt(1)).toEqual([
            '512,/0/default.jpg',
            '1024,/0/default.jpg',
        ]);
        expect(widthsAt(4)).toEqual([
            '512,/0/default.jpg',
            '1024,/0/default.jpg',
            '2048,/0/default.jpg',
            'max/0/default.jpg',
        ]);
    });

    it('spells the full-resolution rung `max`, which is the file a level0 service holds', () => {
        const urls = ladderPlan(8).tileRequests.map((request) => request.url);

        expect(urls).toContain('https://images.test/c1/full/max/0/default.jpg');
    });

    it('holds the chain below the chosen rung, so zooming out is instant and nothing blanks', () => {
        const result = ladderPlan(4);

        // Rung index doubles as the level: coarsest first, ascending, no gaps.
        expect(result.tileRequests.map((request) => request.level)).toEqual([
            0, 1, 2, 3,
        ]);
    });

    it('does not promote past the decoded-pixel cap', () => {
        // At this zoom the uncapped ladder reaches the 4096-square top rung —
        // 16 megapixels, 64 MB decoded. Capped at 2 megapixels it settles for
        // the 1024 rung and accepts the upscaling blur, which is what keeps one
        // level0 manifest from defeating the whole memory budget.
        expect(requestedWidths(ladderPlan(8).tileRequests)).toContain(
            'max/0/default.jpg',
        );

        const capped = ladderPlan(8, { maxDecodedPixels: 2 * 1024 * 1024 });
        expect(requestedWidths(capped.tileRequests)).toEqual([
            '512,/0/default.jpg',
            '1024,/0/default.jpg',
        ]);
    });

    it('paints the resident rungs coarsest first, over the whole canvas', () => {
        const coarse = tileKey('c1', 0, 0, 0);
        const fine = tileKey('c1', 1, 0, 0);

        const result = ladderPlan(1, {}, new Set([fine, coarse]));

        expect(result.tileDraws).toEqual([
            { key: coarse, level: 0, x: 0, y: 0, width: 1000, height: 1000 },
            { key: fine, level: 1, x: 0, y: 0, width: 1000, height: 1000 },
        ]);
    });

    it('releases everything when the canvas leaves the pyramid tier', () => {
        // The per-rung rules are nested inside the canvas tier exactly as the
        // per-level ones are: a ladder canvas below the tier holds nothing.
        const result = ladderPlan(0.01);

        expect(result.tiers.c1).not.toBe('pyramid');
        expect(result.tileRequests).toEqual([]);
        expect(result.tileDraws).toEqual([]);
    });

    it('falls back to the whole image for a level0 service advertising nothing at all', () => {
        // No tiles and no sizes, but a declared level0 profile — which is what
        // says the missing keys MEAN something. Level0 compliance guarantees
        // the full image at the canonical whole-image URL, and a blank canvas
        // is worse than one heavy request.
        const result = plan([level0Canvas], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 1 }),
            knownMetadata: { c1: { width: 800, height: 1000, version: 2 } },
        });

        expect(result.tileRequests.map((request) => request.url)).toEqual([
            // Version 2 spells the whole image `full`, version 3 `max`.
            'https://images.test/c1/full/full/0/default.jpg',
        ]);
    });

    it('does NOT make a ladder of a tile-less level 1/2 service', () => {
        // `tiles` is optional at every compliance level, and Cantaloupe and IIP
        // both ship configurations that omit it while still answering any
        // region at any size. Read as a ladder, such a service has exactly one
        // rung — the whole master — and the decoded-pixel cap cannot refuse it,
        // because `chooseRung` must keep the cheapest rung rather than paint
        // nothing. A 12000x9000 scan would be 108 megapixels on a phone.
        const result = plan([ladderCanvas], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 1 }),
            knownMetadata: {
                c1: { width: 12_000, height: 9_000, version: 3 },
            },
            budgets: { ...BUDGETS, maxDecodedPixels: 4 * 1024 * 1024 },
        });

        const urls = result.tileRequests.map((request) => request.url);
        // A derived power-of-two pyramid instead. Its base level is a whole
        // image like a ladder's, but a DOWNSCALED one — never `max`, and never
        // wider than the tile size the renderer chose.
        expect(urls).not.toContain(
            'https://images.test/c1/full/max/0/default.jpg',
        );
        expect(urls.length).toBeGreaterThan(1);
        for (const url of urls) {
            expect(url).toMatch(
                /\/(\d+,\d+,\d+,\d+|full)\/\d+,\/0\/default\.jpg$/,
            );
            const width = Number(url.match(/\/(\d+),\/0\//)![1]);
            expect(width).toBeLessThanOrEqual(512);
        }
    });

    it('holds only the base rung of a ladder canvas outside the residency margin', () => {
        // Under ticket 07's multi-canvas layout this is the difference between
        // a canvas two spreads away holding its full-resolution scan resident
        // for ever — required-set membership, not visibility, drives eviction —
        // and holding the one cheap image that stops it blanking on return.
        const near = plan([ladderCanvas], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 4 }),
            knownMetadata: { c1: LADDER_FACTS },
        });
        const far = plan([ladderCanvas], {
            viewport: viewport({ centre: { x: 50_000, y: 500 }, scale: 4 }),
            knownMetadata: { c1: LADDER_FACTS },
        });

        expect(near.tileRequests.length).toBeGreaterThan(1);
        expect(far.tileRequests.map((request) => request.level)).toEqual([0]);
        expect(far.tileDraws).toEqual([]);
    });

    it('reports a canvas whose cheapest image is already over the cap', () => {
        // The cap degrades to blur while there is anything coarser to fall back
        // to. When there is not, the renderer still draws — never blank — and
        // says so, rather than overriding the budget in silence.
        const result = plan([level0Canvas], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 1 }),
            knownMetadata: {
                c1: { width: 8000, height: 8000, version: 3 },
            },
            budgets: { ...BUDGETS, maxDecodedPixels: 1024 },
        });

        expect(result.overCapCanvases).toEqual(['c1']);
        expect(result.tileRequests).toHaveLength(1);
    });

    it('leaves a canvas within the cap out of `overCapCanvases`', () => {
        expect(ladderPlan(8).overCapCanvases).toEqual([]);
    });

    it('carries the deprecated `native` spelling as a fallback on version 2 rungs only', () => {
        // A frozen pre-2016 static tree serves `.../native.jpg` and nothing
        // else. Every rung of a ladder shares the quality parameter, so getting
        // it wrong is not a blurrier canvas — it is every rung 404ing, the
        // negative cache closing over the whole ladder, and a canvas blank for
        // the life of the page. One request per broken service buys the answer.
        const v2 = ladderPlan(1, {}, undefined, {
            ...LADDER_FACTS,
            version: 2,
        });
        for (const request of v2.tileRequests) {
            expect(request.fallback).toEqual({
                url: request.url.replace('/default.', '/native.'),
                // The service, not the rung: one answer for the whole ladder.
                group: 'https://images.test/c1',
            });
        }

        // Version 3 never had `native`, so there is no second spelling to try.
        for (const request of ladderPlan(1).tileRequests) {
            expect(request.fallback).toBeUndefined();
        }
    });
});

/**
 * The cheap half of the planner, for the two questions the host asks on every
 * pointer sample.
 */
describe('planViewportLimits', () => {
    it('agrees with a full plan on the layout and the derived zoom floor', () => {
        const canvases = [
            serviceCanvas('c1', 4000, 3000),
            staticCanvas('c2', 1000, 750),
        ];
        const full = plan(canvases, {
            knownMetadata: { c1: FACTS },
        });
        const limits = planViewportLimits(canvases, BUDGETS.boxThreshold);

        expect(limits.layout).toEqual(full.layout);
        expect(limits.minZoom).toBe(full.minZoom);
    });

    it('drops the same unlayoutable canvases a full plan does', () => {
        const canvases = [
            staticCanvas('c1', 1000, 750),
            staticCanvas('bad', 0, 750),
        ];

        expect(
            planViewportLimits(canvases, BUDGETS.boxThreshold).layout,
        ).toEqual(plan(canvases).layout);
    });

    it('needs neither the viewport, the metadata, nor the resident set', () => {
        // The whole point: none of the inputs that make a full plan expensive —
        // building the pyramid and enumerating the required tile set — are even
        // in this signature, so a clamp cannot accidentally pay for them. A
        // pointer drag clamps per event; planning stays once per frame.
        const canvases = [serviceCanvas('c1', 4000, 3000)];

        const atHome = planViewportLimits(canvases, BUDGETS.boxThreshold);
        const zoomedIn = plan(canvases, {
            knownMetadata: { c1: FACTS },
            viewport: viewport({ scale: 8 }),
        });

        expect(atHome.minZoom).toBe(zoomedIn.minZoom);
        expect(atHome.layout).toEqual(zoomedIn.layout);
        // …and the full plan at that zoom really did enumerate tiles, so the
        // comparison above is between the cheap answer and an expensive one.
        expect(zoomedIn.tileRequests.length).toBeGreaterThan(0);
    });
});
