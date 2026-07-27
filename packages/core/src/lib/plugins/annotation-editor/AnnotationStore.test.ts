import { describe, expect, it, vi } from 'vitest';

const { setUserAnnotations, clearUserAnnotations } = vi.hoisted(() => ({
    setUserAnnotations: vi.fn(),
    clearUserAnnotations: vi.fn(),
}));

vi.mock('../../state/manifests.svelte', () => ({
    manifestsState: {
        setUserAnnotations,
        clearUserAnnotations,
    },
}));

import { AnnotationStore } from './AnnotationStore.svelte';
import type { W3CAnnotation } from './adapters/types';
import type {
    AnnotationPersistenceError,
    AnnotationStorageAdapter,
} from './types';

const MANIFEST = 'manifest-1';
const CANVAS = 'http://example.org/canvas/1';

function anno(id: string): W3CAnnotation {
    return { id, type: 'Annotation', body: [] } as unknown as W3CAnnotation;
}

/**
 * A "docs example" adapter: only the five storage methods over an in-memory Map,
 * with zero knowledge of `manifestsState`. Display sync is entirely the store's
 * job (F10).
 */
function inMemoryAdapter(): AnnotationStorageAdapter {
    const store = new Map<string, W3CAnnotation[]>();
    const key = (m: string, c: string) => `${m}::${c}`;
    return {
        id: 'in-memory',
        name: 'In Memory',
        async load(m, c) {
            return [...(store.get(key(m, c)) ?? [])];
        },
        async create(m, c, annotation) {
            const list = store.get(key(m, c)) ?? [];
            list.push(annotation);
            store.set(key(m, c), list);
        },
        async update(m, c, annotation) {
            const list = store.get(key(m, c)) ?? [];
            const i = list.findIndex((a) => a.id === annotation.id);
            if (i >= 0) list[i] = annotation;
            store.set(key(m, c), list);
        },
        async delete(m, c, id) {
            const list = store.get(key(m, c)) ?? [];
            store.set(
                key(m, c),
                list.filter((a) => a.id !== id),
            );
        },
    };
}

