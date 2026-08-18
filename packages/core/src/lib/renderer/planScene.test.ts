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

import { getVisibleCanvasEntries } from '../components/viewerControls';
import { toPlannerCanvases } from './canvasDescriptors';
import { parseImageService } from './imageService';
import { planScene, planViewportLimits } from './planScene';
import { THUMBNAIL_BASE_RUNG } from './thumbnailLadder';
import { tileKey } from './tilePyramid';
import type {
    ImageServiceFacts,
    PlannerBudgets,
    PlannerCanvas,
    PlannerImage,
    SourceDescriptor,
    ViewingDirection,
    TileKey,
    Viewport,
} from './types';

// A round 1% rather than the shipped figure, so every position asserted below
// is arithmetic the test states rather than a default it inherits.
const GAP_FRACTION = 0.01;

const BUDGETS: PlannerBudgets = {
    byteBudget: 64 * 1024 * 1024,
    marginFactor: 1.5,
    pyramidThreshold: 400,
    boxThreshold: 40,
    minPixelRatio: 0.5,
    // Generous by default, so only the tests that are about the cap see it.
    maxDecodedPixels: 64 * 1024 * 1024,
};

/**
 * The service id every service canvas here is given, from the canvas's name.
 *
 * One expression rather than a literal per builder, because it is also what
 * {@link byService} has to spell.
 */
function serviceIdOf(canvasId: string): string {
    return `https://images.test/${canvasId}`;
}

/**
 * `knownMetadata`, written the way these tests NAME canvases and keyed the way
 * the planner READS it — by service (`planScene.factsFor`).
 *
 * The two differ, and that is the point: a canvas id is not a stable name for a
 * picture, so a canvas-keyed record answers a Choice switch with the previous
 * alternative's dimensions forever and never provokes the new service's
 * `info.json`. Spelling each service id inline at three dozen call sites would
 * make those expectations about URL shape rather than about facts, so the
 * mapping is stated once, here.
 */
function byService(
    entries: Record<string, ImageServiceFacts>,
): Record<string, ImageServiceFacts> {
    return Object.fromEntries(
        Object.entries(entries).map(([canvasId, facts]) => [
            serviceIdOf(canvasId),
            facts,
        ]),
    );
}

/**
 * One canvas-filling placement, in the normalized units {@link PlannerImage}
 * uses: both axes divided by the Canvas's own WIDTH, so a full-canvas image is
 * `x: 0, y: 0, width: 1` and its `height` is the aspect ratio.
 */
function fills(
    id: string,
    source: SourceDescriptor,
    width: number,
    height: number,
): PlannerImage {
    return {
        key: `${id}#0`,
        source,
        x: 0,
        y: 0,
        width: 1,
        height: height / width,
    };
}

function staticSource(id: string): SourceDescriptor {
    return { kind: 'static', url: `https://example.test/${id}.jpg` };
}

function serviceSource(id: string): SourceDescriptor {
    return { kind: 'service', serviceId: serviceIdOf(id), profile: 'level2' };
}

function staticCanvas(
    id: string,
    width: number,
    height: number,
): PlannerCanvas {
    return {
        id,
        width,
        height,
        images: [fills(id, staticSource(id), width, height)],
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
        images: [fills(id, serviceSource(id), width, height)],
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
        gapFraction: GAP_FRACTION,
        viewport: viewport(),
        knownMetadata: {},
        budgets: BUDGETS,
        ...overrides,
    });
}

/**
 * A plan in which `c0` and `c4` are genuinely in the **box tier**: five folios
 * 1000 units wide, framed on the middle one, at a scale far below
 * `boxThreshold`.
 *
 * Five rather than one, because the size test is not the last word. The TIER
 * FLOOR guarantees the canvas nearest the viewport centre and its two neighbours
 * never fall below the thumbnail tier however far out the reader has zoomed — so
 * a world small enough to be covered by that floor cannot demonstrate the box
 * tier at all. Framed on `c2`, the floor is `c1`/`c2`/`c3` and the outer two are
 * what the box tier's assertions are about.
 */
function belowBoxThreshold(
    make: (id: string) => PlannerCanvas,
    overrides: Partial<Parameters<typeof planScene>[0]> = {},
) {
    return plan(
        Array.from({ length: 5 }, (_, index) => make(`c${index}`)),
        {
            mode: 'continuous',
            viewport: viewport({
                // The middle folio's centre: two pitches — canvas width plus the
                // resolved gap — plus half a canvas.
                centre: { x: 2 * (1000 + GAP_FRACTION * 1000) + 500, y: 375 },
                scale: 0.02,
            }),
            ...overrides,
        },
    );
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
        //
        // Asserted on a canvas the reader is not standing on — see
        // `belowBoxThreshold` for why a one-canvas world cannot show this.
        const result = belowBoxThreshold((id) => staticCanvas(id, 1000, 750));

        expect(result.tiers.c0).toBe('box');
        expect(result.tiers.c4).toBe('box');
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

    it('holds every canvas at a real tier while every canvas is required', () => {
        const result = plan([staticCanvas('c1', 1000, 750)]);

        expect(result.tiers).toEqual({ c1: 'pyramid' });
    });

    it('drops a canvas to the box tier: it has left the required set', () => {
        // The tier map is the ONE residency vocabulary. There is deliberately
        // no second `evictable` list beside it saying the same thing — it
        // named every box-tier canvas, which on an 800-folio manifest is ~795
        // strings a frame for a reader that never existed.
        const result = belowBoxThreshold((id) => staticCanvas(id, 1000, 750));

        expect(result.tiers.c0).toBe('box');
    });

    it('never lays out NaN, whatever the manifest declares', () => {
        // A zero, a negative, or a NaN is not a dimension. The canvas is still
        // laid out — a canvas the renderer refuses to place is a canvas it can
        // never ask metadata for — but the axis the manifest DID state survives.
        const result = plan([staticCanvas('c1', 0, 750)]);

        expect(result.layout[0]).toMatchObject({ height: 750 });
        expect(result.layout[0].width).toBeGreaterThan(0);
        expect(result.tiers.c1).toBeDefined();
    });

    it('is deterministic: the same input produces an equal plan', () => {
        const canvases = [staticCanvas('c1', 1000, 750)];

        expect(plan(canvases)).toEqual(plan(canvases));
    });
});

/**
 * Multi-canvas layout: paged spreads, the four viewing directions, and
 * `preserveCanvasScale`.
 *
 * The positions are the shared layout function's (`components/canvasLayout`),
 * expressed in the renderer's own units — canvas space, where a page is
 * thousands of units across rather than one. Every expectation below is
 * arithmetic stated in the test: `gapFraction` is 0.01 and the gap is that
 * fraction of the median LAID-OUT canvas extent along the axis the world flows
 * in — the extents after normalization, not the manifest figures, which are a
 * different quantity whenever normalization is not the identity.
 */
