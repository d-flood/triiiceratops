/**
 * `<TriiiceratopsViewer>` driven by `createApp` against the REAL custom element.
 *
 * An idealized element double is deliberately not used: every hazard worth
 * testing here lives in the element's own semantics — Svelte's asynchronous
 * `connectedCallback`, the porting of properties assigned before upgrade, kebab
 * attribute mapping, the getter-only state bridge, and the destroy/re-mount
 * cycle a detach-then-reattach produces. A double would agree with whatever the
 * wrapper assumed.
 */

import {
    createApp,
    defineComponent,
    h,
    nextTick,
    ref,
    shallowRef,
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

import { definePlugin } from '@triiiceratops/plugin-sdk';

import { configureLogging } from '../logging/logger.js';
import type { SearchProvider } from '../types/config.js';
import type { PluginError, SdkPlugin } from '../types/plugin.js';
import type { ViewerStateSnapshot } from '../state/viewer.svelte.js';
import type { ViewerError } from '../types/viewerError.js';
import type { TriiiceratopsViewerElement } from '../framework/index.js';
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
    configureLogging({ debug: false, sink: null });
    await settle(0);
});

/** Mount, then let Vue, Svelte, and the element's own microtasks settle. */
async function mount(component: Parameters<typeof createApp>[0]): Promise<App> {
    app = createApp(component);
    app.mount(container);
    await settle();
    await nextTick();
    return app;
}

/** Let a command's batched notification reach Vue. */
async function flush(mutate: () => void): Promise<void> {
    mutate();
    await settle();
    await nextTick();
}

function viewerElement(
    from: ParentNode = container,
): TriiiceratopsViewerElement {
    const element = from.querySelector(VIEWER_TAG);
    if (!element) throw new Error(`no <${VIEWER_TAG}> was rendered`);
    return element as TriiiceratopsViewerElement;
}

/** An element's attributes as a plain, order-independent record. */
function attributeMap(element: Element): Record<string, string> {
    const map: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes)) {
        map[attribute.name] = attribute.value;
    }
    return map;
}

/** A plugin whose `mount` throws, so activation reports a real `PluginError`. */
function failingPlugin(name: string): SdkPlugin {
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
                throw new Error(`${name} mount boom`);
            },
        },
    }) as unknown as SdkPlugin;
}

/** A plugin that records each mount, so restarts are observable. */
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

describe('what the wrapper renders', () => {
    it('renders exactly one custom element and no layout wrapper', async () => {
        await mount(
            defineComponent({
                setup: () => (): VNode => h(TriiiceratopsViewer),
            }),
        );

        expect(container.childElementCount).toBe(1);
        expect(container.firstElementChild?.localName).toBe(VIEWER_TAG);
        // No children projected into the light DOM either: the viewer's chrome
        // lives entirely inside its shadow root.
        expect(viewerElement().childElementCount).toBe(0);
    });

    it('ignores slot content: the default slot is reserved and unused', async () => {
        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, null, {
                        default: () => [h('span', 'not rendered')],
                    }),
            }),
        );

        expect(container.childElementCount).toBe(1);
        expect(viewerElement().childElementCount).toBe(0);
        expect(container.textContent).toBe('');
    });

    it('renders the attribute tier as kebab attributes and nothing else', async () => {
        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        manifestId: 'https://example.org/manifest',
                        canvasId: 'https://example.org/canvas/1',
                        theme: 'dark',
                        manifestJson: {
                            '@id': 'https://example.org/manifest',
                        },
                        searchProvider: (async () => []) as SearchProvider,
                    }),
            }),
        );

        const element = viewerElement();
        expect(element.getAttribute('manifest-id')).toBe(
            'https://example.org/manifest',
        );
        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/1',
        );
        expect(element.getAttribute('theme')).toBe('dark');
        // Property-tier inputs are never stringified into attributes — the
        // failure mode `shouldSetAsProp` would produce if they went through
        // vnode props instead of the applier.
        expect(element.getAttribute('manifest-json')).toBeNull();
        expect(element.getAttribute('searchprovider')).toBeNull();
    });

    it('forwards host attributes despite inheritAttrs being disabled', async () => {
        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        id: 'the-viewer',
                        class: 'tall bordered',
                        style: { height: '400px' },
                        'aria-label': 'Digitised manuscript',
                        'data-analytics-id': 'viewer-1',
                        title: 'A viewer',
                    }),
            }),
        );

        const element = viewerElement();
        expect(element.getAttribute('id')).toBe('the-viewer');
        expect(element.getAttribute('class')).toBe('tall bordered');
        expect(element.getAttribute('style')).toContain('400px');
        expect(element.getAttribute('aria-label')).toBe('Digitised manuscript');
        expect(element.getAttribute('data-analytics-id')).toBe('viewer-1');
        expect(element.getAttribute('title')).toBe('A viewer');
    });

    it('emits on the client the identical attribute set the server rendered', async () => {
        const { renderToString } = await import('vue/server-renderer');
        const { createSSRApp } = await import('vue');
        const props = {
            manifestId: 'https://example.org/manifest',
            canvasId: 'https://example.org/canvas/1',
            theme: 'dark',
            id: 'the-viewer',
            class: 'tall',
            'data-analytics-id': 'viewer-1',
            manifestJson: { '@id': 'https://example.org/manifest' },
            searchProvider: (async () => []) as SearchProvider,
        };
        const Probe = defineComponent({
            setup: () => (): VNode => h(TriiiceratopsViewer, props),
        });

        const server = document.createElement('div');
        server.innerHTML = await renderToString(createSSRApp(Probe));

        // The first client commit only — before the element's own reflection
        // has had a chance to touch anything.
        app = createApp(Probe);
        app.mount(container);

        expect(attributeMap(viewerElement())).toEqual(
            attributeMap(server.firstElementChild!),
        );
    });
});

