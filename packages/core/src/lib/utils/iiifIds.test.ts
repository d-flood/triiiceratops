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
});
