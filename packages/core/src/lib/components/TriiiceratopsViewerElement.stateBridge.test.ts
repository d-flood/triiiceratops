import {
    describe,
    it,
    expect,
    afterAll,
    afterEach,
    beforeAll,
    vi,
} from 'vitest';
import { tick } from 'svelte';

import TriiiceratopsViewerElement from './TriiiceratopsViewerElement.svelte';
import { ViewerState } from '../state/viewer.svelte';
import { configureLogging, type LogLevel } from '../logging/logger';
import { VIEWER_STATE_AVAILABLE_EVENT } from '../types/viewerElement';
import type { SearchProvider, SearchResultGroup } from '../types/config';

/**
 * The custom element's state bridge (framework-wrappers ticket 02).
 *
 * These tests drive the REAL compiled custom element — registered through
 * `customElements.define` exactly as the Web Component entries do — because
 * every hazard here lives in the element's own semantics: the asynchronous
 * `connectedCallback`, the getter-only prototype property the Svelte compiler
 * emits for an instance export, pre-connection property porting, and the
 * destroy/re-mount cycle a detach-then-reattach produces.
 */

// The viewer mounts OpenSeadragon as soon as a manifest resolves; happy-dom has
// no WebGL/canvas for it. Same stub the other element-level component tests use.
vi.mock('openseadragon', () => ({
    default: Object.assign(
        vi.fn(() => ({
            addHandler: vi.fn(),
            removeHandler: vi.fn(),
            removeAllHandlers: vi.fn(),
            destroy: vi.fn(),
            open: vi.fn(),
            close: vi.fn(),
            forceRedraw: vi.fn(),
            setMouseNavEnabled: vi.fn(),
            addOverlay: vi.fn(),
            removeOverlay: vi.fn(),
            clearOverlays: vi.fn(),
            viewport: {
                getZoom: vi.fn(() => 1),
                getMaxZoom: vi.fn(() => 10),
                getMinZoom: vi.fn(() => 0.1),
                zoomTo: vi.fn(),
                zoomBy: vi.fn(),
                panTo: vi.fn(),
                goHome: vi.fn(),
                fitBounds: vi.fn(),
                imageToViewportCoordinates: vi.fn(),
                imageToViewportRectangle: vi.fn(),
                viewportToImageCoordinates: vi.fn(),
                getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1, height: 1 })),
            },
            world: {
                getItemCount: vi.fn(() => 0),
                getItemAt: vi.fn(),
                addHandler: vi.fn(),
                removeHandler: vi.fn(),
            },
            drawer: { canvas: null },
            container: null,
            element: null,
        })),
        { Rect: vi.fn(), Point: vi.fn(), ControlAnchor: {} },
    ),
}));

const TAG = 'triiiceratops-viewer';

/**
 * The custom-element class the Svelte compiler produced for the wrapper —
 * exactly what `custom-element.ts` / `element.ts` hand to the browser runtime.
 */
const ElementCtor = (
    TriiiceratopsViewerElement as unknown as {
        element: CustomElementConstructor;
    }
).element;

/** The element's bridge surface, as seen by a Web Component host. */
interface BridgeElement extends HTMLElement {
    readonly viewerState: ViewerState | undefined;
    searchProvider?: unknown;
    manifestId?: string;
    manifestJson?: unknown;
    config?: unknown;
}

const MANIFEST_ID = 'https://example.org/iiif/book/manifest';

function makeCanvas(name: string) {
    const id = `${MANIFEST_ID}/canvas/${name}`;
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label: name,
        height: 1000,
        width: 800,
        images: [
            {
                '@id': `${id}/image`,
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
                on: id,
                resource: {
                    '@id': `https://example.org/iiif/${name}/full/full/0/default.jpg`,
                    '@type': 'dctypes:Image',
                    format: 'image/jpeg',
                    height: 1000,
                    width: 800,
                },
            },
        ],
    };
}

const MANIFEST_JSON = {
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': MANIFEST_ID,
    '@type': 'sc:Manifest',
    label: 'Book',
    sequences: [
        {
            '@id': `${MANIFEST_ID}/sequence/normal`,
            '@type': 'sc:Sequence',
            canvases: [makeCanvas('page-1'), makeCanvas('page-2')],
        },
    ],
};