describe('AnnotationStore display sync (F10)', () => {
    it('injects loaded annotations into manifestsState on load', async () => {
        setUserAnnotations.mockClear();
        const adapter = inMemoryAdapter();
        await adapter.create(MANIFEST, CANVAS, anno('a'));

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();

        expect(setUserAnnotations).toHaveBeenLastCalledWith(
            MANIFEST,
            CANVAS,
            [expect.objectContaining({ id: 'a' })],
        );
    });

    it('re-injects the updated set on create, update, and delete', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();

        setUserAnnotations.mockClear();
        await store.persist(anno('a'));
        expect(setUserAnnotations).toHaveBeenLastCalledWith(MANIFEST, CANVAS, [
            expect.objectContaining({ id: 'a' }),
        ]);

        setUserAnnotations.mockClear();
        await store.persist({ ...anno('a'), body: [{ value: 'x' }] } as any);
        expect(setUserAnnotations).toHaveBeenLastCalledWith(MANIFEST, CANVAS, [
            expect.objectContaining({ id: 'a' }),
        ]);

        setUserAnnotations.mockClear();
        await store.delete('a');
        expect(setUserAnnotations).toHaveBeenLastCalledWith(MANIFEST, CANVAS, []);
    });

    it('clears every populated canvas and releases the adapter on destroy', async () => {
        clearUserAnnotations.mockClear();
        const adapter = inMemoryAdapter();
        (adapter as any).destroy = vi.fn();
        const store = new AnnotationStore({ adapter });

        store.setCanvas(MANIFEST, 'canvas-A');
        await store.load();
        store.setCanvas(MANIFEST, 'canvas-B');
        await store.load();

        store.destroy();

        expect(clearUserAnnotations).toHaveBeenCalledWith(MANIFEST, 'canvas-A');
        expect(clearUserAnnotations).toHaveBeenCalledWith(MANIFEST, 'canvas-B');
        expect((adapter as any).destroy).toHaveBeenCalledTimes(1);
    });

    it('reconciles a server-assigned id returned as an annotation (F5)', async () => {
        const adapter = inMemoryAdapter();
        adapter.create = vi.fn(async (_m, _c, annotation) => ({
            ...annotation,
            id: 'https://server/anno/42',
        }));
        adapter.update = vi.fn(async () => undefined);
        adapter.delete = vi.fn(async () => undefined);

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);

        const reconciled: Array<{ oldId: string; canonical: W3CAnnotation }> =
            [];
        store.onReconcileId = (oldId, canonical) =>
            reconciled.push({ oldId, canonical });

        setUserAnnotations.mockClear();
        await store.persist(anno('temp-1'));

        // Cache is now keyed by the server id; the temp id is gone.
        expect(store.has('temp-1')).toBe(false);
        expect(store.has('https://server/anno/42')).toBe(true);
        expect(reconciled).toEqual([
            {
                oldId: 'temp-1',
                canonical: expect.objectContaining({
                    id: 'https://server/anno/42',
                }),
            },
        ]);
        // manifestsState holds the canonical id.
        expect(setUserAnnotations).toHaveBeenLastCalledWith(MANIFEST, CANVAS, [
            expect.objectContaining({ id: 'https://server/anno/42' }),
        ]);

        // Subsequent body save updates under the server id, never re-creates.
        await store.persist({
            ...anno('https://server/anno/42'),
            body: [{ value: 'x' }],
        } as any);
        expect(adapter.update).toHaveBeenCalledTimes(1);
        expect(adapter.update).toHaveBeenLastCalledWith(
            MANIFEST,
            CANVAS,
            expect.objectContaining({ id: 'https://server/anno/42' }),
        );

        // Delete hits the server id.
        await store.delete('https://server/anno/42');
        expect(adapter.delete).toHaveBeenLastCalledWith(
            MANIFEST,
            CANVAS,
            'https://server/anno/42',
        );
    });

    it('reconciles a server id returned as a bare string (F5)', async () => {
        const adapter = inMemoryAdapter();
        adapter.create = vi.fn(async () => 'https://server/anno/7');

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);

        await store.persist(anno('temp-9'));

        expect(store.has('temp-9')).toBe(false);
        expect(store.get('https://server/anno/7')?.id).toBe(
            'https://server/anno/7',
        );
    });

    it('keeps the local id when create returns void (F5)', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);

        const reconciled: string[] = [];
        store.onReconcileId = (oldId) => reconciled.push(oldId);

        await store.persist(anno('local-1'));

        expect(store.has('local-1')).toBe(true);
        expect(reconciled).toEqual([]);
    });

    it('replaces the cached copy when update returns a normalized annotation', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a'));

        adapter.update = vi.fn(async (_m, _c, annotation) => ({
            ...annotation,
            modified: 'server-normalized',
        }));

        await store.persist({ ...anno('a'), body: [{ value: 'y' }] } as any);

        expect(store.get('a')?.modified).toBe('server-normalized');
    });
});

describe('AnnotationStore attribution stamping (F18)', () => {
    it('stamps @context, type, creator, created, and default motivation on create', async () => {
        const adapter = inMemoryAdapter();
        const create = vi.fn(adapter.create);
        adapter.create = create;

        const store = new AnnotationStore({
            adapter,
            user: { id: 'u-1', name: 'Ada' },
        });
        store.setCanvas(MANIFEST, CANVAS);

        await store.persist(anno('a'));

        const [, , stamped] = create.mock.calls[0];
        expect(stamped['@context']).toBe('http://www.w3.org/ns/anno.jsonld');
        expect(stamped.type).toBe('Annotation');
        expect(stamped.creator).toEqual({ id: 'u-1', name: 'Ada' });
        expect(typeof stamped.created).toBe('string');
        expect(stamped.motivation).toBe('commenting');
    });

    it('honors config.defaultMotivation and never overwrites a host motivation', async () => {
        const adapter = inMemoryAdapter();
        const create = vi.fn(adapter.create);
        adapter.create = create;

        const store = new AnnotationStore({
            adapter,
            defaultMotivation: 'tagging',
        });
        store.setCanvas(MANIFEST, CANVAS);

        await store.persist(anno('a'));
        expect(create.mock.calls[0][2].motivation).toBe('tagging');

        await store.persist({
            ...anno('b'),
            motivation: 'describing',
        } as any);
        expect(create.mock.calls[1][2].motivation).toBe('describing');
    });

    it('refreshes modified on update', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a'));

        const update = vi.fn(adapter.update);
        adapter.update = update;

        await store.persist({ ...anno('a'), body: [{ value: 'z' }] } as any);

        expect(typeof update.mock.calls[0][2].modified).toBe('string');
    });

    it('a pure five-method adapter displays after a create + reload round-trip', async () => {
        setUserAnnotations.mockClear();
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();

        await store.persist(anno('round-trip'));

        // A fresh store over the same adapter (simulating a reload) displays it,
        // with no manifestsState knowledge in the adapter.
        setUserAnnotations.mockClear();
        const reloaded = new AnnotationStore({ adapter });
        reloaded.setCanvas(MANIFEST, CANVAS);
        const loaded = await reloaded.load();

        expect(loaded.map((a) => a.id)).toEqual(['round-trip']);
        expect(setUserAnnotations).toHaveBeenLastCalledWith(MANIFEST, CANVAS, [
            expect.objectContaining({ id: 'round-trip' }),
        ]);
    });
});

