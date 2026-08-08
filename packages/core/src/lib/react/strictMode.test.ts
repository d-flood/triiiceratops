/**
 * React 19 Strict Mode: one handle, one binding, one subscription.
 *
 * Strict Mode double-invokes render bodies and `useState` initializers, and
 * simulates an immediate unmount/remount of every effect. A wrapper that
 * created its binding during render, or that never tore one down, would end up
 * with two `viewerstateavailable` listeners, two selector runtimes, and two
 * `ViewerState.subscribe` registrations for one viewer — all of which are
 * invisible until a page has several viewers and starts leaking work.
 *
 * These assertions are deliberately about observable consequences (live DOM
 * listeners, live core subscriptions, published handles, plugin restarts)
 * rather than hook call counts.
 */

import { act, createElement, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { definePlugin } from '@triiiceratops/plugin-sdk';

import { configureLogging, type LogLevel } from '../logging/logger.js';
import { ViewerState } from '../state/viewer.svelte.js';
import { VIEWER_STATE_AVAILABLE_EVENT } from '../types/viewerElement.js';
import type { SdkPlugin } from '../types/plugin.js';
import {
    getSelectorRuntime,
    type TriiiceratopsViewerElement,
    type ViewerHandle,
    type ViewerHandleSlot,
} from '../framework/index.js';
import { useViewerHandle } from './handle.js';
import { useViewerSelector } from './selector.js';
import { TriiiceratopsViewer } from './viewer.js';

vi.mock('openseadragon', async () => {
    const { createOsdModuleMock } =
        await import('../test/utils/realViewerElement.js');
    return createOsdModuleMock();
});

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

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
    root = createRoot(container);
});

afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container.remove();
    configureLogging({ debug: false, sink: null });
    vi.restoreAllMocks();
    await settle(0);
});

async function render(node: ReactNode): Promise<void> {
    await act(async () => {
        root?.render(node);
    });
    await act(async () => {
        await settle();
    });
}

function viewerElement(): TriiiceratopsViewerElement {
    const element = container.querySelector(VIEWER_TAG);
    if (!element) throw new Error(`no <${VIEWER_TAG}> was rendered`);
    return element as TriiiceratopsViewerElement;
}

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

/**
 * Count the DOM listeners currently installed on `<triiiceratops-viewer>`
 * elements, per event type, by wrapping the prototype methods for the duration
 * of the test.
 */
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

function countingPlugin(name: string, mounts: string[]): SdkPlugin {
    return definePlugin({
        name,
        version: '1.0.0',
        coreRange: '>=1.0.0-rc.0',
        pluginApiRange: '^1.0.0',
        requiredCapabilities: [],
        icon: { kind: 'svg', inner: '<circle />', viewBox: '0 0 1 1' },
        target: 'flyout',
        dismiss: 'explicit',
        view: {
            mount() {
                mounts.push(name);
                return () => {};
            },
        },
    }) as unknown as SdkPlugin;
}

describe('Strict Mode double invocation', () => {
    it('leaves one handle, one binding, and one live core subscription', async () => {
        const listeners = trackViewerListeners();
        const subscriptions = trackViewerStateSubscriptions();
        const published: Array<ViewerHandle | null> = [];
        let slot: ViewerHandleSlot | null = null;

        function App(): ReactNode {
            const handle = useViewerHandle();
            slot = handle;
            // A reader too, so the selector runtime is exercised, not just
            // created.
            useViewerSelector(handle, (state) => state.toolbarOpen);
            return createElement(TriiiceratopsViewer, { handle });
        }

        await render(createElement(StrictMode, null, createElement(App)));

        const box = slot as unknown as ViewerHandleSlot;
        box.subscribe(() => published.push(box.get()));

        const element = viewerElement();
        const state = element.viewerState!;

        // One availability listener and one listener per translated channel.
        expect(listeners.get(VIEWER_STATE_AVAILABLE_EVENT)).toBe(1);
        expect(listeners.get('statechange')).toBe(1);
        expect(listeners.get('pluginerror')).toBe(1);

        // One selector runtime for this viewer, and exactly one live
        // `ViewerState.subscribe` registration behind it. (A plugin activation
        // would legitimately add its own; this viewer has none.)
        expect(getSelectorRuntime(state)).toBeDefined();
        expect(subscriptions.live()).toBe(1);

        // One handle, and it is the live binding's.
        const handle = box.get()!;
        expect(handle.element).toBe(element);
        expect(handle.state).toBe(state);

        // A command changes nothing about the binding: no republished handle,
        // no extra subscription.
        await act(async () => {
            state.toggleToolbar();
            await settle();
        });
        expect(published).toEqual([]);
        expect(subscriptions.live()).toBe(1);
    });

    it('activates a plugin exactly once across the simulated remount', async () => {
        const mounts: string[] = [];
        const plugin = countingPlugin('strict-probe', mounts);

        function App(): ReactNode {
            // A parent that rebuilds the array every render, which is the
            // ordinary React case.
            return createElement(TriiiceratopsViewer, { plugins: [plugin] });
        }

        await render(createElement(StrictMode, null, createElement(App)));
        await render(createElement(StrictMode, null, createElement(App)));

        expect(mounts).toEqual(['strict-probe']);
    });

    it('does not warn that a Strict Mode handle was never used', async () => {
        const warnings: string[] = [];
        configureLogging({
            debug: true,
            sink: (level: LogLevel, args: readonly unknown[]) => {
                if (level === 'warn') warnings.push(String(args[0]));
            },
        });

        function App(): ReactNode {
            const handle = useViewerHandle();
            return createElement(TriiiceratopsViewer, {
                handle,
                config: { debug: true },
            });
        }

        await render(createElement(StrictMode, null, createElement(App)));
        // The warning is deferred by a macrotask, so give it room to misfire.
        await act(async () => {
            await settle();
        });

        expect(
            warnings.filter((message) => message.includes('never passed')),
        ).toEqual([]);
    });

    it('releases everything on unmount', async () => {
        const listeners = trackViewerListeners();
        const subscriptions = trackViewerStateSubscriptions();
        let slot: ViewerHandleSlot | null = null;

        function App(): ReactNode {
            const handle = useViewerHandle();
            slot = handle;
            return createElement(TriiiceratopsViewer, { handle });
        }

        await render(createElement(StrictMode, null, createElement(App)));
        const state = viewerElement().viewerState!;

        await act(async () => root?.unmount());
        root = null;

        expect(listeners.get(VIEWER_STATE_AVAILABLE_EVENT)).toBe(0);
        expect(listeners.get('statechange')).toBe(0);
        expect(subscriptions.live()).toBe(0);
        expect(getSelectorRuntime(state)).toBeUndefined();
        expect((slot as unknown as ViewerHandleSlot).get()).toBeNull();
    });
});
