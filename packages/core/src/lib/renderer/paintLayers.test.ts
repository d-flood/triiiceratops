import { describe, expect, it, vi } from 'vitest';

import {
    createPaintLayerRegistry,
    drawPaintLayers,
    paintCanvasPlacements,
    paintCanvasSpace,
    sortPaintLayers,
    type PaintFrame,
    type PaintLayerDraw,
    type RegisteredPaintLayer,
} from './paintLayers';

const FRAME: PaintFrame = {
    transform: { scale: 2, offsetX: 10, offsetY: 20, dpr: 2 },
    width: 800,
    height: 600,
    ...paintCanvasSpace([], () => ({ width: null, height: null })),
};

function layer(
    id: string,
    order: number,
    sequence: number,
    draw: PaintLayerDraw = () => {},
): RegisteredPaintLayer {
    return { id, order, sequence, draw };
}

/** A context stub recording only what this module is responsible for. */
function contextStub() {
    const log: string[] = [];
    return {
        log,
        ctx: {
            save: () => log.push('save'),
            restore: () => log.push('restore'),
        } as unknown as CanvasRenderingContext2D,
    };
}

describe('sortPaintLayers', () => {
    it('orders by order, then by registration sequence', () => {
        const sorted = sortPaintLayers([
            layer('c', 10, 3),
            layer('a', 0, 1),
            layer('b', 0, 0),
            layer('d', -5, 9),
        ]);

        expect(sorted.map((entry) => entry.id)).toEqual(['d', 'b', 'a', 'c']);
    });
});

describe('createPaintLayerRegistry', () => {
    it('exposes layers in call order, whatever order they registered in', () => {
        const registry = createPaintLayerRegistry();
        registry.register({ id: 'over', order: 10, draw: () => {} });
        registry.register({ id: 'under', order: -1, draw: () => {} });
        registry.register({ id: 'middle', draw: () => {} });

        expect(registry.layers.map((entry) => entry.id)).toEqual([
            'under',
            'middle',
            'over',
        ]);
    });

    it('keeps registration order for layers sharing an order', () => {
        const registry = createPaintLayerRegistry();
        registry.register({ id: 'first', draw: () => {} });
        registry.register({ id: 'second', draw: () => {} });

        expect(registry.layers.map((entry) => entry.id)).toEqual([
            'first',
            'second',
        ]);
    });

    it('removes a layer on unregister, and is idempotent', () => {
        const registry = createPaintLayerRegistry();
        const release = registry.register({ id: 'one', draw: () => {} });
        registry.register({ id: 'two', draw: () => {} });

        release();
        expect(registry.layers.map((entry) => entry.id)).toEqual(['two']);

        // A second call must not remove somebody else's layer, which is what a
        // non-idempotent implementation keyed on position would do.
        release();
        expect(registry.layers.map((entry) => entry.id)).toEqual(['two']);
    });

    it('reports a change on register and on unregister', () => {
        const onChange = vi.fn();
        const registry = createPaintLayerRegistry({ onChange });

        const release = registry.register({ id: 'one', draw: () => {} });
        expect(onChange).toHaveBeenCalledTimes(1);

        release();
        expect(onChange).toHaveBeenCalledTimes(2);

        // A released layer is gone: releasing again changes nothing, so nothing
        // is announced and no repaint is asked for.
        release();
        expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('refuses a layer with no id or no draw function, with a no-op release', () => {
        const onRefused = vi.fn();
        const registry = createPaintLayerRegistry({ onRefused });

        const release = registry.register({
            id: '   ',
            draw: () => {},
        });
        registry.register({ id: 'nope' } as never);

        expect(registry.layers).toEqual([]);
        expect(onRefused).toHaveBeenCalledTimes(2);
        expect(() => release()).not.toThrow();
    });

    it('refuses a duplicate id rather than drawing twice under one name', () => {
        const onRefused = vi.fn();
        const registry = createPaintLayerRegistry({ onRefused });
        registry.register({ id: 'same', draw: () => {} });
        const release = registry.register({ id: 'same', draw: () => {} });

        expect(registry.layers).toHaveLength(1);
        expect(onRefused).toHaveBeenCalledTimes(1);

        // The refused registration's release must not take the ACCEPTED layer
        // with it — a caller cannot tell the two apart.
        release();
        expect(registry.layers).toHaveLength(1);
    });

    it('frees the id once its layer is released', () => {
        const registry = createPaintLayerRegistry();
        const release = registry.register({ id: 'same', draw: () => {} });
        release();

        registry.register({ id: 'same', draw: () => {} });
        expect(registry.layers).toHaveLength(1);
    });
});

describe('drawPaintLayers', () => {
    it('calls every layer in order with the frame', () => {
        const calls: string[] = [];
        const seen: PaintFrame[] = [];
        const layers = [
            layer('first', 0, 0, () => calls.push('first')),
            layer('second', 1, 1, (_ctx, frame) => {
                calls.push('second');
                seen.push(frame);
            }),
        ] as RegisteredPaintLayer[];

        drawPaintLayers(contextStub().ctx, layers, FRAME, () => {});

        expect(calls).toEqual(['first', 'second']);
        expect(seen[0].transform).toEqual(FRAME.transform);
    });

    it('brackets each layer in save/restore', () => {
        const { ctx, log } = contextStub();
        drawPaintLayers(
            ctx,
            [
                layer('a', 0, 0, () => log.push('a')),
                layer('b', 0, 1, () => log.push('b')),
            ],
            FRAME,
            () => {},
        );

        expect(log).toEqual(['save', 'a', 'restore', 'save', 'b', 'restore']);
    });

    it('isolates a throwing layer: the rest still draw and the context is restored', () => {
        const { ctx, log } = contextStub();
        const onError = vi.fn();

        drawPaintLayers(
            ctx,
            [
                layer('bad', 0, 0, () => {
                    throw new Error('boom');
                }),
                layer('good', 1, 1, () => log.push('good')),
            ],
            FRAME,
            onError,
        );

        expect(log).toEqual(['save', 'restore', 'save', 'good', 'restore']);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0][0].id).toBe('bad');
    });
});

