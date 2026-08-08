/**
 * `useViewer()` and `useViewerSelector()` against a REAL mounted viewer.
 *
 * The subjects here are the things a framework binding over the core selector
 * runtime can get wrong: freezing an inline projection on first render, mutating
 * a shared projection during render, breaking React's `getSnapshot` caching
 * contract, missing the frame cadence, or swallowing a consumer's own failure.
 * All of them need a live `ViewerState` with real batched notifications, so the
 * real element supplies it.
 */

import { act, Component, createElement, useState } from 'react';
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

import { configureLogging, type LogLevel } from '../logging/logger.js';
import { createRendererStub } from '../testing/rendererStub.js';
import type { ViewerState } from '../state/viewer.svelte.js';
import type { PluginError } from '../types/plugin.js';
import type { ViewerError } from '../types/viewerError.js';
import type {
    ReadonlyViewerState,
    TriiiceratopsViewerElement,
    ViewerHandleSlot,
} from '../framework/index.js';
import { ViewerProvider } from './context.js';
import { useViewerHandle } from './handle.js';
import { useViewer, useViewerSelector } from './selector.js';
import { TriiiceratopsViewer } from './viewer.js';

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

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

async function render(node: ReactNode): Promise<void> {
    await act(async () => {
        root?.render(node);
    });
    await act(async () => {
        await settle();
    });
}

/** Let a command's batched notification reach React. */
async function flush(mutate: () => void): Promise<void> {
    await act(async () => {
        mutate();
        await settle();
    });
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

interface BoundaryProps {
    onError: (error: unknown) => void;
    children?: ReactNode;
}

/** An ordinary React error boundary — the consumer's own error handling. */
class Boundary extends Component<BoundaryProps, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(error: unknown): void {
        this.props.onError(error);
    }

    render(): ReactNode {
        if (this.state.failed) {
            return createElement(
                'span',
                { 'data-testid': 'boundary' },
                'caught',
            );
        }
        return this.props.children;
    }
}

describe('reading the current selection', () => {
    it('is undefined until the viewer state exists, then tracks commands', async () => {
        const seen: Array<boolean | undefined> = [];

        function App(): ReactNode {
            const handle = useViewerHandle();
            const open = useViewerSelector(
                handle,
                (state) => state.toolbarOpen,
            );
            seen.push(open);
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { handle }),
                createElement('span', { 'data-testid': 'value' }, String(open)),
            );
        }

        await render(createElement(App));

        expect(seen[0]).toBeUndefined();
        expect(text()).toBe('false');

        await flush(() => liveState().toggleToolbar());
        expect(text()).toBe('true');
    });

    it('gives useViewer the very same live object the handle carries', async () => {
        let slot: ViewerHandleSlot | null = null;
        let fromHook: ReadonlyViewerState | undefined;

        function App(): ReactNode {
            const handle = useViewerHandle();
            slot = handle;
            fromHook = useViewer(handle);
            return createElement(TriiiceratopsViewer, { handle });
        }

        await render(createElement(App));

        expect(fromHook).toBe(liveState());
        expect(fromHook).toBe(
            (slot as unknown as ViewerHandleSlot).get()?.state,
        );
    });

    it('resolves the handle from <ViewerProvider> when none is passed', async () => {
        function Reader(): ReactNode {
            const open = useViewerSelector((state) => state.toolbarOpen);
            return createElement(
                'span',
                { 'data-testid': 'value' },
                String(open),
            );
        }

        function App(): ReactNode {
            const handle = useViewerHandle();
            return createElement(
                ViewerProvider,
                { value: handle },
                createElement(TriiiceratopsViewer, { handle }),
                // Deliberately deep, and after the viewer: the provider gates
                // nothing and imposes no layout constraint.
                createElement('div', null, createElement(Reader)),
            );
        }

        await render(createElement(App));
        expect(text()).toBe('false');

        await flush(() => liveState().toggleToolbar());
        expect(text()).toBe('true');
    });

    it('names the mistake when there is no handle and no provider', async () => {
        const failures: unknown[] = [];

        function Reader(): ReactNode {
            useViewerSelector((state) => state.toolbarOpen);
            return null;
        }

        await render(
            createElement(
                Boundary,
                { onError: (error: unknown) => failures.push(error) },
                createElement(Reader),
            ),
        );

        expect(String(failures[0])).toMatch(/no viewer handle and no/);
        expect(String(failures[0])).toMatch(/useViewerSelector/);
    });
});

