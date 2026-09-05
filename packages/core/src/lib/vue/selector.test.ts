/**
 * `useViewer()` and `useViewerSelector()` against a REAL mounted viewer.
 *
 * The subjects here are the things a Vue binding over the core selector runtime
 * can get wrong: resolving the runtime outside the `computed` (so a rebound
 * handle never rewires), reading through the version memo instead of
 * `recompute()` (so a Vue reactive dependency is swallowed), pushing values from
 * the subscription callback (so a failing projection is swallowed or a stale
 * value freezes), missing the frame cadence, or losing the equality gate. All of
 * them need a live `ViewerState` with real batched notifications, so the real
 * element supplies it.
 */

import {
    createApp,
    defineComponent,
    h,
    nextTick,
    onErrorCaptured,
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
import { createRendererStub } from '../testing/rendererStub.js';
import type { ViewerState } from '../state/viewer.svelte.js';
import type { PluginError } from '../types/plugin.js';
import type { ViewerError } from '../types/viewerError.js';
import type {
    ReadonlyViewerState,
    TriiiceratopsViewerElement,
} from '../framework/index.js';
import { ViewerProvider } from './context.js';
import { provideViewer, type TriiiceratopsViewerInstance } from './handle.js';
import { useViewer, useViewerSelector } from './selector.js';
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

async function mount(component: Parameters<typeof createApp>[0]): Promise<App> {
    app = createApp(component);
    app.mount(container);
    await settle();
    await nextTick();
    return app;
}

async function flush(mutate: () => void): Promise<void> {
    mutate();
    await settle();
    await nextTick();
}

function viewerElement(): TriiiceratopsViewerElement {
    const element = container.querySelector(VIEWER_TAG);
    if (!element) throw new Error(`no <${VIEWER_TAG}> was rendered`);
    return element as TriiiceratopsViewerElement;
}

function liveState(): ViewerState {
    const state = viewerElement().viewerState;
    if (!state) throw new Error('the viewer has not published its state');
    return state;
}

function text(): string {
    return container.querySelector('[data-testid="value"]')?.textContent ?? '';
}

/** An ordinary Vue error boundary — the consumer's own error handling. */
function boundary(
    caught: unknown[],
    child: () => VNode,
): ReturnType<typeof defineComponent> {
    return defineComponent({
        setup() {
            onErrorCaptured((error) => {
                caught.push(error);
                return false;
            });
            return (): VNode => child();
        },
    });
}

describe('reading the current selection', () => {
    it('is undefined until the viewer state exists, then tracks commands', async () => {
        const seen: Array<boolean | undefined> = [];

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    const open = useViewerSelector(
                        viewer,
                        (state) => state.toolbarOpen,
                    );
                    return (): VNode => {
                        seen.push(open.value);
                        return h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            h(
                                'span',
                                { 'data-testid': 'value' },
                                String(open.value),
                            ),
                        ]);
                    };
                },
            }),
        );

        expect(seen[0]).toBeUndefined();
        expect(text()).toBe('false');

        await flush(() => liveState().toggleToolbar());
        expect(text()).toBe('true');
    });

    it('gives useViewer the very same live object the template ref carries', async () => {
        let fromComposable: ReadonlyViewerState | undefined;
        let viewer: { value: TriiiceratopsViewerInstance | null } | null = null;

        await mount(
            defineComponent({
                setup() {
                    const ref_ =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    viewer = ref_;
                    const state = useViewer(ref_);
                    return (): VNode => {
                        fromComposable = state.value;
                        return h(TriiiceratopsViewer, { ref: 'viewer' });
                    };
                },
            }),
        );

        expect(fromComposable).toBe(liveState());
        expect(fromComposable).toBe(
            (viewer as unknown as { value: TriiiceratopsViewerInstance }).value
                .state,
        );
    });

    it('resolves the handle from provideViewer() when none is passed', async () => {
        const Reader = defineComponent({
            setup() {
                const open = useViewerSelector((state) => state.toolbarOpen);
                return (): VNode =>
                    h('span', { 'data-testid': 'value' }, String(open.value));
            },
        });

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    provideViewer(viewer);
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            // Deliberately deep, and after the viewer: nothing
                            // is gated and no layout constraint is imposed.
                            h('div', null, [h(Reader)]),
                        ]);
                },
            }),
        );

        expect(text()).toBe('false');
        await flush(() => liveState().toggleToolbar());
        expect(text()).toBe('true');
    });

    it('resolves the handle from <ViewerProvider> too', async () => {
        const Reader = defineComponent({
            setup() {
                const state = useViewer();
                const dock = useViewerSelector((s) => s.dockSide);
                return (): VNode =>
                    h(
                        'span',
                        { 'data-testid': 'value' },
                        `${state.value === undefined ? 'none' : 'live'}:${String(dock.value)}`,
                    );
            },
        });

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            h(ViewerProvider, { value: viewer }, () => [
                                h(Reader),
                            ]),
                        ]);
                },
            }),
        );

        expect(text()).toBe('live:bottom');
        await flush(() => liveState().setDockSide('right'));
        expect(text()).toBe('live:right');
    });

    it('names the mistake when there is no handle and no provider', async () => {
        const caught: unknown[] = [];
        const Reader = defineComponent({
            setup() {
                useViewerSelector((state) => state.toolbarOpen);
                return (): VNode => h('span');
            },
        });

        await mount(boundary(caught, () => h(Reader)));

        expect(String(caught[0])).toMatch(/no viewer handle and no/);
        expect(String(caught[0])).toMatch(/useViewerSelector/);
    });
});