describe('planScene — multi-canvas layout', () => {
    /** The gap for a world laid out at these extents along the flow axis. */
    function gapFor(...extents: number[]) {
        const sorted = [...extents].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const centre =
            sorted.length % 2 === 0
                ? (sorted[middle - 1] + sorted[middle]) / 2
                : sorted[middle];
        return GAP_FRACTION * centre;
    }

    const recto = staticCanvas('recto', 1000, 750);
    const verso = staticCanvas('verso', 1000, 750);

    it('lays a facing-page spread out side by side, in canvas-space units', () => {
        const gap = gapFor(1000, 1000);
        const result = plan([recto, verso], { mode: 'paged' });

        expect(result.layout).toEqual([
            { canvasId: 'recto', x: 0, y: 0, width: 1000, height: 750 },
            {
                canvasId: 'verso',
                x: 1000 + gap,
                y: 0,
                width: 1000,
                height: 750,
            },
        ]);
    });

    it('reverses the spread for a right-to-left manifest', () => {
        // The reading order, not the array order: the first canvas is the one on
        // the RIGHT (user story 15).
        const gap = gapFor(1000, 1000);
        const result = plan([recto, verso], {
            mode: 'paged',
            direction: 'right-to-left',
        });

        expect(result.layout.map((rect) => rect.x)).toEqual([1000 + gap, 0]);
    });

    it('leaves a single-canvas world at the origin at its manifest size', () => {
        // The geometry the manifest declares, in every mode: canvas space and
        // world space coincide, which is what the geometric e2e assertions are
        // written against.
        for (const mode of ['individuals', 'paged', 'continuous'] as const) {
            expect(plan([recto], { mode }).layout).toEqual([
                { canvasId: 'recto', x: 0, y: 0, width: 1000, height: 750 },
            ]);
        }
    });

    it('stacks individuals mode at the origin: only one canvas is ever shown', () => {
        expect(plan([recto, verso], { mode: 'individuals' }).layout).toEqual([
            { canvasId: 'recto', x: 0, y: 0, width: 1000, height: 750 },
            { canvasId: 'verso', x: 0, y: 0, width: 1000, height: 750 },
        ]);
    });

    describe('viewing direction', () => {
        const flowed = (direction: ViewingDirection) =>
            plan([recto, verso], { mode: 'continuous', direction }).layout;

        it('flows left to right', () => {
            const gap = gapFor(1000, 1000);
            expect(flowed('left-to-right').map((rect) => rect.x)).toEqual([
                0,
                1000 + gap,
            ]);
        });

        it('flows right to left', () => {
            const gap = gapFor(1000, 1000);
            const [first, second] = flowed('right-to-left');
            expect(first.x).toBeCloseTo(0, 6);
            expect(second.x).toBeCloseTo(-(1000 + gap), 6);
        });

        it('flows top to bottom, spaced by heights rather than widths', () => {
            // The gap is a fraction of the extent along the FLOW axis, so a
            // vertical world is spaced by the median height. Measured on widths
            // it would read differently for a portrait manifest and a landscape
            // one at the same visual size.
            const gap = gapFor(750, 750);
            expect(flowed('top-to-bottom').map((rect) => rect.y)).toEqual([
                0,
                750 + gap,
            ]);
        });

        it('flows bottom to top', () => {
            const gap = gapFor(750, 750);
            const [first, second] = flowed('bottom-to-top');
            expect(first.y).toBeCloseTo(0, 6);
            expect(second.y).toBeCloseTo(-(750 + gap), 6);
        });
    });

    describe('normalization and preserveCanvasScale', () => {
        const wide = staticCanvas('wide', 1000, 750);
        const tall = staticCanvas('tall', 800, 1200);

        it('normalizes mixed canvases to the median height by default', () => {
            // Existing, user-visible layout semantics, carried across the
            // renderer swap: median height 975, so the two scale by 1.3 and
            // 0.8125 respectively.
            const result = plan([wide, tall], { mode: 'paged' });

            expect(result.layout.map((rect) => rect.height)).toEqual([
                975, 975,
            ]);
            expect(result.layout.map((rect) => rect.width)).toEqual([
                1300, 650,
            ]);
        });

        it('clamps normalization to the [0.25, 4] scale range', () => {
            const result = plan(
                [
                    staticCanvas('sliver', 1000, 10),
                    staticCanvas('middle', 1000, 1000),
                    staticCanvas('column', 1000, 10_000),
                ],
                { mode: 'paged' },
            );

            expect(result.layout.map((rect) => rect.width)).toEqual([
                4000, 1000, 250,
            ]);
        });

        it('keeps every canvas at its authored size under preserveCanvasScale', () => {
            const result = plan([wide, tall], {
                mode: 'paged',
                preserveCanvasScale: true,
            });

            expect(result.layout.map((rect) => rect.width)).toEqual([
                1000, 800,
            ]);
            expect(result.layout.map((rect) => rect.height)).toEqual([
                750, 1200,
            ]);
        });

        it('places mixed aspect ratios WITHOUT overlap under preserveCanvasScale', () => {
            // The regression. Layout used to advance a fixed ONE WORLD UNIT per
            // canvas when normalization was off — which, in a world where a page
            // is a thousand units across, stacked the whole spread on one spot.
            // Against that behaviour `tall` lands at x ≈ 1, i.e. 999 units
            // inside `wide`.
            const result = plan([wide, tall], {
                mode: 'paged',
                preserveCanvasScale: true,
            });

            const [first, second] = result.layout;
            expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
            expect(second.x).toBeCloseTo(1000 + gapFor(1000, 800), 6);
        });

        it('places mixed aspect ratios without overlap in a vertical world too', () => {
            const result = plan([wide, tall], {
                mode: 'continuous',
                direction: 'top-to-bottom',
                preserveCanvasScale: true,
            });

            const [first, second] = result.layout;
            expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
            expect(second.y).toBeCloseTo(750 + gapFor(750, 1200), 6);
        });

        it('centres the shorter page in the spread', () => {
            const result = plan([wide, tall], {
                mode: 'paged',
                preserveCanvasScale: true,
            });

            expect(result.layout.map((rect) => rect.y)).toEqual([
                (1200 - 750) / 2,
                0,
            ]);
        });
    });

    describe('canvases with no declared dimensions', () => {
        // A SERVICE source, because that is the only kind whose dimensions can
        // ever be reported: the host fetches `info.json` for a service canvas
        // and for nothing else, so a static canvas has no facts to reflow to.
        const unsized: PlannerCanvas = {
            id: 'unsized',
            width: null,
            height: null,
            images: [fills('unsized', serviceSource('unsized'), 1, 1)],
        };

        it('positions an unsized canvas from the median of its siblings', () => {
            // Never blocked on a fetch: "just fetch its dimensions" is the
            // reflex, and it restores the fetch storm for any manifest with
            // sparse metadata (spec §Coordinate model and layout).
            const result = plan(
                [
                    staticCanvas('a', 1000, 750),
                    unsized,
                    staticCanvas('c', 1200, 900),
                ],
                { mode: 'paged' },
            );

            const guessed = result.layout[1];
            // Median width (1000, 1200) = 1100; median height (750, 900) = 825.
            // Normalized to the median height of the three, which the guess is
            // by construction, so its own scale is 1.
            expect(guessed.width).toBeCloseTo(1100, 6);
            expect(guessed.height).toBeCloseTo(825, 6);
        });

        it('repositions it when the image service reports real dimensions', () => {
            const canvases = [staticCanvas('a', 1000, 750), unsized];
            const guessed = plan(canvases, {
                mode: 'paged',
                preserveCanvasScale: true,
            });
            const reflowed = plan(canvases, {
                mode: 'paged',
                preserveCanvasScale: true,
                knownMetadata: byService({
                    unsized: { width: 400, height: 300, version: 3 },
                }),
            });

            expect(guessed.layout[1]).toMatchObject({
                width: 1000,
                height: 750,
            });
            expect(reflowed.layout[1]).toMatchObject({
                width: 400,
                height: 300,
            });
        });

        it('never lets service dimensions move a canvas the manifest DID size', () => {
            // The other half of the rule, and the one that matters more: manifest
            // and service dimensions disagreeing is routine, and if the service
            // won, the thing under the user's cursor would move as tiles landed
            // and annotation geometry — persisted in canvas space — would break.
            const result = plan([staticCanvas('a', 1000, 750)], {
                knownMetadata: byService({
                    a: { width: 4000, height: 3000, version: 3 },
                }),
            });

            expect(result.layout).toEqual([
                { canvasId: 'a', x: 0, y: 0, width: 1000, height: 750 },
            ]);
        });

        it('lays out a lone unsized canvas and asks for the metadata that will fix it', () => {
            // The path users actually take: the host feeds the planner only the
            // canvases on screen, which in individuals and continuous mode is
            // ONE — so an unsized canvas there has no siblings to take a median
            // from. Dropping it looks safe and is a dead end: no rect means no
            // tier, no tier means no metadata request, and no request means the
            // reflow that would size it can never fire. The folio is blank
            // permanently, and blank again every time the user pages back to it
            // (user story 32).
            const result = plan([
                {
                    id: 'lonely',
                    width: null,
                    height: null,
                    images: [fills('lonely', serviceSource('lonely'), 1, 1)],
                },
            ]);

            expect(result.layout).toHaveLength(1);
            expect(result.layout[0].width).toBeGreaterThan(0);
            expect(result.layout[0].height).toBeGreaterThan(0);
            expect(result.tiers.lonely).toBe('pyramid');
            expect(result.metadataRequests).toEqual(['lonely']);
        });

        it('reflows the lone unsized canvas once its service answers', () => {
            const lonely: PlannerCanvas = {
                id: 'lonely',
                width: null,
                height: null,
                images: [fills('lonely', serviceSource('lonely'), 1, 1)],
            };

            const reflowed = plan([lonely], {
                knownMetadata: byService({
                    lonely: { width: 1600, height: 1200 },
                }),
            });

            expect(reflowed.layout[0]).toMatchObject({
                width: 1600,
                height: 1200,
            });
        });

        it('drops a canvas with no usable id, and only that', () => {
            // The one remaining drop: an unkeyed canvas cannot be named by a
            // tier, a request, or a draw, so there is nothing to lay out FOR.
            const result = plan(
                [{ ...unsized, id: '' }, staticCanvas('a', 1000, 750)],
                {
                    mode: 'paged',
                },
            );

            expect(result.layout.map((rect) => rect.canvasId)).toEqual(['a']);
        });

        it('keeps the axis the manifest DID declare when the other is missing', () => {
            // Half a declaration is still a declaration. Taking both axes from
            // the median silently overrides a figure the manifest was explicit
            // about — and this canvas would be laid out 1000 wide instead of the
            // 2400 it states.
            const halfSized: PlannerCanvas = {
                id: 'half',
                width: 2400,
                height: 0,
                images: [fills('half', staticSource('half'), 1, 1)],
            };
            const result = plan(
                [
                    staticCanvas('a', 1000, 750),
                    halfSized,
                    staticCanvas('c', 1000, 750),
                ],
                { mode: 'paged', preserveCanvasScale: true },
            );

            // The stated width, kept; the missing height taken from the
            // siblings' 4:3 aspect ratio rather than from their absolute size.
            expect(result.layout[1]).toMatchObject({
                width: 2400,
                height: 1800,
            });
        });

        it('reaches a fixed point: the reflow does not re-enter the guess', () => {
            // The reflow terminates only because the host's `knownMetadata` is
            // append-only (`CanvasHost.requestMetadata`). Asserted here, in the
            // pure function, because the invariant it rests on lives in a Svelte
            // component: were a byte budget to evict facts alongside tiles, a
            // canvas would fall back to the guess, resize, re-enter the pyramid
            // tier, refetch, and resize back — thrashing at the tier boundary
            // with nothing failing.
            const canvases = [staticCanvas('a', 1000, 750), unsized];
            const knownMetadata = byService({
                unsized: { width: 400, height: 300, version: 3 as const },
            });

            const once = plan(canvases, { mode: 'paged', knownMetadata });
            const twice = plan(canvases, { mode: 'paged', knownMetadata });

            expect(twice.layout).toEqual(once.layout);
            expect(twice.metadataRequests).toEqual(once.metadataRequests);
        });
    });

    describe('the inter-canvas gap under normalization', () => {
        it('measures the gap on the laid-out extents, not the manifest ones', () => {
            // Median height 2500, so the two scale by 2.5 and 0.625 and are laid
            // out 10000 and 312.5 wide. The gap is 1% of the median of THOSE
            // (5156.25), not of the raw widths (2250): measured on the manifest
            // figures it is a different quantity on a different axis, and the
            // seam the reader sees is wrong by the normalization scale — 0.28%
            // of the drawn recto instead of 1%.
            const result = plan(
                [
                    staticCanvas('recto', 4000, 1000),
                    staticCanvas('verso', 500, 4000),
                ],
                { mode: 'paged' },
            );

            expect(result.layout.map((rect) => rect.width)).toEqual([
                10000, 312.5,
            ]);
            expect(result.layout[1].x).toBeCloseTo(
                10000 + GAP_FRACTION * 5156.25,
                6,
            );
        });
    });

    describe('tiers and residency across several canvases', () => {
        // Median height 562.5, so the two scale by 0.75 and 1.5 and both are
        // laid out at 750x562.5 — `little` at half again its manifest size.
        const mixedSpread = [
            staticCanvas('big', 1000, 750),
            staticCanvas('little', 500, 375),
        ];

        it('decides the tier from the LAID-OUT rect, not the manifest size', () => {
            // Normalization scales a canvas to the median height, so a small
            // canvas beside large siblings covers more screen than its manifest
            // figure predicts. At a 600 threshold `little` is a thumbnail by its
            // manifest (effectiveSize 433) and a pyramid by its rect (649).
            const result = plan(mixedSpread, {
                mode: 'paged',
                budgets: { ...BUDGETS, pyramidThreshold: 600 },
            });

            expect(result.layout[1]).toMatchObject({
                width: 750,
                height: 562.5,
            });
            expect(result.tiers.little).toBe('pyramid');
        });

        it('derives the zoom floor from the laid-out rects', () => {
            const result = plan(mixedSpread, { mode: 'paged' });

            // Both rects are 750x562.5 after normalization, so the median
            // effective size is sqrt(750 * 562.5) rather than either manifest
            // figure.
            expect(result.minZoom).toBeCloseTo(
                BUDGETS.boxThreshold / Math.sqrt(750 * 562.5),
                10,
            );
        });

        it('holds only the base level of a canvas outside viewport-plus-margin', () => {
            // The claim the residency margin rests on, checked with more than one
            // canvas in the world for the first time: a spread whose far page is
            // off screen must cost its base tile and nothing else, or a paged
            // manifest pays for two full pyramids on every page turn.
            const spread = plan(
                [
                    serviceCanvas('near', 4096, 4096),
                    serviceCanvas('far', 4096, 4096),
                ],
                {
                    mode: 'paged',
                    preserveCanvasScale: true,
                    knownMetadata: byService({ near: FACTS, far: FACTS }),
                    // Zoomed into the near page; the far one starts beyond
                    // x = 4096 and is nowhere near the margin box.
                    viewport: viewport({
                        centre: { x: 500, y: 500 },
                        scale: 0.5,
                    }),
                },
            );

            const farLevels = spread.tileRequests
                .filter((request) => request.canvasId === 'far')
                .map((request) => request.level);
            const nearLevels = spread.tileRequests
                .filter((request) => request.canvasId === 'near')
                .map((request) => request.level);

            expect(farLevels).toEqual([0]);
            expect(new Set(nearLevels).size).toBeGreaterThan(1);
        });

        it('orders the required set centre-out ACROSS canvases, not per canvas', () => {
            const result = plan(
                [
                    serviceCanvas('near', 4096, 4096),
                    serviceCanvas('far', 4096, 4096),
                ],
                {
                    mode: 'paged',
                    preserveCanvasScale: true,
                    knownMetadata: byService({ near: FACTS, far: FACTS }),
                    viewport: viewport({
                        centre: { x: 500, y: 500 },
                        scale: 0.5,
                    }),
                },
            );

            const priorities = result.tileRequests.map(
                (request) => request.priority,
            );
            expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
            // …and the far canvas really is behind the near one, rather than the
            // list happening to be sorted within each canvas.
            expect(result.tileRequests.at(-1)!.canvasId).toBe('far');
        });
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
            knownMetadata: byService({ c1: FACTS }),
        });

        expect(result.metadataRequests).toEqual([]);
    });

    it('uses the service id returned by info.json for tile requests', () => {
        const signed = 'https://images.test/signed/abc';
        const facts = parseImageService({
            ...FACTS,
            id: signed,
            type: 'ImageService3',
        })!;
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
            knownMetadata: byService({ c1: facts }),
        });

        expect(result.tileRequests.length).toBeGreaterThan(0);
        expect(
            result.tileRequests.every((request) =>
                request.url.startsWith(`${signed}/`),
            ),
        ).toBe(true);
    });

    it('asks for no metadata below the pyramid tier: the level rules nest inside the canvas tier', () => {
        // Applied without the tier gate, "the base level is never evicted"
        // would mean one resident base tile per canvas across a whole manifest.
        const thumbnail = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ scale: 0.2 }),
        });
        const box = belowBoxThreshold((id) => serviceCanvas(id, 1000, 1000));

        expect(thumbnail.tiers.c1).toBe('thumbnail');
        expect(thumbnail.metadataRequests).toEqual([]);
        expect(box.tiers.c0).toBe('box');
        expect(box.metadataRequests).not.toContain('c0');
    });

    it('keeps the coarse chain over viewport-plus-margin, not over the whole image', () => {
        // Zoomed into the top-left corner at full resolution. Every level —
        // coarse chain included — is restricted to the same box; only the base
        // level, one tile by construction, is held whole.
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 60, y: 60 }, scale: 16 }),
            knownMetadata: byService({ c1: FACTS }),
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
            knownMetadata: byService({ c1: BIG_FACTS }),
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
                knownMetadata: byService({ c1: FACTS }),
            });

            expect(
                result.tileRequests.some(
                    (request) =>
                        request.key ===
                        tileKey('c1', serviceIdOf('c1'), 0, 0, 0),
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
                    knownMetadata: byService({ c1: FACTS }),
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
                    knownMetadata: byService({ c1: FACTS }),
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
                    knownMetadata: byService({ c1: FACTS }),
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
                    knownMetadata: byService({ c1: FACTS }),
                    budgets: { ...BUDGETS, minPixelRatio },
                }).tileRequests.map((request) => request.level),
            );

        // The ratio is device pixels per LEVEL pixel: a higher one accepts a
        // blurrier level, which is the previous renderer's direction carried forward
        // with the value.
        expect(at(2)).toBeLessThan(at(0.25));
    });

    it('orders tiles centre-out, not in discovery order', () => {
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 4 }),
            knownMetadata: byService({ c1: FACTS }),
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
                knownMetadata: byService({ c1: FACTS }),
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
            knownMetadata: byService({ c1: FACTS }),
        });

        expect(result.tileRequests[0].key).toBe(
            tileKey('c1', serviceIdOf('c1'), 0, 0, 0),
        );
        expect(result.tileRequests[0].priority).toBe(0);
    });

    it('builds a IIIF Image API request URL per tile', () => {
        // Zoomed out far enough that only the base level is wanted.
        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 0.5 }),
            knownMetadata: byService({ c1: FACTS }),
        });

        expect(result.tileRequests).toHaveLength(1);
        expect(result.tileRequests[0].url).toBe(
            'https://images.test/c1/full/512,/0/default.jpg',
        );
    });

    it('draws only tiles the host actually holds', () => {
        const withNothing = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
            knownMetadata: byService({ c1: FACTS }),
        });
        expect(withNothing.tileDraws).toEqual([]);

        const withBase = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: fit,
            knownMetadata: byService({ c1: FACTS }),
            residentTiles: new Set([tileKey('c1', serviceIdOf('c1'), 0, 0, 0)]),
        });
        expect(withBase.tileDraws.map((draw) => draw.key)).toEqual([
            tileKey('c1', serviceIdOf('c1'), 0, 0, 0),
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
            tileKey('c1', serviceIdOf('c1'), 2, 1, 1),
            tileKey('c1', serviceIdOf('c1'), 0, 0, 0),
            tileKey('c1', serviceIdOf('c1'), 1, 0, 0),
        ]);

        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 300, y: 300 }, scale: 1.6 }),
            knownMetadata: byService({ c1: FACTS }),
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
        const onScreen = tileKey('c1', serviceIdOf('c1'), 3, 0, 0);
        const inMarginOnly = tileKey('c1', serviceIdOf('c1'), 3, 1, 0);

        const result = plan([serviceCanvas('c1', 1000, 1000)], {
            viewport: viewport({ centre: { x: 60, y: 60 }, scale: 16 }),
            knownMetadata: byService({ c1: FACTS }),
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
        images: [
            {
                ...ladderCanvas.images[0],
                source: {
                    kind: 'service',
                    serviceId: serviceIdOf('c1'),
                    profile: 'level0',
                },
            },
        ],
    };

    function ladderPlan(
        scale: number,
        budgets: Partial<PlannerBudgets> = {},
        residentTiles?: Set<string>,
        facts: ImageServiceFacts = LADDER_FACTS,
    ) {
        return plan([ladderCanvas], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale }),
            knownMetadata: byService({ c1: facts }),
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
        const coarse = tileKey('c1', serviceIdOf('c1'), 0, 0, 0);
        const fine = tileKey('c1', serviceIdOf('c1'), 1, 0, 0);

        const result = ladderPlan(1, {}, new Set([fine, coarse]));

        expect(result.tileDraws).toEqual([
            {
                key: coarse,
                canvasId: 'c1',
                level: 0,
                // The sole placement of the sole canvas, so paint order 0.
                order: 0,
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            },
            {
                key: fine,
                canvasId: 'c1',
                level: 1,
                order: 0,
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            },
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
            knownMetadata: byService({
                c1: { width: 800, height: 1000, version: 2 },
            }),
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
            knownMetadata: byService({
                c1: { width: 12_000, height: 9_000, version: 3 },
            }),
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
        // The next page: inside the residency window because it is the ±1
        // canvas beyond the one on screen, but outside the residency MARGIN.
        // A rung is a whole image, so a neighbour that kept its chain would
        // hold its full-resolution scan resident — required-set membership, not
        // visibility, drives eviction, so nothing would ever release it. The
        // one cheap image it does hold is what stops it blanking on arrival.
        const nextPage: PlannerCanvas = {
            ...serviceCanvas('c2', 1000, 1000),
        };

        // Framed inside canvas 1 (x 0..1000) at scale 4: the margin reaches
        // x 350..650, and canvas 2 starts at 1010.
        const result = plan([ladderCanvas, nextPage], {
            mode: 'continuous',
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 4 }),
            knownMetadata: byService({ c1: LADDER_FACTS, c2: LADDER_FACTS }),
        });

        const levelsOf = (canvasId: string) =>
            result.tileRequests
                .filter((request) => request.canvasId === canvasId)
                .map((request) => request.level);

        expect(result.tiers).toEqual({ c1: 'pyramid', c2: 'pyramid' });
        expect(levelsOf('c1').length).toBeGreaterThan(1);
        expect(levelsOf('c2')).toEqual([0]);
        // …and nothing of the neighbour is painted: the margin exists to
        // prefetch, not to paint. Asserted on `canvasId` rather than on the key's
        // spelling, because that is the field the HOST reads — "does this canvas
        // have anything on screen this frame?" is what decides whether an error
        // placeholder may cover it (`CanvasHost.updateCanvasErrors`).
        expect(result.tileDraws.map((draw) => draw.canvasId)).not.toContain(
            'c2',
        );
    });

    it('releases even the base rung once the canvas is out of the residency window', () => {
        // The nesting rule at its sharpest (spec §Further Notes): "the base
        // level is never evicted" is scoped to the pyramid tier, and a canvas
        // the viewport is nowhere near is not in it. Applied without that
        // scope, an 800-folio manifest holds 800 base images for ever.
        const far = plan([ladderCanvas], {
            viewport: viewport({ centre: { x: 50_000, y: 500 }, scale: 4 }),
            knownMetadata: byService({ c1: LADDER_FACTS }),
        });

        expect(far.tiers.c1).toBe('box');
        expect(far.tileRequests).toEqual([]);
        expect(far.tileDraws).toEqual([]);
    });

    it('still draws a canvas whose cheapest image is already over the cap', () => {
        // The cap degrades to blur while there is anything coarser to fall back
        // to. When there is not, the renderer still draws it — never blank.
        const result = plan([level0Canvas], {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 1 }),
            knownMetadata: byService({
                c1: { width: 8000, height: 8000, version: 3 },
            }),
            budgets: { ...BUDGETS, maxDecodedPixels: 1024 },
        });

        expect(result.tileRequests).toHaveLength(1);
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
 * Opening a long paged manifest, along the chain `CanvasHost` actually runs:
 * raw manifest JSON → the visible spread → planner canvases → a scene plan.
 *
 * The claim under test: opening
 * a manifest costs O(1) network requests regardless of its length, because
 * layout comes from manifest Canvas dimensions and never from `info.json`.
 */
