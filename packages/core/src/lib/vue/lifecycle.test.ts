/**
 * What unmounting a `<TriiiceratopsViewer>` leaves behind: nothing.
 *
 * Vue's own `emit` refuses to fire on an unmounted instance, so a leaked DOM
 * listener is invisible from the consumer's side — a stale callback simply never
 * runs. These tests therefore measure the resources directly: the listeners
 * installed on the element and the `ViewerState.subscribe` registrations the
 * wrapper's selector runtime owns.
 */

import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue';
import type { App, VNode } from 'vue';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { ViewerState } from '../state/viewer.svelte.js';
import { VIEWER_EVENT_CHANNELS } from '../framework/index.js';
import { VIEWER_STATE_AVAILABLE_EVENT } from '../framework/index.js';
import { useViewerSelector } from './selector.js';
import type { TriiiceratopsViewerInstance } from './handle.js';
import { TriiiceratopsViewer } from './viewer.js';

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

let container: HTMLDivElement;
let app: App | null = null;

beforeAll(() => {
    installInertAnimations();
    defineRealViewerElement();
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
});

afterEach(async () => {
    app?.unmount();
    app = null;
    container.remove();
    vi.restoreAllMocks();
    await settle(0);
});

/**
 * The prototype in a DOM node's own chain that owns `key`.
 *
 * The global `EventTarget` in this runner is Node's, not the document's, so
 * spying on `EventTarget.prototype` would instrument a class no element in the
 * page inherits from — and silently count nothing.
 */
function prototypeOwning(node: object, key: string): EventTarget {
    let current: object | null = node;
    while (current && !Object.prototype.hasOwnProperty.call(current, key)) {
        current = Object.getPrototypeOf(current) as object | null;
    }
    if (!current) throw new Error(`no prototype in the chain owns ${key}`);
    return current as EventTarget;
}

/** Live DOM listeners on `<triiiceratops-viewer>` elements, per event type. */
function trackViewerListeners(): Map<string, number> {
    const counts = new Map<string, number>();
    const bump = (type: string, delta: number): void => {
        counts.set(type, (counts.get(type) ?? 0) + delta);
    };
    const probe = document.createElement(VIEWER_TAG);
    const target = prototypeOwning(probe, 'addEventListener');
    const add = target.addEventListener;
    const remove = target.removeEventListener;

    vi.spyOn(target, 'addEventListener').mockImplementation(function (
        this: EventTarget,
        ...args: Parameters<EventTarget['addEventListener']>
    ) {
        if ((this as Element).localName === VIEWER_TAG) bump(args[0], 1);
        return add.apply(this, args);
    });
    vi.spyOn(target, 'removeEventListener').mockImplementation(function (
        this: EventTarget,
        ...args: Parameters<EventTarget['removeEventListener']>
    ) {
        if ((this as Element).localName === VIEWER_TAG) bump(args[0], -1);
        return remove.apply(this, args);
    });

    return counts;
}

/** Count the `ViewerState.subscribe` registrations that are still live. */
function trackViewerStateSubscriptions(): { live: () => number } {
    let live = 0;
    const original = ViewerState.prototype.subscribe;
    vi.spyOn(ViewerState.prototype, 'subscribe').mockImplementation(function (
        this: ViewerState,
        ...args: Parameters<ViewerState['subscribe']>
    ) {
        live += 1;
        const unsubscribe = original.apply(this, args);
        let released = false;
        return () => {
            if (!released) {
                released = true;
                live -= 1;
            }
            unsubscribe();
        };
    });
    return { live: () => live };
}

describe('teardown', () => {
    it('removes every DOM listener it installed', async () => {
        const counts = trackViewerListeners();

        app = createApp(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        onStateChange: () => {},
                        onViewerError: () => {},
                    }),
            }),
        );
        app.mount(container);
        await settle();

        // One per translated channel, plus the availability listener.
        for (const channel of VIEWER_EVENT_CHANNELS) {
            expect(counts.get(channel)).toBe(1);
        }
        expect(counts.get(VIEWER_STATE_AVAILABLE_EVENT)).toBe(1);

        app.unmount();
        app = null;
        await settle();

        for (const [type, live] of counts) {
            expect({ type, live }).toEqual({ type, live: 0 });
        }
    });

    it('owns one viewer-state subscription and releases it, idempotently', async () => {
        const subscriptions = trackViewerStateSubscriptions();

        // No plugins: every plugin activation owns its own subscription, so a
        // viewer with plugins would legitimately show more than one.
        app = createApp(
            defineComponent({
                setup() {
                    const viewer =
                        shallowRef<TriiiceratopsViewerInstance | null>(null);
                    const dock = useViewerSelector(
                        viewer,
                        (state) => state.dockSide,
                    );
                    const open = useViewerSelector(
                        viewer,
                        (state) => state.toolbarOpen,
                    );
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: viewer }),
                            // Two projections, one runtime, one subscription.
                            h(
                                'span',
                                `${String(dock.value)}${String(open.value)}`,
                            ),
                        ]);
                },
            }),
        );
        app.mount(container);
        await settle();
        await nextTick();

        expect(subscriptions.live()).toBe(1);

        const instance = app;
        instance.unmount();
        app = null;
        await settle();
        expect(subscriptions.live()).toBe(0);

        // Unmounting again is a no-op rather than a double release.
        instance.unmount();
        await settle();
        expect(subscriptions.live()).toBe(0);
    });
});