describe('projections that read Vue reactive state', () => {
    it('reruns when a reactive dependency changes, with no manual watcher', async () => {
        const prefix = ref('a');

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    const label = useViewerSelector(
                        viewer,
                        (state) => `${prefix.value}:${state.toolbarOpen}`,
                    );
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            h(
                                'span',
                                { 'data-testid': 'value' },
                                String(label.value),
                            ),
                        ]);
                },
            }),
        );

        expect(text()).toBe('a:false');

        // Vue's own reactivity, tracked because the projection runs inside the
        // computed's evaluation. No viewer notification happened at all.
        await flush(() => {
            prefix.value = 'b';
        });
        expect(text()).toBe('b:false');

        // And the viewer's own notifications still wake it.
        await flush(() => liveState().toggleToolbar());
        expect(text()).toBe('b:true');
    });

    it('does not re-render a consumer when the selection is unchanged', async () => {
        let renders = 0;
        const Reader = defineComponent({
            setup() {
                const dock = useViewerSelector((state) => state.dockSide);
                return (): VNode => {
                    renders += 1;
                    return h(
                        'span',
                        { 'data-testid': 'value' },
                        String(dock.value),
                    );
                };
            },
        });

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    provideViewer(viewer);
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            h(Reader),
                        ]);
                },
            }),
        );

        const before = renders;
        expect(text()).toBe('bottom');

        // Three commands that change inventoried members the projection does
        // not read. Every one wakes the runtime; none changes the selection.
        await flush(() => liveState().toggleToolbar());
        await flush(() => liveState().toggleThumbnailGallery());
        await flush(() => liveState().toggleAnnotations());

        expect(renders).toBe(before);
        expect(text()).toBe('bottom');
    });

    it('honours a supplied equality gate', async () => {
        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    const dock = useViewerSelector(
                        viewer,
                        (state) => state.dockSide,
                        // Everything compares equal, so the first selected
                        // value is the only one ever returned.
                        { equals: () => true },
                    );
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            h(
                                'span',
                                { 'data-testid': 'value' },
                                String(dock.value),
                            ),
                        ]);
                },
            }),
        );

        expect(text()).toBe('bottom');
        await flush(() => liveState().setDockSide('right'));
        expect(text()).toBe('bottom');
    });
});

describe('selector cadence', () => {
    // Zoom read REACTIVELY through a `frame`-cadence selector, for Vue.
    it("wakes a frame-cadence projection from the renderer's animation events", async () => {
        const renderer = createRendererStub({ scale: 1 });

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    const zoom = useViewerSelector(
                        viewer,
                        (state) => state.viewportScale,
                        { cadence: 'frame' },
                    );
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            h(
                                'span',
                                { 'data-testid': 'value' },
                                String(zoom.value),
                            ),
                        ]);
                },
            }),
        );

        expect(text()).toBe('0');

        await flush(() => {
            liveState().attachRenderer(renderer);
        });
        expect(text()).toBe('1');
        expect(renderer.frameListenerCount).toBeGreaterThan(0);

        // A continuous viewport value, reactive with no state notification and
        // no requestAnimationFrame loop.
        await flush(() => {
            renderer.setView({ scale: 4.5 });
            renderer.emitFrame();
        });
        expect(text()).toBe('4.5');

        // Unmounting detaches the ticker: an idle viewer costs nothing.
        app?.unmount();
        app = null;
        expect(renderer.frameListenerCount).toBe(0);
    });

    it('warns in development when a state-cadence projection reads a query-only viewport value', async () => {
        const warnings: string[] = [];
        configureLogging({
            debug: true,
            sink: (level: LogLevel, args: readonly unknown[]) => {
                if (level === 'warn') warnings.push(String(args[0]));
            },
        });

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    const zoom = useViewerSelector(
                        viewer,
                        (state) => state.viewportScale,
                    );
                    return (): VNode =>
                        h('div', null, [
                            // The viewer re-applies `config.debug` as it mounts,
                            // so debug has to stay on through the element too.
                            h(TriiiceratopsViewer, {
                                ref: 'viewer',
                                config: { debug: true },
                            }),
                            h(
                                'span',
                                { 'data-testid': 'value' },
                                String(zoom.value),
                            ),
                        ]);
                },
            }),
        );

        expect(
            warnings.filter((message) => message.includes("cadence: 'frame'"))
                .length,
        ).toBeGreaterThan(0);
    });
});