/**
 * The **thumbnail tier**: one small image per canvas, sized to its projection
 * and quantized to a rung.
 *
 * This is what fills the grey boxes between the two thresholds. The resolution
 * ladder itself is `thumbnailLadder.test.ts`; what is asserted here is what the
 * PLANNER does with it — how many requests one canvas is worth, in what order
 * they arrive, and the two gates that keep a viewport holding fifty of these
 * canvases from becoming a request storm.
 */
describe('planScene — the thumbnail tier', () => {
    /** effectiveSize ≈ 1000 * 0.2 = 200: below 400, above 40. */
    const THUMBNAIL_VIEW = viewport({ scale: 0.2 });

    function thumbnailPlan(
        canvases: PlannerCanvas[],
        overrides: Partial<Parameters<typeof planScene>[0]> = {},
    ) {
        return plan(canvases, { viewport: THUMBNAIL_VIEW, ...overrides });
    }

    function level0Canvas(id: string): PlannerCanvas {
        return {
            id,
            width: 1000,
            height: 1000,
            images: [
                {
                    ...fills(id, serviceSource(id), 1, 1),
                    source: {
                        kind: 'service',
                        serviceId: serviceIdOf(id),
                        profile: 'level0',
                    },
                },
            ],
        };
    }

    it('gives a thumbnail-tier canvas a whole image instead of a pyramid', () => {
        const result = thumbnailPlan([serviceCanvas('c1', 1000, 1000)]);

        expect(result.tiers.c1).toBe('thumbnail');
        expect(result.tileRequests).toEqual([]);
        expect(result.thumbnailRequests.map((request) => request.url)).toEqual([
            // The base rung, and the rung the projection wants: 1000 canvas
            // units at scale 0.2 is 200 device px, which rounds UP to 256.
            'https://images.test/c1/full/32,/0/default.jpg',
            'https://images.test/c1/full/256,/0/default.jpg',
        ]);
    });

    it('costs a level 1/2 canvas no info.json at all', () => {
        // The whole point of rung 2. An ordinary manifest fills its grey boxes
        // from manifest data alone.
        const result = thumbnailPlan([serviceCanvas('c1', 1000, 1000)]);

        expect(result.metadataRequests).toEqual([]);
    });

    it('uses a declared thumbnail as-is, and asks a level0 service nothing', () => {
        // The acceptance criterion this ladder's first rung exists for.
        const declared = 'https://example.test/thumb.jpg';
        const result = thumbnailPlan([
            { ...level0Canvas('c1'), thumbnailUrl: declared },
        ]);

        expect(result.metadataRequests).toEqual([]);
        expect(result.thumbnailRequests.map((request) => request.url)).toEqual([
            declared,
        ]);
        // One URL for both rungs is ONE request and one texture: the identity
        // is the URL, not the rung.
        expect(result.thumbnailRequests).toHaveLength(1);
    });

    it('asks a level0 service for its info.json, bounded by the tier', () => {
        // Rung 3. The bound is what makes it not-a-storm — the storm was
        // fetching all N regardless of tier — so the same canvas below the box
        // threshold asks for nothing at all.
        const inTier = thumbnailPlan([level0Canvas('c1')]);
        const belowTier = belowBoxThreshold(level0Canvas);

        expect(inTier.metadataRequests).toEqual(['c1']);
        expect(inTier.thumbnailRequests).toEqual([]);
        expect(belowTier.tiers.c0).toBe('box');
        expect(belowTier.metadataRequests).not.toContain('c0');
    });

    it('takes the advertised size once the info.json has landed', () => {
        const result = thumbnailPlan([level0Canvas('c1')], {
            knownMetadata: byService({
                c1: {
                    width: 4000,
                    height: 4000,
                    level0: true,
                    version: 3,
                    sizes: [
                        { width: 62, height: 62 },
                        { width: 250, height: 250 },
                        { width: 1000, height: 1000 },
                    ],
                },
            }),
        });

        expect(result.metadataRequests).toEqual([]);
        expect(result.thumbnailRequests.map((request) => request.url)).toEqual([
            'https://images.test/c1/full/62,/0/default.jpg',
            'https://images.test/c1/full/250,/0/default.jpg',
        ]);
    });

    describe('quantization', () => {
        it('produces a SMALL set of distinct URLs across a continuous zoom', () => {
            // The naive implementation computes the exact projected size: every
            // zoom step mints a fresh URL, every one misses the HTTP cache, and
            // a pinch generates a request per frame per canvas.
            const urls = new Set<string>();

            // A continuous sweep across the whole thumbnail band — 300 frames
            // of a pinch, which is about five seconds of one.
            for (let step = 0; step < 300; step += 1) {
                const scale = 0.05 + (step * 0.35) / 300;
                for (const request of thumbnailPlan(
                    [serviceCanvas('c1', 1000, 1000)],
                    { viewport: viewport({ scale }) },
                ).thumbnailRequests) {
                    urls.add(request.url);
                }
            }

            expect(urls.size).toBeLessThanOrEqual(5);
        });

        it('rounds the rung UP, so a thumbnail is never asked to cover more pixels than it has', () => {
            const wanted = (scale: number) =>
                thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                    viewport: viewport({ scale }),
                }).thumbnailRequests.at(-1)?.rung;

            // 1000 canvas units at 0.06 is 60 device px.
            expect(wanted(0.06)).toBe(64);
            expect(wanted(0.065)).toBe(128);
        });

        it('asks for device pixels, not CSS pixels', () => {
            // A thumbnail chosen from CSS pixels is visibly soft on a 2x screen,
            // for the same reason a pyramid level chosen from them never reaches
            // full resolution.
            const onePx = thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                viewport: viewport({ scale: 0.06 }),
            });
            const twoPx = thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                viewport: viewport({ scale: 0.06 }),
                dpr: 2,
            });

            expect(onePx.thumbnailRequests.at(-1)?.rung).toBe(64);
            expect(twoPx.thumbnailRequests.at(-1)?.rung).toBe(128);
        });
    });

    describe('the base rung', () => {
        it('holds the cheapest rung beneath the chosen one, so a zoom re-sharpens rather than blanking', () => {
            const result = thumbnailPlan([serviceCanvas('c1', 1000, 1000)]);

            expect(
                result.thumbnailRequests.map((request) => request.rung),
            ).toEqual([32, 256]);
        });

        it('collapses to ONE request where the projection already wants the base rung', () => {
            // The derived zoom floor's own case: every canvas in the residency
            // window is thumbnail tier down there, so this is the difference
            // between fifty requests and a hundred.
            const result = thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                // A lower box threshold than the block's, so a canvas can sit
                // in the tier while its projection still wants the base rung.
                budgets: { ...BUDGETS, boxThreshold: 10 },
                viewport: viewport({ scale: 0.03 }),
            });

            expect(result.tiers.c1).toBe('thumbnail');
            expect(result.thumbnailRequests).toHaveLength(1);
            expect(result.thumbnailRequests[0].rung).toBe(32);
        });
    });

    describe('the handover from the pyramid tier', () => {
        /** The base level of any pyramid or ladder: level 0, one tile. */
        const BASE = tileKey('c1', serviceIdOf('c1'), 0, 0, 0);
        const CANVAS = serviceCanvas('c1', 1000, 1000);

        /** In the thumbnail tier, holding `resident` and nothing else. */
        function handover(resident: TileKey[]) {
            return thumbnailPlan([CANVAS], {
                knownMetadata: byService({ c1: FACTS }),
                residentTiles: new Set(resident),
            });
        }

        it('keeps painting the base level until the thumbnail arrives', () => {
            // The defect: blur-up held WITHIN the pyramid tier and nowhere at the
            // boundary out of it. Crossing the threshold released every tile
            // while the thumbnail had not been asked for yet, so the canvas had
            // nothing to paint for a whole round trip — one dropped frame against
            // a fixture, the better part of a second against a real service.
            const result = handover([BASE]);

            expect(result.tiers.c1).toBe('thumbnail');
            expect(result.tileDraws.map((draw) => draw.key)).toEqual([BASE]);
            // Over the whole canvas: the base level is one tile covering the
            // whole image, which is the same picture a thumbnail is.
            expect(result.tileDraws[0]).toMatchObject({
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            });
        });

        it('keeps it REQUIRED, not merely held', () => {
            // `tileDraws` is the required-AND-held subset, so a base tile left
            // out of the request list would be demoted to the opportunistic
            // cache and could not be painted — the blank frame again, arriving
            // through eviction instead of through the tier.
            const result = handover([BASE]);

            expect(result.tileRequests.map((request) => request.key)).toEqual([
                BASE,
            ]);
        });

        it('stops carrying it the moment a thumbnail is resident', () => {
            // Otherwise this is "the base level is never evicted", which on an
            // 800-folio manifest means 800 resident base tiles — the thing the
            // tier gate exists to prevent.
            const thumbnailUrl =
                'https://images.test/c1/full/256,/0/default.jpg';
            const result = handover([BASE, `c1#thumb/${thumbnailUrl}`]);

            expect(result.tileDraws.map((draw) => draw.key)).toEqual([
                `c1#thumb/${thumbnailUrl}`,
            ]);
            expect(result.tileRequests).toEqual([]);
        });

        it('carries nothing for a canvas arriving from the box tier', () => {
            // It holds no base tile, so there is nothing to carry and nothing to
            // fetch: a canvas on its way IN costs exactly what it did before.
            const result = handover([]);

            expect(result.tileDraws).toEqual([]);
            expect(result.tileRequests).toEqual([]);
        });

        it('carries nothing while the canvas has no service facts', () => {
            // No facts, no pyramid, no URL to keep it required by. The metadata
            // request is the thumbnail ladder's business, not this seam's.
            const result = thumbnailPlan([CANVAS], {
                residentTiles: new Set([BASE]),
            });

            expect(result.tileDraws).toEqual([]);
            expect(result.tileRequests).toEqual([]);
        });
    });

    describe('the tier floor', () => {
        /**
         * The scale at which a 1000-square canvas sits exactly ON the block's
         * box threshold. Below it the size test alone sends the canvas — and in
         * a one-canvas world therefore the whole scene — to the box tier.
         */
        const AT_THRESHOLD = BUDGETS.boxThreshold / 1000;

        it('keeps the nearest canvas rendering at any scale, however far out', () => {
            // The defect this exists for: past this point the viewer was the
            // faint placeholder rects and nothing else, and the derived zoom
            // floor did not save it, because the floor is derived from this very
            // threshold and lands on the same boundary. Zoom bounds are a
            // setting, still to come; zooming out must soften the picture, never
            // extinguish it.
            for (const factor of [0.999, 0.5, 1e-3, 1e-9]) {
                const result = thumbnailPlan(
                    [serviceCanvas('c1', 1000, 1000)],
                    { viewport: viewport({ scale: AT_THRESHOLD * factor }) },
                );

                expect(result.tiers.c1).toBe('thumbnail');
                // The base rung at least, and it paints: the required set and
                // the draw list are both non-empty however small the projection.
                expect(
                    result.thumbnailRequests.map((request) => request.rung),
                ).toContain(32);
                expect(result.tileRequests).toEqual([]);
            }
        });

        it('costs nothing when something is already above the box tier', () => {
            // A no-op at every scale a reader actually reads at, which is what
            // makes it safe to apply unconditionally rather than as a
            // "is the scene blank?" second pass.
            const reading = thumbnailPlan([serviceCanvas('c1', 1000, 1000)]);

            expect(reading.tiers.c1).toBe('thumbnail');
            expect(reading.thumbnailRequests.map((r) => r.rung)).toEqual([
                32, 256,
            ]);
        });

        it('does not reach a viewport the world is nowhere near', () => {
            // The scoping the residency window states: a canvas the reader is
            // nowhere near really must hold nothing. The floor is a promise
            // about what is ON SCREEN, not a promise that a texture exists.
            const away = thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                viewport: viewport({
                    centre: { x: 900_000, y: 900_000 },
                    scale: AT_THRESHOLD / 10,
                }),
            });

            expect(away.tiers.c1).toBe('box');
            expect(away.thumbnailRequests).toEqual([]);
        });

        it('still asks for nothing while the view is moving', () => {
            // The floor promotes the TIER; it does not reopen the view-stable
            // gate. A flick that ends up below the threshold asks for nothing,
            // exactly as one above it does.
            const flicking = thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                viewport: viewport({ scale: AT_THRESHOLD / 100 }),
                viewStable: false,
            });

            expect(flicking.tiers.c1).toBe('thumbnail');
            expect(flicking.thumbnailRequests).toEqual([]);
            expect(flicking.metadataRequests).toEqual([]);
        });
    });

    describe('the view-stable gate', () => {
        const CANVASES = [serviceCanvas('c1', 1000, 1000), level0Canvas('c2')];

        it('issues no thumbnail and no metadata request while the view is moving', () => {
            // A flick passes over hundreds of canvases that are never dwelt on.
            // Asking for each as it goes by is most of the storm on its own.
            const moving = thumbnailPlan(CANVASES, { viewStable: false });

            expect(moving.thumbnailRequests).toEqual([]);
            expect(moving.metadataRequests).toEqual([]);
        });

        it('issues them the moment the view stops', () => {
            const stopped = thumbnailPlan(CANVASES, { viewStable: true });

            expect(stopped.thumbnailRequests.length).toBeGreaterThan(0);
            expect(stopped.metadataRequests).toEqual(['c2']);
        });

        it('gates a PYRAMID-tier canvas’s metadata too', () => {
            const moving = plan([serviceCanvas('c1', 1000, 1000)], {
                viewStable: false,
            });

            expect(moving.tiers.c1).toBe('pyramid');
            expect(moving.metadataRequests).toEqual([]);
        });

        it('does not gate TILES, so a canvas being dragged does not go blank', () => {
            const moving = plan([serviceCanvas('c1', 1000, 1000)], {
                knownMetadata: byService({ c1: FACTS }),
                viewStable: false,
            });

            expect(moving.tileRequests.length).toBeGreaterThan(0);
        });

        it('keeps a thumbnail already decoded in the required set through a gesture', () => {
            // Dropped from the required set it would be demoted to the
            // opportunistic cache and stop painting — a canvas that blanks the
            // instant the reader touches it.
            const stable = thumbnailPlan([serviceCanvas('c1', 1000, 1000)]);
            const held = new Set(
                stable.thumbnailRequests.map((request) => request.key),
            );

            const moving = thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                viewStable: false,
                residentTiles: held,
            });

            expect(
                new Set(moving.thumbnailRequests.map((request) => request.key)),
            ).toEqual(held);
        });

        it('keeps painting the resident rung when a pinch crosses a rung boundary', () => {
            // The gate refuses NEW requests during a gesture, so a rung that
            // changes mid-pinch turns that refusal into a blank canvas: both the
            // required set and the draws are derived from the current rungs, and
            // the image already decoded is in neither. The canvas would paint
            // its 32 px base stretched over 250 — the "blanks the instant the
            // reader touched it" failure arriving through the rung rather than
            // through the gate.
            const canvases = [serviceCanvas('c1', 1000, 1000)];
            // 1000 * 0.1 = 100 device px, which rounds up to the 128 rung.
            const settled = plan(canvases, {
                viewport: viewport({ scale: 0.1 }),
            });
            const held = new Set(
                settled.thumbnailRequests.map((request) => request.key),
            );
            expect(
                settled.thumbnailRequests.map((request) => request.rung),
            ).toEqual([32, 128]);

            // The reader pinches out: the projection now wants 256, which is
            // gated off and which nothing holds.
            const pinching = plan(canvases, {
                viewport: viewport({ scale: 0.2 }),
                viewStable: false,
                residentTiles: held,
            });

            expect(pinching.tiers.c1).toBe('thumbnail');
            expect(new Set(pinching.tileDraws.map((draw) => draw.key))).toEqual(
                held,
            );
            // And still nothing new is asked for: the gate is intact.
            expect(
                new Set(
                    pinching.thumbnailRequests.map((request) => request.key),
                ),
            ).toEqual(held);
        });

        it('picks the projection back up the frame the motion stops', () => {
            const canvases = [serviceCanvas('c1', 1000, 1000)];
            const held = new Set(
                plan(canvases, {
                    viewport: viewport({ scale: 0.1 }),
                }).thumbnailRequests.map((request) => request.key),
            );

            const stopped = plan(canvases, {
                viewport: viewport({ scale: 0.2 }),
                residentTiles: held,
            });

            expect(
                stopped.thumbnailRequests.map((request) => request.rung),
            ).toEqual([32, 256]);
        });

        it('is open by default, which is what an idle caller is describing', () => {
            expect(
                thumbnailPlan([serviceCanvas('c1', 1000, 1000)])
                    .thumbnailRequests.length,
            ).toBeGreaterThan(0);
        });
    });

    describe('priority', () => {
        it('orders thumbnails centre-out, so the page being looked at arrives first', () => {
            const canvases = Array.from({ length: 5 }, (_, index) =>
                serviceCanvas(`c${index}`, 1000, 1000),
            );

            const result = plan(canvases, {
                mode: 'continuous',
                // Framed on canvas 2, four canvases wide.
                viewport: viewport({
                    centre: { x: 2 * 1010 + 500, y: 500 },
                    scale: 0.2,
                }),
            });

            const order = result.thumbnailRequests.map(
                (request) => request.canvasId,
            );
            // Nearest first — and not in discovery order, which would be c0.
            expect(order[0]).toBe('c2');
            expect(
                result.thumbnailRequests.every(
                    (request, index) =>
                        index === 0 ||
                        request.priority >=
                            result.thumbnailRequests[index - 1].priority,
                ),
            ).toBe(true);
        });
    });

    describe('a canvas with no usable thumbnail', () => {
        /** Level0, no sizes, no tiles: the only legal request is the master. */
        const HOPELESS: ImageServiceFacts = {
            width: 12_000,
            height: 9000,
            level0: true,
            version: 3,
        };

        it('lands in the box tier rather than downloading a 108-megapixel master', () => {
            const result = thumbnailPlan([level0Canvas('c1')], {
                knownMetadata: byService({ c1: HOPELESS }),
            });

            expect(result.tiers.c1).toBe('box');
            expect(result.thumbnailRequests).toEqual([]);
            expect(result.unresolvedThumbnails).toEqual(['c1']);
        });

        it('is reported for the host to log, and is never retried', () => {
            // A retry loop across hundreds of canvases against one badly-behaved
            // institutional server is the worst kind of bug to diagnose
            // remotely. The decision is a pure function of the manifest and the
            // service's facts, so it is the same answer on every frame and no
            // request is ever issued.
            const once = thumbnailPlan([level0Canvas('c1')], {
                knownMetadata: byService({ c1: HOPELESS }),
            });
            const again = thumbnailPlan([level0Canvas('c1')], {
                knownMetadata: byService({ c1: HOPELESS }),
            });

            expect(again).toEqual(once);
            expect(again.metadataRequests).toEqual([]);
        });

        /**
         * The ordinary shape a level0 service actually has: a Cantaloupe/IIP
         * derivative set off a large master. The cheapest image is 1.7 MB
         * decoded and is a perfectly good thumbnail.
         */
        const DERIVATIVES: ImageServiceFacts = {
            width: 12_000,
            height: 9000,
            level0: true,
            version: 3,
            sizes: [
                { width: 750, height: 563 },
                { width: 1500, height: 1125 },
                { width: 3000, height: 2250 },
            ],
        };

        it('is NOT the answer for an ordinary level0 derivative set', () => {
            // Rungs 3 and 4 of the ladder are the two that exist for level0. A
            // refusal that caught this shape would put most real level0
            // manifests in the box tier — the acceptance criterion "scrolling an
            // 800-canvas manifest shows page images, not empty boxes" failing on
            // exactly the manifests it was written for.
            const result = thumbnailPlan([level0Canvas('c1')], {
                knownMetadata: byService({ c1: DERIVATIVES }),
            });

            expect(result.tiers.c1).toBe('thumbnail');
            expect(result.unresolvedThumbnails).toEqual([]);
            expect(
                result.thumbnailRequests.map((request) => request.url),
            ).toContain('https://images.test/c1/full/750,/0/default.jpg');
        });

        it('is the same answer at every zoom, so the tier cannot flip under a reader', () => {
            // "Box tier permanently, logged once" is a claim about the manifest
            // and the service's facts. A rung-relative refusal would make it a
            // claim about the viewport: refused at the floor with a log entry
            // saying "permanently", accepted one zoom step in, refused again on
            // the way back out with no second log — a canvas oscillating across
            // a rung boundary.
            for (const scale of [0.05, 0.1, 0.2, 0.3]) {
                const at = plan([level0Canvas('c1')], {
                    viewport: viewport({ scale }),
                    knownMetadata: byService({ c1: HOPELESS }),
                });
                expect(at.tiers.c1).toBe('box');

                const usable = plan([level0Canvas('c1')], {
                    viewport: viewport({ scale }),
                    knownMetadata: byService({ c1: DERIVATIVES }),
                });
                expect(usable.tiers.c1).toBe('thumbnail');
            }
        });

        it('does not report a canvas that is merely waiting for its info.json', () => {
            expect(
                thumbnailPlan([level0Canvas('c1')]).unresolvedThumbnails,
            ).toEqual([]);
        });

        it('does not report a static canvas, whose one image the host paints whole', () => {
            const result = thumbnailPlan([staticCanvas('c1', 1000, 1000)]);

            expect(result.tiers.c1).toBe('thumbnail');
            expect(result.unresolvedThumbnails).toEqual([]);
            expect(result.thumbnailRequests).toEqual([]);
        });
    });

    describe('painting', () => {
        it('draws a resident thumbnail over the canvas’s whole layout rect', () => {
            const first = thumbnailPlan([serviceCanvas('c1', 1000, 1000)]);
            const resident = new Set(
                first.thumbnailRequests.map((request) => request.key),
            );

            const result = thumbnailPlan([serviceCanvas('c1', 1000, 1000)], {
                residentTiles: resident,
            });

            expect(result.tileDraws).toHaveLength(2);
            expect(result.tileDraws[0]).toMatchObject({
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            });
            // Coarsest first, so the chosen rung paints OVER the base one.
            expect(result.tileDraws[0].level).toBe(0);
            expect(result.tileDraws[1].level).toBe(1);
        });

        it('draws nothing for a thumbnail that is not held', () => {
            expect(
                thumbnailPlan([serviceCanvas('c1', 1000, 1000)]).tileDraws,
            ).toEqual([]);
        });
    });

    it('releases a thumbnail when the canvas drops to the box tier', () => {
        // The nesting rule, one tier down: a canvas below the box threshold is
        // a layout rect and nothing else.
        const result = belowBoxThreshold((id) => serviceCanvas(id, 1000, 1000));

        expect(result.tiers.c0).toBe('box');
        expect(
            result.thumbnailRequests.map((request) => request.canvasId),
        ).not.toContain('c0');
    });
});

