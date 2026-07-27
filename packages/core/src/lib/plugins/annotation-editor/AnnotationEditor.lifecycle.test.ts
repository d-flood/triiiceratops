import { describe, expect, it, vi } from 'vitest';

/**
 * End-to-end lifecycle integration suite (F28). Drives the *real*
 * `AnnotationManager` + `AnnotationStore` against a mocked adapter and a mocked
 * OSD/Annotorious pair through the whole flow a user exercises:
 *
 *   init → draw → edit body → canvas change → reload → delete → destroy
 *
 * At each step it asserts both the adapter call counts/payloads and the
 * read-only display contents (`manifestsState.setUserAnnotations`). This is the
 * harness that would have caught the review's data-loss bugs
 * (F1 wrong target.source, F2 unpersisted draft, F3 double-save, F4 load-per-save,
 * F7 hydration, F11/F12 teardown leaks); keep it adapter-agnostic and fast so
 * later tickets can extend it with new steps rather than new bespoke mocks.
 */

const KEY = (manifestId: string, canvasId: string) =>
    `${manifestId}::${canvasId}`;

// A stateful stand-in for `manifestsState` so the test can read back exactly
// what the plugin is displaying for any canvas at any point in the flow.
const { manifestsState, displayed, clearUserAnnotations } = vi.hoisted(() => {
    const displayed = new Map<string, unknown[]>();
    const clearUserAnnotations = vi.fn((m: string, c: string) => {
        displayed.delete(`${m}::${c}`);
    });
    return {
        displayed,
        clearUserAnnotations,
        manifestsState: {
            getCanvases: vi.fn(() => []),
            setUserAnnotations: vi.fn(
                (m: string, c: string, annos: unknown[]) => {
                    displayed.set(`${m}::${c}`, annos);
                },
            ),
            clearUserAnnotations,
        },
    };
});

vi.mock('../../state/manifests.svelte', () => ({ manifestsState }));

import type { Mock } from 'vitest';
import { AnnotationManager } from './AnnotationManager.svelte';
import type { AnnotationStorageAdapter } from './types';
import type { W3CAnnotation } from './adapters/types';

const MANIFEST = 'manifest-1';
const CANVAS_1 = 'http://example.org/canvas/1';
const CANVAS_2 = 'http://example.org/canvas/2';

// Drain microtasks + one macrotask so the void-called async event handlers
// (`createAnnotation` etc.) and per-id save queue settle before assertions.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A recording adapter: five pure-storage functions over an in-memory,
 * manifest+canvas-keyed map, wrapped in `vi.fn` spies so the test can assert
 * call counts and payloads. Deliberately knows nothing about `manifestsState`,
 * ids, stamping, or caching — the plugin owns all of that (F10).
 */
function recordingAdapter(): AnnotationStorageAdapter {
    const store = new Map<string, W3CAnnotation[]>();
    return {
        id: 'recording',
        name: 'Recording Adapter',
        load: vi.fn(async (m: string, c: string) => [
            ...(store.get(KEY(m, c)) ?? []),
        ]),
        create: vi.fn(async (m: string, c: string, annotation: W3CAnnotation) => {
            const list = store.get(KEY(m, c)) ?? [];
            list.push(annotation);
            store.set(KEY(m, c), list);
        }),
        update: vi.fn(async (m: string, c: string, annotation: W3CAnnotation) => {
            const list = store.get(KEY(m, c)) ?? [];
            const i = list.findIndex((a) => a.id === annotation.id);
            if (i >= 0) list[i] = annotation;
            else list.push(annotation);
            store.set(KEY(m, c), list);
        }),
        delete: vi.fn(async (m: string, c: string, id: string) => {
            const list = store.get(KEY(m, c)) ?? [];
            store.set(
                KEY(m, c),
                list.filter((a) => a.id !== id),
            );
        }),
        destroy: vi.fn(),
    };
}

/**
 * A fake Annotorious annotator that captures the lifecycle handlers the manager
 * registers in `setupEvents()` (so the test can `emit()` a real draw event) and
 * mirrors Annotorious's own in-memory set so `getAnnotations()`/body edits see
 * what "the user drew".
 */