describe('inline projections and inline equality', () => {
    it('reads current closure values with no useCallback or useMemo', async () => {
        let setPrefix: ((next: string) => void) | null = null;

        function App(): ReactNode {
            const handle = useViewerHandle();
            const [prefix, set] = useState('a');
            setPrefix = set;
            // An inline arrow whose CLOSURE changes between renders. Freezing
            // the projection on first render would pin `prefix` at 'a' forever.
            const label = useViewerSelector(
                handle,
                (state) => `${prefix}:${state.toolbarOpen}`,
            );
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { handle }),
                createElement('span', { 'data-testid': 'value' }, label),
            );
        }

        await render(createElement(App));
        expect(text()).toBe('a:false');

        await act(async () => setPrefix?.('b'));
        expect(text()).toBe('b:false');

        await flush(() => liveState().toggleToolbar());
        expect(text()).toBe('b:true');
    });

    it('honours a current inline equality function', async () => {
        let renders = 0;
        let setTolerance: ((next: number) => void) | null = null;

        function App(): ReactNode {
            const handle = useViewerHandle();
            const [tolerance, set] = useState(0);
            setTolerance = set;
            renders += 1;
            // Equality is rebuilt every render and closes over `tolerance`.
            const dock = useViewerSelector(handle, (state) => state.dockSide, {
                equals: (a, b) => (tolerance > 0 ? true : a === b),
            });
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { handle }),
                createElement('span', { 'data-testid': 'value' }, String(dock)),
            );
        }

        await render(createElement(App));
        expect(text()).toBe('bottom');

        // Tolerant equality: the projection's cached value is gated, so a real
        // change is reported as "equal" and the displayed value never moves.
        await act(async () => setTolerance?.(1));
        const before = renders;
        await flush(() => liveState().setDockSide('right'));
        expect(text()).toBe('bottom');
        expect(renders).toBe(before);

        // Back to strict equality: the same projection now reports the change.
        await act(async () => setTolerance?.(0));
        expect(text()).toBe('right');
    });

    it('does not loop or warn when a projection returns a fresh object literal', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        let renders = 0;

        function App(): ReactNode {
            const handle = useViewerHandle();
            renders += 1;
            const view = useViewerSelector(handle, (state) => ({
                canvasId: state.canvasId,
                open: state.toolbarOpen,
            }));
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { handle }),
                createElement(
                    'span',
                    { 'data-testid': 'value' },
                    String(view?.open),
                ),
            );
        }

        await render(createElement(App));
        const settledRenders = renders;

        await flush(() => liveState().toggleToolbar());
        expect(text()).toBe('true');

        // A handful of renders, not a runaway loop, and React never complained
        // that `getSnapshot` was uncached.
        expect(renders - settledRenders).toBeLessThan(5);
        expect(
            consoleError.mock.calls.map((call) => String(call[0])).join('\n'),
        ).not.toContain('getSnapshot');
        consoleError.mockRestore();
    });

    it('does not re-render when the selection is unchanged', async () => {
        let renders = 0;

        function Reader({ handle }: { handle: ViewerHandleSlot }): ReactNode {
            renders += 1;
            const dock = useViewerSelector(handle, selectDockSide);
            return createElement(
                'span',
                { 'data-testid': 'value' },
                String(dock),
            );
        }

        function App(): ReactNode {
            const handle = useViewerHandle();
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { handle }),
                createElement(Reader, { handle }),
            );
        }

        await render(createElement(App));
        const before = renders;

        // Three commands that change inventoried members the projection does
        // not read. Every one wakes the runtime; none changes the selection.
        await flush(() => liveState().toggleToolbar());
        await flush(() => liveState().toggleThumbnailGallery());
        await flush(() => liveState().toggleAnnotations());

        expect(renders).toBe(before);
        expect(text()).toBe('bottom');
    });
});

const selectDockSide = (state: ReadonlyViewerState): string => state.dockSide;
const selectToolbarOpen = (state: ReadonlyViewerState): boolean =>
    state.toolbarOpen;
const throwingEquals = (): boolean => {
    throw new Error('equality boom');
};

