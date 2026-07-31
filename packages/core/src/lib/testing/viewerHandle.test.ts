/**
 * `createTestViewerHandle()` — the headless consumer testing helper.
 *
 * The claims worth doubting here are the ones the helper would be worthless
 * without: that the state is REAL (real commands, real batched notifications,
 * not a stub), that its selector runtime is registered in the very registry the
 * framework helpers consult, that nothing DOM-ish or networked is set up behind
 * the caller's back, and that disposal actually releases the one underlying
 * `ViewerState.subscribe` rather than merely looking tidy.
 *
 * Framework integration is proved separately, against real React and Vue
 * components (`react.consumer.test.ts`, `vue.consumer.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VIEWER_ELEMENT_TAG } from '../browser-runtime.js';
import { getSelectorRuntime } from '../framework/index.js';
import { ViewerState } from '../state/viewer.svelte.js';
import {
    createTestViewerHandle,
    flush,
    type TestViewerHandle,
} from './index.js';

/**
 * A minimal OpenSeadragon stand-in. The kit ships none deliberately (SPEC.md
 * Testing Decisions) — a `frame`-cadence projection needs only the handler pair
 * plus whatever the projection itself reads.
 */
function createOsdStub(): {
    stub: unknown;
    zoom: { value: number };
    emit(event: string): void;
    handlerCount(): number;
} {
    const handlers = new Map<string, Set<() => void>>();
    const zoom = { value: 1 };
    const stub = {
        addHandler(event: string, handler: () => void) {
            const set = handlers.get(event) ?? new Set();
            set.add(handler);
            handlers.set(event, set);
        },
        removeHandler(event: string, handler: () => void) {
            handlers.get(event)?.delete(handler);
        },
        viewport: { getZoom: () => zoom.value },
    };
    return {
        stub,
        zoom,
        emit(event: string): void {
            for (const handler of [...(handlers.get(event) ?? [])]) handler();
        },
        handlerCount(): number {
            let total = 0;
            for (const set of handlers.values()) total += set.size;
            return total;
        },
    };
}

/** Records every `ViewerState.subscribe` and whether its unsubscribe ran. */
function trackSubscriptions(): { live(): number; total(): number } {
    const records: { released: boolean }[] = [];
    const original = ViewerState.prototype.subscribe;
    vi.spyOn(ViewerState.prototype, 'subscribe').mockImplementation(function (
        this: ViewerState,
        ...args: Parameters<ViewerState['subscribe']>
    ) {
        const off = original.apply(this, args);
        const record = { released: false };
        records.push(record);
        return () => {
            record.released = true;
            off();
        };
    });
    return {
        live: () => records.filter((record) => !record.released).length,
        total: () => records.length,
    };
}

let handles: TestViewerHandle[] = [];

function make(
    ...args: Parameters<typeof createTestViewerHandle>
): TestViewerHandle {
    const handle = createTestViewerHandle(...args);
    handles.push(handle);
    return handle;
}

beforeEach(() => {
    handles = [];
});

