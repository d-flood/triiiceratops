/**
 * @vitest-environment node
 *
 * Module evaluation is SSR-safe.
 *
 * A React or Vue application imports `triiiceratops/react` / `triiiceratops/vue`
 * at the top of a file that also runs on the server. Everything those entry
 * points are built from is this substrate, so evaluating it must not touch
 * `window`, `document`, or `customElements`, and must not register anything.
 *
 * This is the one genuinely DOM-free case in the suite: the environment
 * override above removes the browser globals entirely, so an accidental
 * top-level browser access is a hard failure rather than a silent success
 * against happy-dom's shims.
 */

import { describe, expect, it } from 'vitest';

describe('substrate module evaluation', () => {
    it('has no browser globals to touch', () => {
        expect((globalThis as { window?: unknown }).window).toBeUndefined();
        expect((globalThis as { document?: unknown }).document).toBeUndefined();
        expect(
            (globalThis as { customElements?: unknown }).customElements,
        ).toBeUndefined();
    });

    it('imports with no browser globals and registers nothing', async () => {
        const substrate = await import('./index.js');

        // Evaluation succeeded, and the surface the wrappers need is present.
        expect(typeof substrate.ensureViewerElementRegistered).toBe('function');
        expect(typeof substrate.createViewerBinding).toBe('function');
        expect(typeof substrate.createViewerPropApplier).toBe('function');
        expect(typeof substrate.createViewerHandleSlot).toBe('function');
        expect(typeof substrate.viewerElementAttributes).toBe('function');
        expect(typeof substrate.getSelectorRuntime).toBe('function');
        expect(substrate.VIEWER_ELEMENT_TAG).toBe('triiiceratops-viewer');

        // Nothing was registered, because nothing could have been: importing
        // never calls into the registry.
        expect(
            (globalThis as { customElements?: unknown }).customElements,
        ).toBeUndefined();
    });

    it('builds the attribute tier and compares props without a DOM', async () => {
        const { shallowEqual, viewerElementAttributes } =
            await import('./index.js');

        // The server renders exactly this attribute set; the client's first
        // render emits the same one, which is what makes hydration clean.
        expect(
            viewerElementAttributes({
                manifestId: 'https://example.org/m',
                canvasId: 'https://example.org/c',
                theme: 'dark',
            }),
        ).toEqual({
            'manifest-id': 'https://example.org/m',
            'canvas-id': 'https://example.org/c',
            theme: 'dark',
        });
        expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
    });

    it('creates an inert, unbound handle slot with no browser globals', async () => {
        const { createViewerHandleSlot } = await import('./index.js');
        const slot = createViewerHandleSlot();

        expect(slot.get()).toBeNull();
        // Subscribing must not reach for a browser API either.
        const unsubscribe = slot.subscribe(() => {});
        unsubscribe();
        unsubscribe();
    });

    it('only reaches for `customElements` when registration is requested', async () => {
        const { ensureViewerElementRegistered } = await import('./index.js');

        // Registration is the ONE browser-touching operation, and it is called
        // from a wrapper's browser lifecycle callback — never at module scope.
        // Calling it here proves the reach happens then, not at import.
        await expect(ensureViewerElementRegistered()).rejects.toMatchObject({
            code: 'ELEMENT_REGISTRATION_UNAVAILABLE',
        });
    });
});
