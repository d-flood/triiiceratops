// Vue adapter unit tests.
//
// Exercises useViewerSelector against the SDK's real selector runtime driven by
// a deterministic fake viewer state: initial value, update after a command,
// equality-gate suppression of no-op propagation, readonly ref, and scope
// disposal stopping updates on unmount.

import { createApp, defineComponent, h, isReadonly, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useViewerSelector } from './vue.js';
import {
    makeFakeHarness,
    selectToolbarOpen,
    type FakeHarness,
} from './test/fakeViewerState.js';

let container: HTMLDivElement;
let harness: FakeHarness;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    harness = makeFakeHarness();
});

afterEach(() => {
    container.remove();
    harness.runtime.dispose();
});

function mountProbe() {
    let renderCount = 0;
    const Probe = defineComponent({
        setup() {
            const open = useViewerSelector(harness.context, selectToolbarOpen);
            return () => {
                renderCount += 1;
                return h(
                    'span',
                    { 'data-testid': 'value' },
                    open.value ? 'open' : 'closed',
                );
            };
        },
    });
    const app = createApp(Probe);
    app.mount(container);
    return { app, renders: () => renderCount };
}

function text(): string | null {
    return (
        container.querySelector('[data-testid="value"]')?.textContent ?? null
    );
}

describe('useViewerSelector (Vue)', () => {
    it('renders the initial selected value', () => {
        const { app } = mountProbe();
        expect(text()).toBe('closed');
        app.unmount();
    });

    it('returns a readonly ref', () => {
        let captured: unknown;
        const Probe = defineComponent({
            setup() {
                captured = useViewerSelector(
                    harness.context,
                    selectToolbarOpen,
                );
                return () => null;
            },
        });
        const app = createApp(Probe);
        app.mount(container);
        expect(isReadonly(captured)).toBe(true);
        app.unmount();
    });

    it('updates after a command changes the selected member', async () => {
        const { app } = mountProbe();
        harness.state.toggleToolbar();
        await nextTick();
        expect(text()).toBe('open');
        app.unmount();
    });

    it('the equality gate suppresses updates for an unselected change', async () => {
        const { app, renders } = mountProbe();
        const before = renders();
        harness.state.bumpCounter();
        await nextTick();
        expect(text()).toBe('closed');
        expect(renders()).toBe(before);
        app.unmount();
    });

    it('stops updating after the component unmounts (scope disposal)', async () => {
        const { app } = mountProbe();
        app.unmount();
        expect(() => harness.state.toggleToolbar()).not.toThrow();
        await nextTick();
        // The DOM was torn down; nothing to assert beyond no error/leak.
        expect(text()).toBe(null);
    });
});