describe('AnnotationStore error surface + rollback (F20)', () => {
    it('reports a failed create, leaves cache/display at pre-op state, and retry re-runs it', async () => {
        const adapter = inMemoryAdapter();
        const realCreate = adapter.create;
        let attempts = 0;
        adapter.create = vi.fn(async (m, c, a) => {
            attempts += 1;
            if (attempts === 1) throw new Error('boom');
            return realCreate(m, c, a);
        });

        const errors: AnnotationPersistenceError[] = [];
        const store = new AnnotationStore({
            adapter,
            onPersistenceError: (e) => errors.push(e),
        });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();

        setUserAnnotations.mockClear();
        const ok = await store.persist(anno('temp-1'));

        expect(ok).toBe(false);
        // Cache + display untouched by the failed create.
        expect(store.has('temp-1')).toBe(false);
        expect(setUserAnnotations).not.toHaveBeenCalled();
        expect(errors).toHaveLength(1);
        expect(errors[0].op).toBe('create');
        expect(errors[0].annotationId).toBe('temp-1');
        expect(errors[0].manifestId).toBe(MANIFEST);
        expect(errors[0].canvasId).toBe(CANVAS);

        // retry() re-invokes the adapter with the same payload; on success it
        // applies normally (cache + display advance).
        await errors[0].retry();
        expect(store.has('temp-1')).toBe(true);
        expect(setUserAnnotations).toHaveBeenLastCalledWith(MANIFEST, CANVAS, [
            expect.objectContaining({ id: 'temp-1' }),
        ]);
    });

    it('reports a failed update, keeps the previous cached copy, and retry re-runs it', async () => {
        const adapter = inMemoryAdapter();
        const errors: AnnotationPersistenceError[] = [];
        const store = new AnnotationStore({
            adapter,
            onPersistenceError: (e) => errors.push(e),
        });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a')); // successful create — no error pushed

        let fail = true;
        adapter.update = vi.fn(async () => {
            if (fail) throw new Error('server down');
            return undefined;
        });

        const ok = await store.persist({
            ...anno('a'),
            body: [{ value: 'edited' }],
        } as any);

        expect(ok).toBe(false);
        // Previous copy still current (its body was []).
        expect(store.get('a')?.body).toEqual([]);
        expect(errors[0].op).toBe('update');
        expect(errors[0].annotationId).toBe('a');

        fail = false;
        await errors[0].retry();
        expect(store.get('a')?.body).toEqual([{ value: 'edited' }]);
    });

    it('reports a failed delete, restores (keeps) the entry, and retry re-runs it', async () => {
        const adapter = inMemoryAdapter();
        const errors: AnnotationPersistenceError[] = [];
        const store = new AnnotationStore({
            adapter,
            onPersistenceError: (e) => errors.push(e),
        });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a'));

        let fail = true;
        adapter.delete = vi.fn(async () => {
            if (fail) throw new Error('nope');
        });

        setUserAnnotations.mockClear();
        const ok = await store.delete('a');

        expect(ok).toBe(false);
        expect(store.has('a')).toBe(true);
        expect(setUserAnnotations).not.toHaveBeenCalled();
        expect(errors[0].op).toBe('delete');
        expect(errors[0].annotationId).toBe('a');

        fail = false;
        await errors[0].retry();
        expect(store.has('a')).toBe(false);
    });

    it('records a dismissible panel error when no handler is configured, and clears it on the next success', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const adapter = inMemoryAdapter();
        let fail = true;
        adapter.create = vi.fn(async () => {
            if (fail) throw new Error('x');
        });

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);

        await store.persist(anno('a'));
        expect(store.panelError).toEqual({ op: 'create', annotationId: 'a' });
        expect(consoleError).toHaveBeenCalled();

        // A subsequent successful operation clears the line.
        fail = false;
        await store.persist(anno('b'));
        expect(store.panelError).toBeNull();

        consoleError.mockRestore();
    });

    it('dismissError() clears the panel error', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const adapter = inMemoryAdapter();
        adapter.create = vi.fn(async () => {
            throw new Error('x');
        });

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a'));

        expect(store.panelError).not.toBeNull();
        store.dismissError();
        expect(store.panelError).toBeNull();

        consoleError.mockRestore();
    });

    it('keeps accepting saves of the same id after a rejection (queue slot cleared)', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const adapter = inMemoryAdapter();
        const realCreate = adapter.create;
        let attempts = 0;
        adapter.create = vi.fn(async (m, c, a) => {
            attempts += 1;
            if (attempts === 1) throw new Error('x');
            return realCreate(m, c, a);
        });

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);

        const first = await store.persist(anno('a'));
        expect(first).toBe(false);

        // Same id → same queue slot; a failed save must not deadlock it.
        const second = await store.persist(anno('a'));
        expect(second).toBe(true);
        expect(store.has('a')).toBe(true);

        consoleError.mockRestore();
    });
});