function fakeAnnotorious() {
    const handlers = new Map<string, (arg: unknown) => void>();
    const held: any[] = [];
    return {
        _held: held,
        on: vi.fn((event: string, handler: (arg: unknown) => void) => {
            handlers.set(event, handler);
        }),
        emit(event: string, arg: unknown) {
            handlers.get(event)?.(arg);
        },
        getAnnotations: vi.fn(() => held),
        setAnnotations: vi.fn((list: any[]) => {
            held.length = 0;
            held.push(...(list ?? []));
        }),
        addAnnotation: vi.fn((a: any) => {
            held.push(a);
        }),
        removeAnnotation: vi.fn((id: string) => {
            const i = held.findIndex((a) => a.id === id);
            if (i >= 0) held.splice(i, 1);
        }),
        updateAnnotation: vi.fn((a: any) => {
            const i = held.findIndex((x) => x.id === a.id);
            if (i >= 0) held[i] = a;
            else held.push(a);
        }),
        clearAnnotations: vi.fn(() => {
            held.length = 0;
        }),
        setSelected: vi.fn(),
        setUser: vi.fn(),
        setVisible: vi.fn(),
        setDrawingEnabled: vi.fn(),
        setDrawingTool: vi.fn(),
        cancelSelection: vi.fn(),
        destroy: vi.fn(),
    };
}

// A viewer that stays "unopened" (worldCount 0) so `init()` defers annotator
// creation to its `open` handler — letting the test wire the fake annotator
// itself instead of triggering the real dynamic imports. Records handler
// registration/removal so teardown can be asserted (F12).
function fakeViewer() {
    return {
        world: { getItemCount: () => 0 },
        element: { classList: { add: vi.fn(), remove: vi.fn() } },
        addHandler: vi.fn(),
        removeHandler: vi.fn(),
    };
}

const rectAnnotation = () => ({
    id: 'rect-1',
    type: 'Annotation',
    body: [],
    target: {
        source: CANVAS_1,
        selector: {
            type: 'FragmentSelector',
            conformsTo: 'http://www.w3.org/TR/media-frags/',
            value: 'xywh=10,20,30,40',
        },
    },
});

