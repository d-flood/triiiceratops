import { describe, expect, it, vi } from 'vitest';

const { getCanvases, setUserAnnotations, clearUserAnnotations } = vi.hoisted(
    () => ({
        getCanvases: vi.fn(() => []),
        setUserAnnotations: vi.fn(),
        clearUserAnnotations: vi.fn(),
    }),
);

vi.mock('../../state/manifests.svelte', () => ({
    manifestsState: {
        getCanvases,
        setUserAnnotations,
        clearUserAnnotations,
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

/**
 * A minimal OSD viewer whose pixel→image conversion resolves to a fixed image
 * point, with a per-zoom viewport scale that is deliberately discarded by the
 * new point flow (proving zoom-invariance — F17). `viewportToImageCoordinates`
 * returns `imagePoint` regardless of the intermediate viewport value.
 */
function fakePointViewer(
    imagePoint: { x: number; y: number },
    zoom = 1,
): any {
    return {
        element: { classList: { add: vi.fn(), remove: vi.fn() } },
        world: {
            getItemAt: () => ({
                viewportToImageCoordinates: () => ({ ...imagePoint }),
            }),
        },
        viewport: {
            pointFromPixel: (p: any) => ({ x: p.x / zoom, y: p.y / zoom }),
        },
    };
}

class FakePoint {
    constructor(
        public x: number,
        public y: number,
    ) {}
}

/**
 * A viewer whose screen→image conversion yields `scale / zoom` image units per
 * screen pixel, so the point editing rect (which is sized in screen pixels) has
 * a predictable, zoom-dependent size in image space.
 */
function fakeEditingViewer(scale: number, zoom: number): any {
    return {
        element: { classList: { add: vi.fn(), remove: vi.fn() } },
        viewport: {
            pointFromPixel: (p: { x: number; y: number }) => ({
                x: p.x / zoom,
                y: p.y / zoom,
            }),
        },
        world: {
            getItemAt: () => ({
                viewportToImageCoordinates: (vp: { x: number; y: number }) => ({
                    x: vp.x * scale,
                    y: vp.y * scale,
                }),
            }),
        },
    };
}

function parseXywh(value: string): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    const m = value.match(/xywh=([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+)/)!;
    return {
        x: Number(m[1]),
        y: Number(m[2]),
        width: Number(m[3]),
        height: Number(m[4]),
    };
}

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
    it('updates active edit id through an injected callback and the deprecated window shim', () => {
        const manager = new AnnotationManager({ adapter: createAdapter() });
        const onActiveEditingAnnotationChange = vi.fn();
        const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

        manager.onActiveEditingAnnotationChange =
            onActiveEditingAnnotationChange;

        (manager as any).setActiveEditingAnnotationId('anno-1');

        expect(onActiveEditingAnnotationChange).toHaveBeenCalledWith('anno-1');
        expect(dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'triiiceratops:annotation-editor:active-edit-id',
                detail: { annotationId: 'anno-1' },
            }),
        );

        dispatchEvent.mockRestore();
    });

    it('passes a canvas-space PointSelector draft through prepareAnnotation unchanged (F17)', () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).store.setCanvas(null, 'http://example.org/canvas/1');

        const annotation = {
            id: 'temp-1',
            type: 'Annotation',
            body: [],
            target: {
                type: 'SpecificResource',
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'PointSelector',
                    x: 11,
                    y: 21,
                },
            },
        };

        // The point tool authors PointSelector directly in canvas space, so the
        // create path skips the image→canvas transform (issue 11).
        const prepared = (manager as any).prepareAnnotation(annotation, {
            canvasSpace: true,
        });

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

    it('sizes the point editing rect in screen pixels, constant across zoom (§3.2)', () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS); // 1920x1080 canvas / 640x360 image (3x)

        const sizes: number[] = [];
        const centers: Array<{ x: number; y: number }> = [];
        for (const zoom of [1, 8]) {
            const manager = new AnnotationManager({ adapter: createAdapter() });
            (manager as any).store.setCanvas(
                'manifest-1',
                'http://example.org/canvas/1',
            );
            (manager as any).OSD = { Point: FakePoint };
            (manager as any).osdViewer = fakeEditingViewer(4, zoom);

            const editable = (manager as any).toAnnotoriousTarget({
                id: 'p1',
                type: 'Annotation',
                target: {
                    type: 'SpecificResource',
                    source: 'http://example.org/canvas/1',
                    selector: { type: 'PointSelector', x: 960, y: 540 },
                },
            });

            const rect = parseXywh(editable.target.selector.value);
            sizes.push(rect.width);
            centers.push({
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
            });
        }

        // diameter = 2 × default radius (5) = 10 screen px; the fake viewer gives
        // (scale=4 / zoom) image units per screen px, so size = 40 / zoom.
        expect(sizes[0]).toBeCloseTo(40);
        expect(sizes[1]).toBeCloseTo(5);
        // The marker's centre (the image-space point) is zoom-invariant.
        expect(centers[0].x).toBeCloseTo(centers[1].x);
        expect(centers[0].y).toBeCloseTo(centers[1].y);
        // canvas (960,540) → image (320,180) at the 3x canvas/image scale.
        expect(centers[0].x).toBeCloseTo(320);
        expect(centers[0].y).toBeCloseTo(180);
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

        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
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

    it('round-trips an unmoved point selector bit-identically (§3.2)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        (manager as any).OSD = { Point: FakePoint };
        (manager as any).osdViewer = fakeEditingViewer(4, 2);

        const loaded = {
            id: 'p-1',
            type: 'Annotation',
            body: [],
            target: {
                type: 'SpecificResource',
                source: 'http://example.org/canvas/1',
                selector: { type: 'PointSelector', x: 963, y: 541 },
            },
        };
        // An existing (persisted) point the user selects to edit → save = update.
        (manager as any).store.persistedAnnotations.set('p-1', loaded);

        let editing: any = null;
        const anno = fakeAnnotorious();
        anno.setAnnotations = vi.fn((arr: any[]) => {
            editing = arr[0];
        });
        (manager as any).annotorious = anno;

        await manager.selectAnnotationById('p-1');
        // Annotorious now holds the presentational fragment rect.
        expect(editing.target.selector.type).toBe('FragmentSelector');

        // "Deselect without moving": persist the untouched Annotorious shape.
        await manager.saveAnnotation(editing);

        expect(adapter.update).toHaveBeenCalledTimes(1);
        const [, , saved] = adapter.update.mock.calls[0];
        // The saved selector is the loaded one, verbatim — no centre-derived drift.
        expect(saved.target.selector).toEqual({
            type: 'PointSelector',
            x: 963,
            y: 541,
        });
    });

    it('takes the new rect centre when the point is dragged (§3.2)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        (manager as any).OSD = { Point: FakePoint };
        (manager as any).osdViewer = fakeEditingViewer(4, 2);

        (manager as any).store.persistedAnnotations.set('p-1', {
            id: 'p-1',
            type: 'Annotation',
            body: [],
            target: {
                type: 'SpecificResource',
                source: 'http://example.org/canvas/1',
                selector: { type: 'PointSelector', x: 963, y: 541 },
            },
        });

        let editing: any = null;
        const anno = fakeAnnotorious();
        anno.setAnnotations = vi.fn((arr: any[]) => {
            editing = arr[0];
        });
        (manager as any).annotorious = anno;

        await manager.selectAnnotationById('p-1');

        // Simulate a drag: shift the fragment rect right by 60 image units.
        const rect = parseXywh(editing.target.selector.value);
        const moved = {
            ...editing,
            target: {
                ...editing.target,
                selector: {
                    ...editing.target.selector,
                    value: `xywh=${rect.x + 60},${rect.y},${rect.width},${rect.height}`,
                },
            },
        };

        await manager.saveAnnotation(moved);

        const [, , saved] = adapter.update.mock.calls[0];
        // +60 image px in x → +60 × (1920/640) = +180 canvas px → x = 963 + 180.
        expect(saved.target.selector).toEqual({
            type: 'PointSelector',
            x: 1143,
            y: 541,
        });
    });
});

