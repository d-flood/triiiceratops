/**
 * `<TriiiceratopsViewer>` driven by `react-dom/client` against the REAL custom
 * element.
 *
 * An idealized element double is deliberately not used: every hazard worth
 * testing here lives in the element's own semantics — Svelte's asynchronous
 * `connectedCallback`, the porting of properties assigned before upgrade, kebab
 * attribute mapping, the getter-only state bridge, and the destroy/re-mount
 * cycle a detach-then-reattach produces. A double would agree with whatever the
 * wrapper assumed.
 */

import { act, createElement, useState } from 'react';
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

import { configureLogging } from '../logging/logger.js';
import type { SearchProvider } from '../types/config.js';
import type { PluginError } from '../types/plugin.js';
import type { SdkPlugin } from '../types/plugin.js';
import type { ViewerStateSnapshot } from '../state/viewer.svelte.js';
import type { ViewerError } from '../types/viewerError.js';
import type {
    TriiiceratopsViewerElement,
    ViewerHandle,
    ViewerHandleSlot,
} from '../framework/index.js';
import { useViewerHandle } from './handle.js';
import { useViewer } from './selector.js';
import { TriiiceratopsViewer } from './viewer.js';

vi.mock('openseadragon', async () => {
    const { createOsdModuleMock } =
        await import('../test/utils/realViewerElement.js');
    return createOsdModuleMock();
});

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

// React 19 in a test environment expects this global.
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
    await settle(0);
});

