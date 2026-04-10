import { describe, expect, it, vi } from 'vitest';
import { transformAnnotationToImageSpace } from '../../utils/canvasImageSpace';

const { getCanvases } = vi.hoisted(() => ({
    getCanvases: vi.fn(() => []),
}));

vi.mock('../../state/manifests.svelte', () => ({
    manifestsState: {
        getCanvases,
    },
}));

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
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
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
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
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

    it('scales fragment selectors into canvas coordinates before save', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([
            {
                id: 'http://example.org/canvas/1',
                width: 1920,
                height: 1080,
                getContent: () => [
                    {
                        getBody: () => ({
                            id: 'https://example.org/image.png',
                            width: 640,
                            height: 360,
                        }),
                    },
                ],
            },
        ] as any);

        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        await manager.saveAnnotation({
            id: 'rect-1',
            type: 'Annotation',
            target: {
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'FragmentSelector',
                    conformsTo: 'http://www.w3.org/TR/media-frags/',
                    value: 'xywh=10,20,30,40',
                },
            },
        });

        expect(adapter.create).toHaveBeenCalledWith(
            'manifest-1',
            'http://example.org/canvas/1',
            expect.objectContaining({
                target: {
                    source: 'http://example.org/canvas/1',
                    selector: {
                        type: 'FragmentSelector',
                        conformsTo: 'http://www.w3.org/TR/media-frags/',
                        value: 'xywh=30,60,90,120',
                    },
                },
            }),
        );
    });

    it('scales persisted point selectors into image coordinates for editing', () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([
            {
                id: 'http://example.org/canvas/1',
                width: 1920,
                height: 1080,
                getContent: () => [
                    {
                        getBody: () => ({
                            id: 'https://example.org/image.png',
                            width: 640,
                            height: 360,
                        }),
                    },
                ],
            },
        ] as any);

        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        const editable = (manager as any).toAnnotoriousTarget({
            id: 'point-2',
            type: 'Annotation',
            target: {
                type: 'SpecificResource',
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'PointSelector',
                    x: 960,
                    y: 540,
                },
            },
        });

        const imageSpace = (manager as any).getCurrentCanvasImageDimensions();
        const scaled = transformAnnotationToImageSpace(editable, imageSpace);

        expect(scaled.target).toEqual({
            source: 'http://example.org/canvas/1',
            selector: {
                type: 'FragmentSelector',
                conformsTo: 'http://www.w3.org/TR/media-frags/',
                value: 'xywh=319,179,2,2',
            },
        });
    });
});