describe('AnnotationManager point authoring (F17)', () => {
    it('authors a PointSelector at the click point in integer canvas px + stamps + applies prepareDraft', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS); // 1920x1080 canvas / 640x360 image (3x)
        const adapter = createAdapter();
        const manager = new AnnotationManager({
            adapter,
            user: { id: 'u-1', name: 'Ada' },
            extension: {
                prepareDraft: (annotation: any) => ({
                    ...annotation,
                    body: [
                        { type: 'TextualBody', purpose: 'tagging', value: 'x' },
                    ],
                }),
            },
        });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        (manager as any).annotorious = fakeAnnotorious([]);
        (manager as any).osdViewer = fakePointViewer({ x: 100, y: 50 });

        await (manager as any).handlePointClick({
            quick: true,
            position: { x: 0, y: 0 },
        });

        expect(adapter.create).toHaveBeenCalledTimes(1);
        const [manifestId, canvasId, created] = adapter.create.mock.calls[0];
        expect(manifestId).toBe('manifest-1');
        expect(canvasId).toBe('http://example.org/canvas/1');
        // image (100,50) → canvas (300,150) via 3x scale, rounded once (D2).
        expect(created.target).toEqual({
            type: 'SpecificResource',
            source: 'http://example.org/canvas/1',
            selector: { type: 'PointSelector', x: 300, y: 150 },
        });
        // Stamped uniformly (issue 07 / F18).
        expect(created['@context']).toBe('http://www.w3.org/ns/anno.jsonld');
        expect(created.type).toBe('Annotation');
        expect(created.creator).toEqual({ id: 'u-1', name: 'Ada' });
        expect(typeof created.created).toBe('string');
        expect(created.motivation).toBe('commenting');
        // The prepareDraft body survived the create.
        expect(created.body).toEqual([
            { type: 'TextualBody', purpose: 'tagging', value: 'x' },
        ]);
        // Temp id, replaced by the adapter's id via reconciliation (F5).
        expect(created.id).toMatch(/^temp-/);
        // The freshly created point is opened for body editing.
        expect(
            (manager as any).annotorious.setAnnotations,
        ).toHaveBeenCalledTimes(1);
    });

    it('stores identical PointSelectors for the same image point at different zooms', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS);

        const selectors: any[] = [];
        for (const zoom of [1, 8]) {
            const adapter = createAdapter();
            const manager = new AnnotationManager({ adapter });
            (manager as any).store.setCanvas(
                'manifest-1',
                'http://example.org/canvas/1',
            );
            (manager as any).annotorious = fakeAnnotorious([]);
            (manager as any).osdViewer = fakePointViewer({ x: 123, y: 77 }, zoom);

            await (manager as any).handlePointClick({
                quick: true,
                position: { x: 40, y: 40 },
            });

            selectors.push(adapter.create.mock.calls[0][2].target.selector);
        }

        // No zoom-dependent screen-pixel sizing survives — only the point (F17).
        expect(selectors[0]).toEqual(selectors[1]);
        // image (123,77) → canvas (369,231) via 3x scale.
        expect(selectors[0]).toEqual({
            type: 'PointSelector',
            x: 369,
            y: 231,
        });
    });

    it('detects PointSelector targets (direct + wrapped) and ignores id prefixes', () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const manager = new AnnotationManager({ adapter: createAdapter() });
        const isPoint = (a: any) => (manager as any).isPointAnnotation(a);

        expect(
            isPoint({
                id: 'x',
                target: { selector: { type: 'PointSelector', x: 1, y: 2 } },
            }),
        ).toBe(true);
        expect(
            isPoint({
                id: 'x',
                target: {
                    selector: { item: { type: 'PointSelector', x: 1, y: 2 } },
                },
            }),
        ).toBe(true);
        // A fragment rect is a rectangle, even with a legacy `point-` id.
        expect(
            isPoint({
                id: 'point-legacy',
                target: {
                    selector: {
                        type: 'FragmentSelector',
                        value: 'xywh=1,2,3,4',
                    },
                },
            }),
        ).toBe(false);
    });

    it('resolves legacy fragment-center points via getPointCoordinates (D3)', () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const manager = new AnnotationManager({ adapter: createAdapter() });

        const point = (manager as any).getPointCoordinates({
            id: 'point-legacy',
            target: {
                selector: {
                    type: 'FragmentSelector',
                    value: 'xywh=10,20,2,2',
                },
            },
        });

        expect(point).toEqual({ x: 11, y: 21 });
    });
});