describe('the property tier', () => {
    it('assigns object- and function-valued inputs as element properties', async () => {
        const manifestJson = { '@id': 'https://example.org/manifest' };
        const searchProvider = (async () => []) as SearchProvider;
        const config = { debug: false };

        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        manifestJson,
                        searchProvider,
                        config,
                    }),
            }),
        );

        const element = viewerElement() as TriiiceratopsViewerElement &
            Record<string, unknown>;
        expect(element.manifestJson).toBe(manifestJson);
        expect(element.config).toBe(config);
        // End to end: the function-valued input reached the live viewer.
        expect(element.viewerState?.searchProvider).toBe(searchProvider);
    });

    it('forwards changed property-tier values after mount', async () => {
        const first = { '@id': 'https://example.org/a' };
        const second = { '@id': 'https://example.org/b' };
        // `shallowRef`, so the test compares the consumer's own object rather
        // than the deep reactive proxy `ref()` would hand the wrapper.
        const manifestJson = shallowRef<Record<string, string>>(first);

        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        manifestJson: manifestJson.value,
                    }),
            }),
        );

        const element = viewerElement() as TriiiceratopsViewerElement &
            Record<string, unknown>;
        expect(element.manifestJson).toBe(first);

        await flush(() => {
            manifestJson.value = second;
        });
        expect(element.manifestJson).toBe(second);
    });

    it('writes nothing when a re-rendered value is shallow-equal', async () => {
        const mounts: string[] = [];
        const plugin = countingPlugin('unchanged-probe', mounts);
        const nudge = ref(0);

        // A parent that rebuilds both props on every render — the ordinary Vue
        // case the applier's edge-triggering exists for.
        await mount(
            defineComponent({
                setup: () => (): VNode => {
                    void nudge.value;
                    return h(TriiiceratopsViewer, {
                        manifestJson: {
                            '@id': 'https://example.org/manifest',
                        },
                        plugins: [plugin],
                    });
                },
            }),
        );

        const element = viewerElement() as TriiiceratopsViewerElement &
            Record<string, unknown>;
        const firstManifestJson = element.manifestJson;
        expect(mounts).toEqual(['unchanged-probe']);

        for (let i = 0; i < 3; i++) {
            await flush(() => {
                nudge.value++;
            });
        }

        // The element still holds the FIRST object: nothing was re-assigned, so
        // the manifest was never reloaded and the plugin never restarted.
        expect(element.manifestJson).toBe(firstManifestJson);
        expect(mounts).toEqual(['unchanged-probe']);
    });

    it('does not undo internal navigation when an unchanged canvasId re-renders', async () => {
        const nudge = ref(0);
        await mount(
            defineComponent({
                setup: () => (): VNode => {
                    void nudge.value;
                    return h(TriiiceratopsViewer, {
                        manifestId: 'https://example.org/manifest',
                        canvasId: 'https://example.org/canvas/1',
                    });
                },
            }),
        );
        const element = viewerElement();

        // The user navigates inside the viewer: its live state now disagrees
        // with the value the parent is still holding for `canvasId`.
        await flush(() =>
            element.viewerState?.setCanvas('https://example.org/canvas/9'),
        );
        expect(element.viewerState?.canvasId).toBe(
            'https://example.org/canvas/9',
        );

        // Re-writing `canvas-id` — even with the same string — would fire
        // `attributeChangedCallback` and snap the viewer back to canvas 1.
        for (let i = 0; i < 3; i++) {
            await flush(() => {
                nudge.value++;
            });
        }

        expect(element.viewerState?.canvasId).toBe(
            'https://example.org/canvas/9',
        );
        // The host attribute is still the instruction the parent last gave, not
        // a mirror of where the viewer has since gone.
        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/1',
        );
    });

    it('directs the live viewer when the parent changes canvasId', async () => {
        const canvasId = ref('https://example.org/canvas/1');
        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, { canvasId: canvasId.value }),
            }),
        );
        const element = viewerElement();
        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/1',
        );

        await flush(() => {
            canvasId.value = 'https://example.org/canvas/2';
        });

        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/2',
        );
    });
});

