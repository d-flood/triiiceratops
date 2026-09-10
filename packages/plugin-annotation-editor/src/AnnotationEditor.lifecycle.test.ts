import { describe, expect, it, vi } from 'vitest';

/**
 * End-to-end lifecycle integration suite (F28). Drives the *real*
 * `AnnotationStore` against a recording adapter and a stand-in display state
 * through the whole flow a user exercises:
 *
 *   load → create → edit body → canvas change → reload → delete → destroy
 *
 * At each step it asserts both the adapter call counts/payloads and the
 * read-only display contents (the viewer's `setUserAnnotations`). This is the
 * harness that would have caught the review's data-loss bugs
 * (F1 wrong target.source, F2 unpersisted draft, F4 load-per-save, F11/F12
 * teardown leaks); keep it adapter-agnostic and fast so later tickets can
 * extend it with new steps rather than new bespoke mocks.
 */

const KEY = (manifestId: string, canvasId: string) =>
    `${manifestId}::${canvasId}`;

import type { Mock } from 'vitest';
import { AnnotationStore } from './AnnotationStore.svelte';
import type { AnnotationStorageAdapter } from './types';
import type { W3CAnnotation } from './adapters/types';

// A stateful stand-in for the owning viewer's display state so the test can read
// back exactly what the plugin is displaying for any canvas at any point in the
// flow. The store display-syncs through the viewer's state (ADR 0007), not the
// page-shared manifest cache.
const displayed = new Map<string, unknown[]>();
const setUserAnnotations = vi.fn((m: string, c: string, annos: unknown[]) => {
    displayed.set(`${m}::${c}`, annos);
});
const clearUserAnnotations = vi.fn((m: string, c: string) => {
    displayed.delete(`${m}::${c}`);
});
const displayStateStub = { setUserAnnotations, clearUserAnnotations };

const MANIFEST = 'manifest-1';
const CANVAS_1 = 'http://example.org/canvas/1';
const CANVAS_2 = 'http://example.org/canvas/2';

/**
 * A recording adapter: five pure-storage functions over an in-memory,
 * manifest+canvas-keyed map, wrapped in `vi.fn` spies so the test can assert
 * call counts and payloads. Deliberately knows nothing about the display state,
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
        create: vi.fn(
            async (m: string, c: string, annotation: W3CAnnotation) => {
                const list = store.get(KEY(m, c)) ?? [];
                list.push(annotation);
                store.set(KEY(m, c), list);
            },
        ),
        update: vi.fn(
            async (m: string, c: string, annotation: W3CAnnotation) => {
                const list = store.get(KEY(m, c)) ?? [];
                const i = list.findIndex((a) => a.id === annotation.id);
                if (i >= 0) list[i] = annotation;
                else list.push(annotation);
                store.set(KEY(m, c), list);
            },
        ),
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

/** The shape a rectangle tool hands the store: canvas-space, unstamped. */
const rectAnnotation = (): W3CAnnotation => ({
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
    it('drives load → create → edit body → canvas change → reload → delete → destroy, keeping storage and display in agreement', async () => {
        displayed.clear();
        clearUserAnnotations.mockClear();
        setUserAnnotations.mockClear();

        const adapter = recordingAdapter();
        const store = new AnnotationStore({
            adapter,
            user: { id: 'u1', name: 'Tester' },
        });
        store.setDisplayState(displayStateStub);

        // --- load: the canvas is seeded and its (empty) set displayed ---
        store.setCanvas(MANIFEST, CANVAS_1);
        await store.load();
        expect(adapter.load).toHaveBeenCalledTimes(1);
        expect(adapter.load).toHaveBeenLastCalledWith(MANIFEST, CANVAS_1);
        expect(displayed.get(KEY(MANIFEST, CANVAS_1))).toEqual([]);

        // --- create: the drawn shape is persisted exactly once ---
        expect(await store.persist(rectAnnotation())).toBe(true);

        // No load-per-save and no second write (F2/F4).
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

        // --- edit body: persists once as an update, not a second create ---
        const body = [
            { type: 'TextualBody', purpose: 'commenting', value: 'a note' },
        ];
        const ok = await store.persist({ ...rectAnnotation(), body });
        expect(ok).toBe(true);
        expect(adapter.create).toHaveBeenCalledTimes(1); // no second create
        expect(adapter.update).toHaveBeenCalledTimes(1);
        const displayedAfterEdit = displayed.get(
            KEY(MANIFEST, CANVAS_1),
        ) as W3CAnnotation[];
        expect(displayedAfterEdit).toHaveLength(1);
        expect(displayedAfterEdit[0].body).toEqual(body);

        // --- canvas change: cache resets, new canvas loads empty ---
        store.setCanvas(MANIFEST, CANVAS_2);
        await store.load();
        expect(adapter.load).toHaveBeenLastCalledWith(MANIFEST, CANVAS_2);
        expect(store.has('rect-1')).toBe(false);
        expect(displayed.get(KEY(MANIFEST, CANVAS_2))).toEqual([]);

        // --- reload: navigate back; the annotation round-trips from storage ---
        store.setCanvas(MANIFEST, CANVAS_1);
        await store.load();
        expect(store.has('rect-1')).toBe(true);
        const reloaded = displayed.get(
            KEY(MANIFEST, CANVAS_1),
        ) as W3CAnnotation[];
        expect(reloaded).toHaveLength(1);
        // The edited body survived persistence + reload (not the pre-edit body).
        expect(reloaded[0].body).toEqual(body);

        // --- delete: removed from storage and display ---
        expect(await store.delete('rect-1')).toBe(true);
        expect(adapter.delete).toHaveBeenCalledTimes(1);
        expect(adapter.delete).toHaveBeenLastCalledWith(
            MANIFEST,
            CANVAS_1,
            'rect-1',
        );
        expect(displayed.get(KEY(MANIFEST, CANVAS_1))).toEqual([]);

        // --- destroy: overlays cleared, adapter released ---
        store.destroy();
        expect(clearUserAnnotations).toHaveBeenCalledWith(MANIFEST, CANVAS_1);
        expect((adapter as { destroy?: Mock }).destroy).toHaveBeenCalledTimes(
            1,
        );
        expect(displayed.has(KEY(MANIFEST, CANVAS_1))).toBe(false);
    });
});