describe('AnnotationManager target.source correctness', () => {
    it('forces target.source to the current canvas after navigation (F1)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

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

        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

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
        (manager as any).store.setCanvas(null, null);

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

        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

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

        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

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
        (manager as any).store.persistedAnnotations.set('rect-1', {
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

    it('does not delete a just-saved annotation when the body-save update echo and the editor-teardown clear echo collide (F3/F27)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

        const imageSpaceAnnotation = {
            id: 'rect-1',
            type: 'Annotation',
            body: [],
            target: { source: 'http://example.org/canvas/1' },
        };
        (manager as any).annotorious = fakeAnnotorious([imageSpaceAnnotation]);
        (manager as any).store.persistedAnnotations.set('rect-1', {
            id: 'rect-1',
            type: 'Annotation',
            target: imageSpaceAnnotation.target,
        });
        // The annotation is the one being edited, so teardown targets it.
        (manager as any).activeEditingAnnotationId = 'rect-1';

        // Save a body — persists once (update) and pushes a suppressed
        // updateAnnotation echo back into Annotorious.
        await manager.updateAnnotationBodies('rect-1', [
            { type: 'TextualBody', purpose: 'commenting', value: 'note' },
        ]);
        expect(adapter.update).toHaveBeenCalledTimes(1);

        // The controller closes the editor on a successful save, which clears
        // Annotorious and pushes a *second* (delete) echo for the same id.
        manager.cancelSelection();

        // Annotorious now dispatches both async echoes, update before delete.
        await (manager as any).handleUpdateAnnotation({
            ...imageSpaceAnnotation,
            body: { type: 'TextualBody', purpose: 'commenting', value: 'note' },
        });
        await (manager as any).handleDeleteAnnotation({ id: 'rect-1' });

        // Both echoes are ours; neither may reach the adapter. The just-saved
        // annotation must survive.
        expect(adapter.delete).not.toHaveBeenCalled();
        expect((manager as any).store.has('rect-1')).toBe(true);
        expect((manager as any).suppressedEchoIds.size).toBe(0);
    });

    it('updateAnnotationBodies persists opaque structured bodies verbatim (F29)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue(SCALING_CANVAS);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });

        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

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
        (manager as any).store.persistedAnnotations.set('rect-1', {
            id: 'rect-1',
            type: 'Annotation',
            target: imageSpaceAnnotation.target,
        });

        const structuredBody = {
            type: 'Dataset',
            value: { label: 'Complex body', confidence: 0.9 },
        };

        await manager.updateAnnotationBodies('rect-1', structuredBody);

        expect(adapter.update).toHaveBeenCalledTimes(1);
        const [, , updated] = adapter.update.mock.calls[0];
        expect(updated.body).toEqual(structuredBody);
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
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

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
        (manager as any).store.setCanvas('manifest-1', 'canvas-A');

        // Slow load for canvas A is in flight...
        const loadA = (manager as any).loadAnnotations();
        await flush();
        // ...navigate to canvas B, whose load resolves immediately.
        await manager.handleCanvasChange('manifest-1', 'canvas-B');

        // Now the stale canvas-A load finally resolves — it must be discarded.
        resolveA();
        await loadA;
        await flush();

        expect((manager as any).store.persistedAnnotations.get('B-anno')).toBeTruthy();
        expect(
            (manager as any).store.persistedAnnotations.get('A-anno'),
        ).toBeUndefined();
    });
});

describe('AnnotationManager lazy hydration (F7)', () => {
    const RECT_TARGET = {
        source: 'http://example.org/canvas/1',
        selector: {
            type: 'FragmentSelector',
            conformsTo: 'http://www.w3.org/TR/media-frags/',
            value: 'xywh=10,20,30,40',
        },
    };
    const FULL_BODY = [
        { type: 'TextualBody', purpose: 'commenting', value: 'full note' },
    ];

    it('hydrates a skeleton selection and persists the full body on save', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        adapter.load.mockResolvedValue([
            {
                id: 'anno-1',
                type: 'Annotation',
                target: RECT_TARGET,
                body: [],
                // Adapter marks this as a skeleton on load (the contract).
                __fullBodyLoaded: false,
            },
        ]);
        (adapter as any).hydrate = vi.fn().mockResolvedValue({
            id: 'anno-1',
            type: 'Annotation',
            target: RECT_TARGET,
            body: FULL_BODY,
        });

        const manager = new AnnotationManager({ adapter });
        const selections: any[] = [];
        manager.onSelectionChange = (a) => selections.push(a);
        (manager as any).annotorious = fakeAnnotorious([{ id: 'anno-1' }]);
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

        await (manager as any).loadAnnotations();

        // Marker is read into internal state, then stripped from the cache.
        expect((manager as any).store.hydrationState.get('anno-1')).toBe('skeleton');
        expect(
            (manager as any).store.persistedAnnotations.get('anno-1')
                .__fullBodyLoaded,
        ).toBeUndefined();

        await (manager as any).hydrateAnnotation('anno-1');

        expect((adapter as any).hydrate).toHaveBeenCalledWith(
            'manifest-1',
            'http://example.org/canvas/1',
            'anno-1',
        );
        // The panel (onSelectionChange) receives the full body.
        expect(selections.at(-1).body).toEqual(FULL_BODY);
        expect((manager as any).store.hydrationState.get('anno-1')).toBe('full');
        expect(
            (manager as any).store.persistedAnnotations.get('anno-1').body,
        ).toEqual(FULL_BODY);

        // Saving after hydration persists the FULL body, never the skeleton.
        await manager.saveAnnotation({
            id: 'anno-1',
            type: 'Annotation',
            target: RECT_TARGET,
            body: FULL_BODY,
        });

        expect(adapter.update).toHaveBeenCalledTimes(1);
        const [, , persisted] = adapter.update.mock.calls[0];
        expect(persisted.body).toEqual(FULL_BODY);
    });

    it('stays hydrating (blocking save) while hydrate is unresolved', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        adapter.load.mockResolvedValue([
            {
                id: 'anno-1',
                type: 'Annotation',
                target: RECT_TARGET,
                body: [],
                __fullBodyLoaded: false,
            },
        ]);
        // Never resolves — mimics an in-flight hydrate.
        (adapter as any).hydrate = vi.fn(() => new Promise<never>(() => {}));

        const manager = new AnnotationManager({ adapter });
        const hydrationEvents: boolean[] = [];
        manager.onAnnotationHydrationChange = (v) => hydrationEvents.push(v);
        (manager as any).annotorious = fakeAnnotorious([{ id: 'anno-1' }]);
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

        await (manager as any).loadAnnotations();

        void (manager as any).hydrateAnnotation('anno-1');
        await flush();

        expect((adapter as any).hydrate).toHaveBeenCalledTimes(1);
        // Hydration signaled and never flipped back to false → controller keeps
        // save disabled and the stub body is never persisted.
        expect(hydrationEvents.at(-1)).toBe(true);
        expect(adapter.update).not.toHaveBeenCalled();
        expect(adapter.create).not.toHaveBeenCalled();
    });
});

