import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';

import { configureLogging, type LogLevel } from '../logging/logger.js';
import { ViewerState } from '../state/viewer.svelte.js';
import { VIEWER_STATE_AVAILABLE_EVENT } from '../types/viewerElement.js';
import { createViewerBinding } from './binding.js';
import { createViewerHandleSlot } from './handle.js';
import { getSelectorRuntime } from './runtimeRegistry.js';
import type { TriiiceratopsViewerElement } from './types.js';

/**
 * Binding, handle publication, and repeatable re-availability, driven against
 * the REAL custom element.
 *
 * Availability timing is the whole subject here, and it is entirely the
 * element's: the property is populated before the event is dispatched, the
 * event arrives a microtask after `connectedCallback` finishes its own await,
 * and a detach long enough to destroy the inner viewer produces a completely
 * new `ViewerState` and a second event. A double would have to encode the very
 * assumptions under test.
 *
 * Registration is driven through the binding's injected `ensureRegistered`
 * seam. The element is registered directly by the test, exactly as
 * `element.ts` does, because what these tests are about is what the wrapper
 * does with an element — not how the bundle got loaded (that is
 * `registration.test.ts`).
 */

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

type Element = TriiiceratopsViewerElement & { id: string };

const mounted: HTMLElement[] = [];
const disposables: Array<() => void> = [];

