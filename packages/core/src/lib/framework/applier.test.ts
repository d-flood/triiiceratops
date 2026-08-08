import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { definePlugin } from '@triiiceratops/plugin-sdk';

import {
    configureLogging,
    isDebugEnabled,
    type LogLevel,
} from '../logging/logger.js';
import type { SearchProvider } from '../types/config.js';
import type { SdkPlugin } from '../types/plugin.js';
import { createViewerPropApplier } from './applier.js';
import { viewerElementAttributes } from './props.js';
import type { ViewerElementProps } from './props.js';
import type { TriiiceratopsViewerElement } from './types.js';

/**
 * The property-tier applier, driven against the REAL custom element.
 *
 * Every hazard here is a hazard of the real element's semantics — Svelte's
 * asynchronous `connectedCallback`, the porting of pre-upgrade properties into
 * the component's props record, the inert observed attributes Svelte derives
 * from property-only inputs — so an idealized double would only confirm the
 * applier's own assumptions.
 *
 * The companion file `applier.preUpgrade.test.ts` covers the same applier
 * against an element whose tag is not yet registered; it has to be a separate
 * file because the custom-element registry is per test file.
 */

vi.mock('openseadragon', async () => {
    const { createOsdModuleMock } =
        await import('../test/utils/realViewerElement.js');
    return createOsdModuleMock();
});

const { defineRealViewerElement, installInertAnimations, settle, VIEWER_TAG } =
    await import('../test/utils/realViewerElement.js');

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
    configureLogging({ debug: false, sink: null });
    await settle(0);
});

function createElement(): Element {
    const element = document.createElement(VIEWER_TAG) as Element;
    mounted.push(element);
    return element;
}

async function connect(element: HTMLElement): Promise<void> {
    document.body.appendChild(element);
    await settle();
}

/**
 * The real element behind a write-recording proxy. Writes reach the element's
 * own prototype accessors (`Reflect.set` with the element as receiver), so this
 * observes the applier without replacing anything it talks to.
 */
function recordWrites(element: Element): {
    proxy: TriiiceratopsViewerElement;
    writes: Array<{ prop: string; value: unknown }>;
    deletes: string[];
} {
    const writes: Array<{ prop: string; value: unknown }> = [];
    const deletes: string[] = [];
    const proxy = new Proxy(element, {
        set(target, prop, value: unknown) {
            writes.push({ prop: String(prop), value });
            return Reflect.set(target, prop, value, target);
        },
        deleteProperty(target, prop) {
            deletes.push(String(prop));
            return Reflect.deleteProperty(target, prop);
        },
    }) as unknown as TriiiceratopsViewerElement;
    return { proxy, writes, deletes };
}

/** Every property-tier input, with an object- and a function-valued one. */
function fullProps(): ViewerElementProps & { searchProvider: SearchProvider } {
    return {
        manifestId: 'https://example.org/manifest',
        canvasId: 'https://example.org/canvas/1',
        theme: 'dark',
        manifestJson: { '@id': 'https://example.org/manifest' },
        themeConfig: { primary: '#3b82f6' },
        config: { debug: false },
        initialCanvasRegion: { x: 1, y: 2, width: 3, height: 4 },
        plugins: [],
        searchProvider: (async () => []) as SearchProvider,
    };
}

describe('property tier after the element is registered', () => {
    beforeAll(() => {
        defineRealViewerElement();
    });

    it('assigns objects and functions as properties on an upgraded element', async () => {
        const element = createElement();
        // Already upgraded: assignment now goes through Svelte's prototype
        // accessors instead of the pre-upgrade porting path.
        expect(customElements.get(VIEWER_TAG)).toBeDefined();
        expect(
            Object.getOwnPropertyDescriptor(
                Object.getPrototypeOf(element) as object,
                'plugins',
            ),
        ).toBeDefined();

        const props = fullProps();
        createViewerPropApplier(element).apply(props);
        await connect(element);

        expect(element.manifestJson).toBe(props.manifestJson);
        expect(element.plugins).toBe(props.plugins);
        expect(element.viewerState?.searchProvider).toBe(props.searchProvider);
        expect(element.getAttribute('plugins')).toBeNull();
        expect(element.getAttribute('searchprovider')).toBeNull();
    });

    it('forwards a post-mount change to the live viewer', async () => {
        const element = createElement();
        const applier = createViewerPropApplier(element);
        applier.apply({});
        await connect(element);

        const provider: SearchProvider = async () => [];
        applier.apply({ searchProvider: provider });
        await settle();

        expect(element.viewerState?.searchProvider).toBe(provider);
    });

    it('activates an SDK plugin supplied through the plugins property', async () => {
        // `plugins` is a property-only input with no supported attribute, so
        // the property is the only channel a framework wrapper has for it. The
        // whole path is exercised here — applier write, Svelte prototype
        // accessor, inner viewer, activation — because a silent break anywhere
        // along it would leave a wrapper's `plugins` prop doing nothing at all.
        const mounts: string[] = [];
        const plugin = definePlugin({
            name: 'applier-probe',
            version: '1.0.0',
            coreRange: '>=1.0.0-rc.0',
            pluginApiRange: '^1.0.0',
            requiredCapabilities: [],
            icon: {
                kind: 'svg',
                inner: '<circle />',
                viewBox: '0 0 1 1',
            },
            target: 'flyout',
            dismiss: 'explicit',
            view: {
                mount(container: HTMLElement) {
                    mounts.push(container.tagName);
                    return () => {};
                },
            },
        }) as unknown as SdkPlugin;

        const element = createElement();
        createViewerPropApplier(element).apply({ plugins: [plugin] });
        await connect(element);
        await settle();

        expect(mounts.length).toBeGreaterThan(0);
    });

    it('writes nothing for an input that is absent and has never been set', () => {
        const element = createElement();
        const { proxy, writes, deletes } = recordWrites(element);
        const applier = createViewerPropApplier(proxy);

        applier.apply({ manifestId: 'https://example.org/m' });
        applier.apply({ manifestId: 'https://example.org/m' });

        // Attribute-tier keys are rendered declaratively by the wrapper; the
        // applier ignores them. Nothing else was asked for, so nothing at all
        // was written or deleted.
        expect(writes).toEqual([]);
        expect(deletes).toEqual([]);
    });
});

