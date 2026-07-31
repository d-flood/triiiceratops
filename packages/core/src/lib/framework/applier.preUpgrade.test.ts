import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { SearchProvider } from '../types/config.js';
import { createViewerPropApplier } from './applier.js';
import type { TriiiceratopsViewerElement } from './types.js';

/**
 * The applier against an element whose tag is NOT yet registered.
 *
 * This lives in its own file because the custom-element registry is per test
 * file: registering the element in any earlier test would destroy the very
 * condition under test. A framework wrapper hits this ordering on every first
 * mount — the element bundle arrives through a lazy dynamic import, and first
 * paint is deliberately not gated on it — so the applier must assign
 * properties, not attributes, before the tag exists.
 *
 * happy-dom implements no custom-element upgrade at all: `customElements.upgrade`
 * is a documented no-op and `define` does not walk the document. The platform's
 * upgrade step is therefore reproduced explicitly below, by transplanting the
 * exact own-property state the applier left on the unregistered element onto a
 * registered instance. Everything after that point — Svelte's porting loop, its
 * deletion of the shadowing own property, and delivery to the component — is
 * the real element's own code, unmodified.
 *
 * `applier.upgrade.test.ts` drives the same path with nothing simulated, in
 * jsdom, which does implement the upgrade algorithm. Both are kept: this file
 * covers what the applier leaves on an unregistered element (including the
 * delete-rather-than-assign-`undefined` rule), the other covers what the
 * platform then does with it.
 */

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

type Element = TriiiceratopsViewerElement & Record<string, unknown>;

const mounted: HTMLElement[] = [];

beforeAll(() => {
    installInertAnimations();
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

afterEach(async () => {
    for (const element of mounted.splice(0)) element.remove();
    await settle(0);
});

function createElement(): Element {
    const element = document.createElement(VIEWER_TAG) as Element;
    mounted.push(element);
    return element;
}

const PROPERTY_TIER_ATTRIBUTES = [
    'manifest-json',
    'manifestjson',
    'theme-config',
    'themeconfig',
    'config',
    'initial-canvas-region',
    'initialcanvasregion',
    'plugins',
    'searchprovider',
    'search-provider',
];

describe('applying property-tier inputs before registration', () => {
    it('assigns objects and functions as properties, never as attributes', () => {
        expect(isRealViewerElementDefined()).toBe(false);
        expect(customElements.get(VIEWER_TAG)).toBeUndefined();

        const element = createElement();
        const manifestJson = { '@id': 'https://example.org/manifest' };
        const themeConfig = { primary: '#3b82f6' };
        const config = { debug: false };
        const initialCanvasRegion = { x: 1, y: 2, width: 3, height: 4 };
        const plugins: never[] = [];
        const searchProvider = (async () => []) as SearchProvider;

        // Synchronous: the applier never awaits registration, so nothing here
        // is deferred behind a dynamic import.
        createViewerPropApplier(element).apply({
            manifestJson,
            themeConfig,
            config,
            initialCanvasRegion,
            plugins,
            searchProvider,
        });

        // Each value is on the element as itself, by reference.
        expect(element.manifestJson).toBe(manifestJson);
        expect(element.themeConfig).toBe(themeConfig);
        expect(element.config).toBe(config);
        expect(element.initialCanvasRegion).toBe(initialCanvasRegion);
        expect(element.plugins).toBe(plugins);
        expect(element.searchProvider).toBe(searchProvider);

        // Nothing was stringified into an attribute. This is the failure mode
        // Vue's `shouldSetAsProp` produces when a property-tier value is routed
        // through vnode props on a not-yet-defined element.
        for (const attribute of PROPERTY_TIER_ATTRIBUTES) {
            expect(element.getAttribute(attribute)).toBeNull();
        }
        expect(element.attributes).toHaveLength(0);
    });

    it('clears by deleting the own property, never by assigning undefined', () => {
        const element = createElement();
        const applier = createViewerPropApplier(element);

        applier.apply({ config: { debug: true } });
        expect(
            Object.getOwnPropertyDescriptor(element, 'config'),
        ).toBeDefined();

        applier.apply({});

        // Svelte's porting loop skips keys whose value is `undefined`, so an
        // `undefined` left here would never be ported AND never removed: the
        // own property would shadow the prototype accessor for the rest of the
        // element's life and silently swallow every later assignment.
        expect(
            Object.getOwnPropertyDescriptor(element, 'config'),
        ).toBeUndefined();
        expect('config' in element).toBe(false);
    });

    it('ports pre-registration properties into the viewer once the element upgrades', async () => {
        const element = createElement();
        const manifestJson = { '@id': 'https://example.org/manifest' };
        const searchProvider = (async () => []) as SearchProvider;
        const plugins: never[] = [];
        createViewerPropApplier(element).apply({
            manifestJson,
            plugins,
            searchProvider,
        });

        // The tag becomes available — the lazy dynamic import has resolved.
        defineRealViewerElement();

        // Reproduce the platform's upgrade: a browser adopts the registered
        // prototype and keeps the own data properties the host assigned, which
        // then shadow Svelte's accessors. happy-dom cannot do this, so the
        // resulting state is transplanted onto a registered instance verbatim.
        const upgraded = createElement();
        for (const prop of ['manifestJson', 'plugins', 'searchProvider']) {
            const descriptor = Object.getOwnPropertyDescriptor(element, prop);
            expect(descriptor).toBeDefined();
            Object.defineProperty(upgraded, prop, descriptor!);
        }
        expect(
            Object.getOwnPropertyDescriptor(upgraded, 'manifestJson'),
        ).toBeDefined();

        document.body.appendChild(upgraded);
        await settle();

        // From here on it is entirely the real element's own behavior: the
        // porting loop moved each value into the component's props and deleted
        // the shadowing own property.
        for (const prop of ['manifestJson', 'plugins', 'searchProvider']) {
            expect(
                Object.getOwnPropertyDescriptor(upgraded, prop),
            ).toBeUndefined();
        }
        expect(upgraded.manifestJson).toBe(manifestJson);
        expect(upgraded.plugins).toBe(plugins);
        expect(upgraded.searchProvider).toBe(searchProvider);

        // End to end: the function-valued input reached the live viewer.
        expect(upgraded.viewerState?.searchProvider).toBe(searchProvider);
        for (const attribute of PROPERTY_TIER_ATTRIBUTES) {
            expect(upgraded.getAttribute(attribute)).toBeNull();
        }
    });
});
