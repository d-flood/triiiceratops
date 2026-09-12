/**
 * The host seams the panel owns: the `extension` hooks and the hydration of a
 * skeleton annotation when one is opened.
 *
 * They are asserted here rather than through a drawn shape because this is
 * where they are decided — the controller holds the config and the runtime
 * context, and hands the two write hooks to the drawing layer through the
 * session. A create that skipped `prepareDraft` and a body editor that opened
 * on an unhydrated skeleton are both silent failures in a host's data, which
 * is what these guard.
 */
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AnnotationEditorController from './AnnotationEditorController.svelte';
import { AnnotationStore } from './AnnotationStore.svelte';
import { VIEWER_STATE_KEY } from './contextKey';
import { DrawingSession } from './drawingSession.svelte';
import type { W3CAnnotation } from './adapters/types';
import type {
    AnnotationEditorConfig,
    AnnotationEditorRuntimeContext,
    AnnotationStorageAdapter,
} from './types';

const MANIFEST = 'manifest-1';
const CANVAS = 'canvas-1';

function anno(id: string, value: string): W3CAnnotation {
    return {
        id,
        type: 'Annotation',
        body: [{ type: 'TextualBody', value }],
        target: { source: CANVAS },
    } as unknown as W3CAnnotation;
}

/** An adapter whose `load` returns skeletons, so hydration has work to do. */
function skeletonAdapter(): AnnotationStorageAdapter {
    return {
        id: 'skeleton',
        name: 'Skeleton',
        async load() {
            return [{ ...anno('anno-1', ''), __fullBodyLoaded: false }];
        },
        async hydrate() {
            return anno('anno-1', 'the full body');
        },
        async create() {},
        async update() {},
        async delete() {},
    };
}

let target: HTMLElement;

beforeEach(() => {
    target = document.createElement('div');
    document.body.append(target);
});

afterEach(() => {
    target.remove();
    vi.restoreAllMocks();
});

function viewerState(bus: { requestEdit: (id: string) => void }) {
    return {
        manifestId: MANIFEST,
        canvasId: CANVAS,
        annotatableCanvasIds: [CANVAS],
        annotationEditBus: bus,
    };
}

async function mountController(
    config: AnnotationEditorConfig,
    store?: AnnotationStore,
) {
    const session = new DrawingSession();
    // The controller replaces this on mount; the property is how core's shape
    // overlay reaches the plugin, so the test drives selection through it.
    const bus = {
        requestEdit: (_: string) => {},
        activeEditAnnotationId: null,
    };
    const app = mount(AnnotationEditorController, {
        target,
        props: { config, store, session },
        context: new Map<symbol, unknown>([
            [VIEWER_STATE_KEY, viewerState(bus)],
        ]),
    });
    await tick();
    return { app, session, bus };
}

describe('the host extension hooks', () => {
    it('hands the drawing layer the draft and save hooks while the panel is mounted', async () => {
        const prepareDraft = vi.fn(
            (
                annotation: W3CAnnotation,
                _context: AnnotationEditorRuntimeContext,
            ) => ({ ...annotation, motivation: 'describing' }),
        );
        const beforeSave = vi.fn(async (annotation: W3CAnnotation) => ({
            ...annotation,
            'dc:source': 'host',
        }));

        const { app, session } = await mountController({
            extension: { prepareDraft, beforeSave },
        });

        const drafted = session.prepareDraft!(anno('temp-1', ''));
        expect(drafted).toMatchObject({ motivation: 'describing' });
        expect(prepareDraft.mock.calls[0]?.[1]).toMatchObject({
            manifestId: MANIFEST,
            canvasId: CANVAS,
        });

        await expect(session.beforeSave!(drafted)).resolves.toMatchObject({
            'dc:source': 'host',
        });

        await unmount(app);
        expect(session.prepareDraft).toBeNull();
        expect(session.beforeSave).toBeNull();
    });

    it('falls back to the flat prepareAnnotation when no extension hook is given', async () => {
        const prepareAnnotation = vi.fn((annotation: W3CAnnotation) => ({
            ...annotation,
            motivation: 'tagging',
        }));

        const { app, session } = await mountController({ prepareAnnotation });

        expect(session.prepareDraft!(anno('temp-1', ''))).toMatchObject({
            motivation: 'tagging',
        });
        expect(prepareAnnotation).toHaveBeenCalledTimes(1);

        await unmount(app);
    });

    it('notifies the host when a selection opens, and not before', async () => {
        const onSelectionChange = vi.fn();
        const store = new AnnotationStore({ adapter: skeletonAdapter() });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();

        const { app, bus } = await mountController(
            { extension: { onSelectionChange } },
            store,
        );

        // Nothing is selected at mount, so the host has heard nothing yet.
        expect(onSelectionChange).not.toHaveBeenCalled();

        bus.requestEdit('anno-1');
        await tick();
        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        expect(onSelectionChange.mock.calls[0]?.[0]).toMatchObject({
            id: 'anno-1',
        });
        expect(onSelectionChange.mock.calls[0]?.[1]).toMatchObject({
            canvasId: CANVAS,
        });

        await unmount(app);
    });
});

describe('opening a skeleton annotation', () => {
    it('hydrates its full body before the body editor can save over it', async () => {
        const adapter = skeletonAdapter();
        const hydrate = vi.spyOn(adapter, 'hydrate');
        const store = new AnnotationStore({ adapter });
        store.setCanvas(MANIFEST, CANVAS);
        await store.load();
        expect(store.isSkeleton('anno-1')).toBe(true);

        const { app, bus } = await mountController({}, store);

        bus.requestEdit('anno-1');
        // The fetch, then the assignment it resolves into.
        await tick();
        await tick();

        expect(hydrate).toHaveBeenCalledWith(MANIFEST, CANVAS, 'anno-1');
        expect(store.isSkeleton('anno-1')).toBe(false);
        expect(target.querySelector('textarea')?.value).toBe('the full body');

        await unmount(app);
    });
});