describe('AnnotationManager teardown (F11, F12)', () => {
    it('removes both viewer handlers and calls adapter.destroy() on destroy', () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        (adapter as any).destroy = vi.fn();
        const manager = new AnnotationManager({ adapter });

        const removeHandler = vi.fn();
        const viewer = {
            world: { getItemCount: () => 0 },
            addHandler: vi.fn(),
            removeHandler,
        };
        manager.init(viewer, 'http://example.org/canvas/1');
        (manager as any).store.persistedAnnotations.set('anno-1', {
            id: 'anno-1',
            type: 'Annotation',
        });
        (manager as any).store.hydrationState.set('anno-1', 'full');

        // Both handlers were registered with retained references.
        expect(viewer.addHandler).toHaveBeenCalledWith(
            'open',
            expect.any(Function),
        );
        expect(viewer.addHandler).toHaveBeenCalledWith(
            'canvas-click',
            expect.any(Function),
        );

        manager.destroy();

        expect(removeHandler).toHaveBeenCalledWith('open', expect.any(Function));
        expect(removeHandler).toHaveBeenCalledWith(
            'canvas-click',
            expect.any(Function),
        );
        expect((adapter as any).destroy).toHaveBeenCalledTimes(1);
        expect((manager as any).store.persistedAnnotations.size).toBe(0);
        expect((manager as any).store.hydrationState.size).toBe(0);
    });
});