describe('AnnotationStore undo/redo (F6)', () => {
    it('undoes a create by deleting it, then redoes by re-creating', async () => {
        const adapter = inMemoryAdapter();
        const deleteSpy = vi.fn(adapter.delete);
        adapter.delete = deleteSpy;
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();

        await store.persist(anno('a'));
        expect(store.canUndo).toBe(true);
        expect(store.canRedo).toBe(false);

        // Undo removes it from the cache, the adapter, and the display overlay.
        setUserAnnotations.mockClear();
        await store.undo();
        expect(deleteSpy).toHaveBeenCalledWith(MANIFEST, CANVAS, 'a');
        expect(store.has('a')).toBe(false);
        expect(setUserAnnotations).toHaveBeenLastCalledWith(MANIFEST, CANVAS, []);
        expect(store.canUndo).toBe(false);
        expect(store.canRedo).toBe(true);

        // Redo re-creates it (a fresh create path — reconciliation honored).
        await store.redo();
        expect(store.has('a')).toBe(true);
        expect(store.canUndo).toBe(true);
        expect(store.canRedo).toBe(false);
    });

    it('undoes an update by restoring the previous copy to the adapter', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a')); // body []
        await store.persist({ ...anno('a'), body: [{ value: 'v2' }] } as any);
        expect(store.get('a')?.body).toEqual([{ value: 'v2' }]);

        const updateSpy = vi.fn(adapter.update);
        adapter.update = updateSpy;

        await store.undo();

        // The adapter receives the previous copy (its body, verbatim).
        expect(updateSpy).toHaveBeenCalledTimes(1);
        const [, , sent] = updateSpy.mock.calls[0];
        expect(sent.id).toBe('a');
        expect(sent.body).toEqual([]);
        expect(store.get('a')?.body).toEqual([]);

        // Redo re-applies the edit.
        await store.redo();
        expect(store.get('a')?.body).toEqual([{ value: 'v2' }]);
    });

    it('undoes a delete by re-creating the removed copy', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist({ ...anno('a'), body: [{ value: 'keep' }] } as any);
        await store.delete('a');
        expect(store.has('a')).toBe(false);

        const createSpy = vi.fn(adapter.create);
        adapter.create = createSpy;

        await store.undo();

        expect(createSpy).toHaveBeenCalledTimes(1);
        expect(store.has('a')).toBe(true);
        expect(store.get('a')?.body).toEqual([{ value: 'keep' }]);
    });

    it('undo of a server-reconciled create deletes the canonical id (F5)', async () => {
        const adapter = inMemoryAdapter();
        adapter.create = vi.fn(async (_m, _c, annotation) => ({
            ...annotation,
            id: 'https://server/anno/42',
        }));
        const deleteSpy = vi.fn(async () => undefined);
        adapter.delete = deleteSpy;

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('temp-1'));
        expect(store.has('https://server/anno/42')).toBe(true);

        await store.undo();

        // The undo deletes the canonical (server) id, never the temp id.
        expect(deleteSpy).toHaveBeenCalledWith(
            MANIFEST,
            CANVAS,
            'https://server/anno/42',
        );
        expect(store.has('https://server/anno/42')).toBe(false);
    });

    it('leaves the op on the undo stack and reports the error when a replay fails', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a'));

        // Undoing the create replays a delete; make it reject.
        adapter.delete = vi.fn(async () => {
            throw new Error('offline');
        });

        await store.undo();

        // The failed replay did not lose the op or advance state.
        expect(store.canUndo).toBe(true);
        expect(store.canRedo).toBe(false);
        expect(store.has('a')).toBe(true);
        expect(store.panelError?.op).toBe('delete');

        consoleError.mockRestore();
    });

    it('clears both stacks on canvas change', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.persist(anno('a'));
        await store.undo();
        expect(store.canUndo).toBe(false);
        expect(store.canRedo).toBe(true);

        store.setCanvas(MANIFEST, 'http://example.org/canvas/2');

        expect(store.canUndo).toBe(false);
        expect(store.canRedo).toBe(false);
    });

    it('caps the undo stack at 50 entries', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);

        // 60 creates → 60 undo entries, capped to 50.
        for (let i = 0; i < 60; i += 1) {
            await store.persist(anno(`a-${i}`));
        }

        let undos = 0;
        while (store.canUndo) {
            await store.undo();
            undos += 1;
            if (undos > 100) throw new Error('undo did not terminate');
        }
        expect(undos).toBe(50);
    });

    it('notifies onReplay with the affected annotation (present, then removed)', async () => {
        const adapter = inMemoryAdapter();
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);

        const events: Array<{ id: string; present: boolean }> = [];
        store.onReplay = (id, annotation) =>
            events.push({ id, present: annotation !== null });

        await store.persist(anno('a'));
        await store.undo(); // create undone → removed
        await store.redo(); // re-created → present

        expect(events).toEqual([
            { id: 'a', present: false },
            { id: 'a', present: true },
        ]);
    });
});