describe('edge-triggering', () => {
    beforeAll(() => {
        defineRealViewerElement();
    });

    it('writes only when the prop value changes', () => {
        const element = createElement();
        const { proxy, writes } = recordWrites(element);
        const applier = createViewerPropApplier(proxy);
        const config = { debug: true };

        applier.apply({ config });
        applier.apply({ config });
        applier.apply({ config });

        expect(writes).toEqual([{ prop: 'config', value: config }]);
    });

    it('does not re-assert a value because the element diverged', async () => {
        // `canvas-id` reflects, so internal navigation changes the attribute
        // under the wrapper. Re-asserting the same prop must still write
        // nothing: the comparison is against the last APPLIED prop value, never
        // against the element's own state.
        const element = createElement();
        const provider: SearchProvider = async () => [];
        const { proxy, writes } = recordWrites(element);
        const applier = createViewerPropApplier(proxy);

        applier.apply({ searchProvider: provider });
        await connect(element);
        expect(writes).toHaveLength(1);

        // Something else moves the element's own state out from under us.
        element.searchProvider = null;
        await settle();
        expect(element.viewerState?.searchProvider).toBeNull();

        applier.apply({ searchProvider: provider });
        // Still exactly the one write the applier itself made.
        expect(writes.filter((w) => w.prop === 'searchProvider')).toHaveLength(
            1,
        );
        expect(element.viewerState?.searchProvider).toBeNull();
    });

    it('suppresses a fresh-but-equal array and a fresh-but-equal flat object', () => {
        const element = createElement();
        const { proxy, writes } = recordWrites(element);
        const applier = createViewerPropApplier(proxy);
        const pluginA = { name: 'a' } as never;
        const pluginB = { name: 'b' } as never;

        applier.apply({ plugins: [pluginA, pluginB], config: { debug: true } });
        expect(writes).toHaveLength(2);

        // A parent re-render that rebuilds both literals with the same contents.
        applier.apply({ plugins: [pluginA, pluginB], config: { debug: true } });
        expect(writes).toHaveLength(2);
    });

    it('permits a genuine change in either kind', () => {
        const element = createElement();
        const { proxy, writes } = recordWrites(element);
        const applier = createViewerPropApplier(proxy);
        const pluginA = { name: 'a' } as never;
        const pluginB = { name: 'b' } as never;

        applier.apply({ plugins: [pluginA], config: { debug: true } });
        expect(writes).toHaveLength(2);

        // The applier writes in one fixed order, independent of the shape of
        // the props object it was handed.
        applier.apply({ plugins: [pluginA, pluginB], config: { debug: true } });
        expect(writes.map((w) => w.prop)).toEqual([
            'config',
            'plugins',
            'plugins',
        ]);

        applier.apply({
            plugins: [pluginA, pluginB],
            config: { debug: false },
        });
        expect(writes.map((w) => w.prop)).toEqual([
            'config',
            'plugins',
            'plugins',
            'config',
        ]);
    });
});

describe('attribute tier against the real element', () => {
    beforeAll(() => {
        defineRealViewerElement();
    });

    it('arrives as kebab attributes the element reads as props', async () => {
        const element = createElement();
        // Exactly what a wrapper renders declaratively, on the server and on
        // the client's first render alike.
        for (const [name, value] of Object.entries(
            viewerElementAttributes({
                manifestId: 'https://example.org/manifest',
                canvasId: 'https://example.org/canvas/1',
                theme: 'dark',
            }),
        )) {
            element.setAttribute(name, value);
        }
        await connect(element);

        expect(element.manifestId).toBe('https://example.org/manifest');
        expect(element.canvasId).toBe('https://example.org/canvas/1');
        expect(element.theme).toBe('dark');
        expect(element.viewerState?.manifestId).toBe(
            'https://example.org/manifest',
        );
    });

    it('lets ordinary host attributes reach the element untouched', async () => {
        const element = createElement();
        element.setAttribute('id', 'viewer-one');
        element.setAttribute('class', 'h-96 w-full');
        element.setAttribute('style', 'display:block');
        element.setAttribute('data-testid', 'viewer');
        element.setAttribute('aria-label', 'Digitised book');
        await connect(element);

        expect(element.id).toBe('viewer-one');
        expect(element.getAttribute('class')).toBe('h-96 w-full');
        expect(element.getAttribute('style')).toBe('display:block');
        expect(element.getAttribute('data-testid')).toBe('viewer');
        expect(element.getAttribute('aria-label')).toBe('Digitised book');
        // No layout wrapper is introduced by any of this.
        expect(element.parentElement).toBe(document.body);
    });
});

