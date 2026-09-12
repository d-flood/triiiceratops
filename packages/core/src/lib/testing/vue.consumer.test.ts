/**
 * A Vue consumer's own component, unit-tested against the headless handle.
 *
 * Same user story as `react.consumer.test.ts` (SPEC user story 66), through
 * Vue's own idiom: the handle goes into a `ref`, which is exactly the shape a
 * real `useTemplateRef<TriiiceratopsViewerInstance>('viewer')` produces, so the
 * component under test needs no test-only branch.
 *
 * Nothing is stubbed below the harness: real `triiiceratops/vue` composables,
 * real `ViewerState` commands, real batched notifications. `flush()` settles
 * the viewer's notification and `nextTick()` settles Vue's render queue — two
 * separate schedulers, both real.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    createApp,
    defineComponent,
    h,
    nextTick,
    shallowRef,
    type App,
    type ShallowRef,
} from 'vue';

import { VIEWER_ELEMENT_TAG } from '../browser-runtime.js';
import { provideViewer, useViewer, useViewerSelector } from '../vue/index.js';
import {
    createTestViewerHandle,
    flush,
    type TestViewerHandle,
} from './index.js';

let container: HTMLDivElement;
let app: App | null = null;
let handle: TestViewerHandle;
let viewer: ShallowRef<TestViewerHandle>;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    handle = createTestViewerHandle();
    // `shallowRef`, not `ref`: a deep ref would hand the composable a reactive
    // PROXY of the handle instead of the handle, breaking state identity.
    viewer = shallowRef(handle);
});

afterEach(() => {
    app?.unmount();
    app = null;
    container.remove();
    handle.dispose();
});

function mount(component: ReturnType<typeof defineComponent>): void {
    app = createApp(component);
    app.mount(container);
}

/** Settle the viewer's batched notification, then Vue's render queue. */
async function settle(): Promise<void> {
    await flush();
    await nextTick();
}

/** A representative consumer component: reads a selector, invokes a command. */
const Sidebar = defineComponent({
    setup() {
        const canvasId = useViewerSelector(
            viewer,
            (state) => state.canvasId ?? 'none',
        );
        const state = useViewer(viewer);
        return () =>
            h('div', [
                h('span', { id: 'canvas' }, canvasId.value),
                h(
                    'button',
                    {
                        id: 'next',
                        onClick: () =>
                            state.value?.setCanvas(
                                'https://example.org/canvas/2',
                            ),
                    },
                    'next',
                ),
            ]);
    },
});

function text(id: string): string | null | undefined {
    return container.querySelector(`#${id}`)?.textContent;
}

describe('a Vue consumer component reading the ref-wrapped headless handle', () => {
    it('renders the real state and updates from a real command', async () => {
        mount(Sidebar);
        expect(text('canvas')).toBe('none');

        handle.state.setCanvas('https://example.org/canvas/7');
        await settle();

        expect(text('canvas')).toBe('https://example.org/canvas/7');
    });

    it('lets the component itself drive a command through useViewer()', async () => {
        mount(Sidebar);

        container.querySelector<HTMLButtonElement>('#next')?.click();
        await settle();

        expect(handle.state.canvasId).toBe('https://example.org/canvas/2');
        expect(text('canvas')).toBe('https://example.org/canvas/2');
    });

    it('resolves the handle through provideViewer() for a deep component', async () => {
        const Deep = defineComponent({
            setup() {
                const canvasId = useViewerSelector(
                    (state) => state.canvasId ?? 'none',
                );
                return () => h('span', { id: 'canvas' }, canvasId.value);
            },
        });
        const Root = defineComponent({
            setup() {
                provideViewer(viewer);
                return () => h('div', [h(Deep)]);
            },
        });
        mount(Root);

        handle.state.setCanvas('https://example.org/canvas/deep');
        await settle();

        expect(text('canvas')).toBe('https://example.org/canvas/deep');
    });

    it('tracks a Vue reactive dependency the viewer never notified about', async () => {
        const prefix = shallowRef('a');
        const Labelled = defineComponent({
            setup() {
                const label = useViewerSelector(
                    viewer,
                    (state) => `${prefix.value}:${state.canvasId ?? 'none'}`,
                );
                return () => h('span', { id: 'canvas' }, label.value);
            },
        });
        mount(Labelled);
        expect(text('canvas')).toBe('a:none');

        prefix.value = 'b';
        await nextTick();

        expect(text('canvas')).toBe('b:none');
    });

    it("reads continuous viewport values with cadence: 'frame'", async () => {
        const Zoom = defineComponent({
            setup() {
                const zoom = useViewerSelector(
                    viewer,
                    (state) => state.viewportScale,
                    { cadence: 'frame' },
                );
                return () => h('span', { id: 'zoom' }, String(zoom.value));
            },
        });
        mount(Zoom);
        // No renderer yet: the viewport queries answer with zero rather than
        // making a consumer guard every read.
        expect(text('zoom')).toBe('0');

        const renderer = handle.attachRenderer({ scale: 1 });
        await settle();
        expect(text('zoom')).toBe('1');

        // The renderer's own animation event — nothing in viewer state moved,
        // and no state notification was delivered.
        renderer.setView({ scale: 2.5 });
        renderer.emitFrame();
        await nextTick();

        expect(text('zoom')).toBe('2.5');
    });

    it('surfaces a consumer projection failure to Vue error handling', async () => {
        const captured: unknown[] = [];
        const Broken = defineComponent({
            setup() {
                const value = useViewerSelector(viewer, () => {
                    throw new Error('consumer projection blew up');
                });
                return () => h('span', String(value.value));
            },
        });
        app = createApp(Broken);
        app.config.errorHandler = (error) => captured.push(error);
        app.mount(container);
        await nextTick();

        expect(captured).toHaveLength(1);
        expect((captured[0] as Error).message).toBe(
            'consumer projection blew up',
        );
    });

    it('keeps two handles completely isolated', async () => {
        const second = createTestViewerHandle();
        const secondRef = shallowRef(second);
        try {
            const Pair = defineComponent({
                setup() {
                    const first = useViewerSelector(
                        viewer,
                        (state) => state.canvasId ?? 'none',
                    );
                    const other = useViewerSelector(
                        secondRef,
                        (state) => state.canvasId ?? 'none',
                    );
                    return () =>
                        h('div', [
                            h('span', { id: 'first' }, first.value),
                            h('span', { id: 'second' }, other.value),
                        ]);
                },
            });
            mount(Pair);

            handle.state.setCanvas('https://example.org/canvas/first');
            await settle();

            expect(text('first')).toBe('https://example.org/canvas/first');
            expect(text('second')).toBe('none');
        } finally {
            second.dispose();
        }
    });

    it('mounts no custom element in the process', () => {
        mount(Sidebar);

        expect(customElements.get(VIEWER_ELEMENT_TAG)).toBeUndefined();
        expect(container.querySelector(VIEWER_ELEMENT_TAG)).toBeNull();
    });
});
