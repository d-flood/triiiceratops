// Svelte adapter unit tests (ticket 13).
//
// The bridge produces a Svelte readable store, so these assert the store
// CONTRACT against the SDK's real selector runtime driven by a deterministic
// fake viewer state: immediate emission on subscribe, update after a command,
// equality-gate suppression of no-op emission, and unsubscribe stopping
// emission. Real in-component `$store` usage is proven at the packed seam (the
// plugin-svelte fixture).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { selectorStore, viewerSelector } from './svelte.js';
import {
    makeFakeHarness,
    selectToolbarOpen,
    type FakeHarness,
} from './test/fakeViewerState.js';

let harness: FakeHarness;

beforeEach(() => {
    harness = makeFakeHarness();
});

afterEach(() => {
    harness.runtime.dispose();
});

describe('viewerSelector / selectorStore (Svelte)', () => {
    it('emits the current value synchronously on subscribe', () => {
        const store = viewerSelector(harness.context, selectToolbarOpen);
        const seen: boolean[] = [];
        const unsub = store.subscribe((v) => seen.push(v));
        expect(seen).toEqual([false]);
        unsub();
    });

    it('emits again after a command changes the selected member', () => {
        const store = viewerSelector(harness.context, selectToolbarOpen);
        const seen: boolean[] = [];
        const unsub = store.subscribe((v) => seen.push(v));
        harness.state.toggleToolbar();
        expect(seen).toEqual([false, true]);
        unsub();
    });

    it('the equality gate suppresses emission for an unselected change', () => {
        const store = viewerSelector(harness.context, selectToolbarOpen);
        const seen: boolean[] = [];
        const unsub = store.subscribe((v) => seen.push(v));
        harness.state.bumpCounter();
        expect(seen).toEqual([false]);
        unsub();
    });

    it('stops emitting after unsubscribe', () => {
        const store = viewerSelector(harness.context, selectToolbarOpen);
        const seen: boolean[] = [];
        const unsub = store.subscribe((v) => seen.push(v));
        unsub();
        harness.state.toggleToolbar();
        expect(seen).toEqual([false]);
    });

    it('selectorStore wraps a pre-built selector', () => {
        const selector = harness.context.selectors.select(selectToolbarOpen);
        const store = selectorStore(selector);
        const seen: boolean[] = [];
        const unsub = store.subscribe((v) => seen.push(v));
        harness.state.toggleToolbar();
        expect(seen).toEqual([false, true]);
        unsub();
    });
});