describe('selector cadence', () => {
    // The acceptance this ticket is measured against: a React wrapper reads
    // zoom REACTIVELY through a `frame`-cadence selector, with no state
    // notification and no requestAnimationFrame loop anywhere.
    it("wakes a frame-cadence projection from the renderer's animation events", async () => {
        const renderer = createRendererStub({ scale: 1 });

        function App(): ReactNode {
            const handle = useViewerHandle();
            const zoom = useViewerSelector(
                handle,
                (state) => state.viewportScale,
                { cadence: 'frame' },
            );
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { handle }),
                createElement('span', { 'data-testid': 'value' }, String(zoom)),
            );
        }

        await render(createElement(App));
        expect(text()).toBe('0');

        await flush(() => {
            liveState().attachRenderer(renderer);
        });
        expect(text()).toBe('1');
        expect(renderer.frameListenerCount).toBeGreaterThan(0);

        await act(async () => {
            renderer.setView({ scale: 4.5 });
            renderer.emitFrame();
            await settle(0);
        });
        expect(text()).toBe('4.5');

        // Unmounting detaches the ticker: an idle viewer costs nothing.
        await act(async () => root?.unmount());
        root = null;
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

        function App(): ReactNode {
            const handle = useViewerHandle();
            const zoom = useViewerSelector(
                handle,
                (state) => state.viewportScale,
            );
            return createElement(
                'div',
                null,
                // The viewer re-applies `config.debug` as it mounts, so debug
                // has to stay on through the element too.
                createElement(TriiiceratopsViewer, {
                    handle,
                    config: { debug: true },
                }),
                createElement('span', { 'data-testid': 'value' }, String(zoom)),
            );
        }

        await render(createElement(App));

        const cadenceWarnings = warnings.filter((message) =>
            message.includes("cadence: 'frame'"),
        );
        expect(cadenceWarnings.length).toBeGreaterThan(0);
    });
});

describe('consumer failures', () => {
    it('reaches a React error boundary and is not reported as a viewer or plugin error', async () => {
        const caught: unknown[] = [];
        const viewerErrors: ViewerError[] = [];
        const pluginErrors: PluginError[] = [];

        function Reader({ handle }: { handle: ViewerHandleSlot }): ReactNode {
            const value = useViewerSelector(handle, () => {
                throw new Error('projection boom');
            });
            return createElement(
                'span',
                { 'data-testid': 'value' },
                String(value),
            );
        }

        function App(): ReactNode {
            const handle = useViewerHandle();
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, {
                    handle,
                    onViewerError: (error) => viewerErrors.push(error),
                    onPluginError: (error) => pluginErrors.push(error),
                }),
                createElement(
                    Boundary,
                    { onError: (error: unknown) => caught.push(error) },
                    createElement(Reader, { handle }),
                ),
            );
        }

        await render(createElement(App));

        expect(caught).toHaveLength(1);
        expect(String(caught[0])).toContain('projection boom');
        // Neither swallowed nor mislabelled, and never served as a stale value.
        expect(viewerErrors).toEqual([]);
        expect(pluginErrors).toEqual([]);
        expect(
            container.querySelector('[data-testid="boundary"]')?.textContent,
        ).toBe('caught');
        // The viewer itself is untouched by its consumer's mistake.
        expect(liveState()).toBeDefined();
    });

    it('surfaces a throwing equality function the same way', async () => {
        const caught: unknown[] = [];

        function Reader({ handle }: { handle: ViewerHandleSlot }): ReactNode {
            // Stable identities, so ONE projection survives the notification
            // and its equality gate actually runs (a gate only compares against
            // a previously cached value).
            const value = useViewerSelector(handle, selectToolbarOpen, {
                equals: throwingEquals,
            });
            return createElement('span', null, String(value));
        }

        function App(): ReactNode {
            const handle = useViewerHandle();
            return createElement(
                'div',
                null,
                createElement(TriiiceratopsViewer, { handle }),
                createElement(
                    Boundary,
                    { onError: (error: unknown) => caught.push(error) },
                    createElement(Reader, { handle }),
                ),
            );
        }

        await render(createElement(App));
        await flush(() => liveState().toggleToolbar());

        expect(caught).toHaveLength(1);
        expect(String(caught[0])).toContain('equality boom');
    });
});