/** Render, then let React, Svelte, and the element's own microtasks settle. */
async function render(node: ReactNode): Promise<void> {
    await act(async () => {
        root?.render(node);
    });
    await act(async () => {
        await settle();
    });
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
        requiredCapabilities: ['osd@5'],
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
        requiredCapabilities: ['osd@5'],
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
        await render(createElement(TriiiceratopsViewer, {}));

        expect(container.childElementCount).toBe(1);
        expect(container.firstElementChild?.localName).toBe(VIEWER_TAG);
        // No children projected into the light DOM either: the viewer's chrome
        // lives entirely inside its shadow root.
        expect(viewerElement().childElementCount).toBe(0);
    });

    it('renders the attribute tier as kebab attributes and nothing else', async () => {
        await render(
            createElement(TriiiceratopsViewer, {
                manifestId: 'https://example.org/manifest',
                canvasId: 'https://example.org/canvas/1',
                theme: 'dark',
                manifestJson: { '@id': 'https://example.org/manifest' },
                searchProvider: (async () => []) as SearchProvider,
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
        // Property-tier inputs are never stringified into attributes.
        expect(element.getAttribute('manifest-json')).toBeNull();
        expect(element.getAttribute('searchprovider')).toBeNull();
    });

    it('emits on the client the identical attribute set the server rendered', async () => {
        const { renderToStaticMarkup } = await import('react-dom/server');
        const props = {
            manifestId: 'https://example.org/manifest',
            canvasId: 'https://example.org/canvas/1',
            theme: 'dark',
            id: 'the-viewer',
            className: 'tall',
            'data-analytics-id': 'viewer-1',
            manifestJson: { '@id': 'https://example.org/manifest' },
            searchProvider: (async () => []) as SearchProvider,
        };

        const server = document.createElement('div');
        server.innerHTML = renderToStaticMarkup(
            createElement(TriiiceratopsViewer, props),
        );

        // The first client commit only — before the element's own reflection
        // has had a chance to touch anything.
        await act(async () => {
            root?.render(createElement(TriiiceratopsViewer, props));
        });

        expect(attributeMap(viewerElement())).toEqual(
            attributeMap(server.firstElementChild!),
        );
    });

    it('forwards host attributes, className, style, data-* and aria-*', async () => {
        await render(
            createElement(TriiiceratopsViewer, {
                id: 'the-viewer',
                className: 'tall bordered',
                style: { height: '400px' },
                'aria-label': 'Digitised manuscript',
                'data-analytics-id': 'viewer-1',
                title: 'A viewer',
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
});

describe('the property tier', () => {
    it('assigns object- and function-valued inputs as element properties', async () => {
        const manifestJson = { '@id': 'https://example.org/manifest' };
        const searchProvider = (async () => []) as SearchProvider;
        const config = { debug: false };

        await render(
            createElement(TriiiceratopsViewer, {
                manifestJson,
                searchProvider,
                config,
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
        const element = () =>
            viewerElement() as TriiiceratopsViewerElement &
                Record<string, unknown>;

        await render(
            createElement(TriiiceratopsViewer, { manifestJson: first }),
        );
        expect(element().manifestJson).toBe(first);

        await render(
            createElement(TriiiceratopsViewer, { manifestJson: second }),
        );
        expect(element().manifestJson).toBe(second);
    });

    it('writes nothing when a re-rendered value is shallow-equal', async () => {
        const mounts: string[] = [];
        const plugin = countingPlugin('unchanged-probe', mounts);

        // A parent that rebuilds both props on every render — the ordinary
        // React case the applier's edge-triggering exists for.
        await render(
            createElement(TriiiceratopsViewer, {
                manifestJson: { '@id': 'https://example.org/manifest' },
                plugins: [plugin],
            }),
        );
        const element = viewerElement() as TriiiceratopsViewerElement &
            Record<string, unknown>;
        const firstManifestJson = element.manifestJson;
        expect(mounts).toEqual(['unchanged-probe']);

        for (let i = 0; i < 3; i++) {
            await render(
                createElement(TriiiceratopsViewer, {
                    manifestJson: { '@id': 'https://example.org/manifest' },
                    plugins: [plugin],
                }),
            );
        }

        // The element still holds the FIRST object: nothing was re-assigned, so
        // the manifest was never reloaded and the plugin never restarted.
        expect(element.manifestJson).toBe(firstManifestJson);
        expect(mounts).toEqual(['unchanged-probe']);
    });

    it('does not undo internal navigation when an unchanged canvasId re-renders', async () => {
        const props = {
            manifestId: 'https://example.org/manifest',
            canvasId: 'https://example.org/canvas/1',
        };
        await render(createElement(TriiiceratopsViewer, props));
        const element = viewerElement();

        // The user navigates inside the viewer: its live state now disagrees
        // with the value React is still holding for `canvasId`.
        element.viewerState?.setCanvas('https://example.org/canvas/9');
        await act(async () => {
            await settle();
        });
        expect(element.viewerState?.canvasId).toBe(
            'https://example.org/canvas/9',
        );

        // The parent re-renders with an equal-but-new props object, three
        // times. Re-writing `canvas-id` — even with the same string — would
        // fire `attributeChangedCallback` and snap the viewer back to canvas 1.
        for (let i = 0; i < 3; i++) {
            await render(createElement(TriiiceratopsViewer, { ...props }));
        }

        expect(element.viewerState?.canvasId).toBe(
            'https://example.org/canvas/9',
        );
        // The host attribute is still the instruction React last gave, not a
        // mirror of where the viewer has since gone.
        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/1',
        );
    });
});

describe('the handle', () => {
    it('is null until the viewer publishes state, then binds to this element', async () => {
        const seen: Array<string | undefined> = [];
        let slot: ViewerHandleSlot | null = null;

        function App(): ReactNode {
            const handle = useViewerHandle();
            slot = handle;
            const state = useViewer(handle);
            seen.push(state === undefined ? undefined : 'state');
            return createElement(TriiiceratopsViewer, { handle });
        }

        await render(createElement(App));

        // The honest state of the world: nullable until the element mounted
        // its inner viewer, then present.
        expect(seen[0]).toBeUndefined();
        expect(seen.at(-1)).toBe('state');

        const bound = (
            slot as unknown as ViewerHandleSlot
        ).get() as ViewerHandle;
        expect(Object.keys(bound)).toEqual(['element', 'state']);
        expect(bound.element).toBe(viewerElement());
        // A type-level view of the SAME live object.
        expect(bound.state).toBe(viewerElement().viewerState);
    });

    it('publishes the handle through a forwarded ref and clears it on unmount', async () => {
        const ref: { current: ViewerHandle | null } = { current: null };

        await render(createElement(TriiiceratopsViewer, { ref }));

        const element = viewerElement();
        expect(ref.current?.element).toBe(element);
        expect(ref.current?.state).toBe(element.viewerState);

        await act(async () => root?.unmount());
        root = null;

        expect(ref.current).toBeNull();
    });

    it('rebinds a released handle on remount', async () => {
        let slot: ViewerHandleSlot | null = null;

        function App({ show }: { show: boolean }): ReactNode {
            const handle = useViewerHandle();
            slot = handle;
            return show ? createElement(TriiiceratopsViewer, { handle }) : null;
        }

        await render(createElement(App, { show: true }));
        const first = (slot as unknown as ViewerHandleSlot).get();
        expect(first?.element).toBe(viewerElement());

        await render(createElement(App, { show: false }));
        expect((slot as unknown as ViewerHandleSlot).get()).toBeNull();

        await render(createElement(App, { show: true }));
        const second = (slot as unknown as ViewerHandleSlot).get();
        expect(second).not.toBe(first);
        expect(second?.element).toBe(viewerElement());
        expect(second?.state).toBe(viewerElement().viewerState);
    });
});

describe('event channels', () => {
    it('hands each callback the event detail, never a CustomEvent', async () => {
        const stateChanges: ViewerStateSnapshot[] = [];
        const canvasChanges: ViewerStateSnapshot[] = [];
        const choiceChanges: ViewerStateSnapshot[] = [];

        await render(
            createElement(TriiiceratopsViewer, {
                onStateChange: (snapshot) => stateChanges.push(snapshot),
                onCanvasChange: (snapshot) => canvasChanges.push(snapshot),
                onChoiceChange: (snapshot) => choiceChanges.push(snapshot),
            }),
        );

        const state = viewerElement().viewerState!;
        await act(async () => {
            state.toggleToolbar();
            state.setCanvas('https://example.org/canvas/7');
            state.selectChoice('https://example.org/canvas/7', 'choice-a');
            await settle();
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

    it('hands onPluginError the exact PluginError, retry() included', async () => {
        const errors: PluginError[] = [];

        await render(
            createElement(TriiiceratopsViewer, {
                plugins: [failingPlugin('exploding')],
                onPluginError: (error) => errors.push(error),
            }),
        );

        expect(errors).toHaveLength(1);
        expect(errors[0]).not.toBeInstanceOf(Event);
        expect(errors[0].pluginName).toBe('exploding');
        expect(errors[0].phase).toBe('mount');
        expect(typeof errors[0].retry).toBe('function');
    });

    it('hands onViewerError the exact ViewerError', async () => {
        const errors: ViewerError[] = [];

        await render(
            createElement(TriiiceratopsViewer, {
                // A genuinely conflicting configuration the viewer reports on
                // the structured `viewererror` channel.
                config: {
                    controls: 'split',
                    toolbar: { anchor: 'top' },
                    nav: { edge: 'top' },
                },
                onViewerError: (error) => errors.push(error),
            }),
        );

        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).not.toBeInstanceOf(Event);
        expect(errors[0].code).toBe('nav-edge-conflict');
        expect(errors[0].severity).toBe('warning');
        expect(typeof errors[0].message).toBe('string');
    });

    it('neither leaks nor duplicates a listener when a callback prop changes', async () => {
        const calls: string[] = [];
        const makeProps = (label: string) => ({
            onStateChange: () => calls.push(label),
        });

        await render(createElement(TriiiceratopsViewer, makeProps('first')));
        for (const label of ['second', 'third', 'fourth']) {
            await render(createElement(TriiiceratopsViewer, makeProps(label)));
        }

        const element = viewerElement();
        await act(async () => {
            element.viewerState?.toggleToolbar();
            await settle();
        });

        // Exactly one delivery, to the CURRENT callback only.
        expect(calls).toEqual(['fourth']);

        // Teardown removes the listener: the detached element notifies nobody.
        await act(async () => root?.unmount());
        root = null;
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
    it('keeps state, handles, and callbacks completely isolated', async () => {
        const aCanvases: string[] = [];
        const bCanvases: string[] = [];
        let slotA: ViewerHandleSlot | null = null;
        let slotB: ViewerHandleSlot | null = null;

        function App(): ReactNode {
            const a = useViewerHandle();
            const b = useViewerHandle();
            slotA = a;
            slotB = b;
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, {
                    key: 'a',
                    handle: a,
                    id: 'viewer-a',
                    onCanvasChange: (snapshot) =>
                        aCanvases.push(snapshot.canvasId ?? ''),
                }),
                createElement(TriiiceratopsViewer, {
                    key: 'b',
                    handle: b,
                    id: 'viewer-b',
                    onCanvasChange: (snapshot) =>
                        bCanvases.push(snapshot.canvasId ?? ''),
                }),
            );
        }

        await render(createElement(App));

        const handleA = (slotA as unknown as ViewerHandleSlot).get()!;
        const handleB = (slotB as unknown as ViewerHandleSlot).get()!;
        expect(handleA.element.getAttribute('id')).toBe('viewer-a');
        expect(handleB.element.getAttribute('id')).toBe('viewer-b');
        expect(handleA.state).not.toBe(handleB.state);

        await act(async () => {
            handleA.state.setCanvas('https://example.org/only-a');
            await settle();
        });

        expect(handleA.state.canvasId).toBe('https://example.org/only-a');
        expect(handleB.state.canvasId).not.toBe('https://example.org/only-a');
        expect(aCanvases).toEqual(['https://example.org/only-a']);
        expect(bCanvases).toEqual([]);
    });

    it('throws when one handle is passed to two viewers', async () => {
        const failures: unknown[] = [];

        function App(): ReactNode {
            const handle = useViewerHandle();
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { key: 'a', handle }),
                createElement(TriiiceratopsViewer, { key: 'b', handle }),
            );
        }

        // The conflict is thrown from the second viewer's mount effect, so
        // React surfaces it as a failure of the whole commit.
        try {
            await act(async () => {
                root?.render(createElement(App));
            });
            await act(async () => {
                await settle();
            });
        } catch (error) {
            failures.push(error);
        }

        expect(failures.length).toBeGreaterThan(0);
        expect(String(failures[0])).toMatch(/already bound/);
        // The root is not recoverable after a failed commit; skip the shared
        // teardown rather than unmount a broken tree.
        root = null;
    });
});

describe('post-mount updates from parent state', () => {
    it('directs the live viewer when the parent re-renders with a new canvasId', async () => {
        let setCanvas: ((next: string) => void) | null = null;

        function App(): ReactNode {
            const [canvasId, set] = useState('https://example.org/canvas/1');
            setCanvas = set;
            return createElement(TriiiceratopsViewer, { canvasId });
        }

        await render(createElement(App));
        const element = viewerElement();
        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/1',
        );

        await act(async () => {
            setCanvas?.('https://example.org/canvas/2');
        });
        await act(async () => {
            await settle();
        });

        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/2',
        );
    });
});
