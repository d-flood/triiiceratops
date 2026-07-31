/**
 * @vitest-environment jsdom
 *
 * The applier across a REAL custom-element upgrade, and edge-triggering
 * against the one attribute the element actually reflects.
 *
 * This file runs in jsdom rather than the suite's happy-dom because jsdom
 * implements the custom-element upgrade algorithm and happy-dom does not
 * (`CustomElementRegistry.upgrade` is a documented no-op there, and `define`
 * does not walk the document). `applier.preUpgrade.test.ts` reproduces the
 * upgrade by hand for the cases that need happy-dom; this one lets the platform
 * do it, so the ordering a framework wrapper hits on every first mount — props
 * assigned while the lazy element bundle is still in flight, then the tag
 * appears, then the browser upgrades the live element — is exercised end to end
 * with nothing simulated.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { SearchProvider } from '../types/config.js';
import { createViewerPropApplier } from './applier.js';
import { viewerElementAttributes } from './props.js';
import type { TriiiceratopsViewerElement } from './types.js';

vi.mock('openseadragon', async () => {
    const { createOsdModuleMock } =
        await import('../test/utils/realViewerElement.js');
    return createOsdModuleMock();
});

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

type Element = TriiiceratopsViewerElement & Record<string, unknown>;

/** jsdom lacks the handful of browser APIs the viewer reads while mounting. */
function installJsdomShims(): void {
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
}

beforeAll(() => {
    installJsdomShims();
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

describe('a real upgrade of an element the applier already wrote to', () => {
    it('is a real upgrade: jsdom adopts the registered class', () => {
        // Guard the premise. If this ever stops holding, every assertion below
        // would pass vacuously against an element that never upgraded.
        const probe = document.createElement('upgrade-premise-probe');
        document.body.appendChild(probe);
        class Probe extends HTMLElement {
            upgraded = true;
        }
        customElements.define('upgrade-premise-probe', Probe);

        expect(probe).toBeInstanceOf(Probe);
        expect((probe as unknown as Probe).upgraded).toBe(true);
    });

    it('delivers pre-registration properties to the live viewer, never as attributes', async () => {
        expect(customElements.get(VIEWER_TAG)).toBeUndefined();

        const element = document.createElement(VIEWER_TAG) as Element;
        const manifestJson = { '@id': 'https://example.org/manifest' };
        const searchProvider = (async () => []) as SearchProvider;
        const plugins: never[] = [];

        // What a wrapper does on first render: write the property tier
        // imperatively and the attribute tier declaratively, both before the
        // lazy element bundle has resolved.
        createViewerPropApplier(element).apply({
            manifestJson,
            plugins,
            searchProvider,
        });
        for (const [name, value] of Object.entries(
            viewerElementAttributes({
                canvasId: 'https://example.org/canvas/1',
                theme: 'dark',
            }),
        )) {
            element.setAttribute(name, value);
        }

        // Only the attribute tier is on the element as attributes. Nothing was
        // stringified — the failure Vue's `shouldSetAsProp` produces when a
        // property-tier value goes through vnode props on an unknown element.
        expect(element.attributes).toHaveLength(2);
        expect(element.getAttribute('manifest-json')).toBeNull();
        expect(element.getAttribute('plugins')).toBeNull();
        expect(element.getAttribute('searchprovider')).toBeNull();

        document.body.appendChild(element);

        // The dynamic import resolves and the tag is defined. The platform
        // upgrades the already-connected element for real; everything after
        // this point is the element's own code.
        defineRealViewerElement();
        await settle();

        for (const prop of ['manifestJson', 'plugins', 'searchProvider']) {
            // Svelte's porting loop moved the value into the component's props
            // and deleted the own property shadowing its accessor.
            expect(
                Object.getOwnPropertyDescriptor(element, prop),
            ).toBeUndefined();
        }
        expect(element.manifestJson).toBe(manifestJson);
        expect(element.plugins).toBe(plugins);
        expect(element.searchProvider).toBe(searchProvider);
        expect(element.canvasId).toBe('https://example.org/canvas/1');
        expect(element.theme).toBe('dark');
        // End to end: the function-valued input reached the live viewer.
        expect(element.viewerState?.searchProvider).toBe(searchProvider);
    });
});

describe('edge-triggering against a reflected attribute', () => {
    it('writes nothing when an unchanged canvasId is re-asserted after navigation', async () => {
        const element = document.createElement(VIEWER_TAG) as Element;
        document.body.appendChild(element);
        await settle();

        const attributeWrites: string[] = [];
        const setAttribute = element.setAttribute.bind(element);
        element.setAttribute = ((name: string, value: string) => {
            attributeWrites.push(`${name}=${value}`);
            setAttribute(name, value);
        }) as typeof element.setAttribute;
        const removeAttribute = element.removeAttribute.bind(element);
        element.removeAttribute = ((name: string) => {
            attributeWrites.push(`-${name}`);
            removeAttribute(name);
        }) as typeof element.removeAttribute;

        const props = {
            manifestId: 'https://example.org/manifest',
            canvasId: 'https://example.org/canvas/1',
        };
        const applier = createViewerPropApplier(element);
        applier.apply(props);
        // The applier is property-tier only: the attribute tier is the
        // wrapper's declarative render, so `apply` never touches an attribute.
        expect(attributeWrites).toEqual([]);

        // Internal navigation. `canvas-id` REFLECTS, so the element's own
        // attribute now disagrees with the prop the wrapper is holding.
        element.canvasId = 'https://example.org/canvas/9';
        await settle();
        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/9',
        );

        // The parent re-renders with the same props. Edge-triggering is against
        // the last APPLIED prop value, never against the element's state, so
        // the user's navigation is not undone.
        attributeWrites.length = 0;
        applier.apply(props);
        applier.apply(props);

        expect(attributeWrites).toEqual([]);
        expect(element.getAttribute('canvas-id')).toBe(
            'https://example.org/canvas/9',
        );
        expect(element.canvasId).toBe('https://example.org/canvas/9');
    });
});