afterEach(() => {
    for (const handle of handles) handle.dispose();
    handles = [];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('the state is real', () => {
    it('is a live ViewerState whose commands notify on the batched flush', async () => {
        const handle = make();

        expect(handle.state).toBeInstanceOf(ViewerState);

        let woke = 0;
        const off = handle.state.subscribe(() => {
            woke++;
        });

        handle.state.setCanvas('https://example.org/canvas/2');
        // Batched, not synchronous — the real production timing.
        expect(woke).toBe(0);
        await flush();

        expect(woke).toBe(1);
        expect(handle.state.canvasId).toBe('https://example.org/canvas/2');
        off();
    });

    it('applies fixtures through the real commands', async () => {
        const handle = make({
            fixtures: { activeLocale: 'de', config: { toolbarOpen: true } },
        });
        await flush();

        expect(handle.state.activeLocale).toBe('de');
        expect(handle.state.toolbarOpen).toBe(true);
    });

    it('gives every handle its own isolated state', async () => {
        const first = make();
        const second = make();

        expect(first.state).not.toBe(second.state);
        first.state.setCanvas('https://example.org/canvas/first');
        await flush();

        expect(second.state.canvasId).not.toBe(
            'https://example.org/canvas/first',
        );
    });
});

describe('the selector runtime', () => {
    it('is registered in the registry the framework helpers consult', () => {
        const handle = make();
        const runtime = getSelectorRuntime(handle.state);

        expect(runtime).toBeDefined();
    });

    it('projects real state changes through a real projection', async () => {
        const handle = make();
        const runtime = getSelectorRuntime(handle.state);
        const projection = runtime?.createProjection(
            (state) => state.canvasId ?? 'none',
        );
        let woke = 0;
        const off = projection?.subscribe(() => {
            woke++;
        });

        expect(projection?.read()).toBe('none');
        handle.state.setCanvas('https://example.org/canvas/3');
        await flush();

        expect(woke).toBe(1);
        expect(projection?.read()).toBe('https://example.org/canvas/3');
        off?.();
    });

    it('uses ONE underlying ViewerState.subscribe per handle', () => {
        const subscriptions = trackSubscriptions();
        make();

        expect(subscriptions.total()).toBe(1);
    });
});

describe("cadence: 'frame' through the injected OSD stub", () => {
    it('wakes a frame projection from the stub’s own animation events', async () => {
        const handle = make();
        const osd = createOsdStub();
        const runtime = getSelectorRuntime(handle.state);
        const projection = runtime?.createProjection(
            (state) => state.osdViewer?.viewport.getZoom() ?? 0,
            { cadence: 'frame' },
        );
        let woke = 0;
        const off = projection?.subscribe(() => {
            woke++;
        });

        // No OSD yet: nothing to attach to, and the projection reads the
        // honest absence rather than a fabricated value.
        expect(projection?.read()).toBe(0);
        expect(osd.handlerCount()).toBe(0);

        handle.setOsdViewer(osd.stub);
        await flush();

        expect(handle.state.osdViewer).toBe(osd.stub);
        expect(osd.handlerCount()).toBeGreaterThan(0);
        expect(projection?.read()).toBe(1);

        // A pure OSD-side change: no viewer-state notification exists for it,
        // which is exactly why the frame cadence has to carry it.
        const wokeBeforeAnimation = woke;
        osd.zoom.value = 4;
        osd.emit('animation');

        expect(woke).toBe(wokeBeforeAnimation + 1);
        expect(projection?.read()).toBe(4);
        off?.();
    });

    it('detaches the frame ticker on disposal', async () => {
        const handle = make();
        const osd = createOsdStub();
        const runtime = getSelectorRuntime(handle.state);
        const projection = runtime?.createProjection(
            (state) => state.osdViewer?.viewport.getZoom() ?? 0,
            { cadence: 'frame' },
        );
        projection?.subscribe(() => {});
        handle.setOsdViewer(osd.stub);
        await flush();
        expect(osd.handlerCount()).toBeGreaterThan(0);

        handle.dispose();

        expect(osd.handlerCount()).toBe(0);
    });
});

describe('the inert element', () => {
    it('is a detached host that reports the handle’s own state', () => {
        const handle = make();

        expect(handle.element.localName).toBe(VIEWER_ELEMENT_TAG);
        expect(handle.element.isConnected).toBe(false);
        expect(handle.element.parentNode).toBeNull();
        expect(handle.element.viewerState).toBe(handle.state);
    });

    it('defines no custom element and dispatches no viewer events', async () => {
        const handle = make();
        const seen: string[] = [];
        for (const channel of [
            'statechange',
            'canvaschange',
            'manifestchange',
            'viewerstateavailable',
        ]) {
            handle.element.addEventListener(channel, () => seen.push(channel));
        }

        handle.state.setCanvas('https://example.org/canvas/4');
        await flush();

        expect(seen).toEqual([]);
        // Nothing registered the tag, so nothing was upgraded either.
        expect(customElements.get(VIEWER_ELEMENT_TAG)).toBeUndefined();
    });

    it('performs no network access', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const handle = make({
            fixtures: {
                manifest: {
                    id: 'https://example.org/manifest',
                    json: {
                        '@context': 'x',
                        id: 'https://example.org/manifest',
                    },
                },
            },
        });
        handle.state.setCanvas('https://example.org/canvas/5');
        await flush();

        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('the handle is both shapes a framework helper accepts', () => {
    it('publishes itself through the slot contract', () => {
        const handle = make();

        expect(handle.get()).toBe(handle);
        expect(handle.state).toBe(handle.get()?.state);
        expect(handle.element).toBe(handle.get()?.element);
    });

    it('notifies slot subscribers when the handle goes away', () => {
        const handle = make();
        let woke = 0;
        const off = handle.subscribe(() => {
            woke++;
        });

        handle.dispose();

        expect(woke).toBe(1);
        expect(handle.get()).toBeNull();
        off();
    });

    it('never warns that it was created but never passed to a viewer', () => {
        const handle = make();
        // Already claimed by its own inert host, so arming is a no-op that
        // still returns an idempotent canceller.
        const cancel = handle.armUnboundWarning();
        cancel();
        cancel();

        expect(handle.get()).toBe(handle);
    });
});

describe('disposal', () => {
    it('removes the underlying subscription', () => {
        const subscriptions = trackSubscriptions();
        const handle = make();
        expect(subscriptions.live()).toBe(1);

        handle.dispose();

        expect(subscriptions.live()).toBe(0);
    });

    it('deregisters the selector runtime', () => {
        const handle = make();
        expect(getSelectorRuntime(handle.state)).toBeDefined();

        handle.dispose();

        expect(getSelectorRuntime(handle.state)).toBeUndefined();
    });

    it('is idempotent', () => {
        const subscriptions = trackSubscriptions();
        const handle = make();
        let woke = 0;
        const off = handle.subscribe(() => {
            woke++;
        });

        handle.dispose();
        handle.dispose();
        handle.dispose();

        expect(woke).toBe(1);
        expect(subscriptions.live()).toBe(0);
        expect(subscriptions.total()).toBe(1);
        off();
    });

    it('leaks no subscription across many handles in one file', () => {
        const subscriptions = trackSubscriptions();
        for (let index = 0; index < 25; index++) {
            createTestViewerHandle().dispose();
        }

        expect(subscriptions.total()).toBe(25);
        expect(subscriptions.live()).toBe(0);
    });
});