describe('AnnotationManager delete echo handling (F27)', () => {
    it('syncs the adapter for an Annotorious-originated delete of a cached annotation', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        (manager as any).store.persistedAnnotations.set('anno-1', {
            id: 'anno-1',
            type: 'Annotation',
        });
        (manager as any).store.hydrationState.set('anno-1', 'full');

        await (manager as any).handleDeleteAnnotation({ id: 'anno-1' });

        expect(adapter.delete).toHaveBeenCalledTimes(1);
        expect(adapter.delete).toHaveBeenCalledWith(
            'manifest-1',
            'http://example.org/canvas/1',
            'anno-1',
        );
        expect((manager as any).store.persistedAnnotations.has('anno-1')).toBe(false);
        expect((manager as any).store.hydrationState.has('anno-1')).toBe(false);
    });

    it("ignores the delete echo produced by the plugin's own clearAnnotations()", async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        (manager as any).store.persistedAnnotations.set('anno-1', {
            id: 'anno-1',
            type: 'Annotation',
        });
        (manager as any).annotorious = fakeAnnotorious([{ id: 'anno-1' }]);

        // Plugin teardown of the editing annotation marks the id for suppression.
        (manager as any).clearAnnotoriousEditingAnnotation();
        expect(
            (manager as any).annotorious.clearAnnotations,
        ).toHaveBeenCalledTimes(1);
        expect((manager as any).suppressedEchoIds.has('anno-1')).toBe(true);

        // The async echo Annotorious dispatches is consumed, never persisted.
        await (manager as any).handleDeleteAnnotation({ id: 'anno-1' });

        expect(adapter.delete).not.toHaveBeenCalled();
        expect((manager as any).suppressedEchoIds.size).toBe(0);
    });

    it('ignores a delete echo for an annotation absent from the cache', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

        // The trash button removes the entry from the cache before Annotorious,
        // so its later echo must not double-delete.
        await (manager as any).handleDeleteAnnotation({ id: 'already-gone' });

        expect(adapter.delete).not.toHaveBeenCalled();
    });
});