describe('planScene — opening a 40-canvas paged manifest', () => {
    const CANVASES = Array.from({ length: 40 }, (_, index) => ({
        id: `https://example.test/canvas/${index}`,
        type: 'Canvas',
        width: 1000,
        height: 1400,
        items: [
            {
                id: `https://example.test/page/${index}`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `https://example.test/anno/${index}`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `https://images.test/${index}/full/max/0/default.jpg`,
                            type: 'Image',
                            service: [
                                {
                                    id: `https://images.test/${index}`,
                                    type: 'ImageService3',
                                    profile: 'level2',
                                },
                            ],
                        },
                        target: `https://example.test/canvas/${index}`,
                    },
                ],
            },
        ],
    }));

    function openAt(currentCanvasIndex: number) {
        const visible = getVisibleCanvasEntries({
            canvases: CANVASES,
            currentCanvasId: CANVASES[currentCanvasIndex].id,
            currentCanvasIndex,
            viewingMode: 'paged',
            pagedOffset: 0,
        });

        return plan(toPlannerCanvases(visible.map((entry) => entry.canvas)), {
            mode: 'paged',
            viewport: viewport({ centre: { x: 1000, y: 700 }, scale: 0.4 }),
        });
    }

    it('lays the spread out with no metadata at all', () => {
        // Nothing has been fetched — `knownMetadata` is empty — and both pages
        // still have a position and a size.
        expect(openAt(0).layout).toHaveLength(2);
    });

    it('asks for metadata only for the two canvases on screen', () => {
        expect(openAt(0).metadataRequests).toEqual([
            'https://example.test/canvas/0',
            'https://example.test/canvas/1',
        ]);
    });

    it('asks for two more when the reader turns the page, not thirty-eight', () => {
        expect(openAt(2).metadataRequests).toEqual([
            'https://example.test/canvas/2',
            'https://example.test/canvas/3',
        ]);
    });
});