describe('the template ref', () => {
    it('is the handle: null before mount, then the element and its state', async () => {
        const seen: Array<string | undefined> = [];
        let viewer: { value: TriiiceratopsViewerInstance | null } | null = null;

        await mount(
            defineComponent({
                setup() {
                    const ref_ =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    viewer = ref_;
                    return (): VNode => {
                        seen.push(
                            ref_.value?.state === undefined
                                ? undefined
                                : 'state',
                        );
                        return h(TriiiceratopsViewer, { ref: 'viewer' });
                    };
                },
            }),
        );

        // The honest state of the world: nullable until the element mounted its
        // inner viewer, then present.
        expect(seen[0]).toBeUndefined();

        const bound = viewer as unknown as {
            value: TriiiceratopsViewerInstance;
        };
        expect(bound.value.element).toBe(viewerElement());
        // A type-level view of the SAME live object.
        expect(bound.value.state).toBe(viewerElement().viewerState);
        // Commands are reached straight off the template ref.
        await flush(() =>
            bound.value.state?.setCanvas('https://example.org/canvas/5'),
        );
        expect(viewerElement().viewerState?.canvasId).toBe(
            'https://example.org/canvas/5',
        );
    });

    it('clears on unmount and rebinds on remount', async () => {
        const show = ref(true);
        let viewer: { value: TriiiceratopsViewerInstance | null } | null = null;

        await mount(
            defineComponent({
                setup() {
                    const ref_ =
                        useTemplateRef<TriiiceratopsViewerInstance>('viewer');
                    viewer = ref_;
                    return (): VNode | null =>
                        show.value
                            ? h(TriiiceratopsViewer, { ref: 'viewer' })
                            : null;
                },
            }),
        );

        const box = viewer as unknown as {
            value: TriiiceratopsViewerInstance | null;
        };
        const firstState = box.value?.state;
        expect(firstState).toBe(viewerElement().viewerState);

        await flush(() => {
            show.value = false;
        });
        expect(box.value).toBeNull();

        await flush(() => {
            show.value = true;
        });
        expect(box.value?.element).toBe(viewerElement());
        expect(box.value?.state).toBe(viewerElement().viewerState);
        expect(box.value?.state).not.toBe(firstState);
    });
});

