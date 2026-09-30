import { readFileSync } from 'node:fs';

import { test, expect, type Page } from '@playwright/test';

/**
 * The `<triiiceratops-viewer>` contract, driven through both BUILT element
 * artifacts: every declared attribute and property, each coercion type,
 * reflection, undeclared attributes, writes before definition, attribute
 * changes after mount, detach and re-insert, removal, the events, and
 * duplicate registration.
 *
 * The declared rows come from the reviewed API report, so a row whose `type`
 * has no coercion probe below fails here. Requires `pnpm build:element`.
 */

type Row = { property: string; attribute: string; type: string };

const report = JSON.parse(
    readFileSync(
        new URL('../../../api-reports/custom-element.json', import.meta.url),
        'utf8',
    ),
) as { properties: Row[]; callbackProperties: string[] };

const ROWS: Row[] = [
    ...report.properties,
    ...report.callbackProperties.map((property) => ({
        property,
        attribute: property,
        type: 'String',
    })),
];

const MANIFEST = '/demo-manifests/e2e/manifest.json';
const TAG = 'triiiceratops-viewer';

type Probe = { write: unknown; read: unknown };

/** What each coercion type does to a property write. */
const PROPERTY_PROBES: Record<string, Probe[]> = {
    Boolean: [
        { write: 'false', read: true },
        { write: '', read: true },
        { write: 0, read: true },
        { write: false, read: false },
        { write: null, read: false },
        { write: undefined, read: false },
        { write: true, read: true },
    ],
    String: [
        { write: 'x', read: 'x' },
        { write: null, read: null },
    ],
    Object: [
        { write: '{"a":1}', read: '{"a":1}' },
        { write: null, read: null },
    ],
};

/** What each coercion type does to an attribute value (`null` removes it). */
const ATTRIBUTE_PROBES: Record<string, Probe[]> = {
    Boolean: [
        { write: 'false', read: true },
        { write: '', read: true },
        { write: null, read: false },
    ],
    String: [
        { write: 'abc', read: 'abc' },
        { write: '', read: '' },
        { write: null, read: null },
    ],
    Object: [
        { write: '{"a":[1]}', read: { a: [1] } },
        { write: '', read: '' },
        { write: null, read: null },
    ],
};

function probesFor(table: Record<string, Probe[]>, row: Row): Probe[] {
    const probes = table[row.type];
    if (!probes) {
        throw new Error(
            `${row.property}: no coercion probe for type "${row.type}"`,
        );
    }
    return probes;
}

const ENTRIES = ['esm', 'iife'] as const;
type Entry = (typeof ENTRIES)[number];

async function open(page: Page, errors: string[] = []): Promise<void> {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/e2e/wc-contract.html', { waitUntil: 'domcontentloaded' });
}

async function load(page: Page, entry: Entry): Promise<void> {
    await page.evaluate(
        (e) =>
            (
                window as unknown as {
                    loadViewerElement(entry: string): Promise<unknown>;
                }
            ).loadViewerElement(e),
        entry,
    );
}