/**
 * The cheap half of the planner, for the two questions the host asks on every
 * pointer sample.
 */
describe('planViewportLimits', () => {
    /** The same world a `plan(...)` call describes, minus everything it costs. */
    function limits(
        canvases: PlannerCanvas[],
        overrides: Partial<Parameters<typeof planViewportLimits>[0]> = {},
    ) {
        return planViewportLimits({
            canvases,
            mode: 'individuals',
            direction: 'left-to-right',
            preserveCanvasScale: false,
            gapFraction: GAP_FRACTION,
            knownMetadata: {},
            budgets: BUDGETS,
            ...overrides,
        });
    }

    it('agrees with a full plan on the layout and the derived zoom floor', () => {
        const canvases = [
            serviceCanvas('c1', 4000, 3000),
            staticCanvas('c2', 1000, 750),
        ];
        const full = plan(canvases, {
            mode: 'paged',
            knownMetadata: byService({ c1: FACTS }),
        });

        expect(limits(canvases, { mode: 'paged' }).layout).toEqual(full.layout);
        expect(limits(canvases, { mode: 'paged' }).minZoom).toBe(full.minZoom);
    });

    it('sizes an undeclared canvas exactly as a full plan does', () => {
        const canvases = [staticCanvas('bad', 0, 0)];

        expect(limits(canvases).layout).toEqual(plan(canvases).layout);
    });

    it('needs neither the viewport nor the resident set', () => {
        // The whole point: none of the inputs that make a full plan expensive —
        // building the pyramid and enumerating the required tile set — are even
        // in this signature, so a clamp cannot accidentally pay for them. A
        // pointer drag clamps per event; planning stays once per frame.
        const canvases = [serviceCanvas('c1', 4000, 3000)];

        const atHome = limits(canvases);
        const zoomedIn = plan(canvases, {
            knownMetadata: byService({ c1: FACTS }),
            viewport: viewport({ scale: 8 }),
        });

        expect(atHome.minZoom).toBe(zoomedIn.minZoom);
        expect(atHome.layout).toEqual(zoomedIn.layout);
        // …and the full plan at that zoom really did enumerate tiles, so the
        // comparison above is between the cheap answer and an expensive one.
        expect(zoomedIn.tileRequests.length).toBeGreaterThan(0);
    });
});

/**
 * Continuous mode on a manifest of arbitrary length.
 *
 * An 800-folio manuscript opens immediately, scrolls smoothly, and holds
 * bounded memory, because only the canvases near the viewport hold anything.
 * Exercised through **raw manifest
 * JSON** along the chain `CanvasHost` actually runs — raw Canvases →
 * `toPlannerCanvases` → a scene plan — so the fixture is evidence about the
 * renderer rather than about a hand-built descriptor list.
 *
 * Every position below is arithmetic this file states. The canvases are all
 * 1200x900, so median-height normalization is the identity and the gap is
 * `GAP_FRACTION` of 1200 — canvas *i* begins at `i * 1212`.
 */