describe('AnnotationStore resolve() (F7/F14)', () => {
    it('discards a hydrate that settles after a canvas change — no stale cache write', async () => {
        let releaseHydrate: (value: W3CAnnotation) => void = () => {};
        const hydratePromise = new Promise<W3CAnnotation>((resolve) => {
            releaseHydrate = resolve;
        });

        const adapter: AnnotationStorageAdapter = {
            id: 'skeleton',
            name: 'Skeleton',
            async load(_m, c) {
                // Only the first canvas holds the skeleton annotation.
                return c === CANVAS
                    ? [{ ...anno('anno-1'), __fullBodyLoaded: false }]
                    : [];
            },
            async create() {},
            async update() {},
            async delete() {},
            hydrate: vi.fn(() => hydratePromise),
        };

        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();
        expect(store.isSkeleton('anno-1')).toBe(true);

        // Resolve the skeleton for editing — the hydrate is now in flight.
        const resolving = store.resolve('anno-1');

        // Navigate to a new canvas before the hydrate settles, exactly as
        // handleCanvasChange does: point at the new canvas, then load it (which
        // bumps the load-race token and leaves the cache empty).
        store.setCanvas(MANIFEST, 'http://example.org/canvas/2');
        await store.load();

        // The stale hydrate finally settles. It targets the previous canvas, so
        // it must not poison the new canvas's (empty) cache (F14).
        releaseHydrate({
            ...anno('anno-1'),
            body: [{ value: 'full' }],
        } as unknown as W3CAnnotation);
        await resolving;

        expect(store.has('anno-1')).toBe(false);
        expect(store.get('anno-1')).toBeNull();
    });
});
