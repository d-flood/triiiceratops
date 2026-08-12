/**
 * Deterministic test double for the adapter unit tests.
 *
 * Adapters bind to the SDK's real selector runtime (`createSelectorRuntime`);
 * the runtime's only dependency on `ViewerState` is `subscribe` plus
 * synchronous property reads. This fake supplies exactly that with SYNCHRONOUS
 * notification, so an adapter test can drive a "command" and assert the reaction
 * without Svelte's batched flush timing. High-fidelity exercise against a real,
 * batched `ViewerState` happens at the packed seam (the `plugin-*` fixtures).
 */

import type { PluginContext, ViewerState } from 'triiiceratops';

import { createSelectorRuntime } from '../selectors.js';
import type { SelectorRuntime } from '../selectors.js';

/** A minimal `ViewerState`-shaped object with two independent members. */
export class FakeViewerState {
    /** The member adapter tests select. */
    toolbarOpen = false;
    /** An unselected member, for exercising the equality gate. */
    counter = 0;

    #listeners = new Set<() => void>();

    subscribe(listener: () => void): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    #notify(): void {
        for (const listener of [...this.#listeners]) listener();
    }

    /** A command that changes the selected member and notifies. */
    toggleToolbar(): void {
        this.toolbarOpen = !this.toolbarOpen;
        this.#notify();
    }

    /** A command that changes an UNSELECTED member and notifies. */
    bumpCounter(): void {
        this.counter += 1;
        this.#notify();
    }
}

export interface FakeHarness {
    state: FakeViewerState;
    runtime: SelectorRuntime;
    context: PluginContext;
}

/**
 * Build a fake viewer state wired to the SDK's real selector runtime and a
 * minimal `PluginContext` exposing only the `selectors` the adapters consume.
 */
export function makeFakeHarness(): FakeHarness {
    const state = new FakeViewerState();
    const runtime = createSelectorRuntime(state as unknown as ViewerState);
    const context = {
        selectors: runtime.selectors,
    } as unknown as PluginContext;
    return { state, runtime, context };
}

/** Selector fn shared by the adapter tests. */
export const selectToolbarOpen = (state: ViewerState): boolean =>
    (state as unknown as FakeViewerState).toolbarOpen;