describe('paintCanvasPlacements', () => {
    it('carries id and rect, and nothing else the planner happens to hold', () => {
        expect(
            paintCanvasPlacements([
                { canvasId: 'a', x: 1, y: 2, width: 3, height: 4 },
            ]),
        ).toEqual([{ canvasId: 'a', x: 1, y: 2, width: 3, height: 4 }]);
    });
});

/**
 * The conversion a canvas-anchored layer needs, and the reason it is on the
 * frame rather than left to the layer.
 *
 * Every case below has a rect that is NOT the Canvas's declared box: offset by a
 * neighbour, resized by normalization, or both. A layer that assumed
 * `rect.width === canvas.width` — the only thing four numbers per placement
 * would have let it assume — draws in the wrong place in all of them.
 */
describe('paintCanvasSpace', () => {
    const LAYOUT = [
        { canvasId: 'verso', x: 0, y: 0, width: 100, height: 200 },
        // Beside its neighbour AND scaled: declared 200×400, laid out 50×200.
        { canvasId: 'recto', x: 100, y: 0, width: 50, height: 200 },
    ];
    const DECLARED: Record<string, { width: number; height: number }> = {
        verso: { width: 100, height: 200 },
        recto: { width: 200, height: 400 },
    };

    function space() {
        return paintCanvasSpace(
            LAYOUT,
            (canvasId) => DECLARED[canvasId] ?? { width: null, height: null },
        );
    }

    it('offsets by the canvas rect, so a point on folio 2 is not on folio 1', () => {
        expect(space().canvasToWorld({ x: 0, y: 0 }, 'verso')).toEqual({
            x: 0,
            y: 0,
        });
        expect(space().canvasToWorld({ x: 0, y: 0 }, 'recto')).toEqual({
            x: 100,
            y: 0,
        });
    });

    it('scales by the rect the canvas was actually laid out at', () => {
        // Half-way across a canvas declared 200 wide, laid out 50 wide: 25 world
        // units past the rect's own left edge.
        expect(space().canvasToWorld({ x: 100, y: 200 }, 'recto')).toEqual({
            x: 125,
            y: 100,
        });
        expect(
            space().canvasBoxToWorld(
                { x: 100, y: 200, width: 100, height: 200 },
                'recto',
            ),
        ).toEqual({ x: 125, y: 100, width: 25, height: 100 });
    });

    it('falls back to the laid-out extent for a canvas with no declared size', () => {
        const withoutDimensions = paintCanvasSpace(LAYOUT, () => ({
            width: null,
            height: null,
        }));

        // The rect is then the only statement of the canvas's extent anyone
        // has, so the mapping is the identity plus the offset.
        expect(
            withoutDimensions.canvasToWorld({ x: 25, y: 50 }, 'recto'),
        ).toEqual({ x: 125, y: 50 });
    });

    it('answers null for a canvas this frame did not lay out', () => {
        expect(space().canvasToWorld({ x: 0, y: 0 }, 'folio-700')).toBeNull();
        expect(
            space().canvasBoxToWorld(
                { x: 0, y: 0, width: 1, height: 1 },
                'folio-700',
            ),
        ).toBeNull();
    });

    it('does not ask for declared dimensions until a conversion needs them', () => {
        const declared = vi.fn(() => ({ width: null, height: null }));
        const built = paintCanvasSpace(LAYOUT, declared);

        // A layer that only reads `canvases` — core's own page placeholders —
        // must not pay for an index per frame on an 800-folio manifest.
        expect(built.canvases).toHaveLength(2);
        expect(declared).not.toHaveBeenCalled();

        built.canvasToWorld({ x: 0, y: 0 }, 'verso');
        expect(declared).toHaveBeenCalled();
    });
});