describe('planScene — an 800-canvas continuous manifest', () => {
    const COUNT = 800;
    const PAGE = { width: 1200, height: 900 };
    /** Canvas width plus the resolved gap: `GAP_FRACTION` of the median. */
    const PITCH = PAGE.width + GAP_FRACTION * PAGE.width;

    function rawCanvases(count: number) {
        return Array.from({ length: count }, (_, index) => ({
            id: `https://example.test/canvas/${index}`,
            type: 'Canvas',
            width: PAGE.width,
            height: PAGE.height,
            items: [
                {
                    id: `https://example.test/page/${index}`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `https://example.test/anno/${index}`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: `https://images.test/${index}/full/max/0/default.jpg`,
                                type: 'Image',
                                service: [
                                    {
                                        id: `https://images.test/${index}`,
                                        type: 'ImageService3',
                                        profile: 'level2',
                                    },
                                ],
                            },
                            target: `https://example.test/canvas/${index}`,
                        },
                    ],
                },
            ],
        }));
    }

    const CANVASES = toPlannerCanvases(rawCanvases(COUNT));
    const name = (index: number) => `https://example.test/canvas/${index}`;

    /**
     * Reading zoom on canvas `index`: the page fitted to the viewport height,
     * framed on its centre. At this scale the viewport box is exactly one page
     * wide, so which canvases are on screen is not a matter of taste.
     */
    function readingZoom(index: number, count = COUNT) {
        return plan(
            count === COUNT ? CANVASES : toPlannerCanvases(rawCanvases(count)),
            {
                mode: 'continuous',
                viewport: viewport({
                    centre: {
                        x: index * PITCH + PAGE.width / 2,
                        y: PAGE.height / 2,
                    },
                    scale: 600 / PAGE.height,
                }),
            },
        );
    }

    function pyramidCanvases(result: ReturnType<typeof plan>): string[] {
        return Object.entries(result.tiers)
            .filter(([, tier]) => tier === 'pyramid')
            .map(([canvasId]) => canvasId);
    }

    it('lays out every canvas without a single request', () => {
        // Layout is pure arithmetic over manifest dimensions, so the world is
        // fully positioned before anything is fetched — which is what makes
        // scrolling to canvas 400 possible at all, and what stops opening
        // costing 800 `info.json` requests (spec §Coordinate model and layout).
        const result = readingZoom(0);

        expect(result.layout).toHaveLength(COUNT);
        expect(result.layout[400]).toEqual({
            canvasId: name(400),
            x: 400 * PITCH,
            y: 0,
            width: PAGE.width,
            height: PAGE.height,
        });
    });

    it('opens with O(1) network requests, not O(n)', () => {
        const opened = readingZoom(0);

        expect(opened.metadataRequests).toEqual([name(0), name(1)]);

        // The number that must not grow: the same frame on a manifest a
        // twentieth the length asks for exactly as much.
        const short = readingZoom(0, 40);
        expect(opened.metadataRequests).toHaveLength(
            short.metadataRequests.length,
        );
        expect(opened.tileRequests).toHaveLength(short.tileRequests.length);
    });

    it('leaves exactly the expected canvases holding pyramids at canvas 400', () => {
        // By name, not by count: the page on screen and its two neighbours —
        // the ±1 canvas rule, which is what makes turning the page instant.
        expect(pyramidCanvases(readingZoom(400)).sort()).toEqual(
            [name(399), name(400), name(401)].sort(),
        );
        expect(readingZoom(400).metadataRequests).toEqual([
            name(399),
            name(400),
            name(401),
        ]);
    });

    it('gives the same resident set arriving at 400 directly and by way of 700', () => {
        // Residency is a pure function of viewport position, which is the whole
        // reason eviction is distance-based rather than LRU: an LRU makes the
        // resident set a function of scroll history — non-reproducible, and
        // effectively untestable. Here the history is expressed as the tiles
        // the host is still holding from canvas 700, which must change what is
        // PAINTED and nothing about what is REQUIRED.
        const viaSevenHundred = readingZoom(700);
        const stale = new Set(
            viaSevenHundred.tileRequests.map((request) => request.key),
        );

        const direct = readingZoom(400);
        const afterScrolling = plan(CANVASES, {
            mode: 'continuous',
            viewport: viewport({
                centre: { x: 400 * PITCH + PAGE.width / 2, y: PAGE.height / 2 },
                scale: 600 / PAGE.height,
            }),
            residentTiles: stale,
        });

        expect(afterScrolling.tiers).toEqual(direct.tiers);
        expect(afterScrolling.tileRequests).toEqual(direct.tileRequests);
        // …and none of what canvas 700 left behind is painted at canvas 400.
        expect(afterScrolling.tileDraws).toEqual(direct.tileDraws);
    });

    it('holds a bounded required set however long the manifest is', () => {
        // 800 canvases, and the required set is the same size as it is on a
        // 40-canvas manifest at the same relative position. The naive
        // implementation — one base tile per canvas, because the tier is
        // decided from projected size and ignores position — is O(n) here.
        const long = readingZoom(20);
        const short = readingZoom(20, 40);

        expect(long.tileRequests).toHaveLength(short.tileRequests.length);
        expect(pyramidCanvases(long)).toHaveLength(3);
    });

    it('releases everything a canvas held once it is out of the window', () => {
        // The nesting rule: "the base level is never evicted" is scoped to the
        // pyramid tier. Canvas 400 held a pyramid a moment ago; two pages on it
        // holds nothing at all, base level included.
        const there = readingZoom(400);
        const gone = readingZoom(404);

        expect(there.tiers[name(400)]).toBe('pyramid');
        expect(gone.tiers[name(400)]).toBe('box');
        expect(
            gone.tileRequests.filter(
                (request) => request.canvasId === name(400),
            ),
        ).toEqual([]);
    });

    it('holds no pyramid at the derived zoom floor, and asks for nothing', () => {
        // Zooming out stops where the median canvas reaches the box threshold.
        // At that floor every canvas is confetti, so there is nothing to lose —
        // and, critically, nothing to fetch: a floor that still planned tiles
        // would turn "zoom all the way out" into a request storm.
        const floor = readingZoom(400).minZoom;
        expect(floor).toBeCloseTo(
            BUDGETS.boxThreshold / Math.sqrt(PAGE.width * PAGE.height),
            10,
        );

        const atFloor = plan(CANVASES, {
            mode: 'continuous',
            viewport: viewport({
                centre: { x: 400 * PITCH, y: PAGE.height / 2 },
                scale: floor,
            }),
        });

        expect(pyramidCanvases(atFloor)).toEqual([]);
        expect(atFloor.tileRequests).toEqual([]);
        expect(atFloor.metadataRequests).toEqual([]);
    });

    it('keeps the derived zoom floor cheap, where the window holds dozens of thumbnails', () => {
        // The floor is where the thumbnail tier is at its widest: the residency
        // window BOUNDS the count, it does not make it small, so several dozen
        // canvases are in the tier at once. What keeps that affordable is that
        // each is worth at most TWO requests — the base rung and the rung the
        // projection wants, both at the bottom of the ladder down here — and
        // that they go through the same bounded, centre-out, byte-budgeted
        // window as the tiles.
        const floor = readingZoom(400).minZoom;
        const atFloor = plan(CANVASES, {
            mode: 'continuous',
            viewport: viewport({
                centre: { x: 400 * PITCH, y: PAGE.height / 2 },
                scale: floor,
            }),
        });

        const thumbnailCanvases = Object.values(atFloor.tiers).filter(
            (tier) => tier === 'thumbnail',
        );
        expect(thumbnailCanvases.length).toBeGreaterThan(20);

        expect(atFloor.thumbnailRequests.length).toBeLessThanOrEqual(
            thumbnailCanvases.length * 2,
        );
        // The two cheapest rungs in the ladder, and nothing above them: at the
        // floor a folio is a few dozen pixels across, so this is a few
        // kilobytes per canvas rather than a whole-image download apiece.
        expect(
            Math.max(
                ...atFloor.thumbnailRequests.map((request) => request.rung),
            ),
        ).toBeLessThanOrEqual(64);

        // Bounded by the VIEWPORT, not by the manifest: the same frame on a
        // manifest a twentieth the length asks for as many as it has canvases,
        // never eight hundred.
        expect(atFloor.thumbnailRequests.length).toBeLessThan(COUNT / 8);
        // Nearest the centre first, so what the reader is looking at fills in
        // before the edges of the screen do.
        expect(atFloor.thumbnailRequests[0].canvasId).toBe(name(400));
    });

    it('asks for nothing at all while a flick is in flight', () => {
        // A flick across an 800-folio manifest passes over hundreds of canvases
        // that are never dwelt on. Without the gate every one of them would be
        // worth a thumbnail and an `info.json` on its way past.
        const flicking = plan(CANVASES, {
            mode: 'continuous',
            viewport: viewport({
                centre: { x: 400 * PITCH, y: PAGE.height / 2 },
                scale: readingZoom(400).minZoom,
            }),
            viewStable: false,
        });

        expect(flicking.thumbnailRequests).toEqual([]);
        expect(flicking.metadataRequests).toEqual([]);
    });

    it('keeps the scene alive at a deep zoom into the inter-canvas gutter', () => {
        // Both residency rules key off INTERSECTION with a layout rect, and a
        // viewport can intersect none: the gutter is a fraction of a page wide,
        // so past a certain zoom even the inflated margin is narrower than the
        // gap. Every canvas would then be box tier — every tile and texture
        // released, the viewer blank — until the reader happened to pan back
        // out. The window is total by construction instead.
        const gutter = 400 * PITCH - (PITCH - PAGE.width) / 2;
        const deep = plan(CANVASES, {
            mode: 'continuous',
            viewport: viewport({
                centre: { x: gutter, y: PAGE.height / 2 },
                // A viewport far narrower than the gutter it is centred in, so
                // the margin cannot reach either page.
                scale: 800 / ((PITCH - PAGE.width) / 4),
            }),
        });

        expect(pyramidCanvases(deep).sort()).toEqual(
            [name(398), name(399), name(400)].sort(),
        );
        // …and the window stays bounded: it is the nearest canvas and its
        // neighbours, not a fallback to the whole manifest.
        expect(
            Object.values(deep.tiers).filter((tier) => tier !== 'box'),
        ).toHaveLength(3);
    });

    it('keeps three folios alive far BELOW the zoom floor, and only three', () => {
        // The other half of "the scene is never entirely box tier". Zoomed out
        // absurdly far, every one of the 800 folios is on screen and every one
        // of them is below the box threshold — so "keep painting what is
        // visible" is the same O(manifest) fetch storm the residency window
        // exists to prevent, wearing a different hat. The floor is the nearest folio and its two neighbours,
        // and the other 797 keep their placeholder rects and nothing else.
        const belowFloor = plan(CANVASES, {
            mode: 'continuous',
            viewport: viewport({
                centre: { x: 400 * PITCH, y: PAGE.height / 2 },
                scale: readingZoom(400).minZoom / 1000,
            }),
        });

        expect(
            Object.entries(belowFloor.tiers)
                .filter(([, tier]) => tier !== 'box')
                .map(([canvasId]) => canvasId)
                .sort(),
        ).toEqual([name(399), name(400), name(401)].sort());
        // One request each: the base rung IS the rung a folio this small wants.
        expect(belowFloor.thumbnailRequests).toHaveLength(3);
        expect(belowFloor.tileRequests).toEqual([]);
        expect(belowFloor.metadataRequests).toEqual([]);
    });

    it('decides the tier the same way in a left-to-right and a top-to-bottom world', () => {
        // The orientation-invariance the spec rejects projected HEIGHT for. A
        // portrait page flowing left-to-right and a landscape page flowing
        // top-to-bottom, at equal projected area, must decide alike; thresholded
        // on height, the first is a thumbnail (20x30 px) and the second a box
        // (30x20 px) at identical visual size.
        const portrait = plan(
            [staticCanvas('p0', 600, 1350), staticCanvas('p1', 600, 1350)],
            {
                mode: 'continuous',
                direction: 'left-to-right',
                viewport: viewport({
                    centre: { x: 300, y: 675 },
                    scale: 0.4,
                }),
            },
        );
        const landscape = plan(
            [staticCanvas('l0', 1350, 600), staticCanvas('l1', 1350, 600)],
            {
                mode: 'continuous',
                direction: 'top-to-bottom',
                viewport: viewport({
                    centre: { x: 675, y: 300 },
                    scale: 0.4,
                }),
            },
        );

        expect(portrait.tiers.p0).toBe(landscape.tiers.l0);
        expect(portrait.tiers.p0).toBe('thumbnail');
    });
});

/**
 * **Composite canvases** — IIIF Cookbook recipe 0036, where a folio is painted
 * by its full scan and a miniature is painted over a rectangle of it.
 *
 * Two things are asserted throughout, and they are one missing concept: every
 * painting annotation is planned, and each is planned against ITS OWN box. The
 * renderer that this one replaced composed correctly because it handed
 * OpenSeadragon one tiled image per annotation with its own `x`/`y`/`width`;
 * these are the same guarantees, restated against the planner.
 *
 * The tier stays a per-CANVAS decision — it is about how much of the screen the
 * page occupies — and nothing here changes that. What each placement gets
 * WITHIN the tier is its own: its own pyramid level, its own thumbnail rung,
 * its own tiles.
 */
