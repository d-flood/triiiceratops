import { describe, expect, it, vi } from 'vitest';

import {
    createTileSourceErrorMirror,
    errorPlacements,
    viewerLevelErrorKind,
    type CanvasErrorPlacement,
    type CanvasErrors,
} from './canvasErrors';
import {
    samePlacements,
    MIN_LABEL_HEIGHT,
    MIN_LABEL_WIDTH,
} from './canvasPlacements';
import type { LayoutRect, Viewport } from './types';

function rect(
    canvasId: string,
    x: number,
    width = 100,
    height = 100,
): LayoutRect {
    return { canvasId, x, y: 0, width, height };
}

function viewport(overrides: Partial<Viewport> = {}): Viewport {
    return {
        width: 800,
        height: 600,
        centre: { x: 50, y: 50 },
        scale: 1,
        ...overrides,
    };
}

describe('errorPlacements', () => {
    it('places a failed canvas over its own layout rect', () => {
        const placements = errorPlacements(
            [rect('c1', 0)],
            { c1: 'auth' },
            viewport({ centre: { x: 50, y: 50 }, scale: 2 }),
        );

        expect(placements).toEqual([
            {
                canvasId: 'c1',
                kind: 'auth',
                // The rect's origin is 50 canvas units up-left of the centre, at
                // 2× — so 100 screen px up-left of the middle of an 800×600
                // surface.
                left: 800 / 2 - 100,
                top: 600 / 2 - 100,
                width: 200,
                height: 200,
                // Wholly inside the viewport, so the label box IS the rect.
                labelLeft: 800 / 2 - 100,
                labelTop: 600 / 2 - 100,
                labelWidth: 200,
                labelHeight: 200,
                labelled: true,
            },
        ]);
    });

    it('carries the auth/load distinction through, one placement per canvas', () => {
        const layout = [rect('c1', 0), rect('c2', 120), rect('c3', 240)];
        const errors: CanvasErrors = { c1: 'auth', c3: 'load' };

        const placements = errorPlacements(
            layout,
            errors,
            viewport({ centre: { x: 170, y: 50 }, scale: 1 }),
        );

        expect(placements.map((p) => [p.canvasId, p.kind])).toEqual([
            ['c1', 'auth'],
            ['c3', 'load'],
        ]);
    });

    it('leaves the working canvases alone', () => {
        const placements = errorPlacements(
            [rect('c1', 0), rect('c2', 120)],
            { c2: 'load' },
            viewport({ centre: { x: 120, y: 50 } }),
        );

        expect(placements.map((p) => p.canvasId)).toEqual(['c2']);
    });

    /*
     * The reason this function culls at all. A manifest whose whole image service
     * is behind a login fails on every folio; one placeholder per failure would
     * put 800 named elements into the accessibility tree of a viewer showing two.
     */
    it('culls the failures that are off screen', () => {
        const layout = Array.from({ length: 800 }, (_, index) =>
            rect(`f${index}`, index * 120),
        );
        const errors: CanvasErrors = Object.fromEntries(
            layout.map((entry) => [entry.canvasId, 'auth' as const]),
        );

        const placements = errorPlacements(
            layout,
            errors,
            // Parked on folio 400, an 800 px viewport at 1× — seven 120-unit
            // folios wide.
            viewport({ centre: { x: 400 * 120 + 50, y: 50 }, scale: 1 }),
        );

        // EXACTLY the folios whose rects meet the viewport, not merely "not many
        // of them": a loose bound passes just as happily if the cull is off by
        // several hundred. The viewport spans x 47600..48400 in canvas space
        // (centred on 48050, 800 wide at 1x). Folio n spans 120n..120n+100, so
        // the intersecting ones are f397 (47640..47740) through f403
        // (48360..48400) — seven of them. f396 ends at 47620, before the left
        // edge; f404 starts at 48480, past the right.
        expect(placements.map((p) => p.canvasId)).toEqual([
            'f397',
            'f398',
            'f399',
            'f400',
            'f401',
            'f402',
            'f403',
        ]);
    });

    /*
     * The zoom ceiling is several times home, so "the failed canvas is bigger than the
     * viewport" is ordinary rather than exotic — and then the rect's border is off
     * screen on every side and its centre is a point nobody can see. A label
     * centred in the rect leaves a sighted reader with a flat fill and no message
     * while the accessible name goes on being correct: a sighted-reader-only
     * failure, which no accessibility test can catch.
     */
    describe('the label box', () => {
        it('is the viewport intersection when the failed canvas is larger than the viewport', () => {
            const [placement] = errorPlacements(
                [rect('c1', 0, 1000, 1000)],
                { c1: 'load' },
                // Parked in the middle of the canvas at 4x: the rect projects to
                // 4000x4000 around a 800x600 viewport.
                viewport({ centre: { x: 500, y: 500 }, scale: 4 }),
            );

            // The rect itself is unchanged — it is what the border is drawn on.
            expect(placement.left).toBe(-1600);
            expect(placement.top).toBe(-1700);
            expect(placement.width).toBe(4000);
            expect(placement.height).toBe(4000);

            // The label box is the whole viewport, because the whole viewport is
            // inside this canvas.
            expect(placement.labelLeft).toBe(0);
            expect(placement.labelTop).toBe(0);
            expect(placement.labelWidth).toBe(800);
            expect(placement.labelHeight).toBe(600);
            expect(placement.labelled).toBe(true);
        });

        it('clamps only the edges that are off screen', () => {
            // The rect starts left of the viewport and ends inside it.
            const [placement] = errorPlacements(
                [rect('c1', 0, 400, 400)],
                { c1: 'load' },
                viewport({ centre: { x: 300, y: 200 }, scale: 1 }),
            );

            // Rect: left = (0 - 300) + 400 = 100, top = (0 - 200) + 300 = 100.
            // Wholly inside, so nothing is clamped and the two boxes agree.
            expect(placement.labelLeft).toBe(placement.left);
            expect(placement.labelWidth).toBe(placement.width);

            const [offLeft] = errorPlacements(
                [rect('c1', 0, 400, 400)],
                { c1: 'load' },
                viewport({ centre: { x: 380, y: 200 }, scale: 4 }),
            );

            // Rect: left = (0 - 380) * 4 + 400 = -1120, width 1600, so it runs
            // from -1120 to 480 — off screen on the left, inside on the right.
            expect(offLeft.left).toBe(-1120);
            expect(offLeft.labelLeft).toBe(0);
            expect(offLeft.labelWidth).toBe(480);
            // Vertically: top = (0 - 200) * 4 + 300 = -500, height 1600, so it
            // covers the viewport's whole height.
            expect(offLeft.labelTop).toBe(0);
            expect(offLeft.labelHeight).toBe(600);
        });

        it('refuses the label when the on-screen part is too small to carry it', () => {
            // A thumbnail-tier sliver: the placeholder is still drawn, and still
            // named, but a fragment of one clipped glyph reads as a rendering bug
            // rather than as an error.
            const sliver = errorPlacements(
                [rect('c1', 0, 100, 100)],
                { c1: 'load' },
                viewport({ centre: { x: 50, y: 50 }, scale: 0.2 }),
            );

            expect(sliver[0].labelWidth).toBe(20);
            expect(sliver[0].labelled).toBe(false);

            // And a rect that is large but only just on screen: the size that
            // matters is the INTERSECTION, not the rect.
            const edge = errorPlacements(
                [rect('c1', 0, 1000, 1000)],
                { c1: 'load' },
                // The rect's right edge lands 80 px inside the left of the
                // viewport: left = (0 - 1320) + 400 = -920, plus 1000 of width.
                viewport({ centre: { x: 1320, y: 500 }, scale: 1 }),
            );
            expect(edge[0].width).toBe(1000);
            expect(edge[0].labelWidth).toBe(80);
            expect(edge[0].labelled).toBe(false);

            // The boundary itself is inclusive.
            const exact = errorPlacements(
                [rect('c1', 0, MIN_LABEL_WIDTH, MIN_LABEL_HEIGHT)],
                { c1: 'load' },
                viewport({
                    centre: {
                        x: MIN_LABEL_WIDTH / 2,
                        y: MIN_LABEL_HEIGHT / 2,
                    },
                }),
            );
            expect(exact[0].labelled).toBe(true);
        });
    });

    it('answers nothing before the surface has been measured', () => {
        const errors: CanvasErrors = { c1: 'auth' };

        expect(
            errorPlacements([rect('c1', 0)], errors, viewport({ width: 0 })),
        ).toEqual([]);
        expect(
            errorPlacements([rect('c1', 0)], errors, viewport({ height: 0 })),
        ).toEqual([]);
        expect(
            errorPlacements([rect('c1', 0)], errors, viewport({ scale: 0 })),
        ).toEqual([]);
    });

    it('skips a rect with no area', () => {
        expect(
            errorPlacements(
                [rect('c1', 0, 0, 100)],
                { c1: 'load' },
                viewport(),
            ),
        ).toEqual([]);
    });
});