for (const entry of ENTRIES) {
    test.describe(`custom-element contract (${entry})`, () => {
        test('declares every row as an observed attribute and an accessor', async ({
            page,
        }) => {
            await open(page);
            await load(page, entry);
            const shape = await page.evaluate(
                ({ tag, properties }) => {
                    const ctor = customElements.get(tag) as unknown as {
                        observedAttributes: string[];
                        prototype: object;
                    };
                    const accessor = (name: string) => {
                        const d = Object.getOwnPropertyDescriptor(
                            ctor.prototype,
                            name,
                        );
                        return [
                            typeof d?.get === 'function',
                            typeof d?.set === 'function',
                        ];
                    };
                    return {
                        observed: [...ctor.observedAttributes].sort(),
                        accessors: properties.map(accessor),
                        viewerState: accessor('viewerState'),
                    };
                },
                { tag: TAG, properties: ROWS.map((r) => r.property) },
            );
            expect(shape.observed).toEqual(ROWS.map((r) => r.attribute).sort());
            expect(shape.accessors).toEqual(ROWS.map(() => [true, true]));
            expect(shape.viewerState).toEqual([true, false]);
        });

        test('coerces property writes by type, before and after mount', async ({
            page,
        }) => {
            await open(page);
            await load(page, entry);
            const cases = ROWS.map((row) => ({
                property: row.property,
                probes: probesFor(PROPERTY_PROBES, row),
            }));
            const seen = await page.evaluate(
                async ({ tag, cases, manifest }) => {
                    const read = async (el: any) => {
                        const out: Record<string, unknown[]> = {};
                        for (const { property, probes } of cases) {
                            out[property] = probes.map(({ write }) => {
                                el[property] = write;
                                const value = el[property];
                                return value === undefined
                                    ? '<undefined>'
                                    : value;
                            });
                        }
                        return out;
                    };
                    const detached = document.createElement(tag);
                    const before = await read(detached);

                    const el = document.createElement(tag) as any;
                    el.setAttribute('manifest-id', manifest);
                    document.body.append(el);
                    await new Promise((r) => setTimeout(r, 50));
                    const mounted = !!el.viewerState;
                    for (const { property } of cases) {
                        if (property !== 'manifestId') el[property] = undefined;
                    }
                    const after = await read(el);
                    return { before, after, mounted };
                },
                { tag: TAG, cases, manifest: MANIFEST },
            );
            expect(seen.mounted).toBe(true);
            for (const { property, probes } of cases) {
                const expected = probes.map(({ read }) =>
                    read === undefined ? '<undefined>' : read,
                );
                expect(seen.before[property], property).toEqual(expected);
                expect(seen.after[property], property).toEqual(expected);
            }
        });

        test('converts attribute values by type, before and after mount', async ({
            page,
        }) => {
            await open(page);
            await load(page, entry);
            const cases = ROWS.map((row) => ({
                property: row.property,
                attribute: row.attribute,
                probes: probesFor(ATTRIBUTE_PROBES, row),
            }));
            const seen = await page.evaluate(
                async ({ tag, cases, manifest }) => {
                    const read = (el: any) => {
                        const out: Record<string, unknown[]> = {};
                        for (const { property, attribute, probes } of cases) {
                            if (attribute === 'manifest-id') continue;
                            out[property] = probes.map(({ write }) => {
                                if (write === null)
                                    el.removeAttribute(attribute);
                                else
                                    el.setAttribute(attribute, write as string);
                                return el[property];
                            });
                            el.removeAttribute(attribute);
                        }
                        return out;
                    };
                    const detached = document.createElement(tag);
                    const before = read(detached);

                    const el = document.createElement(tag) as any;
                    el.setAttribute('manifest-id', manifest);
                    document.body.append(el);
                    await new Promise((r) => setTimeout(r, 50));
                    const after = read(el);

                    const errors: string[] = [];
                    const onError = (event: ErrorEvent) => {
                        errors.push(event.error?.name);
                        event.preventDefault();
                    };
                    window.addEventListener('error', onError);
                    el.setAttribute('manifest-json', '{"b":2}');
                    el.setAttribute('manifest-json', 'not json');
                    window.removeEventListener('error', onError);
                    return {
                        before,
                        after,
                        invalidJson: { errors, value: el.manifestJson },
                    };
                },
                { tag: TAG, cases, manifest: MANIFEST },
            );
            for (const { property, attribute, probes } of cases) {
                if (attribute === 'manifest-id') continue;
                const expected = probes.map(({ read }) => read);
                expect(seen.before[property], property).toEqual(expected);
                expect(seen.after[property], property).toEqual(expected);
            }
            // `Object` coercion is a bare `JSON.parse`: invalid JSON throws
            // out of the callback and leaves the property unchanged.
            expect(seen.invalidJson).toEqual({
                errors: ['SyntaxError'],
                value: { b: 2 },
            });
        });

        test('mounts one microtask after connect, reflecting defaults and passing every attribute', async ({
            page,
        }) => {
            const errors: string[] = [];
            await open(page, errors);
            await load(page, entry);
            const seen = await page.evaluate(
                async ({ tag, manifest }) => {
                    const mounted = (el: Element) =>
                        !!el.shadowRoot?.querySelector('.te-root');
                    const attrs = (el: Element) =>
                        [...el.attributes].map((a) => [a.name, a.value]);

                    const bare = document.createElement(tag);
                    const el = document.createElement(tag) as any;
                    el.setAttribute('id', 'v');
                    el.setAttribute('data-extra', 'kept');
                    el.setAttribute('manifest-id', manifest);
                    el.setAttribute('read-content-state-from-url', '');
                    el.setAttribute('theme-config', '{"primary":"#123456"}');
                    const shadow = el.shadowRoot?.mode;
                    document.body.append(bare, el);
                    const sync = [mounted(bare), mounted(el), el.viewerState];
                    await Promise.resolve();
                    const microtask = [mounted(bare), mounted(el)];
                    await new Promise((r) => setTimeout(r, 50));
                    return {
                        shadow,
                        sync: sync.map((v) => v ?? '<undefined>'),
                        microtask,
                        bareAttrs: attrs(bare),
                        attrs: attrs(el),
                        values: {
                            manifestId: el.manifestId,
                            canvasId: el.canvasId,
                            theme: el.theme ?? '<undefined>',
                            contentState: el.contentState,
                            readContentStateFromUrl: el.readContentStateFromUrl,
                            acceptDroppedContentState:
                                el.acceptDroppedContentState,
                            themeConfig: el.themeConfig,
                            plugins: el.plugins,
                            config: el.config ?? '<undefined>',
                        },
                        undeclared: ['id', 'dataExtra', 'data-extra'].map(
                            (name) =>
                                Object.getOwnPropertyDescriptor(
                                    customElements.get(tag)!.prototype,
                                    name,
                                ) === undefined,
                        ),
                        id: el.id,
                    };
                },
                { tag: TAG, manifest: MANIFEST },
            );
            expect(seen.shadow).toBe('open');
            expect(seen.sync).toEqual([false, false, '<undefined>']);
            expect(seen.microtask).toEqual([true, true]);
            expect(seen.bareAttrs).toEqual([
                ['manifest-id', ''],
                ['canvas-id', ''],
            ]);
            expect(seen.attrs).toEqual([
                ['id', 'v'],
                ['data-extra', 'kept'],
                ['manifest-id', MANIFEST],
                ['read-content-state-from-url', ''],
                ['theme-config', '{"primary":"#123456"}'],
                ['canvas-id', ''],
            ]);
            expect(seen.values).toEqual({
                manifestId: MANIFEST,
                canvasId: '',
                theme: '<undefined>',
                contentState: '',
                readContentStateFromUrl: true,
                acceptDroppedContentState: false,
                themeConfig: '{"primary":"#123456"}',
                plugins: [],
                config: '<undefined>',
            });
            expect(seen.undeclared).toEqual([true, true, true]);
            expect(seen.id).toBe('v');
            expect(errors).toEqual([]);
        });

        test('carries properties set before the element is defined', async ({
            page,
        }) => {
            const errors: string[] = [];
            await open(page, errors);
            await page.evaluate(
                ({ tag, manifest }) => {
                    const el = document.createElement(tag) as any;
                    el.id = 'pre';
                    el.setAttribute('canvas-id', 'from-attribute');
                    el.canvasId = 'shadowed';
                    el.manifestId = manifest;
                    el.readContentStateFromUrl = 'untransformed';
                    el.plugins = [];
                    el.searchProvider = async () => [];
                    document.body.append(el);
                },
                { tag: TAG, manifest: MANIFEST },
            );
            await load(page, entry);
            const seen = await page.evaluate(async () => {
                await new Promise((r) => setTimeout(r, 50));
                const el = document.getElementById('pre') as any;
                const own = (name: string) =>
                    Object.prototype.hasOwnProperty.call(el, name);
                return {
                    mounted: !!el.viewerState,
                    own: [
                        'manifestId',
                        'canvasId',
                        'readContentStateFromUrl',
                        'plugins',
                        'searchProvider',
                    ].map(own),
                    manifestId: el.manifestId,
                    canvasId: el.canvasId,
                    readContentStateFromUrl: el.readContentStateFromUrl,
                    plugins: Array.isArray(el.plugins),
                    searchProvider: typeof el.searchProvider,
                    attrs: [...el.attributes].map((a) => [a.name, a.value]),
                };
            });
            expect(seen).toEqual({
                mounted: true,
                // An attribute wins over an own property of the same name,
                // and that own property keeps shadowing the accessor.
                own: [false, true, false, false, false],
                manifestId: MANIFEST,
                canvasId: 'shadowed',
                readContentStateFromUrl: 'untransformed',
                plugins: true,
                searchProvider: 'function',
                attrs: [
                    ['id', 'pre'],
                    ['canvas-id', 'from-attribute'],
                    ['manifest-id', MANIFEST],
                ],
            });
            expect(errors).toEqual([]);
        });

        test('reflects property writes synchronously and takes attribute changes after mount', async ({
            page,
        }) => {
            const errors: string[] = [];
            await open(page, errors);
            await load(page, entry);
            const seen = await page.evaluate(
                async ({ tag, manifest }) => {
                    const el = document.createElement(tag) as any;
                    el.setAttribute('manifest-id', manifest);
                    document.body.append(el);
                    await new Promise((r) => setTimeout(r, 50));
                    const mutations: string[] = [];
                    const observer = new MutationObserver((records) => {
                        for (const r of records) {
                            mutations.push(r.attributeName!);
                        }
                    });
                    observer.observe(el, { attributes: true });
                    const out: Record<string, unknown> = {};

                    el.theme = 'dark';
                    out.themeSync = el.getAttribute('theme');
                    el.canvasId = 'c1';
                    out.canvasSync = el.getAttribute('canvas-id');
                    el.contentState = 'not reflected';
                    out.contentStateAttr = el.getAttribute('content-state');
                    el.theme = null;
                    out.themeRemoved = el.hasAttribute('theme');
                    el.canvasId = undefined;
                    out.canvasDefault = [
                        el.getAttribute('canvas-id'),
                        el.canvasId,
                    ];
                    el.theme = 'light';
                    el.theme = undefined;
                    out.themeUndefined = [
                        el.hasAttribute('theme'),
                        el.theme ?? '<undefined>',
                    ];

                    el.setAttribute('canvas-id', 'c2');
                    el.setAttribute('content-state', 'cs');
                    el.setAttribute('theme', 'teal');
                    out.fromAttributes = [
                        el.canvasId,
                        el.contentState,
                        el.theme,
                    ];
                    el.removeAttribute('canvas-id');
                    out.removed = el.canvasId;
                    await new Promise((r) => setTimeout(r, 0));
                    out.removedLater = [
                        el.hasAttribute('canvas-id'),
                        el.canvasId,
                    ];
                    observer.disconnect();
                    out.mutations = mutations;
                    out.stillMounted = !!el.viewerState;
                    return out;
                },
                { tag: TAG, manifest: MANIFEST },
            );
            expect(seen).toEqual({
                themeSync: 'dark',
                canvasSync: 'c1',
                contentStateAttr: null,
                themeRemoved: false,
                canvasDefault: ['', ''],
                themeUndefined: [false, '<undefined>'],
                fromAttributes: ['c2', 'cs', 'teal'],
                removed: null,
                removedLater: [false, null],
                // Every reflected prop is rewritten whenever any of them
                // changes: synchronously for a property write, after the
                // batch for an attribute change.
                mutations: [
                    ...['manifest-id', 'canvas-id', 'theme'],
                    ...['manifest-id', 'canvas-id', 'theme'],
                    ...['manifest-id', 'canvas-id', 'theme'],
                    ...['manifest-id', 'canvas-id'],
                    ...['manifest-id', 'canvas-id', 'theme'],
                    ...['manifest-id', 'canvas-id', 'theme'],
                    ...['canvas-id', 'content-state', 'theme', 'canvas-id'],
                    ...['manifest-id', 'theme'],
                ],
                stillMounted: true,
            });
            expect(errors).toEqual([]);
        });

        test('keeps the mount across detach and re-insert, and unmounts a microtask after removal', async ({
            page,
        }) => {
            const errors: string[] = [];
            await open(page, errors);
            await load(page, entry);
            const seen = await page.evaluate(
                async ({ tag, manifest }) => {
                    const available: unknown[] = [];
                    document.addEventListener('viewerstateavailable', (e) =>
                        available.push((e as CustomEvent).detail),
                    );
                    const el = document.createElement(tag) as any;
                    el.setAttribute('manifest-id', manifest);
                    document.body.append(el);
                    await new Promise((r) => setTimeout(r, 50));
                    const root = el.shadowRoot.querySelector('.te-root');
                    const state = el.viewerState;

                    el.remove();
                    document.body.append(el);
                    await new Promise((r) => setTimeout(r, 50));
                    const moved = [
                        el.shadowRoot.querySelector('.te-root') === root,
                        el.viewerState === state,
                        available.length,
                    ];

                    el.remove();
                    const sync = [
                        !!el.shadowRoot.querySelector('.te-root'),
                        el.viewerState === state,
                    ];
                    await Promise.resolve();
                    const microtask = [
                        el.shadowRoot.childNodes.length,
                        el.viewerState ?? '<undefined>',
                        el.manifestId,
                        el.canvasId,
                    ];

                    document.body.append(el);
                    await new Promise((r) => setTimeout(r, 50));
                    const remounted = [
                        !!el.shadowRoot.querySelector('.te-root'),
                        !!el.viewerState && el.viewerState !== state,
                        available.length,
                        available[1] === el.viewerState,
                    ];
                    return { moved, sync, microtask, remounted };
                },
                { tag: TAG, manifest: MANIFEST },
            );
            expect(seen).toEqual({
                moved: [true, true, 1],
                sync: [true, true],
                microtask: [0, '<undefined>', MANIFEST, ''],
                remounted: [true, true, 2, true],
            });
            expect(errors).toEqual([]);
        });

        test('bridges viewerState and fires every event', async ({ page }) => {
            const errors: string[] = [];
            await open(page, errors);
            await load(page, entry);
            const seen = await page.evaluate(
                async ({ tag, manifest }) => {
                    const names = [
                        'canvaschange',
                        'choicechange',
                        'manifestchange',
                        'pluginerror',
                        'statechange',
                        'viewererror',
                        'viewerstateavailable',
                    ];
                    const el = document.createElement(tag) as any;
                    const events: Record<string, Array<unknown[]>> = {};
                    for (const name of names) {
                        events[name] = [];
                        document.addEventListener(name, (e) => {
                            events[name].push([
                                e.target === el,
                                e.bubbles,
                                e.composed,
                                (e as CustomEvent).detail !== undefined,
                            ]);
                        });
                    }
                    const callbacks: string[] = [];
                    el.onviewererror = () => callbacks.push('viewererror');
                    el.onpluginerror = () => callbacks.push('pluginerror');
                    el.plugins = [
                        {
                            kind: 'triiiceratops-plugin',
                            name: 'contract-boom',
                            version: '1.0.0',
                            view: {},
                            activate() {
                                throw new Error('boom');
                            },
                        },
                    ];
                    el.setAttribute('manifest-id', manifest);
                    const before = el.viewerState ?? '<undefined>';
                    let detailIsState = false;
                    el.addEventListener(
                        'viewerstateavailable',
                        (e: CustomEvent) => {
                            detailIsState = e.detail === el.viewerState;
                        },
                    );
                    document.body.append(el);
                    const deadline = Date.now() + 15000;
                    while (
                        events.manifestchange.length === 0 &&
                        Date.now() < deadline
                    ) {
                        await new Promise((r) => setTimeout(r, 50));
                    }
                    const state = el.viewerState;
                    const setOk = Reflect.set(el, 'viewerState', {});
                    const unchanged = el.viewerState === state;

                    state.toggleToolbar();
                    el.config = JSON.stringify({
                        controls: 'split',
                        nav: { edge: 'top' },
                        toolbar: { anchor: 'top' },
                    });
                    while (
                        events.viewererror.length === 0 &&
                        Date.now() < deadline
                    ) {
                        await new Promise((r) => setTimeout(r, 50));
                    }
                    await new Promise((r) => setTimeout(r, 100));
                    const fired = Object.fromEntries(
                        names.map((n) => [n, events[n].length > 0]),
                    );
                    const shapes = new Set(
                        names.flatMap((n) =>
                            events[n].map((s) => JSON.stringify(s)),
                        ),
                    );
                    return {
                        before,
                        detailIsState,
                        setOk,
                        unchanged,
                        fired,
                        available: events.viewerstateavailable.length,
                        shapes: [...shapes],
                        callbacks: [...new Set(callbacks)].sort(),
                    };
                },
                { tag: TAG, manifest: MANIFEST },
            );
            expect(seen).toEqual({
                before: '<undefined>',
                detailIsState: true,
                setOk: false,
                unchanged: true,
                fired: {
                    canvaschange: true,
                    choicechange: false,
                    manifestchange: true,
                    pluginerror: true,
                    statechange: true,
                    viewererror: true,
                    viewerstateavailable: true,
                },
                available: 1,
                shapes: ['[true,true,true,true]'],
                callbacks: ['pluginerror', 'viewererror'],
            });
            expect(errors).toEqual([]);
        });

        test('keeps the function-valued attributes inert', async ({ page }) => {
            const errors: string[] = [];
            await open(page, errors);
            await load(page, entry);
            const seen = await page.evaluate(
                async ({ tag, manifest }) => {
                    const el = document.createElement(tag) as any;
                    el.setAttribute('manifest-id', manifest);
                    el.setAttribute('plugins', '[1]');
                    el.setAttribute('searchprovider', 'nope');
                    document.body.append(el);
                    await new Promise((r) => setTimeout(r, 50));
                    el.setAttribute('loadmessages', 'nope');
                    await new Promise((r) => setTimeout(r, 50));
                    const results = await el.viewerState.search('x').then(
                        () => 'searched',
                        (e: Error) => e.name,
                    );
                    return {
                        values: [
                            el.plugins,
                            el.searchProvider,
                            el.loadMessages,
                        ],
                        mounted: !!el.shadowRoot.querySelector('.te-root'),
                        results,
                    };
                },
                { tag: TAG, manifest: MANIFEST },
            );
            expect(seen).toEqual({
                values: ['[1]', 'nope', 'nope'],
                mounted: true,
                results: 'searched',
            });
            expect(errors).toEqual([]);
        });

        test('registers once, publishes the runtime, and refuses a second core version', async ({
            page,
        }) => {
            const errors: string[] = [];
            await open(page, errors);
            await load(page, entry);
            const other: Entry = entry === 'esm' ? 'iife' : 'esm';
            const first = await page.evaluate((tag) => {
                (window as any).__firstCtor = customElements.get(tag);
                return (window as any).__firstCtor !== undefined;
            }, TAG);
            expect(first).toBe(true);
            await load(page, entry);
            await load(page, other);
            const seen = await page.evaluate((tag) => {
                const t = (window as any).Triiiceratops;
                return {
                    sameCtor:
                        customElements.get(tag) === (window as any).__firstCtor,
                    coreVersion:
                        typeof t.coreVersion === 'string' &&
                        t.coreVersion !== '',
                    pluginApiVersion: typeof t.pluginApiVersion,
                    capabilities: Array.isArray(t.capabilities),
                    register: typeof t.plugins.register,
                    svelte: Object.keys(t.svelte).length > 0,
                    svelteInternal: Object.keys(t.svelteInternal).length > 0,
                    core: Object.keys(t.core).length > 0,
                };
            }, TAG);
            expect(seen).toEqual({
                sameCtor: true,
                coreVersion: true,
                pluginApiVersion: 'string',
                capabilities: true,
                register: 'function',
                svelte: true,
                svelteInternal: true,
                core: true,
            });

            await open(page);
            await page.evaluate(() => {
                (window as any).Triiiceratops = {
                    coreVersion: '0.0.0-conflict',
                    pluginApiVersion: '0',
                    capabilities: [],
                    plugins: {},
                    svelte: {},
                    svelteInternal: {},
                    core: {},
                };
            });
            const refused = await page.evaluate(
                async ({ tag, entry }) => {
                    const error = await (window as any)
                        .loadViewerElement(entry)
                        .then(
                            () => null,
                            (e: any) => ({
                                name: e?.name,
                                code: e?.code,
                                existing: e?.existingVersion,
                            }),
                        );
                    return {
                        error,
                        defined: customElements.get(tag) !== undefined,
                        coreVersion: (window as any).Triiiceratops.coreVersion,
                    };
                },
                { tag: TAG, entry },
            );
            expect(refused).toEqual({
                error: {
                    name: 'TriiiceratopsCoreConflictError',
                    code: 'CORE_VERSION_CONFLICT',
                    existing: '0.0.0-conflict',
                },
                defined: false,
                coreVersion: '0.0.0-conflict',
            });
            expect(errors).toEqual([]);
        });
    });
}
