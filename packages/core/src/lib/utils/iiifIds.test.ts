import { describe, expect, it } from 'vitest';

import {
    findCanvasById,
    findCanvasIndexById,
    getAnnotationId,
    getCanvasId,
    getResourceId,
} from './iiifIds';

describe('iiifIds', () => {
    it('resolves resource ids from both IIIF spellings', () => {
        // v3 writes `id`, v2 writes `@id`. These are the only two shapes that
        // can reach here now that canvases and annotations are raw JSON.
        expect(getResourceId({ id: 'resource-1' })).toBe('resource-1');
        expect(getResourceId({ '@id': 'resource-2' })).toBe('resource-2');
        expect(getResourceId({})).toBeNull();
    });

    it('resolves canvas ids from both IIIF spellings', () => {
        expect(getCanvasId({ id: 'canvas-1' })).toBe('canvas-1');
        expect(getCanvasId({ '@id': 'canvas-2' })).toBe('canvas-2');
        expect(getCanvasId({})).toBe('');
    });

    it('resolves annotation ids from both IIIF spellings', () => {
        expect(getAnnotationId({ id: 'anno-1' })).toBe('anno-1');
        expect(getAnnotationId({ '@id': 'anno-2' })).toBe('anno-2');
        expect(getAnnotationId({})).toBe('');
    });

    it('finds canvases and their index by id', () => {
        const canvases = [
            { id: 'canvas-1' },
            { '@id': 'canvas-2' },
            { '@id': 'canvas-3' },
        ];

        expect(findCanvasIndexById(canvases, 'canvas-2')).toBe(1);
        expect(findCanvasIndexById(canvases, 'missing')).toBe(-1);
        expect(findCanvasById(canvases, 'canvas-3')).toEqual(canvases[2]);
        expect(findCanvasById(canvases, 'missing')).toBeNull();
    });

    /*
     * The two spellings a dropped content state produces: the Content State
     * API requires the state to name its target absolutely, while plenty of
     * published manifests declare relative canvas ids.
     */
    it('matches a canvas named absolutely against a relatively declared id', () => {
        const canvases = [
            { id: '/material/landing/canvas/haeckel' },
            { id: '/material/landing/canvas/milkmaid' },
        ];
        const wanted = new URL(
            '/material/landing/canvas/milkmaid',
            document.baseURI,
        ).href;

        expect(findCanvasIndexById(canvases, wanted)).toBe(1);
    });

    it('still refuses a canvas that is genuinely not there', () => {
        const canvases = [{ id: '/canvas/one' }];

        expect(
            findCanvasIndexById(
                canvases,
                new URL('/canvas/other', document.baseURI).href,
            ),
        ).toBe(-1);
    });

    // Two ids that cannot be resolved must not collapse into one match.
    it('does not match unresolvable ids to each other', () => {
        expect(findCanvasIndexById([{ id: '' }, {}], 'canvas-1')).toBe(-1);
    });
});