describe('viewerLevelErrorKind', () => {
    it('surfaces the current canvas’s failure when it is the only canvas', () => {
        expect(
            viewerLevelErrorKind([rect('c1', 0)], { c1: 'auth' }, 'c1'),
        ).toBe('auth');
        expect(
            viewerLevelErrorKind([rect('c1', 0)], { c1: 'load' }, 'c1'),
        ).toBe('load');
    });

    /*
     * The whole point of the derivation. The chrome for this condition is a full
     * cover over the renderer, so raising it while a sibling folio is readable
     * would blank a working viewer — the regression the per-canvas model exists
     * to prevent.
     */
    it('stays null while any laid-out canvas is still working', () => {
        expect(
            viewerLevelErrorKind(
                [rect('c1', 0), rect('c2', 120)],
                { c1: 'auth' },
                'c1',
            ),
        ).toBeNull();
    });

    it('raises the condition once every laid-out canvas has failed', () => {
        expect(
            viewerLevelErrorKind(
                [rect('c1', 0), rect('c2', 120)],
                { c1: 'auth', c2: 'load' },
                'c1',
            ),
        ).toBe('auth');
    });

    it('reports the CURRENT canvas’s kind, not the first failure found', () => {
        expect(
            viewerLevelErrorKind(
                [rect('c1', 0), rect('c2', 120)],
                { c1: 'load', c2: 'auth' },
                'c2',
            ),
        ).toBe('auth');
    });

    it('stays null when the current canvas has not failed', () => {
        expect(
            viewerLevelErrorKind([rect('c1', 0)], { c2: 'auth' }, 'c1'),
        ).toBeNull();
    });

    it('stays null with nothing laid out, and with no current canvas', () => {
        expect(viewerLevelErrorKind([], { c1: 'auth' }, 'c1')).toBeNull();
        expect(
            viewerLevelErrorKind([rect('c1', 0)], { c1: 'auth' }, null),
        ).toBeNull();
    });

    /*
     * A canvas id left over from a mode the renderer is no longer showing is not
     * the canvas the reader is looking at, so it cannot cover the surface.
     */
    it('stays null for a current canvas that is not laid out', () => {
        expect(
            viewerLevelErrorKind(
                [rect('c2', 0)],
                { c2: 'auth', c9: 'auth' },
                'c9',
            ),
        ).toBeNull();
    });
});

