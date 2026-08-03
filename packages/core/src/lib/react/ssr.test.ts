/**
 * @vitest-environment node
 *
 * `triiiceratops/react` on a server.
 *
 * The environment override removes the browser globals entirely, so an
 * accidental top-level `window` / `document` / `customElements` access is a hard
 * failure rather than a silent success against happy-dom's shims.
 *
 * Two promises are checked here. Importing the entry point must be inert:
 * evaluation registers nothing and reaches for nothing. And rendering
 * `<TriiiceratopsViewer>` must emit an INERT host carrying the attribute tier
 * and forwarded host attributes only — no shadow-DOM internals, no
 * property-tier values, no state-reading content.
 */

import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

describe('module evaluation', () => {
    it('has no browser globals to touch', () => {
        expect((globalThis as { window?: unknown }).window).toBeUndefined();
        expect((globalThis as { document?: unknown }).document).toBeUndefined();
        expect(
            (globalThis as { customElements?: unknown }).customElements,
        ).toBeUndefined();
    });

    it('imports the entry point and registers nothing', async () => {
        const react = await import('../react.js');

        expect(typeof react.TriiiceratopsViewer).toBe('function');
        expect(typeof react.ViewerProvider).toBe('function');
        expect(typeof react.useViewerHandle).toBe('function');
        expect(typeof react.useViewer).toBe('function');
        expect(typeof react.useViewerSelector).toBe('function');
        expect(react.VIEWER_ELEMENT_TAG).toBe('triiiceratops-viewer');

        expect(
            (globalThis as { customElements?: unknown }).customElements,
        ).toBeUndefined();
    });
});

describe('server rendering', () => {
    it('emits an inert host with the attribute tier and host attributes only', async () => {
        const { renderToStaticMarkup } = await import('react-dom/server');
        const { TriiiceratopsViewer } = await import('../react.js');

        const html = renderToStaticMarkup(
            createElement(TriiiceratopsViewer, {
                manifestId: 'https://example.org/manifest',
                canvasId: 'https://example.org/canvas/1',
                theme: 'dark',
                id: 'the-viewer',
                className: 'tall',
                'data-analytics-id': 'viewer-1',
                // Property-tier inputs: assigned in the browser, never
                // serialized into the server's markup.
                manifestJson: { '@id': 'https://example.org/manifest' },
                plugins: [],
                searchProvider: async () => [],
            }),
        );

        expect(html).toContain('<triiiceratops-viewer');
        expect(html).toContain('manifest-id="https://example.org/manifest"');
        expect(html).toContain('canvas-id="https://example.org/canvas/1"');
        expect(html).toContain('theme="dark"');
        expect(html).toContain('id="the-viewer"');
        expect(html).toContain('class="tall"');
        expect(html).toContain('data-analytics-id="viewer-1"');

        // Nothing from the property tier, and no viewer internals.
        expect(html).not.toContain('manifest-json');
        expect(html).not.toContain('searchprovider');
        expect(html).not.toContain('plugins=');
        expect(html).toMatch(/><\/triiiceratops-viewer>$/);
    });

    it('renders no host attributes at all for a bare viewer', async () => {
        const { renderToStaticMarkup } = await import('react-dom/server');
        const { TriiiceratopsViewer } = await import('../react.js');

        expect(
            renderToStaticMarkup(createElement(TriiiceratopsViewer, {})),
        ).toBe('<triiiceratops-viewer></triiiceratops-viewer>');
    });

    it('fails loudly when a state-reading component renders on the server', async () => {
        const { renderToStaticMarkup } = await import('react-dom/server');
        const { useViewerSelector, useViewer } = await import('../react.js');
        const { createViewerHandleSlot } =
            await import('../framework/index.js');
        const slot = createViewerHandleSlot();

        function Selecting(): null {
            useViewerSelector(slot, (state) => state.canvasId);
            return null;
        }
        function Reading(): null {
            useViewer(slot);
            return null;
        }

        // `getServerSnapshot` is deliberately omitted: state-reading components
        // do not render on the server, so React's own missing-snapshot error is
        // the correct, loud failure rather than an undesigned readiness path.
        expect(() =>
            renderToStaticMarkup(createElement(Selecting)),
        ).toThrowError(/getServerSnapshot/);
        expect(() => renderToStaticMarkup(createElement(Reading))).toThrowError(
            /getServerSnapshot/,
        );
    });
});
