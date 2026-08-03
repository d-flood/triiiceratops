/**
 * @vitest-environment node
 *
 * `triiiceratops/vue` on a server.
 *
 * The environment override removes the browser globals entirely, so an
 * accidental top-level `window` / `document` / `customElements` access is a hard
 * failure rather than a silent success against happy-dom's shims.
 *
 * Two promises are checked here. Importing the entry point must be inert:
 * evaluation registers nothing and reaches for nothing. And rendering
 * `<TriiiceratopsViewer>` must emit an INERT host carrying the attribute tier
 * and forwarded host attributes only — no shadow-DOM internals, no
 * property-tier values, no state-reading application content.
 */

import { createSSRApp, defineComponent, h } from 'vue';
import type { VNode } from 'vue';
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
        const vue = await import('../vue.js');

        expect(typeof vue.TriiiceratopsViewer).toBe('object');
        expect(typeof vue.ViewerProvider).toBe('object');
        expect(typeof vue.provideViewer).toBe('function');
        expect(typeof vue.useViewer).toBe('function');
        expect(typeof vue.useViewerSelector).toBe('function');
        expect(vue.VIEWER_ELEMENT_TAG).toBe('triiiceratops-viewer');

        expect(
            (globalThis as { customElements?: unknown }).customElements,
        ).toBeUndefined();
    });
});

describe('server rendering', () => {
    it('emits an inert host with the attribute tier and host attributes only', async () => {
        const { renderToString } = await import('vue/server-renderer');
        const { TriiiceratopsViewer } = await import('../vue.js');

        const html = await renderToString(
            createSSRApp(
                defineComponent({
                    setup: () => (): VNode =>
                        h(TriiiceratopsViewer, {
                            manifestId: 'https://example.org/manifest',
                            canvasId: 'https://example.org/canvas/1',
                            theme: 'dark',
                            id: 'the-viewer',
                            class: 'tall',
                            'data-analytics-id': 'viewer-1',
                            // Property-tier inputs: assigned in the
                            // browser, never serialized into the markup.
                            manifestJson: {
                                '@id': 'https://example.org/manifest',
                            },
                            plugins: [],
                            searchProvider: async () => [],
                        }),
                }),
            ),
        );

        expect(html).toContain('<triiiceratops-viewer');
        expect(html).toContain('manifest-id="https://example.org/manifest"');
        expect(html).toContain('canvas-id="https://example.org/canvas/1"');
        expect(html).toContain('theme="dark"');
        expect(html).toContain('id="the-viewer"');
        expect(html).toContain('class="tall"');
        expect(html).toContain('data-analytics-id="viewer-1"');

        // Nothing from the property tier, no viewer internals, and no stray
        // `^` from the force-as-attribute markers.
        expect(html).not.toContain('manifest-json');
        expect(html).not.toContain('searchprovider');
        expect(html).not.toContain('plugins=');
        expect(html).not.toContain('^');
        expect(html).toMatch(/><\/triiiceratops-viewer>$/);
    });

    it('renders no host attributes at all for a bare viewer', async () => {
        const { renderToString } = await import('vue/server-renderer');
        const { TriiiceratopsViewer } = await import('../vue.js');

        expect(
            await renderToString(
                createSSRApp(
                    defineComponent({
                        setup: () => (): VNode => h(TriiiceratopsViewer),
                    }),
                ),
            ),
        ).toBe('<triiiceratops-viewer></triiiceratops-viewer>');
    });

    it('renders nothing for the viewer state a server does not have', async () => {
        const { renderToString } = await import('vue/server-renderer');
        const { provideViewer, useViewer, useViewerSelector } =
            await import('../vue.js');
        const { shallowRef } = await import('vue');

        const Reader = defineComponent({
            setup() {
                const state = useViewer();
                const canvasId = useViewerSelector((s) => s.canvasId);
                return (): VNode =>
                    h(
                        'span',
                        `${state.value === undefined ? 'none' : 'live'}:${String(canvasId.value)}`,
                    );
            },
        });

        // Reads are nullable rather than gated, so a state-reading component
        // renders the same "not ready" shape on the server as on the client's
        // first paint — no readiness special case, no hydration mismatch.
        const html = await renderToString(
            createSSRApp(
                defineComponent({
                    setup() {
                        provideViewer(shallowRef(null));
                        return (): VNode => h(Reader);
                    },
                }),
            ),
        );

        expect(html).toBe('<span>none:undefined</span>');
    });
});