/*
 * The frame loop recomputes placements every frame and pushes them into reactive
 * state, so this is what stands between "the placeholders moved" and "the
 * reactive graph is woken 60 times a second for an unchanged answer".
 */
describe('samePlacements', () => {
    function placement(
        overrides: Partial<CanvasErrorPlacement> = {},
    ): CanvasErrorPlacement {
        return {
            canvasId: 'c1',
            kind: 'load',
            left: 10,
            top: 20,
            width: 100,
            height: 200,
            labelLeft: 10,
            labelTop: 20,
            labelWidth: 100,
            labelHeight: 200,
            labelled: true,
            ...overrides,
        };
    }

    it('holds for equal lists, including empty ones', () => {
        expect(samePlacements([], [])).toBe(true);
        expect(samePlacements([placement()], [placement()])).toBe(true);
    });

    it('fails on a different length', () => {
        expect(samePlacements([placement()], [])).toBe(false);
        expect(
            samePlacements(
                [placement()],
                [placement(), placement({ canvasId: 'c2' })],
            ),
        ).toBe(false);
    });

    /*
     * Every field, one at a time. A comparison that misses one is a placeholder
     * that stops following the viewport — and it fails silently, because the
     * stale answer is a perfectly plausible one.
     */
    it.each([
        ['canvasId', { canvasId: 'c2' }],
        ['kind', { kind: 'auth' as const }],
        ['left', { left: 11 }],
        ['top', { top: 21 }],
        ['width', { width: 101 }],
        ['height', { height: 201 }],
        ['labelLeft', { labelLeft: 11 }],
        ['labelTop', { labelTop: 21 }],
        ['labelWidth', { labelWidth: 101 }],
        ['labelHeight', { labelHeight: 201 }],
        ['labelled', { labelled: false }],
    ])('fails when %s differs', (_field, overrides) => {
        expect(samePlacements([placement()], [placement(overrides)])).toBe(
            false,
        );
    });

    /*
     * Order is meaning: `errorPlacements` returns layout order, so the same
     * failures in a different order are a different DOM and reading order.
     */
    it('fails when the same placements arrive in a different order', () => {
        const a = placement({ canvasId: 'c1' });
        const b = placement({ canvasId: 'c2' });

        expect(samePlacements([a, b], [b, a])).toBe(false);
    });
});

