import { describe, expect, it, vi } from 'vitest';
import { AnnotationManager } from './AnnotationManager.svelte';

function createAdapter() {
    return {
        id: 'mock',
        name: 'Mock Adapter',
        load: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
}

describe('AnnotationManager point serialization', () => {
    it('serializes point drafts to IIIF PointSelector targets', () => {
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        const annotation = {
            id: 'point-1',
            type: 'Annotation',
            target: {
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'FragmentSelector',
                    conformsTo: 'http://www.w3.org/TR/media-frags/',
                    value: 'xywh=10,20,2,2',
                },
            },
        };

        const prepared = (manager as any).prepareAnnotation(annotation);

        expect(prepared.target).toEqual({
            type: 'SpecificResource',
            source: 'http://example.org/canvas/1',
            selector: {
                type: 'PointSelector',
                x: 11,
                y: 21,
            },
        });
    });

    it('converts persisted PointSelector targets to editable fragment selectors', () => {
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        const annotation = {
            id: 'point-2',
            type: 'Annotation',
            target: {
                type: 'SpecificResource',
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'PointSelector',
                    x: 3385,
                    y: 1464,
                },
            },
        };

        const editable = (manager as any).toAnnotoriousTarget(annotation);

        expect(editable.target).toEqual({
            source: 'http://example.org/canvas/1',
            selector: {
                type: 'FragmentSelector',
                conformsTo: 'http://www.w3.org/TR/media-frags/',
                value: 'xywh=3382,1461,6,6',
            },
        });
    });
});