describe('planScene — composite canvases', () => {
    /** The miniature's target on a 1000x1000 canvas: a quarter, top-right. */
    const REGION = { x: 0.5, y: 0, width: 0.25, height: 0.25 };

    /**
     * "Everything the planner asks for is held", for the assertions that are
     * about the ORDER of the draw list rather than about its membership.
     *
     * A predicate rather than an enumerated `Set`, because the point is to take
     * residency out of the question entirely: enumerating would mean deriving
     * the required set first, and an omission there would silently weaken the
     * ordering assertion into a vacuous one.
     */
    const ALL_TILES = {
        has: () => true,
    } as unknown as ReadonlySet<TileKey>;

    /**
     * One canvas painted by a full-canvas image and a region-targeted one.
     *
     * `c1` and `c2` are separate services, which is what makes "both were
     * requested" checkable: `serviceIdOf` derives the id from the name, so the
     * two halves cannot be confused for each other in an expectation.
     */
    function composite(
        makeSource: (id: string) => SourceDescriptor = serviceSource,
    ): PlannerCanvas {
        return {
            id: 'c1',
            width: 1000,
            height: 1000,
            images: [
                fills('c1', makeSource('c1'), 1000, 1000),
                { key: 'c1#1', source: makeSource('c2'), ...REGION },
            ],
        };
    }

    it('requests tiles for EVERY painting annotation, not only the first', () => {
        const result = plan([composite()], {
            knownMetadata: byService({ c1: FACTS, c2: FACTS }),
        });

        expect(result.tiers.c1).toBe('pyramid');

        const services = new Set(
            result.tileRequests.map(
                (request) => new URL(request.url).pathname.split('/')[1],
            ),
        );
        // The regression: before this, only `c1` was ever asked for and the
        // miniature's service was never touched.
        expect([...services].sort()).toEqual(['c1', 'c2']);
    });

    /**
     * **Paint order is annotation order, and level order only WITHIN an image.**
     *
     * Blur-up wants coarsest-first so a finer tile paints over the coarse chain
     * beneath it, and that is a statement about one picture's own levels. Sorted
     * across the whole scene, it silently becomes a statement about the
     * composition: the folio is large and picks a fine level while the miniature
     * is small and picks a coarse one, so every folio tile above the miniature's
     * chosen level sorts AFTER it and paints over it. The miniature vanishes —
     * and only when zoomed IN, because at the thumbnail tier both pictures are
     * at rungs 0 and 1 and the order happens to survive.
     */
    it('paints a composition in annotation order, not in level order', () => {
        const result = plan([composite()], {
            knownMetadata: byService({ c1: BIG_FACTS, c2: BIG_FACTS }),
            // Framed INSIDE the miniature's box (x 500..750, y 0..250) and
            // zoomed in far enough that the folio reaches a level well above
            // anything the quarter-width miniature will choose. The folio
            // covers the whole canvas, so both pictures are on screen here.
            viewport: viewport({ centre: { x: 600, y: 120 }, scale: 6 }),
            residentTiles: ALL_TILES,
        });

        const owner = (key: string) =>
            key.includes(serviceIdOf('c2')) ? 'miniature' : 'folio';
        const owners = result.tileDraws.map((draw) => owner(draw.key));

        expect(owners).toContain('folio');
        expect(owners).toContain('miniature');
        // Every miniature draw comes after every folio draw, because the
        // miniature is painted ON the folio.
        expect(owners.lastIndexOf('folio')).toBeLessThan(
            owners.indexOf('miniature'),
        );

        // …and within each picture, still coarsest first: blur-up is intact.
        for (const which of ['folio', 'miniature'] as const) {
            const levels = result.tileDraws
                .filter((draw) => owner(draw.key) === which)
                .map((draw) => draw.level);
            expect(levels).toEqual([...levels].sort((a, b) => a - b));
        }
    });

    it('orders whole images and tiles in ONE sequence the painter can merge', () => {
        // A tiled folio with a plain-JPEG overlay on it — the two source kinds
        // on one canvas. They leave the planner in separate lists (`tileDraws`
        // is scheduler-held, `staticImages` is host-held), so without a shared
        // ordering the painter can only draw all of one kind and then all of the
        // other, and the overlay goes underneath the thing it overlays.
        const mixed: PlannerCanvas = {
            id: 'c1',
            width: 1000,
            height: 1000,
            images: [
                fills('c1', serviceSource('c1'), 1000, 1000),
                { key: 'c1#1', source: staticSource('c2'), ...REGION },
            ],
        };

        const result = plan([mixed], {
            knownMetadata: byService({ c1: FACTS }),
            residentTiles: ALL_TILES,
        });

        const lastTile = Math.max(
            ...result.tileDraws.map((draw) => draw.order),
        );
        expect(result.staticImages).toHaveLength(1);
        // The overlay is second in annotation order, so it must sort after every
        // tile of the folio beneath it.
        expect(result.staticImages[0].order).toBeGreaterThan(lastTile);
    });

    it('tiles the miniature into its target box, not across the canvas', () => {
        const result = plan([composite()], {
            knownMetadata: byService({ c1: FACTS, c2: FACTS }),
            residentTiles: new Set(
                // The base tile of each service — one tile covering its whole
                // image, so the draw box IS the box the image paints into.
                ['c1', 'c2'].map((id) =>
                    tileKey('c1', serviceIdOf(id), 0, 0, 0),
                ),
            ),
        });

        const boxes = new Map(
            result.tileDraws
                .filter((draw) => draw.level === 0)
                .map((draw) => [draw.key, draw]),
        );

        const folio = boxes.get(tileKey('c1', serviceIdOf('c1'), 0, 0, 0))!;
        const miniature = boxes.get(tileKey('c1', serviceIdOf('c2'), 0, 0, 0))!;

        // The folio is the canvas.
        expect(folio).toMatchObject({ x: 0, y: 0, width: 1000, height: 1000 });
        // The miniature is its target's rectangle — offset, and a quarter the
        // width. Painted across the whole canvas it would cover the folio
        // entirely, which is exactly what the discarded placement did.
        expect(miniature).toMatchObject({
            x: 500,
            y: 0,
            width: 250,
            height: 250,
        });
    });

    it('does not mistake a top-half target for a canvas-filling image', () => {
        // `x: 0, y: 0, width: 1` LOOKS like it identifies a canvas-filling
        // image and does not: an annotation targeting `#xywh=0,0,1200,900` on a
        // 1200x1800 canvas has exactly those three values and paints the top
        // half. Only `height` tells the two apart, so any shortcut keyed on the
        // other three silently doubles this image's height.
        const result = plan(
            [
                {
                    id: 'c1',
                    width: 1200,
                    height: 1800,
                    images: [
                        {
                            key: 'c1#0',
                            source: staticSource('c1'),
                            x: 0,
                            y: 0,
                            width: 1,
                            height: 0.75,
                        },
                    ],
                },
            ],
            { viewport: viewport({ centre: { x: 600, y: 900 }, scale: 0.3 }) },
        );

        expect(result.staticImages[0]).toMatchObject({
            x: 0,
            y: 0,
            width: 1200,
            height: 900,
        });
    });

    it('chooses each placement its own level, from its own size on screen', () => {
        // The miniature covers a quarter of the folio's width, so at the same
        // viewport it needs a level two steps coarser to reach the same
        // sharpness. Deciding both from the canvas's box would over-fetch the
        // miniature by 16x in area.
        const result = plan([composite()], {
            knownMetadata: byService({ c1: BIG_FACTS, c2: BIG_FACTS }),
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 2 }),
        });

        const finestOf = (id: string) =>
            Math.max(
                ...result.tileRequests
                    .filter((request) => request.url.includes(`/${id}/`))
                    .map((request) => request.level),
            );

        expect(finestOf('c2')).toBeLessThan(finestOf('c1'));
    });

    it('asks for info.json ONCE for a canvas painting from two services', () => {
        const result = plan([composite()]);

        // The list is re-emitted every frame until the facts land, and the host
        // fetches every service on the canvas it is handed — so a per-image
        // push would be one entry per painting annotation, sixty times a
        // second, for one answer.
        expect(result.metadataRequests).toEqual(['c1']);
    });

    it('holds a whole image per placement for static composite canvases', () => {
        const result = plan([composite(staticSource)]);

        expect(result.staticImages).toEqual([
            {
                key: 'c1#0',
                canvasId: 'c1',
                url: 'https://example.test/c1.jpg',
                // Paint order: the folio first, the miniature over it.
                order: 0,
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            },
            {
                key: 'c1#1',
                canvasId: 'c1',
                url: 'https://example.test/c2.jpg',
                order: 1,
                x: 500,
                y: 0,
                width: 250,
                height: 250,
            },
        ]);
    });

    it('emits static placements in annotation order, which is paint order', () => {
        // Not sorted, deliberately: a composite canvas is only correct if the
        // miniature paints over the folio it sits on.
        const result = plan([composite(staticSource)]);

        expect(result.staticImages.map((image) => image.key)).toEqual([
            'c1#0',
            'c1#1',
        ]);
    });

    it('holds nothing for a box-tier composite canvas', () => {
        // The static half of virtualization. Fed the whole manifest with no
        // tier gate, this would start an `<img>` load per painting annotation
        // per folio on open.
        const result = plan(
            Array.from({ length: 5 }, (_, index) => ({
                ...composite(staticSource),
                id: `c${index}`,
                images: [
                    fills(`c${index}`, staticSource(`c${index}`), 1000, 1000),
                ],
            })),
            {
                mode: 'continuous',
                viewport: viewport({
                    centre: {
                        x: 2 * (1000 + GAP_FRACTION * 1000) + 500,
                        y: 375,
                    },
                    scale: 0.02,
                }),
            },
        );

        const boxed = Object.entries(result.tiers)
            .filter(([, tier]) => tier === 'box')
            .map(([canvasId]) => canvasId);

        expect(boxed.length).toBeGreaterThan(0);
        for (const canvasId of boxed) {
            expect(
                result.staticImages.some(
                    (image) => image.canvasId === canvasId,
                ),
            ).toBe(false);
        }
    });

    describe('the thumbnail tier', () => {
        function thumbnailPlan(canvas: PlannerCanvas) {
            return plan([canvas], {
                viewport: viewport({
                    centre: { x: 500, y: 500 },
                    scale: 0.2,
                }),
            });
        }

        it('paints a DECLARED thumbnail once, over the whole canvas', () => {
            // A Canvas-declared thumbnail depicts the finished canvas —
            // miniature and all — so resolving it per placement would both ask
            // for the same picture twice and squeeze a whole-canvas image into
            // the miniature's rectangle.
            const result = thumbnailPlan({
                ...composite(),
                thumbnailUrl: 'https://example.test/thumb.jpg',
            });

            expect(result.tiers.c1).toBe('thumbnail');
            expect(result.thumbnailRequests).toHaveLength(1);
            expect(result.thumbnailRequests[0].url).toBe(
                'https://example.test/thumb.jpg',
            );
        });

        it('falls back to a thumbnail per placement, in each placement box', () => {
            const result = thumbnailPlan(composite());

            // Each placement asks at its OWN size: the folio is 1000 canvas
            // units at scale 0.2, so 200 device px rounding up to the 256 rung,
            // while the miniature is 250 units — 50 device px, the 64 rung. A
            // thumbnail sized from the canvas would fetch a 256 px image to
            // paint into a 50 px box, four times over on a busy composition.
            expect(result.thumbnailRequests.map((r) => r.url)).toEqual([
                'https://images.test/c1/full/32,/0/default.jpg',
                'https://images.test/c1/full/256,/0/default.jpg',
                'https://images.test/c2/full/32,/0/default.jpg',
                'https://images.test/c2/full/64,/0/default.jpg',
            ]);
        });

        it('draws each fallback thumbnail into its own placement box', () => {
            const canvas = composite();
            const urls = [
                'https://images.test/c1/full/32,/0/default.jpg',
                'https://images.test/c2/full/32,/0/default.jpg',
            ];
            const result = plan([canvas], {
                viewport: viewport({ centre: { x: 500, y: 500 }, scale: 0.2 }),
                residentTiles: new Set(
                    urls.map((url) => `${canvas.id}#thumb/${url}`),
                ),
            });

            const boxes = result.tileDraws.map(({ x, y, width, height }) => ({
                x,
                y,
                width,
                height,
            }));

            expect(boxes).toContainEqual({
                x: 0,
                y: 0,
                width: 1000,
                height: 1000,
            });
            expect(boxes).toContainEqual({
                x: 500,
                y: 0,
                width: 250,
                height: 250,
            });
        });

        it('keeps a canvas whose miniature has no thumbnail out of the box tier', () => {
            // Reported per CANVAS, and only when EVERY picture on it came up
            // empty: this canvas paints its folio perfectly well, and calling
            // it unresolved would both mislead the log and demote a canvas that
            // is rendering.
            const result = thumbnailPlan({
                id: 'c1',
                width: 1000,
                height: 1000,
                images: [
                    fills('c1', staticSource('c1'), 1000, 1000),
                    {
                        key: 'c1#1',
                        // A level0 service advertising nothing, with no
                        // `info.json` fetched: the ladder has no rung to take.
                        source: {
                            kind: 'service',
                            serviceId: serviceIdOf('c2'),
                            profile: 'level0',
                        },
                        ...REGION,
                    },
                ],
            });

            expect(result.tiers.c1).toBe('thumbnail');
            expect(result.unresolvedThumbnails).toEqual([]);
        });
    });
});

/**
 * The companion a claimed canvas's phase is about to name (`companionCanvases`).
 *
 * Everything here is about the REQUIRED SET rather than about the draw list: a
 * warmed companion is requestable and never painted, which is the whole of the
 * distinction this seam has to keep.
 */