// happy-dom ships an incomplete Web Animations API; Svelte transitions call
// `element.animate()` and the missing pieces throw mid-flush, aborting effects
// scheduled after the throw. A no-op animation keeps transitions inert.
beforeAll(() => {
    Element.prototype.animate = function () {
        return {
            onfinish: null,
            oncancel: null,
            cancel() {},
            finish() {},
            play() {},
            pause() {},
            addEventListener() {},
            removeEventListener() {},
            finished: Promise.resolve(),
            currentTime: 0,
            playState: 'finished',
        } as unknown as Animation;
    };
    customElements.define(TAG, ElementCtor);
    // Keep the suite hermetic: the viewer probes image endpoints for the
    // fixture manifest, and nothing here depends on a network answer.
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
});

afterAll(() => {
    vi.unstubAllGlobals();
});

const mounted: BridgeElement[] = [];

/** An unconnected element instance. Connect it with {@link connect}. */
function createViewer(): BridgeElement {
    const el = document.createElement(TAG) as BridgeElement;
    mounted.push(el);
    return el;
}

/**
 * Svelte's `connectedCallback` awaits a microtask before mounting, effects flush
 * after that, and the availability event is dispatched from a further microtask.
 */
async function settle(ms = 50): Promise<void> {
    await tick();
    await new Promise((r) => setTimeout(r, ms));
    await tick();
}

async function connect(el: BridgeElement): Promise<void> {
    document.body.appendChild(el);
    await settle();
}

/** Poll until the inner viewer has registered the manifest it was handed. */
async function waitForManifest(el: BridgeElement): Promise<void> {
    for (let i = 0; i < 40; i++) {
        if (el.viewerState?.manifestEntry?.json) return;
        await settle(25);
    }
    throw new Error('manifest never became available');
}

/** Record every `viewerstateavailable` detail this element emits. */
function recordAvailability(el: BridgeElement): ViewerState[] {
    const seen: ViewerState[] = [];
    el.addEventListener(VIEWER_STATE_AVAILABLE_EVENT, (event) => {
        seen.push((event as CustomEvent<ViewerState>).detail);
    });
    return seen;
}

afterEach(async () => {
    for (const el of mounted.splice(0)) {
        el.remove();
    }
    configureLogging({ debug: false, sink: null });
    await settle(0);
});

describe('viewerState bridge', () => {
    it('reads undefined before availability and is the exact object the event carries', async () => {
        const el = createViewer();
        // Listen-then-check: the listener goes on before the element is ever
        // connected, so no state instance can appear unobserved.
        const seen = recordAvailability(el);

        expect(el.viewerState).toBeUndefined();
        expect(seen).toHaveLength(0);

        await connect(el);

        expect(seen).toHaveLength(1);
        expect(seen[0]).toBeInstanceOf(ViewerState);
        expect(el.viewerState).toBe(seen[0]);
    });

    it('is readable synchronously before the event, so listen-then-check cannot race', async () => {
        const el = createViewer();
        let stateWhenAnnounced: ViewerState | undefined;
        el.addEventListener(VIEWER_STATE_AVAILABLE_EVENT, () => {
            // A late host reads the property after attaching its listener; by
            // the time the event fires the property must already agree.
            stateWhenAnnounced = el.viewerState;
        });

        await connect(el);

        expect(stateWhenAnnounced).toBe(el.viewerState);
        expect(stateWhenAnnounced).toBeDefined();
    });

    it('is a getter-only property on the constructor prototype', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(
            ElementCtor.prototype,
            'viewerState',
        );
        // The version handshake a framework wrapper probes: it must be on the
        // prototype, not installed as an own property at mount time.
        expect(descriptor).toBeDefined();
        expect(typeof descriptor?.get).toBe('function');
        expect(descriptor?.set).toBeUndefined();

        const el = createViewer();
        await connect(el);

        expect(
            Object.getOwnPropertyDescriptor(el, 'viewerState'),
        ).toBeUndefined();
        expect(() => {
            (el as unknown as { viewerState: unknown }).viewerState = null;
        }).toThrow(TypeError);
        expect(el.viewerState).toBeInstanceOf(ViewerState);
    });

    it('is not a prop: no viewerstate attribute is observed or reflected', async () => {
        const el = createViewer();
        await connect(el);

        expect(
            (ElementCtor as unknown as { observedAttributes?: string[] })
                .observedAttributes,
        ).not.toContain('viewerstate');
        expect(el.getAttribute('viewerstate')).toBeNull();
        expect(el.getAttribute('viewer-state')).toBeNull();
    });

    it('does not repeat the event for ordinary state changes', async () => {
        const el = createViewer();
        const seen = recordAvailability(el);
        const stateChanges: unknown[] = [];
        el.addEventListener('statechange', (event) => {
            stateChanges.push((event as CustomEvent).detail);
        });

        await connect(el);
        expect(seen).toHaveLength(1);

        const state = el.viewerState!;
        const before = state.toolbarOpen;
        state.toggleToolbar();
        state.toggleAnnotations();
        await settle();

        // State really did change and really did notify on its own channel …
        expect(state.toolbarOpen).toBe(!before);
        expect(stateChanges.length).toBeGreaterThan(0);
        // … but availability is per state instance, not per change.
        expect(seen).toHaveLength(1);
        expect(el.viewerState).toBe(seen[0]);
    });

    it('emits exactly one event per newly mounted state instance across detach and reattach', async () => {
        const el = createViewer();
        const seen = recordAvailability(el);

        await connect(el);
        const first = el.viewerState;
        expect(seen).toEqual([first]);

        el.remove();
        await settle();

        // Disconnection destroys the inner viewer, so there is no state to bind.
        expect(el.viewerState).toBeUndefined();
        expect(seen).toHaveLength(1);

        document.body.appendChild(el);
        await settle();

        expect(seen).toHaveLength(2);
        expect(seen[1]).toBeInstanceOf(ViewerState);
        expect(seen[1]).not.toBe(first);
        expect(el.viewerState).toBe(seen[1]);
    });

    it('gives each element on the page its own state', async () => {
        const a = createViewer();
        const b = createViewer();
        await connect(a);
        await connect(b);

        expect(a.viewerState).toBeInstanceOf(ViewerState);
        expect(b.viewerState).toBeInstanceOf(ViewerState);
        expect(a.viewerState).not.toBe(b.viewerState);
    });
});

