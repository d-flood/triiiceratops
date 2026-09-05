import { describe, expect, it, vi } from 'vitest';

import { collectCanvasAnnotations } from './canvasAnnotations';

/**
 * The enumeration every annotation surface shares.
 *
 * What is asserted here is the multi-canvas part, because that is what was
 * missing: the panel, the shape overlay and the connector each asked about the
 * viewer's ONE current canvas, so a spread's facing page and a folio scrolled to
 * in continuous mode had no annotations anywhere — no shape, no row, and
 * therefore nothing for a connector to join.
 */
const NOTE_ONE = { id: 'note-1', body: { value: 'One' } };
const NOTE_TWO = { id: 'note-2', body: { value: 'Two' } };

function getAnnotations(_manifestId: string, canvasId: string): unknown[] {
    if (canvasId === 'canvas-1') return [NOTE_ONE];
    if (canvasId === 'canvas-2') return [NOTE_TWO];
    return [];
}

describe('collectCanvasAnnotations', () => {
    it('collects one entry per canvas, in the order given', () => {
        const collected = collectCanvasAnnotations({
            manifestId: 'manifest-1',
            canvasIds: ['canvas-1', 'canvas-2'],
            getAnnotations,
            searchAnnotations: [],
        });

        expect(collected).toEqual([
            {
                canvasId: 'canvas-1',
                annotations: [NOTE_ONE],
                searchHitIds: new Set(),
            },
            {
                canvasId: 'canvas-2',
                annotations: [NOTE_TWO],
                searchHitIds: new Set(),
            },
        ]);
    });

    it('gives a canvas with nothing on it no entry at all', () => {
        const collected = collectCanvasAnnotations({
            manifestId: 'manifest-1',
            canvasIds: ['canvas-1', 'canvas-3', 'canvas-2'],
            getAnnotations,
            searchAnnotations: [],
        });

        expect(collected.map((entry) => entry.canvasId)).toEqual([
            'canvas-1',
            'canvas-2',
        ]);
    });

    /**
     * A hit goes to the canvas it names, with its own coordinates.
     *
     * The overlay this replaces shifted a facing page's hits by
     * `canvasWidth * 1.025` and drew them against the CURRENT canvas — a
     * hand-rolled stand-in for layout that was wrong by the difference between
     * that guess and the renderer's real 1.25% gap, and that could never describe
     * more than two pages.
     */
    it('routes each search hit to its own canvas, unshifted', () => {
        const hitOne = { id: 'hit-1', canvasId: 'canvas-1' };
        const hitTwo = { id: 'hit-2', canvasId: 'canvas-2' };

        const collected = collectCanvasAnnotations({
            manifestId: 'manifest-1',
            canvasIds: ['canvas-1', 'canvas-2'],
            getAnnotations,
            searchAnnotations: [hitTwo, hitOne],
        });

        expect(collected[0]).toEqual({
            canvasId: 'canvas-1',
            annotations: [NOTE_ONE, hitOne],
            searchHitIds: new Set(['hit-1']),
        });
        expect(collected[1]).toEqual({
            canvasId: 'canvas-2',
            annotations: [NOTE_TWO, hitTwo],
            searchHitIds: new Set(['hit-2']),
        });
    });

    it('ignores a search hit for a canvas that is not on screen', () => {
        const collected = collectCanvasAnnotations({
            manifestId: 'manifest-1',
            canvasIds: ['canvas-1'],
            getAnnotations,
            searchAnnotations: [{ id: 'hit-2', canvasId: 'canvas-2' }],
        });

        expect(collected).toHaveLength(1);
        expect(collected[0].annotations).toEqual([NOTE_ONE]);
    });

    it('asks for nothing without a manifest or a canvas', () => {
        const spy = vi.fn(getAnnotations);

        expect(
            collectCanvasAnnotations({
                manifestId: null,
                canvasIds: ['canvas-1'],
                getAnnotations: spy,
                searchAnnotations: [],
            }),
        ).toEqual([]);
        expect(
            collectCanvasAnnotations({
                manifestId: 'manifest-1',
                canvasIds: [],
                getAnnotations: spy,
                searchAnnotations: [],
            }),
        ).toEqual([]);
        expect(spy).not.toHaveBeenCalled();
    });

    it('does not hand back the cache’s own array', () => {
        const cached = [NOTE_ONE];
        const collected = collectCanvasAnnotations({
            manifestId: 'manifest-1',
            canvasIds: ['canvas-1'],
            getAnnotations: () => cached,
            searchAnnotations: [{ id: 'hit-1', canvasId: 'canvas-1' }],
        });

        // The hit is appended to a copy: pushing onto the manifest cache's array
        // would add an ephemeral search result to the cached manifest.
        expect(collected[0].annotations).toHaveLength(2);
        expect(cached).toHaveLength(1);
    });
});
