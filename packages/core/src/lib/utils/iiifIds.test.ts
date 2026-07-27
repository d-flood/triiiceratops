import { describe, expect, it } from 'vitest';

import {
    findCanvasById,
    findCanvasIndexById,
    getAnnotationId,
    getCanvasId,
    getResourceId,
} from './iiifIds';

describe('iiifIds', () => {
    it('resolves resource ids from common IIIF shapes', () => {
        expect(getResourceId({ id: 'resource-1' })).toBe('resource-1');
        expect(getResourceId({ '@id': 'resource-2' })).toBe('resource-2');
        expect(getResourceId({ __jsonld: { id: 'resource-3' } })).toBe(
            'resource-3',
        );
        expect(getResourceId({ getId: () => 'resource-4' })).toBe('resource-4');
        expect(getResourceId({})).toBeNull();
    });

    it('resolves canvas ids across manifesto and raw json shapes', () => {
        expect(getCanvasId({ id: 'canvas-1' })).toBe('canvas-1');
        expect(getCanvasId({ getCanvasId: () => 'canvas-2' })).toBe('canvas-2');
        expect(getCanvasId({ getId: () => 'canvas-3' })).toBe('canvas-3');
        expect(getCanvasId({})).toBe('');
    });

    it('resolves annotation ids from common shapes', () => {
        expect(getAnnotationId({ id: 'anno-1' })).toBe('anno-1');
        expect(getAnnotationId({ '@id': 'anno-2' })).toBe('anno-2');
        expect(getAnnotationId({ getId: () => 'anno-3' })).toBe('anno-3');
        expect(getAnnotationId({})).toBe('');
    });

    it('finds canvases and their index by id', () => {
        const canvases = [
            { id: 'canvas-1' },
            { getCanvasId: () => 'canvas-2' },
            { '@id': 'canvas-3' },
        ];

        expect(findCanvasIndexById(canvases, 'canvas-2')).toBe(1);
        expect(findCanvasIndexById(canvases, 'missing')).toBe(-1);
        expect(findCanvasById(canvases, 'canvas-3')).toEqual(canvases[2]);
        expect(findCanvasById(canvases, 'missing')).toBeNull();
    });
});
