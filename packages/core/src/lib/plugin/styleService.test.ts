// Root-aware plugin style service tests (ticket 08).
//
// Exercises the SPEC.md behaviors: package-qualified keys, dedupe + refcount
// across activations sharing a root, light-DOM (document) vs shadow-root
// targeting, and both the constructable-stylesheet path and the nonce-aware
// <style> fallback.

import { afterEach, describe, expect, it } from 'vitest';

import { createPluginStyleService } from './styleService';

/** A fresh, isolated shadow root per test (no cross-test registry leakage). */
function makeShadowRoot(): ShadowRoot {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
}

const CSS = '.x { color: red }';

describe('style service — constructable path (dedupe + refcount)', () => {
    it('installs one adopted sheet per key and dedupes repeated installs', () => {
        const root = makeShadowRoot();
        const svc = createPluginStyleService(root, '@triiiceratops/plugin-a');

        const un1 = svc.install(CSS, 'main');
        expect(root.adoptedStyleSheets).toHaveLength(1);

        // Same key again: no second sheet (deduped), just a bumped refcount.
        const un2 = svc.install(CSS, 'main');
        expect(root.adoptedStyleSheets).toHaveLength(1);

        // Release one: the sheet stays (refcount still > 0).
        un1();
        expect(root.adoptedStyleSheets).toHaveLength(1);

        // Release the last: the sheet is removed.
        un2();
        expect(root.adoptedStyleSheets).toHaveLength(0);
    });

    it('uninstallers are idempotent (double release drops only one reference)', () => {
        const root = makeShadowRoot();
        const svc = createPluginStyleService(root, '@triiiceratops/plugin-a');

        const unA = svc.install(CSS, 'main');
        const unB = svc.install(CSS, 'main');

        unA();
        unA(); // second call is a no-op; must not over-decrement.
        expect(root.adoptedStyleSheets).toHaveLength(1);

        unB();
        expect(root.adoptedStyleSheets).toHaveLength(0);
    });

    it('keys are package-qualified: same id, different plugin = two sheets', () => {
        const root = makeShadowRoot();
        const a = createPluginStyleService(root, '@triiiceratops/plugin-a');
        const b = createPluginStyleService(root, '@triiiceratops/plugin-b');

        const unA = a.install(CSS, 'main');
        const unB = b.install(CSS, 'main');
        expect(root.adoptedStyleSheets).toHaveLength(2);

        unA();
        unB();
    });

    it('two activations (viewers) sharing a root refcount to 2 for one sheet', () => {
        const root = makeShadowRoot();
        // Same plugin activated on two viewers that share the root.
        const viewer1 = createPluginStyleService(root, '@triiiceratops/plugin-a');
        const viewer2 = createPluginStyleService(root, '@triiiceratops/plugin-a');

        const un1 = viewer1.install(CSS, 'shared');
        const un2 = viewer2.install(CSS, 'shared');
        // One shared sheet, refcount 2.
        expect(root.adoptedStyleSheets).toHaveLength(1);

        un1();
        expect(root.adoptedStyleSheets).toHaveLength(1); // viewer2 still holds it
        un2();
        expect(root.adoptedStyleSheets).toHaveLength(0);
    });

    it('separate roots (two web components) each get their own sheet', () => {
        const rootA = makeShadowRoot();
        const rootB = makeShadowRoot();
        const a = createPluginStyleService(rootA, '@triiiceratops/plugin-a');
        const b = createPluginStyleService(rootB, '@triiiceratops/plugin-a');

        const unA = a.install(CSS, 'shared');
        const unB = b.install(CSS, 'shared');
        expect(rootA.adoptedStyleSheets).toHaveLength(1);
        expect(rootB.adoptedStyleSheets).toHaveLength(1);

        unA();
        unB();
    });
});