describe('unmemoized property warning', () => {
    beforeAll(() => {
        defineRealViewerElement();
    });

    function captureWarnings(): Array<{ level: LogLevel; message: string }> {
        const records: Array<{ level: LogLevel; message: string }> = [];
        configureLogging({
            debug: true,
            sink: (level, args) =>
                records.push({ level, message: args.join(' ') }),
        });
        return records;
    }

    it('warns once, naming the prop, past the write threshold', () => {
        const records = captureWarnings();
        const element = createElement();
        const applier = createViewerPropApplier(element);

        // A parent that rebuilds a nested object every render: shallowEqual is
        // one level deep, so every render is a genuine write.
        for (let i = 0; i < 20; i++) {
            applier.apply({ config: { debug: true, nested: { i } } as never });
        }

        const warnings = records.filter((r) => r.level === 'warn');
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain('`config`');
        expect(warnings[0].message).toContain('re-assigned');
    });

    it('warns per prop, not once for the whole applier', () => {
        const records = captureWarnings();
        const element = createElement();
        const applier = createViewerPropApplier(element);

        for (let i = 0; i < 12; i++) {
            applier.apply({
                config: { nested: { i } } as never,
                themeConfig: { nested: { i } } as never,
            });
        }

        const warned = records
            .filter((r) => r.level === 'warn')
            .map((r) => (r.message.includes('`config`') ? 'config' : 'other'));
        expect(warned).toEqual(['other', 'config']);
    });

    it('does not warn below the threshold', () => {
        const records = captureWarnings();
        const element = createElement();
        const applier = createViewerPropApplier(element);

        for (let i = 0; i < 10; i++) {
            applier.apply({ config: { nested: { i } } as never });
        }

        expect(records.filter((r) => r.level === 'warn')).toHaveLength(0);
    });

    it('stays silent outside development', () => {
        const records: unknown[] = [];
        configureLogging({ debug: false, sink: () => records.push(1) });
        const element = createElement();
        const applier = createViewerPropApplier(element);

        for (let i = 0; i < 30; i++) {
            applier.apply({ config: { nested: { i } } as never });
        }

        expect(records).toHaveLength(0);
    });
});

describe('bridging ViewerConfig.debug to the wrapper-side logger', () => {
    beforeAll(() => {
        defineRealViewerElement();
    });

    it('enables wrapper-side debug logging when config.debug is applied', () => {
        const applier = createViewerPropApplier(createElement());
        expect(isDebugEnabled()).toBe(false);

        applier.apply({ config: { debug: true } });

        expect(isDebugEnabled()).toBe(true);
    });

    it('accepts the JSON-string form of the same input', () => {
        const applier = createViewerPropApplier(createElement());

        applier.apply({ config: '{"debug":true}' });

        expect(isDebugEnabled()).toBe(true);
    });

    it('follows config changes after mount, in both directions', () => {
        const applier = createViewerPropApplier(createElement());

        applier.apply({ config: { debug: true } });
        expect(isDebugEnabled()).toBe(true);

        applier.apply({ config: { debug: false } });
        expect(isDebugEnabled()).toBe(false);

        applier.apply({ config: { debug: true } });
        expect(isDebugEnabled()).toBe(true);
    });

    it('never bridges when config is absent, so the default stands', () => {
        const applier = createViewerPropApplier(createElement());

        applier.apply({ manifestId: 'https://example.test/manifest' });
        expect(isDebugEnabled()).toBe(false);

        // And an absent config never contradicts a viewer that DID ask for
        // diagnostics: page-level debug is one flag, most recent opinion wins.
        configureLogging({ debug: true });
        applier.apply({ manifestId: 'https://example.test/other' });
        expect(isDebugEnabled()).toBe(true);
    });

    it('leaves a second viewer’s debug flag alone when it states no opinion', () => {
        createViewerPropApplier(createElement()).apply({
            config: { debug: true },
        });
        createViewerPropApplier(createElement()).apply({
            config: { locale: 'fr' } as never,
        });

        expect(isDebugEnabled()).toBe(true);
    });

    it('is edge-triggered: an unchanged config re-asserts nothing', () => {
        const applier = createViewerPropApplier(createElement());
        const config = { debug: true };

        applier.apply({ config });
        configureLogging({ debug: false });
        // Same object, and a shallow-equal twin: neither is a write, so neither
        // may reach back into the logger.
        applier.apply({ config });
        applier.apply({ config: { debug: true } });

        expect(isDebugEnabled()).toBe(false);
    });
});
