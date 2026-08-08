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

    it('keeps the whole coarse chain resident, not just the tiles on screen', () => {
        // Zoomed into the top-left corner at full resolution. The current level
        // holds only what is near the viewport, but every coarser level is held
        // whole — which is what makes zooming back out immediate.
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 60, y: 60 }, scale: 16 }),
            knownMetadata: { c1: FACTS },
        });

        const byLevel = new Map<number, number>();
        for (const request of result.tileRequests) {
            byLevel.set(request.level, (byLevel.get(request.level) ?? 0) + 1);
        }

        // Levels 0..2 are the full grid: 1x1, 2x2, 4x4.
        expect(byLevel.get(0)).toBe(1);
        expect(byLevel.get(1)).toBe(4);
        expect(byLevel.get(2)).toBe(16);
        // The current level (8x8 = 64 tiles) is restricted to the corner.
        expect(byLevel.get(3)).toBeLessThan(64);
        expect(byLevel.get(3)).toBeGreaterThan(0);
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
        expect(levelAt(4)).toBeGreaterThan(levelAt(0.5));
        expect(levelAt(16)).toBeGreaterThan(levelAt(4));
        // Four levels exist; there is nothing sharper to promote to.
        expect(levelAt(1000)).toBe(3);
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

        // A higher ratio tolerates less blur, so it promotes sooner.
        expect(at(2)).toBeGreaterThan(at(0.25));
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
        const nearest = (centre: { x: number; y: number }) =>
            plan([serviceCanvas('c1', 1000, 1000)], {
                viewport: viewport({ centre, scale: 4 }),
                knownMetadata: { c1: FACTS },
            }).tileRequests[0].key;

        expect(nearest({ x: 100, y: 100 })).not.toBe(
            nearest({ x: 900, y: 900 }),
        );
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

    it('plans no tiles for a service advertising no tiling: that is a size-ladder source', () => {
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
            knownMetadata: {
                c1: {
                    width: 4096,
                    height: 4096,
                    sizes: [{ width: 1024, height: 1024 }],
                },
            },
        });

        expect(result.tileRequests).toEqual([]);
        expect(result.metadataRequests).toEqual([]);
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