describe('AnnotationManager server-id reconciliation (F5)', () => {
    it('re-opens the edited annotation under the server id and routes later writes to it', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        adapter.create.mockImplementation(async (_m, _c, annotation: any) => ({
            ...annotation,
            id: 'https://server/anno/42',
        }));

        const manager = new AnnotationManager({ adapter });
        (manager as any).annotorious = fakeAnnotorious([{ id: 'temp-1' }]);
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        // The freshly drawn annotation is the one open for editing.
        (manager as any).activeEditingAnnotationId = 'temp-1';

        await (manager as any).handleCreateAnnotation({
            id: 'temp-1',
            type: 'Annotation',
            body: [],
            target: { source: 'http://example.org/canvas/1' },
        });
        await flush();

        // Cache keyed by the server id; the temp id is gone.
        expect((manager as any).store.has('https://server/anno/42')).toBe(true);
        expect((manager as any).store.has('temp-1')).toBe(false);
        // Re-opened under the canonical id in Annotorious.
        expect(
            (manager as any).annotorious.setSelected,
        ).toHaveBeenLastCalledWith('https://server/anno/42');
        expect((manager as any).activeEditingAnnotationId).toBe(
            'https://server/anno/42',
        );

        // A later delete targets the server id, not the temp id.
        await manager.deleteAnnotation('https://server/anno/42');
        expect(adapter.delete).toHaveBeenCalledWith(
            'manifest-1',
            'http://example.org/canvas/1',
            'https://server/anno/42',
        );
    });

    it('stamps point and rectangle creates uniformly (F18)', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({
            adapter,
            user: { id: 'u-1', name: 'Ada' },
        });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

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
        await (manager as any).handleCreateAnnotation({
            id: 'point-1',
            type: 'Annotation',
            body: [],
            target: {
                type: 'SpecificResource',
                source: 'http://example.org/canvas/1',
                selector: { type: 'PointSelector', x: 5, y: 6 },
            },
        });

        for (const [, , created] of adapter.create.mock.calls) {
            expect(created['@context']).toBe(
                'http://www.w3.org/ns/anno.jsonld',
            );
            expect(created.type).toBe('Annotation');
            expect(created.creator).toEqual({ id: 'u-1', name: 'Ada' });
            expect(typeof created.created).toBe('string');
            expect(created.motivation).toBe('commenting');
        }
    });
});

