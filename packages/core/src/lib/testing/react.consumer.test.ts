/**
 * A React consumer's own component, unit-tested against the headless handle.
 *
 * This is the user story the helper exists for (SPEC user story 66): a
 * `<Sidebar>` that reads `useViewerSelector()` and calls a command should be
 * testable like any other store-consuming component — no custom element, no
 * OpenSeadragon, no manifest fetch, no shadow root.
 *
 * So nothing here is stubbed: the component is real React, the hooks are the
 * shipped `triiiceratops/react` hooks, the command is a real `ViewerState`
 * command, and the update arrives on the real batched flush. The only fake is
 * the harness.
 */

import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VIEWER_ELEMENT_TAG } from '../browser-runtime.js';
import { useViewer, useViewerSelector } from '../react/index.js';
import {
    createTestViewerHandle,
    flush,
    type TestViewerHandle,
} from './index.js';

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;
let handle: TestViewerHandle;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    handle = createTestViewerHandle();
});

afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container.remove();
    handle.dispose();
});

async function render(node: ReactNode): Promise<void> {
    await act(async () => {
        root?.render(node);
    });
}

/** A representative consumer component: reads a selector, invokes a command. */
function Sidebar({ viewer }: { viewer: TestViewerHandle }): ReactNode {
    const canvasId = useViewerSelector(viewer, (state) => state.canvasId);
    const toolbarOpen = useViewerSelector(viewer, (state) => state.toolbarOpen);
    const state = useViewer(viewer);
    return createElement(
        'div',
        null,
        createElement('span', { id: 'canvas' }, canvasId ?? 'none'),
        createElement('span', { id: 'toolbar' }, String(toolbarOpen)),
        createElement(
            'button',
            {
                id: 'next',
                onClick: () => state?.setCanvas('https://example.org/canvas/2'),
            },
            'next',
        ),
    );
}

function text(id: string): string | null | undefined {
    return container.querySelector(`#${id}`)?.textContent;
}

describe('a React consumer component reading the headless handle', () => {
    it('renders the real state and updates from a real command', async () => {
        await render(createElement(Sidebar, { viewer: handle }));
        expect(text('canvas')).toBe('none');

        // A real command on the real state, settled on the real batched flush.
        await act(async () => {
            handle.state.setCanvas('https://example.org/canvas/7');
            await flush();
        });

        expect(text('canvas')).toBe('https://example.org/canvas/7');
    });

    it('lets the component itself drive a command through useViewer()', async () => {
        await render(createElement(Sidebar, { viewer: handle }));

        await act(async () => {
            container.querySelector<HTMLButtonElement>('#next')?.click();
            await flush();
        });

        expect(handle.state.canvasId).toBe('https://example.org/canvas/2');
        expect(text('canvas')).toBe('https://example.org/canvas/2');
    });

    it('re-renders once per batched flush, not once per mutation', async () => {
        let renders = 0;
        function Counter(): ReactNode {
            renders++;
            const canvasId = useViewerSelector(handle, (s) => s.canvasId);
            return createElement('span', { id: 'canvas' }, canvasId ?? 'none');
        }
        await render(createElement(Counter));
        const before = renders;

        await act(async () => {
            handle.state.setCanvas('a');
            handle.state.setCanvas('b');
            handle.state.setCanvas('c');
            await flush();
        });

        expect(text('canvas')).toBe('c');
        expect(renders).toBe(before + 1);
    });

    it('gates equal selections, so an unrelated change re-renders nothing', async () => {
        let renders = 0;
        function Toolbar(): ReactNode {
            renders++;
            const visible = useViewerSelector(handle, (s) => s.toolbarOpen);
            return createElement('span', { id: 'toolbar' }, String(visible));
        }
        await render(createElement(Toolbar));
        const before = renders;

        await act(async () => {
            handle.state.setCanvas('https://example.org/canvas/9');
            await flush();
        });

        expect(renders).toBe(before);
    });

    it("reads continuous viewport values with cadence: 'frame'", async () => {
        function Zoom(): ReactNode {
            const zoom = useViewerSelector(
                handle,
                (state) => state.viewportScale,
                { cadence: 'frame' },
            );
            return createElement('span', { id: 'zoom' }, String(zoom));
        }
        await render(createElement(Zoom));
        // No renderer yet: the viewport queries answer with zero rather than
        // making a consumer guard every read.
        expect(text('zoom')).toBe('0');

        let renderer!: ReturnType<TestViewerHandle['attachRenderer']>;
        await act(async () => {
            renderer = handle.attachRenderer({ scale: 1 });
            await flush();
        });
        expect(text('zoom')).toBe('1');

        // The renderer's own animation event — nothing in viewer state moved,
        // and no state notification was delivered.
        await act(async () => {
            renderer.setView({ scale: 3.5 });
            renderer.emitFrame();
        });

        expect(text('zoom')).toBe('3.5');
    });

    it('surfaces a consumer projection failure to a React error boundary', async () => {
        function Broken(): ReactNode {
            useViewerSelector(handle, () => {
                throw new Error('consumer projection blew up');
            });
            return null;
        }

        await expect(render(createElement(Broken))).rejects.toThrow(
            'consumer projection blew up',
        );
    });

    it('reverts to undefined when the handle is disposed', async () => {
        await render(createElement(Sidebar, { viewer: handle }));
        await act(async () => {
            handle.state.setCanvas('https://example.org/canvas/8');
            await flush();
        });
        expect(text('canvas')).toBe('https://example.org/canvas/8');

        await act(async () => {
            handle.dispose();
        });

        expect(text('canvas')).toBe('none');
    });

    it('keeps two handles completely isolated', async () => {
        const second = createTestViewerHandle();
        try {
            await render(
                createElement(
                    'div',
                    null,
                    createElement(Sidebar, { viewer: handle, key: 'a' }),
                    createElement(Sidebar, { viewer: second, key: 'b' }),
                ),
            );

            await act(async () => {
                handle.state.setCanvas('https://example.org/canvas/first');
                await flush();
            });

            const rendered = [...container.querySelectorAll('#canvas')].map(
                (node) => node.textContent,
            );
            expect(rendered).toEqual([
                'https://example.org/canvas/first',
                'none',
            ]);
        } finally {
            // Disposal publishes a null handle, which React treats as a state
            // update on the still-mounted subtree.
            await act(async () => second.dispose());
        }
    });

    it('mounts no custom element in the process', async () => {
        await render(createElement(Sidebar, { viewer: handle }));

        expect(customElements.get(VIEWER_ELEMENT_TAG)).toBeUndefined();
        expect(container.querySelector(VIEWER_ELEMENT_TAG)).toBeNull();
    });
});