describe('searchProvider property input', () => {
    it('reaches the existing search path when assigned before connection', async () => {
        const results: SearchResultGroup[] = [
            {
                canvasIndex: 1,
                canvasLabel: 'page-2',
                hits: [{ type: 'hit', match: 'ornithopod' }],
            },
        ];
        const calls: Array<{ query: string; manifestId: string }> = [];
        const provider: SearchProvider = async (query, context) => {
            calls.push({ query, manifestId: context.manifestId });
            return results;
        };

        const el = createViewer();
        // Assigned before the element is connected — the inner component does
        // not exist yet, so Svelte must carry the value across the upgrade.
        el.searchProvider = provider;
        el.manifestId = MANIFEST_ID;
        el.manifestJson = MANIFEST_JSON;
        await connect(el);

        const state = el.viewerState!;
        expect(state.searchProvider).toBe(provider);

        await waitForManifest(el);
        await state.search('ornithopod');

        expect(calls).toEqual([
            { query: 'ornithopod', manifestId: MANIFEST_ID },
        ]);
        expect(state.searchResults).toEqual(results);
    });

    it('forwards a provider assigned after mount', async () => {
        const el = createViewer();
        await connect(el);

        const provider: SearchProvider = async () => [];
        el.searchProvider = provider;
        await settle();

        expect(el.viewerState?.searchProvider).toBe(provider);
    });

    it('ignores a non-function value with a debug-gated warning', async () => {
        const records: Array<{ level: LogLevel; message: string }> = [];
        configureLogging({
            debug: true,
            sink: (level, args) =>
                records.push({ level, message: args.join(' ') }),
        });

        const el = createViewer();
        // `config.debug` keeps the logger enabled once the viewer applies it.
        el.config = { debug: true };
        // What a stray `searchprovider` attribute would deliver: a string.
        el.searchProvider = 'window.mySearch';
        await connect(el);

        expect(el.viewerState?.searchProvider).toBeNull();
        expect(
            records.filter(
                (r) =>
                    r.level === 'warn' && r.message.includes('searchProvider'),
            ),
        ).toHaveLength(1);
    });

    it('stays silent about a non-function value when debug is off', async () => {
        const records: unknown[] = [];
        configureLogging({ debug: false, sink: () => records.push(1) });

        const el = createViewer();
        el.searchProvider = 42;
        await connect(el);

        expect(el.viewerState?.searchProvider).toBeNull();
        expect(records).toHaveLength(0);
    });

    it('reflects no attribute for the property-only input', async () => {
        const el = createViewer();
        el.searchProvider = (async () => []) as SearchProvider;
        await connect(el);

        expect(el.getAttribute('search-provider')).toBeNull();
        expect(el.getAttribute('searchprovider')).toBeNull();
        expect(
            [...el.attributes]
                .map((a) => a.name)
                .filter((n) => /search/.test(n)),
        ).toEqual([]);
    });
});