describe('emits', () => {
    it('hands each emit the event detail, never a CustomEvent', async () => {
        const stateChanges: ViewerStateSnapshot[] = [];
        const canvasChanges: ViewerStateSnapshot[] = [];
        const choiceChanges: ViewerStateSnapshot[] = [];

        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        onStateChange: (snapshot: ViewerStateSnapshot) =>
                            stateChanges.push(snapshot),
                        onCanvasChange: (snapshot: ViewerStateSnapshot) =>
                            canvasChanges.push(snapshot),
                        onChoiceChange: (snapshot: ViewerStateSnapshot) =>
                            choiceChanges.push(snapshot),
                    }),
            }),
        );

        const state = viewerElement().viewerState!;
        await flush(() => {
            state.toggleToolbar();
            state.setCanvas('https://example.org/canvas/7');
            state.selectChoice('https://example.org/canvas/7', 'choice-a');
        });

        expect(stateChanges.length).toBeGreaterThan(0);
        expect(stateChanges[0]).not.toBeInstanceOf(Event);
        expect(stateChanges[0].toolbarOpen).toBe(true);
        expect(canvasChanges.at(-1)?.canvasId).toBe(
            'https://example.org/canvas/7',
        );
        expect(choiceChanges).toHaveLength(1);
        expect(choiceChanges[0].canvasId).toBe('https://example.org/canvas/7');
    });

    it('hands pluginError the exact PluginError, retry() included', async () => {
        const errors: PluginError[] = [];

        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        plugins: [failingPlugin('exploding')],
                        onPluginError: (error: PluginError) =>
                            errors.push(error),
                    }),
            }),
        );

        expect(errors).toHaveLength(1);
        expect(errors[0]).not.toBeInstanceOf(Event);
        expect(errors[0].pluginName).toBe('exploding');
        expect(errors[0].phase).toBe('mount');
        expect(typeof errors[0].retry).toBe('function');
    });

    it('hands viewerError the exact ViewerError', async () => {
        const errors: ViewerError[] = [];

        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        // A genuinely conflicting configuration the viewer
                        // reports on the structured `viewererror` channel.
                        config: {
                            controls: 'split',
                            toolbar: { anchor: 'top' },
                            nav: { edge: 'top' },
                        },
                        onViewerError: (error: ViewerError) =>
                            errors.push(error),
                    }),
            }),
        );

        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).not.toBeInstanceOf(Event);
        expect(errors[0].code).toBe('nav-edge-conflict');
        expect(errors[0].severity).toBe('warning');
    });

    it('neither leaks nor duplicates a listener when a handler changes', async () => {
        const calls: string[] = [];
        const label = ref('first');

        await mount(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        onStateChange: () => calls.push(label.value),
                    }),
            }),
        );

        for (const next of ['second', 'third', 'fourth']) {
            await flush(() => {
                label.value = next;
            });
        }

        const element = viewerElement();
        await flush(() => element.viewerState?.toggleToolbar());

        // Exactly one delivery, to the CURRENT handler only.
        expect(calls).toEqual(['fourth']);

        // Teardown removes the listener: the detached element notifies nobody.
        app?.unmount();
        app = null;
        calls.length = 0;
        element.dispatchEvent(
            new CustomEvent('statechange', {
                detail: {},
                bubbles: true,
                composed: true,
            }),
        );
        expect(calls).toEqual([]);
    });
});

describe('two viewers on one page', () => {
    it('keeps state, template refs, and emits completely isolated', async () => {
        const aCanvases: string[] = [];
        const bCanvases: string[] = [];
        let a: { value: TriiiceratopsViewerInstance | null } | null = null;
        let b: { value: TriiiceratopsViewerInstance | null } | null = null;

        await mount(
            defineComponent({
                setup() {
                    a = useTemplateRef<TriiiceratopsViewerInstance>('a');
                    b = useTemplateRef<TriiiceratopsViewerInstance>('b');
                    return (): VNode =>
                        h('div', null, [
                            h(TriiiceratopsViewer, {
                                key: 'a',
                                ref: 'a',
                                id: 'viewer-a',
                                onCanvasChange: (
                                    snapshot: ViewerStateSnapshot,
                                ) => aCanvases.push(snapshot.canvasId ?? ''),
                            }),
                            h(TriiiceratopsViewer, {
                                key: 'b',
                                ref: 'b',
                                id: 'viewer-b',
                                onCanvasChange: (
                                    snapshot: ViewerStateSnapshot,
                                ) => bCanvases.push(snapshot.canvasId ?? ''),
                            }),
                        ]);
                },
            }),
        );

        const first = (a as unknown as { value: TriiiceratopsViewerInstance })
            .value;
        const second = (b as unknown as { value: TriiiceratopsViewerInstance })
            .value;
        expect(first.element.getAttribute('id')).toBe('viewer-a');
        expect(second.element.getAttribute('id')).toBe('viewer-b');
        expect(first.state).not.toBe(second.state);

        await flush(() => first.state?.setCanvas('https://example.org/only-a'));

        expect(first.state?.canvasId).toBe('https://example.org/only-a');
        expect(second.state?.canvasId).not.toBe('https://example.org/only-a');
        expect(aCanvases).toEqual(['https://example.org/only-a']);
        expect(bCanvases).toEqual([]);
    });
});