describe('AnnotationEditor full lifecycle integration (F28)', () => {
    it('drives init → draw → edit body → canvas change → reload → delete → destroy, keeping storage and display in agreement', async () => {
        displayed.clear();
        clearUserAnnotations.mockClear();
        manifestsState.setUserAnnotations.mockClear();

        const adapter = recordingAdapter();
        const anno = fakeAnnotorious();
        const viewer = fakeViewer();

        const manager = new AnnotationManager({
            adapter,
            user: { id: 'u1', name: 'Tester' },
        } as any);

        // --- init: registers viewer handlers, defers annotator creation ---
        manager.init(viewer, CANVAS_1);
        expect(viewer.addHandler).toHaveBeenCalledWith(
            'open',
            expect.any(Function),
        );
        expect(viewer.addHandler).toHaveBeenCalledWith(
            'canvas-click',
            expect.any(Function),
        );

        // Stand in for the deferred initAnnotorious(): attach the fake annotator
        // and wire the lifecycle events exactly as the real init path does.
        (manager as any).annotorious = anno;
        (manager as any).setupEvents();

        // The controller calls handleCanvasChange right after init; this seeds
        // the manifest + canvas and performs the initial (empty) load.
        await manager.handleCanvasChange(MANIFEST, CANVAS_1);
        await flush();
        expect(adapter.load).toHaveBeenCalledTimes(1);
        expect(adapter.load).toHaveBeenLastCalledWith(MANIFEST, CANVAS_1);
        expect(displayed.get(KEY(MANIFEST, CANVAS_1))).toEqual([]);

        // --- draw: a real Annotorious createAnnotation event ---
        // Annotorious holds the drawn shape and dispatches the event.
        anno._held.push(rectAnnotation());
        anno.emit('createAnnotation', rectAnnotation());
        await flush();

        // Persisted exactly once as a create (F2/F3/F4): no load-per-save, no
        // double save, no update.
        expect(adapter.create).toHaveBeenCalledTimes(1);
        expect(adapter.update).not.toHaveBeenCalled();
        expect(adapter.load).toHaveBeenCalledTimes(1); // still just the initial load
        const [, , created] = (adapter.create as Mock).mock.calls[0];
        // target.source is the current canvas (F1), and the plugin stamped a
        // complete W3C/IIIF annotation (F18).
        expect(created.target.source).toBe(CANVAS_1);
        expect(created['@context']).toBe('http://www.w3.org/ns/anno.jsonld');
        expect(created.type).toBe('Annotation');
        expect(created.motivation).toBe('commenting');
        expect(created.creator).toEqual({ id: 'u1', name: 'Tester' });
        expect(typeof created.created).toBe('string');
        // Display now shows the one annotation.
        expect(displayed.get(KEY(MANIFEST, CANVAS_1))).toHaveLength(1);

        // --- edit body: persists once as an update, suppresses the echo ---
        const body = [
            { type: 'TextualBody', purpose: 'commenting', value: 'a note' },
        ];
        const ok = await manager.updateAnnotationBodies('rect-1', body);
        await flush();
        expect(ok).toBe(true);
        expect(adapter.create).toHaveBeenCalledTimes(1); // no second create
        expect(adapter.update).toHaveBeenCalledTimes(1);
        const displayedAfterEdit = displayed.get(
            KEY(MANIFEST, CANVAS_1),
        ) as W3CAnnotation[];
        expect(displayedAfterEdit).toHaveLength(1);
        expect(displayedAfterEdit[0].body).toEqual(body);

        // The suppressed echo Annotorious would fire must not persist again (F3).
        anno.emit('updateAnnotation', { ...rectAnnotation(), body });
        await flush();
        expect(adapter.update).toHaveBeenCalledTimes(1);

        // --- canvas change: cache resets, new canvas loads empty ---
        await manager.handleCanvasChange(MANIFEST, CANVAS_2);
        await flush();
        expect(adapter.load).toHaveBeenLastCalledWith(MANIFEST, CANVAS_2);
        expect((manager as any).store.has('rect-1')).toBe(false);
        expect(displayed.get(KEY(MANIFEST, CANVAS_2))).toEqual([]);

        // --- reload: navigate back; the annotation round-trips from storage ---
        await manager.handleCanvasChange(MANIFEST, CANVAS_1);
        await flush();
        expect((manager as any).store.has('rect-1')).toBe(true);
        const reloaded = displayed.get(
            KEY(MANIFEST, CANVAS_1),
        ) as W3CAnnotation[];
        expect(reloaded).toHaveLength(1);
        // The edited body survived persistence + reload (not the pre-edit body).
        expect(reloaded[0].body).toEqual(body);

        // --- delete: removed from storage and display ---
        const deleted = await manager.deleteAnnotation('rect-1');
        await flush();
        expect(deleted).toBe(true);
        expect(adapter.delete).toHaveBeenCalledTimes(1);
        expect(adapter.delete).toHaveBeenLastCalledWith(
            MANIFEST,
            CANVAS_1,
            'rect-1',
        );
        expect(displayed.get(KEY(MANIFEST, CANVAS_1))).toEqual([]);

        // --- destroy: handlers removed, overlay cleared, adapter released ---
        manager.destroy();
        expect(viewer.removeHandler).toHaveBeenCalledWith(
            'open',
            expect.any(Function),
        );
        expect(viewer.removeHandler).toHaveBeenCalledWith(
            'canvas-click',
            expect.any(Function),
        );
        expect(clearUserAnnotations).toHaveBeenCalledWith(MANIFEST, CANVAS_1);
        expect((adapter as any).destroy).toHaveBeenCalledTimes(1);
        expect(displayed.has(KEY(MANIFEST, CANVAS_1))).toBe(false);
    });
});
