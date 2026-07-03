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

function fakeAnnotorious(annotations: any[] = []) {
    return {
        getAnnotations: vi.fn(() => annotations),
        clearAnnotations: vi.fn(),
        updateAnnotation: vi.fn(),
        addAnnotation: vi.fn(),
        removeAnnotation: vi.fn(),
        setAnnotations: vi.fn(),
        setSelected: vi.fn(),
        setUser: vi.fn(),
        setVisible: vi.fn(),
        canUndo: vi.fn(() => false),
        canRedo: vi.fn(() => false),
        on: vi.fn(),
    };
}

// Drain microtasks + one macrotask so queued persist/load chains settle.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const SCALING_CANVAS = [
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
] as any;

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

describe('AnnotationManager target.source correctness', () => {
    it('forces target.source to the current canvas after navigation (F1)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        // Navigate to canvas 2; the Annotorious serializer would still stamp
        // canvas 1 into annotations drawn afterwards.
        await manager.handleCanvasChange(
            'manifest-1',
            'http://example.org/canvas/2',
        );

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

        expect(adapter.create).toHaveBeenCalledTimes(1);
        const [, , persisted] = adapter.create.mock.calls[0];
        expect(persisted.target.source).toBe('http://example.org/canvas/2');
    });

    it('replaces a string target with the current canvas source', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        await manager.saveAnnotation({
            id: 'note-1',
            type: 'Annotation',
            target: 'http://example.org/canvas/1',
        });

        expect(adapter.create).toHaveBeenCalledTimes(1);
        const [, , persisted] = adapter.create.mock.calls[0];
        expect(persisted.target).toEqual({
            source: 'http://example.org/canvas/1',
        });
    });

    it('does not create an annotation on point click without a canvas', () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        const addAnnotation = vi.fn();
        (manager as any).osdViewer = {};
        (manager as any).annotorious = { addAnnotation };
        (manager as any).currentCanvasId = null;

        (manager as any).handlePointClick({ quick: true, position: {} });

        expect(addAnnotation).not.toHaveBeenCalled();
        expect(adapter.create).not.toHaveBeenCalled();
    });
});