describe('planScene — warming the companion behind the phase', () => {
    const WARM_SERVICE = serviceIdOf('warm');
    const WARM_BASE = tileKey('c1', WARM_SERVICE, 0, 0, 0);

    function warming(overrides: Partial<Parameters<typeof planScene>[0]> = {}) {
        return plan(
            [
                {
                    ...serviceCanvas('c1', 1000, 1000),
                    warmImages: [fills('warm', serviceSource('warm'), 1, 1)],
                },
            ],
            {
                knownMetadata: byService({ c1: FACTS, warm: FACTS }),
                ...overrides,
            },
        );
    }

    it('makes the companion requestable at its base level and nothing more', () => {
        const result = warming();
        const warm = result.tileRequests.filter((request) =>
            request.url.startsWith(WARM_SERVICE),
        );

        expect(warm.map((request) => request.key)).toEqual([WARM_BASE]);
        expect(warm[0].level).toBe(0);
        // The picture the reader IS looking at still gets its whole pyramid, so
        // the warming is an addition rather than a substitution.
        expect(
            result.tileRequests.filter((request) =>
                request.url.startsWith(serviceIdOf('c1')),
            ).length,
        ).toBeGreaterThan(1);
    });

    it('never paints it', () => {
        // Requestable is not painted: the phase decides what paints, and it has
        // not named this companion yet.
        expect(warming().tileDraws.some((draw) => draw.key === WARM_BASE)).toBe(
            false,
        );
    });

    it('queues it behind everything on screen', () => {
        const warm = warming().tileRequests.find(
            (request) => request.key === WARM_BASE,
        )!;

        expect(
            warming()
                .tileRequests.filter((request) => request.key !== WARM_BASE)
                .every((request) => request.priority < warm.priority),
        ).toBe(true);
    });

    it('paints it the frame the phase names it, with no new request', () => {
        // The handover: the same key the warm request bought is what the
        // pyramid draws, so there is no interval in which the rect paints
        // neither companion.
        const named = plan(
            [
                {
                    ...serviceCanvas('c1', 1000, 1000),
                    images: [fills('warm', serviceSource('warm'), 1, 1)],
                },
            ],
            {
                knownMetadata: byService({ warm: FACTS }),
                residentTiles: new Set<TileKey>([WARM_BASE]),
            },
        );

        expect(named.tileDraws.some((draw) => draw.key === WARM_BASE)).toBe(
            true,
        );
    });

    it('asks for the companion service’s info.json', () => {
        // Without it there is no pyramid and therefore no URL to warm.
        expect(warming({ knownMetadata: {} }).metadataRequests).toEqual(['c1']);
    });

    it('costs a canvas with no warm companion nothing', () => {
        const bare = plan([serviceCanvas('c1', 1000, 1000)], {
            knownMetadata: byService({ c1: FACTS }),
        });

        expect(bare.tileRequests).toEqual(warming().tileRequests.slice(0, -1));
    });

    it('warms nothing on a box-tier canvas', () => {
        // Outside the residency window a canvas holds nothing at all, and a
        // companion of it is no exception.
        const result = belowBoxThreshold(
            (id) => ({
                ...serviceCanvas(id, 1000, 1000),
                warmImages: [fills('warm', serviceSource('warm'), 1, 1)],
            }),
            { knownMetadata: byService({ warm: FACTS }) },
        );

        expect(result.tiers.c0).toBe('box');
        expect(
            result.tileRequests.some((request) => request.canvasId === 'c0'),
        ).toBe(false);
    });

    it('keeps it required while the view is moving', () => {
        // Not behind the view-stable gate, which exists to keep a flick from
        // asking per canvas for something it will never dwell on. This is one
        // tile on a canvas the reader is already on, and dropping it from the
        // required set mid-drag would demote it to the opportunistic cache —
        // losing the very picture the handover is waiting on.
        expect(
            warming({ viewStable: false }).tileRequests.some(
                (request) => request.key === WARM_BASE,
            ),
        ).toBe(true);
    });
});

/**
 * What the warmed companion COSTS, and under which spelling it is bought.
 *
 * A warmed tile is required rather than opportunistic (`tileScheduler.trim`
 * never evicts a required tile), so a request keyed the way nothing draws it,
 * or one bigger than a decode may be, is not merely wasted — it is unreclaimable
 * for the life of the page.
 */
describe('planScene — what warming a companion buys', () => {
    const WARM = serviceIdOf('warm');

    /** `c1` painting its own picture, warming a companion on `warm`. */
    function warming(
        warmFacts: ImageServiceFacts,
        overrides: Partial<Parameters<typeof planScene>[0]> = {},
        profile = 'level2',
    ) {
        return plan(
            [
                {
                    ...serviceCanvas('c1', 1000, 1000),
                    warmImages: [
                        {
                            ...fills('warm', serviceSource('warm'), 1, 1),
                            source: {
                                kind: 'service',
                                serviceId: WARM,
                                profile,
                            },
                        },
                    ],
                },
            ],
            {
                knownMetadata: {
                    ...byService({ c1: FACTS }),
                    [WARM]: warmFacts,
                },
                ...overrides,
            },
        );
    }

    /** The same picture once the phase has named it: `c1` paints from `warm`. */
    function named(
        warmFacts: ImageServiceFacts,
        overrides: Partial<Parameters<typeof planScene>[0]> = {},
        profile = 'level2',
    ) {
        return plan(
            [
                {
                    ...serviceCanvas('c1', 1000, 1000),
                    images: [
                        {
                            ...fills('warm', serviceSource('warm'), 1, 1),
                            source: {
                                kind: 'service',
                                serviceId: WARM,
                                profile,
                            },
                        },
                    ],
                },
            ],
            { knownMetadata: { [WARM]: warmFacts }, ...overrides },
        );
    }

    it('keys the warm tile the way the planner that draws it keys tiles', () => {
        // `info.json` owns the base URI for image requests and it can differ
        // from the id the manifest advertised — a trailing slash, an http→https
        // redirect, an auth gateway signing access. Bought under the manifest's
        // spelling, the tile lands under a key nothing ever asks for: the
        // handover fetches from cold anyway AND the orphan stays required for
        // ever.
        const redirected: ImageServiceFacts = {
            ...FACTS,
            requestBaseUri: 'https://signed.test/warm',
        };
        const warm = warming(redirected).tileRequests.find((request) =>
            request.url.startsWith('https://signed.test/warm'),
        );

        expect(warm).toBeDefined();
        expect(
            named(redirected, {
                residentTiles: new Set<TileKey>([warm!.key]),
            }).tileDraws.map((draw) => draw.key),
        ).toContain(warm!.key);
    });

    it('warms a service that omits `tiles` from its derived grid', () => {
        // A level 1/2 endpoint without a `tiles` key is legal and common
        // (Cantaloupe and IIP both ship such configurations). The pyramid tier
        // derives a grid for it; warming has to derive the same one, or that
        // whole class of service keeps the handover flash.
        const noTiles: ImageServiceFacts = {
            width: 4096,
            height: 4096,
            version: 3,
        };
        const warm = warming(noTiles).tileRequests.find((request) =>
            request.url.startsWith(WARM),
        );

        expect(warm).toBeDefined();
        expect(
            named(noTiles, {
                residentTiles: new Set<TileKey>([warm!.key]),
            }).tileDraws.map((draw) => draw.key),
        ).toContain(warm!.key);
    });

    it('refuses to warm a level0 master whose only whole image is over the cap', () => {
        // 12000x9000 is 108 megapixels. Warmed, it would be the whole master
        // downloaded before the reader pressed play, and required for ever
        // after. A companion that cannot be warmed cheaply is not warmed.
        const master: ImageServiceFacts = {
            width: 12_000,
            height: 9000,
            level0: true,
            version: 3,
        };
        const result = warming(master, {}, 'level0');

        expect(
            result.tileRequests.some((request) => request.url.startsWith(WARM)),
        ).toBe(false);
        expect(
            result.thumbnailRequests.some((request) =>
                request.url.startsWith(WARM),
            ),
        ).toBe(false);
    });

    it('warms a level0 derivative set at its cheapest advertised image', () => {
        // The ordinary level0 shape still gets its handover: the base rung is a
        // whole picture and a small one.
        const derivatives: ImageServiceFacts = {
            width: 12_000,
            height: 9000,
            level0: true,
            version: 3,
            sizes: [
                { width: 750, height: 563 },
                { width: 1500, height: 1125 },
            ],
        };

        expect(
            warming(derivatives, {}, 'level0')
                .tileRequests.map((request) => request.url)
                .filter((url) => url.startsWith(WARM)),
        ).toEqual(['https://images.test/warm/full/750,/0/default.jpg']);
    });

    /**
     * `scaleFactors: [1,2,4]` on a 10000px image tiled at 512: the coarsest
     * level is 2500px across, five columns wide. Tile (0,0) there is a CORNER.
     */
    const COARSE_CORNER: ImageServiceFacts = {
        width: 10_000,
        height: 10_000,
        tileSize: 512,
        scaleFactors: [1, 2, 4],
        version: 3,
    };

    it('warms a thumbnail rather than a corner when the coarsest level is not one tile', () => {
        // `resolveScaleFactors` derives the chain down to a single tile only
        // when the service declares no factors; declared ones are taken as
        // given and can stop anywhere. One thumbnail is a picture of the whole
        // image; one tile of a five-column level is not, and the other
        // twenty-four are not "bounded and deliberate".
        const result = warming(COARSE_CORNER);

        expect(
            result.tileRequests.some((request) => request.url.startsWith(WARM)),
        ).toBe(false);
        expect(
            result.thumbnailRequests
                .filter((request) => request.url.startsWith(WARM))
                .map((request) => request.rung),
        ).toEqual([THUMBNAIL_BASE_RUNG]);
    });

    it('warms the very request the reader’s own thumbnail tier makes', () => {
        // Same key, so the handover paints from what was warmed rather than
        // holding a second picture of the same thing.
        const warm = warming(COARSE_CORNER).thumbnailRequests.find((request) =>
            request.url.startsWith(WARM),
        );
        const tier = named(COARSE_CORNER, {
            viewport: viewport({ centre: { x: 500, y: 500 }, scale: 0.2 }),
        });

        expect(tier.tiers.c1).toBe('thumbnail');
        expect(tier.thumbnailRequests.map((request) => request.key)).toContain(
            warm!.key,
        );
    });

    it('warms the canvas that paints nothing at all', () => {
        // The longest blank interval of the lot: there is no picture on this
        // canvas for the warmed one to arrive behind.
        const result = plan(
            [
                {
                    id: 'c1',
                    width: 1000,
                    height: 1000,
                    images: [],
                    warmImages: [
                        {
                            ...fills('warm', serviceSource('warm'), 1, 1),
                            source: {
                                kind: 'service',
                                serviceId: WARM,
                                profile: 'level2',
                            },
                        },
                    ],
                },
            ],
            { knownMetadata: { [WARM]: FACTS } },
        );

        expect(result.tileRequests.map((request) => request.url)).toEqual([
            'https://images.test/warm/full/512,/0/default.jpg',
        ]);
    });

    it('drops the warm request when the canvas is demoted to the box tier', () => {
        // A box-tier canvas holds no network resource and no texture. Demotion
        // by `unresolvedThumbnails` is a second route into that tier, and a
        // warm tile left behind by it is required on a canvas that paints
        // nothing — unreclaimable by the byte budget.
        const result = plan(
            [
                {
                    ...level0Master('c1'),
                    warmImages: [
                        {
                            ...fills('warm', serviceSource('warm'), 1, 1),
                            source: {
                                kind: 'service',
                                serviceId: WARM,
                                profile: 'level2',
                            },
                        },
                    ],
                },
            ],
            {
                viewport: viewport({ centre: { x: 500, y: 500 }, scale: 0.2 }),
                knownMetadata: {
                    ...byService({
                        c1: {
                            width: 12_000,
                            height: 9000,
                            level0: true,
                            version: 3,
                        },
                    }),
                    [WARM]: FACTS,
                },
            },
        );

        expect(result.tiers.c1).toBe('box');
        expect(result.unresolvedThumbnails).toEqual(['c1']);
        expect(result.tileRequests).toEqual([]);
        expect(result.thumbnailRequests).toEqual([]);
    });
});

/** A canvas painting from a level0 service, used for the box-demotion route. */
function level0Master(id: string): PlannerCanvas {
    return {
        id,
        width: 1000,
        height: 1000,
        images: [
            {
                ...fills(id, serviceSource(id), 1, 1),
                source: {
                    kind: 'service',
                    serviceId: serviceIdOf(id),
                    profile: 'level0',
                },
            },
        ],
    };
}
