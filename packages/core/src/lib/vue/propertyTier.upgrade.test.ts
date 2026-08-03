/**
 * @vitest-environment jsdom
 *
 * The property tier while the element is still UNDEFINED, then across a REAL
 * custom-element upgrade.
 *
 * This is the case the wrapper's "never through vnode props" rule exists for:
 * Vue's `shouldSetAsProp` ends in `key in el`, so on an element the lazy
 * registration import has not defined yet, a property-tier vnode prop would
 * take the `setAttribute(key, String(value))` path and stringify a manifest
 * object or a search function into an attribute. Every other Vue file in this
 * directory registers the element in `beforeAll` and runs under happy-dom,
 * which implements no upgrade at all — so none of them can observe the
 * pre-definition window. jsdom implements the real upgrade algorithm, so this
 * file drives the whole ordering a first mount actually hits: props applied
 * while the element bundle is still in flight, then the tag appears, then the
 * browser upgrades the live element.
 */

import { createApp, defineComponent, h, type App, type VNode } from 'vue';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { SearchProvider } from '../types/config.js';
import type { TriiiceratopsViewerElement } from '../framework/index.js';
import {
    ensureViewerElementRegistered,
    TriiiceratopsElementVersionError,
} from '../framework/index.js';
import { TriiiceratopsViewer } from './viewer.js';

vi.mock('openseadragon', async () => {
    const { createOsdModuleMock } =
        await import('../test/utils/realViewerElement.js');
    return createOsdModuleMock();
});

const {
    defineRealViewerElement,
    installInertAnimations,
    isRealViewerElementDefined,
    settle,
    VIEWER_TAG,
} = await import('../test/utils/realViewerElement.js');

/** jsdom lacks the handful of browser APIs the viewer reads while mounting. */
beforeAll(() => {
    installInertAnimations();
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    class InertObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', InertObserver);
    vi.stubGlobal('IntersectionObserver', InertObserver);
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

describe('the property tier before <triiiceratops-viewer> is defined', () => {
    it('writes properties, stringifies nothing into attributes, and survives the upgrade', async () => {
        // Guard the premise: everything below is vacuous if the tag is already
        // registered, because then Vue's `key in el` would be true anyway.
        expect(isRealViewerElementDefined()).toBe(false);

        const manifestJson = { '@id': 'https://example.org/manifest' };
        const config = { debug: false };
        const searchProvider = (async () => []) as SearchProvider;

        const container = document.createElement('div');
        document.body.appendChild(container);

        const app: App = createApp(
            defineComponent({
                setup: () => (): VNode =>
                    h(TriiiceratopsViewer, {
                        manifestId: 'https://example.org/manifest',
                        manifestJson,
                        config,
                        searchProvider,
                    }),
            }),
        );
        // The wrapper's lazy registration import is stubbed inert under vitest,
        // so it necessarily fails to define the tag; the wrapper reports that
        // through Vue's own error handling. Capture it, and settle the memoized
        // registration HERE so the outcome is deterministic rather than racing
        // the `defineRealViewerElement()` below.
        const appErrors: unknown[] = [];
        app.config.errorHandler = (error: unknown): void => {
            appErrors.push(error);
        };
        app.mount(container);
        await ensureViewerElementRegistered().catch(() => {});
        await settle(0);
        expect(appErrors).toHaveLength(1);
        expect(appErrors[0]).toBeInstanceOf(TriiiceratopsElementVersionError);

        const element = container.querySelector(
            VIEWER_TAG,
        ) as TriiiceratopsViewerElement & Record<string, unknown>;
        expect(element).toBeTruthy();
        // Still a plain, un-upgraded element: the pre-definition window.
        expect(element.constructor).toBe(HTMLElement);

        // The attribute tier is declarative and reached the DOM as kebab.
        expect(element.getAttribute('manifest-id')).toBe(
            'https://example.org/manifest',
        );
        // The property tier is a PROPERTY, carrying the consumer's own
        // identity…
        expect(element.manifestJson).toBe(manifestJson);
        expect(element.config).toBe(config);
        expect(element.searchProvider).toBe(searchProvider);
        // …and nothing was stringified into an attribute.
        for (const name of element.getAttributeNames()) {
            expect(name).not.toMatch(/manifest-?json|config|search-?provider/i);
        }
        expect(element.outerHTML).not.toContain('[object Object]');

        // The element bundle "arrives": the platform upgrades the live element
        // and the element's own `connectedCallback` ports the pre-upgrade
        // properties into the inner viewer.
        defineRealViewerElement();
        await settle();

        expect(element.constructor).not.toBe(HTMLElement);
        expect(element.viewerState).toBeDefined();
        expect(element.viewerState?.searchProvider).toBe(searchProvider);
        for (const name of element.getAttributeNames()) {
            expect(name).not.toMatch(/manifest-?json|config|search-?provider/i);
        }

        app.unmount();
        container.remove();
    });
});
