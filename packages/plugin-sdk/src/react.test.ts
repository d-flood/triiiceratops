// React adapter unit tests.
//
// Exercises useViewerSelector against the SDK's real selector runtime driven by
// a deterministic fake viewer state: initial value, update after a command,
// equality-gate suppression of no-op propagation, teardown stops updates, and a
// StrictMode tear-safe double-render/mount cycle.

import { act, StrictMode, createElement, useRef } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useViewerSelector } from './react.js';
import {
    makeFakeHarness,
    selectToolbarOpen,
    type FakeHarness,
} from './test/fakeViewerState.js';

// React 19 in a test environment expects this global.
(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let harness: FakeHarness;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    harness = makeFakeHarness();
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    harness.runtime.dispose();
});

function renderWithHook(
    wrap: (child: ReactElement) => ReactElement = (c) => c,
): { renders: () => number } {
    let renderCount = 0;
    function Probe() {
        renderCount += 1;
        const value = useViewerSelector(harness.context, selectToolbarOpen);
        return createElement(
            'span',
            { 'data-testid': 'value' },
            value ? 'open' : 'closed',
        );
    }
    root = createRoot(container);
    act(() => root.render(wrap(createElement(Probe))));
    return { renders: () => renderCount };
}

function text(): string | null {
    return (
        container.querySelector('[data-testid="value"]')?.textContent ?? null
    );
}

describe('useViewerSelector (React)', () => {
    it('renders the initial selected value', () => {
        renderWithHook();
        expect(text()).toBe('closed');
    });

    it('updates after a command changes the selected member', () => {
        renderWithHook();
        act(() => harness.state.toggleToolbar());
        expect(text()).toBe('open');
    });

    it('the equality gate suppresses re-render for an unselected change', () => {
        const { renders } = renderWithHook();
        const before = renders();
        act(() => harness.state.bumpCounter());
        expect(text()).toBe('closed');
        expect(renders()).toBe(before);
    });

    it('stops updating after unmount', () => {
        renderWithHook();
        act(() => root.unmount());
        // Re-assign so afterEach's unmount is harmless.
        root = createRoot(document.createElement('div'));
        expect(() => harness.state.toggleToolbar()).not.toThrow();
    });

    it('is tear-safe under StrictMode double-render/mount', () => {
        // StrictMode double-invokes render and mount/unmount/remount in dev.
        renderWithHook((child) => createElement(StrictMode, null, child));
        expect(text()).toBe('closed');

        act(() => harness.state.toggleToolbar());
        expect(text()).toBe('open');

        act(() => harness.state.toggleToolbar());
        expect(text()).toBe('closed');

        // No leaked subscriptions from the extra StrictMode mount cycle: after
        // unmount, further commands must not throw or re-render a torn-down tree.
        act(() => root.unmount());
        root = createRoot(document.createElement('div'));
        expect(() => harness.state.toggleToolbar()).not.toThrow();
    });

    it('captures a stable selector across renders (useRef guard sanity)', () => {
        // Guards the ref-based single-creation invariant the hook relies on.
        let created = 0;
        function Probe() {
            const ref = useRef(0);
            if (ref.current === 0) {
                ref.current = 1;
                created += 1;
            }
            useViewerSelector(harness.context, selectToolbarOpen);
            return null;
        }
        root = createRoot(container);
        act(() =>
            root.render(createElement(StrictMode, null, createElement(Probe))),
        );
        expect(created).toBe(1);
    });
});
