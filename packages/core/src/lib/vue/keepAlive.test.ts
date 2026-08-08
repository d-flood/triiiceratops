/**
 * A `<KeepAlive>` round trip, against the REAL custom element.
 *
 * Deactivation detaches the element long enough for Svelte to destroy the inner
 * component and its `ViewerState`; reactivation builds a new one and publishes
 * a SECOND `viewerstateavailable`. That is the one lifecycle where the wrapper
 * must rebind, every composable must rewire to the new runtime, and the
 * accompanying viewer-state loss must be warned about — because it is otherwise
 * completely silent.
 *
 * This is also the case that catches the specific bug of resolving the selector
 * runtime once, outside the `computed`: the previous runtime is disposed on
 * rebind, so a cached one would read a dead runtime forever.
 */

import {
    createApp,
    defineComponent,
    h,
    KeepAlive,
    nextTick,
    ref,
    useTemplateRef,
} from 'vue';
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

import { configureLogging, type LogLevel } from '../logging/logger.js';
import type { ViewerState } from '../state/viewer.svelte.js';
import type { TriiiceratopsViewerElement } from '../framework/index.js';
import { VIEWER_STATE_AVAILABLE_EVENT } from '../framework/index.js';
import { provideViewer, type TriiiceratopsViewerInstance } from './handle.js';
import { useViewerSelector } from './selector.js';
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
    configureLogging({ debug: false, sink: null });
    await settle(0);
});

async function flush(mutate: () => void): Promise<void> {
    mutate();
    await settle();
    await nextTick();
}

function viewerElement(): TriiiceratopsViewerElement {
    const element = document.body.querySelector(VIEWER_TAG);
    if (!element) throw new Error(`no <${VIEWER_TAG}> was rendered`);
    return element as TriiiceratopsViewerElement;
}

function text(): string {
    return container.querySelector('[data-testid="value"]')?.textContent ?? '';
}

describe('a <KeepAlive> deactivate/reactivate cycle', () => {
    it('publishes a second ViewerState, warns, and rewires every composable', async () => {
        const warnings: string[] = [];
        configureLogging({
            debug: true,
            sink: (level: LogLevel, args: readonly unknown[]) => {
                if (level === 'warn') warnings.push(String(args[0]));
            },
        });

        const availability: ViewerState[] = [];
        const onAvailable = (event: Event): void => {
            availability.push((event as CustomEvent<ViewerState>).detail);
        };
        document.addEventListener(VIEWER_STATE_AVAILABLE_EVENT, onAvailable);

        const Reader = defineComponent({
            setup() {
                const dock = useViewerSelector((state) => state.dockSide);
                return (): VNode =>
                    h('span', { 'data-testid': 'value' }, String(dock.value));
            },
        });

        const Panel = defineComponent({
            name: 'Panel',
            setup() {
                const viewer =
                    useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                provideViewer(viewer);
                return (): VNode =>
                    h('div', null, [
                        // The viewer re-applies `config.debug` as it mounts, so
                        // debug has to stay on through the element too.
                        h(TriiiceratopsViewer, {
                            ref: 'viewer',
                            config: { debug: true },
                        }),
                        h(Reader),
                    ]);
            },
        });

        const Elsewhere = defineComponent({
            name: 'Elsewhere',
            setup: () => (): VNode => h('p', 'elsewhere'),
        });

        const active = ref(true);
        app = createApp(
            defineComponent({
                setup: () => (): VNode =>
                    h(KeepAlive, null, [
                        active.value ? h(Panel) : h(Elsewhere),
                    ]),
            }),
        );
        app.mount(container);
        await settle();
        await nextTick();

        expect(availability).toHaveLength(1);
        expect(text()).toBe('bottom');
        const firstState = viewerElement().viewerState;
        expect(firstState).toBe(availability[0]);

        // The selection tracks the FIRST viewer state.
        await flush(() => firstState?.setDockSide('right'));
        expect(text()).toBe('right');

        // Deactivate: KeepAlive moves the subtree into its hidden container, so
        // the element disconnects and Svelte destroys the inner viewer.
        await flush(() => {
            active.value = false;
        });
        expect(container.textContent).toContain('elsewhere');

        // Reactivate: a NEW inner viewer, a NEW ViewerState, a second event.
        await flush(() => {
            active.value = true;
        });

        expect(availability).toHaveLength(2);
        const secondState = viewerElement().viewerState;
        expect(secondState).toBe(availability[1]);
        expect(secondState).not.toBe(firstState);

        // The accompanying viewer-state loss is named, not silent.
        expect(
            warnings.filter((message) =>
                message.includes('published a second ViewerState'),
            ),
        ).toHaveLength(1);

        // The composable rewired: it reads the NEW state (whose dock side is
        // back to the default, because nothing is restored across teardown)…
        expect(text()).toBe('bottom');
        // …and it keeps updating from the new runtime.
        await flush(() => secondState?.setDockSide('left'));
        expect(text()).toBe('left');

        // Commanding the DEAD state changes nothing a consumer can see.
        await flush(() => firstState?.setDockSide('right'));
        expect(text()).toBe('left');

        document.removeEventListener(VIEWER_STATE_AVAILABLE_EVENT, onAvailable);
    });
});
