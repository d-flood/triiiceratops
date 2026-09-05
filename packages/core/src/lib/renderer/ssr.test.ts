/**
 * @vitest-environment node
 *
 * The Canvas2D renderer on a server.
 *
 * The environment override removes the browser globals entirely, so an
 * accidental module-scope `window` / `document` / `navigator` access anywhere in
 * the renderer's module graph is a hard failure here rather than a silent
 * success against happy-dom's shims.
 *
 * Being first-party code, the renderer needs no dynamic import to be SSR-safe —
 * the previous renderer's component deferred its library import for exactly this
 * reason. The requirement reduces to: nothing at module scope touches the DOM,
 * and the canvas is created on mount.
 */

import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import CanvasHost from '../components/CanvasHost.svelte';

describe('renderer module evaluation', () => {
    it('has no browser globals to touch', () => {
        expect((globalThis as { window?: unknown }).window).toBeUndefined();
        expect((globalThis as { document?: unknown }).document).toBeUndefined();
        // `navigator` is deliberately not asserted absent: Node ships its own
        // global `navigator`, so its presence proves nothing either way. What
        // matters — that the renderer never sniffs it — is covered by the
        // drawer-selection module having no successor at all.
    });

    it('imports the whole renderer graph without reaching for anything', async () => {
        const [planner, painter, math, descriptors] = await Promise.all([
            import('./planScene'),
            import('./paintScene'),
            import('./viewportMath'),
            import('./canvasDescriptors'),
        ]);

        expect(typeof planner.planScene).toBe('function');
        expect(typeof painter.paintScene).toBe('function');
        expect(typeof math.canvasToScreen).toBe('function');
        expect(typeof descriptors.toPlannerCanvases).toBe('function');
    });
});

describe('server-rendering the canvas host', () => {
    /** The narrow slice of viewer state the host reads during render. */
    const viewerState = {
        config: { transparentBackground: false },
        manifestId: null,
        canvasId: null,
        viewingMode: 'individuals',
        viewingDirection: 'left-to-right',
        preserveCanvasScale: false,
        getCanvases: () => [],
        getSelectedChoice: () => undefined,
    };

    it('emits inert markup with no DOM access', () => {
        const { body } = render(CanvasHost, {
            props: {
                tileSources: null,
                viewerState: viewerState as any,
            },
        });

        expect(body).toContain('canvas-renderer-root');
        expect(body).toContain('canvas-renderer-surface');
        expect(body).toContain('<canvas');
    });

    it('renders with a transparent background configured', () => {
        const { body } = render(CanvasHost, {
            props: {
                tileSources: null,
                viewerState: {
                    ...viewerState,
                    config: { transparentBackground: true },
                } as any,
            },
        });

        expect(body).toContain('canvas-renderer-root');
        // The background class is what carries the CSS `background-color`; with
        // a transparent background configured it is simply absent.
        expect(body).not.toContain('has-bg');
    });
});