describe('AnnotationManager persistence flow', () => {
    it('persists the prepared draft (enriched body, canvas space) once on create (F2)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS);
        const adapter = createAdapter();
        const manager = new AnnotationManager({
            adapter,
            extension: {
                prepareDraft: (annotation: any) => ({
                    ...annotation,
                    body: [
                        {
                            type: 'TextualBody',
                            purpose: 'commenting',
                            value: 'draft note',
                        },
                    ],
                }),
            },
        } as any);

        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        // Simulate the Annotorious createAnnotation event (image-space payload).
        await (manager as any).handleCreateAnnotation({
            id: 'rect-1',
            type: 'Annotation',
            body: [],
            target: {
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'FragmentSelector',
                    conformsTo: 'http://www.w3.org/TR/media-frags/',
                    value: 'xywh=10,20,30,40',
                },
            },
        });

        expect(adapter.create).toHaveBeenCalledTimes(1);
        expect(adapter.update).not.toHaveBeenCalled();
        const [, , created] = adapter.create.mock.calls[0];
        expect(created.body).toEqual([
            { type: 'TextualBody', purpose: 'commenting', value: 'draft note' },
        ]);
        // image xywh=10,20,30,40 → canvas space (×3)
        expect(created.target.selector.value).toBe('xywh=30,60,90,120');
        // internal hydration marker never reaches the adapter
        expect(created.__fullBodyLoaded).toBeUndefined();
    });

    it('updateAnnotationBodies persists once and suppresses the echoed update (F3)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        const imageSpaceAnnotation = {
            id: 'rect-1',
            type: 'Annotation',
            body: [],
            target: {
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'FragmentSelector',
                    conformsTo: 'http://www.w3.org/TR/media-frags/',
                    value: 'xywh=10,20,30,40',
                },
            },
        };
        (manager as any).annotorious = fakeAnnotorious([imageSpaceAnnotation]);
        // Existing (loaded) annotation → persist chooses update, not create.
        (manager as any).persistedAnnotations.set('rect-1', {
            id: 'rect-1',
            type: 'Annotation',
            target: imageSpaceAnnotation.target,
        });

        await manager.updateAnnotationBodies('rect-1', [
            { type: 'TextualBody', purpose: 'commenting', value: 'note' },
        ]);

        expect(adapter.update).toHaveBeenCalledTimes(1);
        expect(adapter.create).not.toHaveBeenCalled();
        expect(
            (manager as any).annotorious.updateAnnotation,
        ).toHaveBeenCalledTimes(1);
        expect((manager as any).suppressedEchoIds.has('rect-1')).toBe(true);

        // The async echo Annotorious would dispatch must NOT persist again.
        await (manager as any).handleUpdateAnnotation({
            ...imageSpaceAnnotation,
            body: { type: 'TextualBody', purpose: 'commenting', value: 'note' },
        });

        expect(adapter.update).toHaveBeenCalledTimes(1);
        expect((manager as any).suppressedEchoIds.size).toBe(0);
    });

    it('serializes rapid saves of the same annotation id (F4)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();

        let createResolved = false;
        let resolveCreate: () => void = () => {};
        adapter.create.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveCreate = () => {
                        createResolved = true;
                        resolve();
                    };
                }),
        );
        adapter.update.mockImplementation(() => {
            // The second save must not start until the first has resolved.
            expect(createResolved).toBe(true);
            return Promise.resolve();
        });

        const manager = new AnnotationManager({ adapter });
        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'http://example.org/canvas/1';

        const base = {
            id: 'dup-1',
            type: 'Annotation',
            target: { source: 'http://example.org/canvas/1' },
        };
        const p1 = manager.saveAnnotation({
            ...base,
            body: { type: 'TextualBody', value: 'first' },
        });
        const p2 = manager.saveAnnotation({
            ...base,
            body: { type: 'TextualBody', value: 'second' },
        });

        await flush(); // let the first (create) call reach the adapter
        expect(adapter.create).toHaveBeenCalledTimes(1);
        expect(adapter.update).not.toHaveBeenCalled();

        resolveCreate();
        await Promise.all([p1, p2]);

        expect(adapter.create).toHaveBeenCalledTimes(1);
        expect(adapter.update).toHaveBeenCalledTimes(1);
        const [, , updatePayload] = adapter.update.mock.calls[0];
        expect(updatePayload.body).toEqual({
            type: 'TextualBody',
            value: 'second',
        });
    });

    it('discards a stale canvas load that resolves after navigation (F14)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();

        let resolveA: () => void = () => {};
        adapter.load.mockImplementation((_m: string, canvasId: string) => {
            if (canvasId === 'canvas-A') {
                return new Promise((resolve) => {
                    resolveA = () =>
                        resolve([{ id: 'A-anno', type: 'Annotation' }]);
                });
            }
            return Promise.resolve([{ id: 'B-anno', type: 'Annotation' }]);
        });

        const manager = new AnnotationManager({ adapter });
        (manager as any).annotorious = fakeAnnotorious();
        (manager as any).currentManifestId = 'manifest-1';
        (manager as any).currentCanvasId = 'canvas-A';

        // Slow load for canvas A is in flight...
        const loadA = (manager as any).loadAnnotations();
        await flush();
        // ...navigate to canvas B, whose load resolves immediately.
        await manager.handleCanvasChange('manifest-1', 'canvas-B');

        // Now the stale canvas-A load finally resolves — it must be discarded.
        resolveA();
        await loadA;
        await flush();

        expect((manager as any).persistedAnnotations.get('B-anno')).toBeTruthy();
        expect(
            (manager as any).persistedAnnotations.get('A-anno'),
        ).toBeUndefined();
    });
});