describe('AnnotationManager error rollback (F20)', () => {
    it('re-signals the rolled-back selection when an update fails', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        adapter.update.mockRejectedValue(new Error('server down'));
        const manager = new AnnotationManager({ adapter });
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        // The previously-persisted (rolled-back) copy the panel should revert to.
        const cached = {
            id: 'rect-1',
            type: 'Annotation',
            body: [],
            target: { source: 'http://example.org/canvas/1' },
        };
        (manager as any).store.persistedAnnotations.set('rect-1', cached);
        (manager as any).store.hydrationState.set('rect-1', 'full');
        (manager as any).annotorious = fakeAnnotorious([
            { id: 'rect-1', body: [] },
        ]);

        const selections: any[] = [];
        manager.onSelectionChange = (a) => selections.push(a);

        const ok = await manager.updateAnnotationBodies('rect-1', [
            { purpose: 'commenting', value: 'edited' },
        ]);

        expect(ok).toBe(false);
        expect(adapter.update).toHaveBeenCalledTimes(1);
        // Annotorious never received the failed edit.
        expect(
            (manager as any).annotorious.updateAnnotation,
        ).not.toHaveBeenCalled();
        // Selection re-signalled with the rolled-back cached copy.
        expect(selections.at(-1)).toEqual(cached);
        // No host handler → the store records a panel error for the line.
        expect(manager.persistenceError).toEqual({
            op: 'update',
            annotationId: 'rect-1',
        });

        consoleError.mockRestore();
    });

    it('removes the optimistic Annotorious shape when a create fails', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        adapter.create.mockRejectedValue(new Error('nope'));
        const manager = new AnnotationManager({ adapter });
        const anno = fakeAnnotorious([]);
        (manager as any).annotorious = anno;
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        (manager as any).activeEditingAnnotationId = 'rect-1';

        const selections: any[] = [];
        manager.onSelectionChange = (a) => selections.push(a);

        await (manager as any).handleCreateAnnotation({
            id: 'rect-1',
            type: 'Annotation',
            body: [],
            target: { source: 'http://example.org/canvas/1' },
        });

        expect(adapter.create).toHaveBeenCalledTimes(1);
        expect(anno.removeAnnotation).toHaveBeenCalledWith('rect-1');
        // Nothing left cached, selection cleared.
        expect((manager as any).store.has('rect-1')).toBe(false);
        expect(selections.at(-1)).toBeNull();
        expect((manager as any).activeEditingAnnotationId).toBeNull();

        consoleError.mockRestore();
    });

    it('keeps the annotation when a delete fails and reports the error', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        adapter.delete.mockRejectedValue(new Error('offline'));
        const manager = new AnnotationManager({ adapter });
        const anno = fakeAnnotorious([{ id: 'rect-1' }]);
        (manager as any).annotorious = anno;
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );
        (manager as any).store.persistedAnnotations.set('rect-1', {
            id: 'rect-1',
            type: 'Annotation',
        });

        const ok = await manager.deleteAnnotation('rect-1');

        expect(ok).toBe(false);
        expect(anno.removeAnnotation).not.toHaveBeenCalled();
        expect((manager as any).store.has('rect-1')).toBe(true);
        expect(manager.persistenceError).toEqual({
            op: 'delete',
            annotationId: 'rect-1',
        });

        consoleError.mockRestore();
    });
});

describe('AnnotationManager undo/redo editing session (F6)', () => {
    it('clears the open editing session when the edited annotation is undone', async () => {
        getCanvases.mockReset();
        getCanvases.mockReturnValue([]);
        const adapter = createAdapter();
        const manager = new AnnotationManager({ adapter });
        const anno = fakeAnnotorious([{ id: 'temp-1' }]);
        (manager as any).annotorious = anno;
        (manager as any).store.setCanvas(
            'manifest-1',
            'http://example.org/canvas/1',
        );

        // Draw + persist the annotation, then treat it as the one open for edit.
        await (manager as any).handleCreateAnnotation({
            id: 'temp-1',
            type: 'Annotation',
            body: [],
            target: { source: 'http://example.org/canvas/1' },
        });
        (manager as any).activeEditingAnnotationId = 'temp-1';

        const selections: any[] = [];
        manager.onSelectionChange = (a) => selections.push(a);

        expect(manager.canUndo).toBe(true);
        await manager.undo();

        // Storage dropped it and the editing session was torn down.
        expect((manager as any).store.has('temp-1')).toBe(false);
        expect(anno.clearAnnotations).toHaveBeenCalled();
        expect(selections.at(-1)).toBeNull();
        expect((manager as any).activeEditingAnnotationId).toBeNull();
    });
});