describe('consumer failures', () => {
    it('reaches onErrorCaptured, is not a viewer or plugin error, and serves no stale value', async () => {
        const caught: unknown[] = [];
        const viewerErrors: ViewerError[] = [];
        const pluginErrors: PluginError[] = [];
        // The projection succeeds first, so there IS a cached value to go
        // stale, and only then starts failing.
        const explode = ref(false);
        let selected: { readonly value: string | undefined } | null = null;

        const Reader = defineComponent({
            setup() {
                const dock = useViewerSelector((state) => {
                    if (explode.value) throw new Error('projection boom');
                    return state.dockSide;
                });
                selected = dock;
                return (): VNode =>
                    h('span', { 'data-testid': 'value' }, String(dock.value));
            },
        });

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    provideViewer(viewer);
                    onErrorCaptured((error) => {
                        caught.push(error);
                        return false;
                    });
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, {
                                ref: 'viewer',
                                onViewerError: (error: ViewerError) =>
                                    viewerErrors.push(error),
                                onPluginError: (error: PluginError) =>
                                    pluginErrors.push(error),
                            }),
                            h(Reader),
                        ]);
                },
            }),
        );

        expect(text()).toBe('bottom');

        await flush(() => {
            explode.value = true;
        });

        expect(caught.length).toBeGreaterThan(0);
        expect(String(caught[0])).toContain('projection boom');
        // Neither swallowed nor mislabelled.
        expect(viewerErrors).toEqual([]);
        expect(pluginErrors).toEqual([]);
        const afterFirstFailure = caught.length;

        // The viewer moves on while the projection is broken. Every read keeps
        // failing loudly instead of quietly settling on the last good value —
        // the assertion a `shallowRef` pushed from the subscription callback
        // would fail, because that callback would swallow the throw and leave
        // the ref holding 'bottom' forever.
        await flush(() => liveState().setDockSide('right'));
        expect(caught.length).toBeGreaterThan(afterFirstFailure);
        expect(String(caught.at(-1))).toContain('projection boom');

        // And when the consumer's own bug is fixed, the selection is CURRENT
        // state, never the value cached before the failure.
        await flush(() => {
            explode.value = false;
        });
        expect(text()).toBe('right');
        expect(
            (selected as unknown as { value: string | undefined }).value,
        ).toBe('right');
        // The viewer itself was untouched by its consumer's mistake.
        expect(liveState()).toBeDefined();
    });

    it('reaches app.config.errorHandler when nothing captures it', async () => {
        const handled: unknown[] = [];

        const Reader = defineComponent({
            setup() {
                const value = useViewerSelector<string>(() => {
                    throw new Error('projection boom');
                });
                return (): VNode => h('span', String(value.value));
            },
        });

        const root = defineComponent({
            setup() {
                const viewer =
                    useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                provideViewer(viewer);
                return (): VNode =>
                    h('div', null, [
                        h(TriiiceratopsViewer, { ref: 'viewer' }),
                        h(Reader),
                    ]);
            },
        });

        app = createApp(root);
        app.config.errorHandler = (error) => handled.push(error);
        app.mount(container);
        await settle();
        await nextTick();

        expect(handled.length).toBeGreaterThan(0);
        expect(String(handled[0])).toContain('projection boom');
    });

    it('surfaces a throwing equality function the same way', async () => {
        const caught: unknown[] = [];

        const Reader = defineComponent({
            setup() {
                const value = useViewerSelector((state) => state.toolbarOpen, {
                    equals: (): boolean => {
                        throw new Error('equality boom');
                    },
                });
                return (): VNode => h('span', String(value.value));
            },
        });

        await mount(
            defineComponent({
                setup() {
                    const viewer =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    provideViewer(viewer);
                    onErrorCaptured((error) => {
                        caught.push(error);
                        return false;
                    });
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, { ref: 'viewer' }),
                            h(Reader),
                        ]);
                },
            }),
        );

        await flush(() => liveState().toggleToolbar());

        expect(caught.length).toBeGreaterThan(0);
        expect(String(caught[0])).toContain('equality boom');
    });
});