/*
 * The throttle on an OBSERVABLE state member. Without it the frame loop notifies
 * every plugin subscriber once per frame with a freshly allocated object for a
 * value that did not change — and nothing but a test of this seam notices,
 * because the value is right either way.
 */
describe('createTileSourceErrorMirror', () => {
    function mirror() {
        const write = vi.fn();
        const set = createTileSourceErrorMirror({
            loadMessage: () => 'could not load',
            write,
        });
        return { set, write };
    }

    it('writes nothing at all while the condition stays null', () => {
        const { set, write } = mirror();

        set(null);
        set(null);

        expect(write).not.toHaveBeenCalled();
    });

    it('writes once per change, not once per frame', () => {
        const { set, write } = mirror();

        for (let frame = 0; frame < 60; frame += 1) set('auth');

        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith({ type: 'auth' });

        for (let frame = 0; frame < 60; frame += 1) set(null);

        expect(write).toHaveBeenCalledTimes(2);
        expect(write).toHaveBeenLastCalledWith(null);
    });

    /* The auth/load distinction survives to the chrome (user story 27). */
    it('carries the kind, and the load message with it', () => {
        const { set, write } = mirror();

        set('load');
        expect(write).toHaveBeenLastCalledWith({
            type: 'load',
            message: 'could not load',
        });

        // A change of kind is a change, even though neither is null.
        set('auth');
        expect(write).toHaveBeenLastCalledWith({ type: 'auth' });
        expect(write).toHaveBeenCalledTimes(2);
    });

    /* Read at write time, so switching locale mid-session is not baked in. */
    it('asks for the message each time it writes one', () => {
        const loadMessage = vi.fn(() => 'first');
        const write = vi.fn();
        const set = createTileSourceErrorMirror({ loadMessage, write });

        set('load');
        set(null);
        loadMessage.mockReturnValue('second');
        set('load');

        expect(write).toHaveBeenLastCalledWith({
            type: 'load',
            message: 'second',
        });
    });
});