describe('style service — light-DOM (document) targeting', () => {
    afterEach(() => {
        document.adoptedStyleSheets = [];
        document
            .querySelectorAll('style[data-triiiceratops-plugin-style]')
            .forEach((el) => el.remove());
    });

    it('installs into the document root', () => {
        const svc = createPluginStyleService(
            document,
            '@triiiceratops/plugin-doc',
        );
        const before = document.adoptedStyleSheets.length;
        const un = svc.install(CSS, 'main');
        expect(document.adoptedStyleSheets.length).toBe(before + 1);
        un();
        expect(document.adoptedStyleSheets.length).toBe(before);
    });
});

describe('style service — nonce-aware <style> fallback', () => {
    afterEach(() => {
        document
            .querySelectorAll('style[data-triiiceratops-plugin-style]')
            .forEach((el) => el.remove());
    });

    it('appends a <style> element carrying the supplied nonce, and removes it on release', () => {
        const root = makeShadowRoot();
        const svc = createPluginStyleService(
            root,
            '@triiiceratops/plugin-fallback',
            { forceFallback: true, nonce: 'test-nonce' },
        );

        const un = svc.install(CSS, 'main');
        const el = root.querySelector<HTMLStyleElement>(
            'style[data-triiiceratops-plugin-style]',
        );
        expect(el).not.toBeNull();
        expect(el?.textContent).toBe(CSS);
        // The nonce is carried (IDL property or reflected attribute).
        expect(el?.nonce || el?.getAttribute('nonce')).toBe('test-nonce');
        // No constructable sheet was adopted on the fallback path.
        expect(root.adoptedStyleSheets).toHaveLength(0);

        un();
        expect(
            root.querySelector('style[data-triiiceratops-plugin-style]'),
        ).toBeNull();
    });

    it('discovers a nonce from a <meta property="csp-nonce"> element', () => {
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'csp-nonce');
        meta.setAttribute('content', 'discovered-nonce');
        document.head.appendChild(meta);

        const svc = createPluginStyleService(
            document,
            '@triiiceratops/plugin-discover',
            { forceFallback: true },
        );
        const un = svc.install(CSS, 'main');
        const el = document.querySelector<HTMLStyleElement>(
            'style[data-triiiceratops-plugin-style]',
        );
        expect(el?.nonce || el?.getAttribute('nonce')).toBe('discovered-nonce');

        un();
        meta.remove();
    });

    it('prefers the nonce <style> fallback (over constructable) when the host advertises a csp-nonce meta', () => {
        // Ticket 24: a host running a nonce-based `style-src` publishes its nonce
        // via <meta property="csp-nonce">; the service must then take the
        // nonce-aware fallback even without an explicit forceFallback, because a
        // constructable/adopted sheet cannot carry the nonce.
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'csp-nonce');
        meta.setAttribute('content', 'meta-drives-fallback');
        document.head.appendChild(meta);

        const root = makeShadowRoot();
        const svc = createPluginStyleService(
            root,
            '@triiiceratops/plugin-meta',
        );
        const un = svc.install(CSS, 'main');

        // No constructable sheet was adopted...
        expect(root.adoptedStyleSheets).toHaveLength(0);
        // ...a nonce-carrying <style> element was appended instead.
        const el = root.querySelector<HTMLStyleElement>(
            'style[data-triiiceratops-plugin-style]',
        );
        expect(el).not.toBeNull();
        expect(el?.nonce || el?.getAttribute('nonce')).toBe(
            'meta-drives-fallback',
        );

        un();
        meta.remove();
    });

    it('fallback dedupes and refcounts like the constructable path', () => {
        const root = makeShadowRoot();
        const svc = createPluginStyleService(
            root,
            '@triiiceratops/plugin-fallback2',
            { forceFallback: true },
        );
        const un1 = svc.install(CSS, 'main');
        const un2 = svc.install(CSS, 'main');
        expect(
            root.querySelectorAll('style[data-triiiceratops-plugin-style]'),
        ).toHaveLength(1);
        un1();
        expect(
            root.querySelectorAll('style[data-triiiceratops-plugin-style]'),
        ).toHaveLength(1);
        un2();
        expect(
            root.querySelectorAll('style[data-triiiceratops-plugin-style]'),
        ).toHaveLength(0);
    });
});