beforeAll(() => {
    installInertAnimations();
    defineRealViewerElement();
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

afterEach(async () => {
    for (const dispose of disposables.splice(0)) dispose();
    for (const element of mounted.splice(0)) element.remove();
    configureLogging({ debug: false, sink: null });
    await settle(0);
});

function createElement(id?: string): Element {
    const element = document.createElement(VIEWER_TAG) as Element;
    if (id) element.setAttribute('id', id);
    mounted.push(element);
    return element;
}

async function connect(element: HTMLElement): Promise<void> {
    document.body.appendChild(element);
    await settle();
}

/** A binding controller that is torn down after the test, whatever happens. */
function makeBinding(
    options: Parameters<typeof createViewerBinding>[0] = {},
): ReturnType<typeof createViewerBinding> {
    const controller = createViewerBinding({
        ensureRegistered: async () => {},
        ...options,
    });
    disposables.push(() => controller.destroy());
    return controller;
}

function captureLogs(): Array<{ level: LogLevel; message: string }> {
    const records: Array<{ level: LogLevel; message: string }> = [];
    configureLogging({
        debug: true,
        sink: (level, args) => records.push({ level, message: args.join(' ') }),
    });
    return records;
}

describe('listen-then-check', () => {
    it('binds to an element whose state is already available', async () => {
        const element = createElement();
        await connect(element);
        expect(element.viewerState).toBeDefined();

        const changes = vi.fn();
        const controller = makeBinding({ onChange: changes });
        controller.attach(element);

        // No await: the property was read synchronously during attach.
        expect(controller.binding?.state).toBe(element.viewerState);
        expect(controller.handle?.element).toBe(element);
        expect(changes).toHaveBeenCalledTimes(1);

        // The event for that state fired long ago; nothing rebinds.
        await settle();
        expect(changes).toHaveBeenCalledTimes(1);
    });

    it('binds to an element whose state becomes available later', async () => {
        const element = createElement();
        const changes = vi.fn();
        const controller = makeBinding({ onChange: changes });

        // Attached while the element is not even connected: there is nothing
        // to read, so only the listener can catch the state.
        controller.attach(element);
        expect(controller.handle).toBeNull();
        expect(changes).toHaveBeenCalledTimes(0);

        await connect(element);

        expect(controller.binding?.state).toBe(element.viewerState);
        expect(changes).toHaveBeenCalledTimes(1);
    });

    it('binds once when the property read and the event report the same state', async () => {
        const element = createElement();
        await connect(element);
        const controller = makeBinding();
        controller.attach(element);
        const first = controller.binding;

        // The overlap a late-initializing wrapper hits: it read the property
        // AND then receives the announcement for that same state.
        element.dispatchEvent(
            new CustomEvent(VIEWER_STATE_AVAILABLE_EVENT, {
                detail: element.viewerState,
                bubbles: true,
                composed: true,
            }),
        );

        expect(controller.binding).toBe(first);
        expect(controller.handle).toBe(first?.handle);
    });

    it('installs the availability listener before triggering registration', async () => {
        const element = createElement();
        const order: string[] = [];
        const originalAdd = element.addEventListener.bind(element);
        element.addEventListener = ((
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions,
        ) => {
            if (type === VIEWER_STATE_AVAILABLE_EVENT) order.push('listen');
            originalAdd(type, listener, options);
        }) as typeof element.addEventListener;

        const controller = makeBinding({
            ensureRegistered: async () => {
                order.push('register');
            },
        });
        controller.attach(element);

        expect(order).toEqual(['listen', 'register']);
    });
});

describe('registration failures', () => {
    it('hands the rejection to the wrapper for framework-native surfacing', async () => {
        const element = createElement();
        const failure = new Error('element bundle unavailable');
        const onRegistrationError = vi.fn();
        const controller = makeBinding({
            ensureRegistered: async () => {
                throw failure;
            },
            onRegistrationError,
        });

        controller.attach(element);
        await settle(0);

        expect(onRegistrationError).toHaveBeenCalledTimes(1);
        expect(onRegistrationError).toHaveBeenCalledWith(failure);
    });

    it('requests registration once per attached element', async () => {
        const element = createElement();
        const ensureRegistered = vi.fn(async () => {});
        const controller = makeBinding({ ensureRegistered });

        controller.attach(element);
        controller.attach(element);
        controller.attach(element);
        await settle(0);

        expect(ensureRegistered).toHaveBeenCalledTimes(1);
    });
});

describe('the handle and its selector runtime', () => {
    it('publishes a two-member handle whose state is the element’s own', async () => {
        const slot = createViewerHandleSlot();
        const element = createElement();
        const controller = makeBinding({ handle: slot });
        controller.attach(element);
        await connect(element);

        const handle = slot.get();
        expect(handle).toBe(controller.handle);
        expect(Object.keys(handle!)).toEqual(['element', 'state']);
        expect(handle!.element).toBe(element);
        // A type-level view of the SAME live object — identity comparisons hold.
        expect(handle!.state).toBe(element.viewerState);
    });

    it('resolves the runtime from the handle’s state, not from the handle', async () => {
        const element = createElement();
        const controller = makeBinding();
        controller.attach(element);
        await connect(element);

        const handle = controller.handle!;
        expect(getSelectorRuntime(handle.state)).toBe(
            controller.binding?.runtime,
        );
        expect(getSelectorRuntime(undefined)).toBeUndefined();
        expect(getSelectorRuntime(new ViewerState())).toBeUndefined();
    });

    it('gives each viewer its own state, runtime, and handle', async () => {
        const a = createElement('viewer-a');
        const b = createElement('viewer-b');
        const slotA = createViewerHandleSlot();
        const slotB = createViewerHandleSlot();
        const controllerA = makeBinding({ handle: slotA });
        const controllerB = makeBinding({ handle: slotB });

        controllerA.attach(a);
        controllerB.attach(b);
        await connect(a);
        await connect(b);

        expect(slotA.get()!.state).not.toBe(slotB.get()!.state);
        expect(controllerA.binding!.runtime).not.toBe(
            controllerB.binding!.runtime,
        );
        expect(getSelectorRuntime(slotA.get()!.state)).toBe(
            controllerA.binding!.runtime,
        );
        expect(getSelectorRuntime(slotB.get()!.state)).toBe(
            controllerB.binding!.runtime,
        );
    });

    it('throws when a second viewer claims a bound handle', async () => {
        const slot = createViewerHandleSlot();
        const a = createElement('viewer-a');
        const b = createElement('viewer-b');
        makeBinding({ handle: slot }).attach(a);
        const second = makeBinding({ handle: slot });

        expect(() => second.attach(b)).toThrow(/already bound/);
        expect(slot.get()).toBeNull();
        await connect(a);
        expect(slot.get()!.element).toBe(a);
    });
});

describe('repeatable availability', () => {
    it('rebinds after a detach-and-reattach cycle and rebuilds the handle', async () => {
        const slot = createViewerHandleSlot();
        const element = createElement();
        const controller = makeBinding({ handle: slot });
        controller.attach(element);
        await connect(element);

        const first = controller.binding!;
        const firstHandle = slot.get();

        // What Vue's <KeepAlive> does on every deactivation: detach long enough
        // for Svelte to destroy the inner component and its ViewerState.
        element.remove();
        await settle();
        expect(element.viewerState).toBeUndefined();

        document.body.appendChild(element);
        await settle();

        const second = controller.binding!;
        expect(second.state).not.toBe(first.state);
        expect(second.state).toBe(element.viewerState);
        expect(second.runtime).not.toBe(first.runtime);
        expect(slot.get()).not.toBe(firstHandle);
        expect(slot.get()).toBe(second.handle);
        expect(slot.get()!.state).toBe(element.viewerState);
    });

    it('swaps runtimes atomically, leaving nothing subscribed to the disposed one', async () => {
        const element = createElement();
        const controller = makeBinding();
        controller.attach(element);
        await connect(element);

        const firstState = controller.binding!.state;
        const firstRuntime = controller.binding!.runtime;

        // A projection a consumer is already holding through the first binding.
        const stale = firstRuntime.createProjection((s) => s.toolbarOpen);
        const staleWakeups: number[] = [];
        stale.subscribe(() => staleWakeups.push(1));
        firstState.toggleToolbar();
        await tick();
        expect(staleWakeups).toHaveLength(1);

        // A second availability, carrying a live state so the old one can still
        // be exercised afterwards.
        const secondState = new ViewerState();
        element.dispatchEvent(
            new CustomEvent(VIEWER_STATE_AVAILABLE_EVENT, {
                detail: secondState,
                bubbles: true,
                composed: true,
            }),
        );

        const secondRuntime = controller.binding!.runtime;
        expect(controller.binding!.state).toBe(secondState);
        expect(secondRuntime).not.toBe(firstRuntime);
        // The registry points at the live runtime only; the old state's entry
        // is gone, so no consumer can resolve a disposed runtime from a handle.
        expect(getSelectorRuntime(secondState)).toBe(secondRuntime);
        expect(getSelectorRuntime(firstState)).toBeUndefined();

        // The disposed runtime is inert: its subscription to the first state is
        // gone, so the projection a consumer still holds never wakes again.
        firstState.toggleToolbar();
        await tick();
        expect(staleWakeups).toHaveLength(1);

        // The new runtime is live over the new state.
        const fresh = secondRuntime.createProjection((s) => s.toolbarOpen);
        const freshWakeups: number[] = [];
        fresh.subscribe(() => freshWakeups.push(1));
        secondState.toggleToolbar();
        await tick();
        expect(freshWakeups).toHaveLength(1);

        secondState.destroy();
    });

    it('warns once, and only in development, about the viewer-state loss', async () => {
        const records = captureLogs();
        const element = createElement();
        // The viewer re-applies `config.debug` as it mounts, so the element
        // itself has to keep development diagnostics on.
        (element as unknown as { config: unknown }).config = { debug: true };
        const controller = makeBinding();
        controller.attach(element);
        await connect(element);

        expect(records.filter((r) => r.level === 'warn')).toHaveLength(0);

        for (let i = 0; i < 3; i++) {
            element.remove();
            await settle();
            document.body.appendChild(element);
            await settle();
        }

        const warnings = records.filter((r) => r.level === 'warn');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('second ViewerState');
    });

    it('stays silent about re-availability outside development', async () => {
        const records: unknown[] = [];
        configureLogging({ debug: false, sink: () => records.push(1) });
        const element = createElement();
        const controller = makeBinding();
        controller.attach(element);
        await connect(element);

        element.remove();
        await settle();
        document.body.appendChild(element);
        await settle();

        expect(controller.binding).not.toBeNull();
        expect(records).toHaveLength(0);
    });
});

describe('teardown and remount', () => {
    it('removes listeners, disposes the runtime, and clears the binding', async () => {
        const slot = createViewerHandleSlot();
        const element = createElement();
        const changes = vi.fn();
        const controller = makeBinding({ handle: slot, onChange: changes });
        const woke = vi.fn();
        controller.subscribe(woke);
        controller.attach(element);
        await connect(element);

        const state = controller.binding!.state;
        const runtime = controller.binding!.runtime;
        expect(getSelectorRuntime(state)).toBe(runtime);

        controller.destroy();

        expect(controller.binding).toBeNull();
        expect(controller.handle).toBeNull();
        expect(controller.element).toBeNull();
        expect(slot.get()).toBeNull();
        expect(getSelectorRuntime(state)).toBeUndefined();
        expect(woke).toHaveBeenCalledTimes(2);
        expect(changes).toHaveBeenCalledTimes(2);

        // The DOM listener is gone: a later availability event binds nothing.
        element.dispatchEvent(
            new CustomEvent(VIEWER_STATE_AVAILABLE_EVENT, {
                detail: new ViewerState(),
                bubbles: true,
                composed: true,
            }),
        );
        expect(controller.binding).toBeNull();
    });

    it('is idempotent and terminal', async () => {
        const element = createElement();
        const controller = makeBinding();
        controller.attach(element);
        await connect(element);

        controller.destroy();
        controller.destroy();
        controller.destroy();

        controller.attach(element);
        expect(controller.element).toBeNull();
        expect(controller.binding).toBeNull();
    });

    it('rebinds a released slot on remount', async () => {
        const slot = createViewerHandleSlot();
        const first = createElement('mount-1');
        const firstController = makeBinding({ handle: slot });
        firstController.attach(first);
        await connect(first);
        expect(slot.get()!.element).toBe(first);

        // Unmount: React/Vue destroy the controller and drop the element.
        firstController.destroy();
        first.remove();
        await settle();
        expect(slot.get()).toBeNull();

        // Remount: a brand new element and controller, the same consumer handle.
        const second = createElement('mount-2');
        const secondController = makeBinding({ handle: slot });
        secondController.attach(second);
        await connect(second);

        expect(slot.get()!.element).toBe(second);
        expect(slot.get()!.state).toBe(second.viewerState);
    });
});
