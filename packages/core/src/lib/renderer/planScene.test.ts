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

import { planScene } from './planScene';
import type { PlannerBudgets, PlannerCanvas, Viewport } from './types';

const BUDGETS: PlannerBudgets = {
    byteBudget: 64 * 1024 * 1024,
    marginFactor: 1.5,
    pyramidThreshold: 400,
    boxThreshold: 40,
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