describe('AnnotationManager tool resolution (F8)', () => {
    it('point-only config resolves to point and never enables native drawing', () => {
        const manager = new AnnotationManager({
            adapter: createAdapter(),
            tools: ['point'],
        });

        expect(manager.resolvedDefaultTool).toBe('point');
        expect(manager.availableTools).toEqual(['point']);

        const setDrawingEnabled = vi.fn();
        const setDrawingTool = vi.fn();
        (manager as any).annotorious = { setDrawingEnabled, setDrawingTool };
        (manager as any).osdViewer = {
            element: { classList: { add: vi.fn(), remove: vi.fn() } },
        };
        (manager as any).store.setCanvas(null, 'http://example.org/canvas/1');

        (manager as any).updateDrawingMode(true);
        expect(setDrawingEnabled).toHaveBeenLastCalledWith(false);

        // A tool outside the configured set must also never enable drawing,
        // even with drawing turned on.
        setDrawingEnabled.mockClear();
        (manager as any).isDrawingEnabled = true;
        manager.setTool('rectangle');
        expect(setDrawingEnabled).toHaveBeenLastCalledWith(false);
    });

    it('ignores a defaultTool that is not within the tool set', () => {
        const manager = new AnnotationManager({
            adapter: createAdapter(),
            tools: ['polygon'],
            defaultTool: 'rectangle',
        });

        expect(manager.resolvedDefaultTool).toBe('polygon');
        expect(manager.availableTools).toEqual(['polygon']);
    });
});

describe('AnnotationManager.injectStyles CSS single-source (F23)', () => {
    // A viewer element inside a shadow root; getRootNode() returns the ShadowRoot.
    function shadowViewer(): { viewer: any; root: ShadowRoot } {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const element = document.createElement('div');
        root.appendChild(element);
        return { viewer: { element }, root };
    }

    // A viewer element attached to the document; getRootNode() is the Document,
    // so injectStyles takes its document.head path.
    function documentViewer(): { viewer: any } {
        const element = document.createElement('div');
        document.body.appendChild(element);
        return { viewer: { element } };
    }

    it('injects exactly one <style> into a shadow root, carrying the plugin fix CSS', () => {
        const manager = new AnnotationManager({ adapter: createAdapter() });
        const { viewer, root } = shadowViewer();

        (manager as any).injectStyles(viewer);

        const styles = root.querySelectorAll('style#annotorious-fixes');
        expect(styles.length).toBe(1);
        // The plugin's own point-marker override rides along with the imported
        // Annotorious stylesheet. (The bundled `?inline` CSS is stubbed to an
        // empty string under vitest — its presence in the real bundle is covered
        // by the build acceptance steps, not this unit test.)
        expect(styles[0].textContent).toContain('point-selected');
    });

    it('does not duplicate the shadow-root <style> on repeated calls', () => {
        const manager = new AnnotationManager({ adapter: createAdapter() });
        const { viewer, root } = shadowViewer();

        (manager as any).injectStyles(viewer);
        (manager as any).injectStyles(viewer);
        (manager as any).injectStyles(viewer);

        expect(root.querySelectorAll('style#annotorious-fixes').length).toBe(1);
    });

    it('injects one <style> into document.head and does not duplicate it', () => {
        const existing = document.getElementById('annotorious-fixes');
        existing?.remove();

        const manager = new AnnotationManager({ adapter: createAdapter() });
        const { viewer } = documentViewer();

        (manager as any).injectStyles(viewer);
        (manager as any).injectStyles(viewer);

        const styles = document.querySelectorAll(
            'head style#annotorious-fixes',
        );
        expect(styles.length).toBe(1);
        expect(styles[0].textContent).toContain('point-selected');
    });
});
