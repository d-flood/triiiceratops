import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, tick } from 'svelte';

import OSDViewer from './OSDViewer.svelte';
import { ViewerState } from '../state/viewer.svelte';

/**
 * The OpenSeadragon half of the renderer port (`renderer/rendererPort.ts`).
 *
 * Two claims only, both of which the first-party host makes by construction and
 * this one has to be held to explicitly:
 *
 * 1. **Readiness means the viewport can answer.** `rendererReady` is not "the
 *    component mounted"; it is "the queries return real numbers instead of
 *    zeroes and `null`s". On this renderer nothing is true until OSD's `open`
 *    fires, because before it the world holds no items.
 * 2. **A viewport question is answered for the canvas it was asked about, or
 *    not at all.** OSD's world has no idea what a Canvas is, so `getItemAt(0)`
 *    is simply the first source opened — the VERSO in a spread. Answering from
 *    it while gating on `viewerState.canvasId` puts an overlay a full page-width
 *    off for any reader standing on the recto.
 *
 * OpenSeadragon itself is mocked: what is under test is this component's
 * mapping from Canvas ids to world items and its readiness timing, neither of
 * which needs a real tile pyramid — and a real OSD in happy-dom has no sized
 * surface to be ready about.
 */

/** One fake `TiledImage`: a page `viewportWidth` units across in OSD's world. */
function fakeItem(originX: number, viewportWidth: number) {
    return {
        // The identity conversions this component composes with; each fake
        // returns a value derived from the item's own origin, so a query
        // answered from the WRONG item is a different number rather than a
        // coincidence.
        getBounds: () => ({
            x: originX,
            y: 0,
            width: viewportWidth,
            height: viewportWidth * 0.75,
        }),
        imageToViewportCoordinates: (x: number, y: number) => ({
            x: originX + x / 1000,
            y: y / 1000,
        }),
        imageToViewportRectangle: (
            x: number,
            y: number,
            width: number,
            height: number,
        ) => ({
            x: originX + x / 1000,
            y: y / 1000,
            width: width / 1000,
            height: height / 1000,
        }),
        viewportToImageCoordinates: (point: { x: number; y: number }) => ({
            x: (point.x - originX) * 1000,
            y: point.y * 1000,
        }),
        viewportToImageRectangle: (rect: {
            x: number;
            y: number;
            width: number;
            height: number;
        }) => ({
            x: (rect.x - originX) * 1000,
            y: rect.y * 1000,
            width: rect.width * 1000,
            height: rect.height * 1000,
        }),
    };
}

interface FakeViewer {
    handlers: Map<string, Array<(event?: unknown) => void>>;
    items: ReturnType<typeof fakeItem>[];
    opened: unknown;
    fireOpen(): void;
    viewport: Record<string, any>;
    world: Record<string, any>;
    [key: string]: any;
}

let viewers: FakeViewer[] = [];

function createFakeViewer(): FakeViewer {
    const handlers = new Map<string, Array<(event?: unknown) => void>>();
    const items: ReturnType<typeof fakeItem>[] = [];

    const add = (name: string, fn: (event?: unknown) => void) => {
        const list = handlers.get(name) ?? [];
        list.push(fn);
        handlers.set(name, list);
    };

    const viewer: FakeViewer = {
        handlers,
        items,
        opened: null,
        addHandler: add,
        addOnceHandler: add,
        removeHandler: vi.fn(),
        removeAllHandlers: vi.fn(),
        destroy: vi.fn(),
        open: vi.fn((sources: unknown) => {
            viewer.opened = sources;
        }),
        close: vi.fn(() => {
            items.length = 0;
        }),
        addTiledImage: vi.fn(),
        forceRedraw: vi.fn(),
        setMouseNavEnabled: vi.fn(),
        addOverlay: vi.fn(),
        removeOverlay: vi.fn(),
        clearOverlays: vi.fn(),
        fireOpen() {
            for (const fn of handlers.get('open') ?? []) fn();
        },
        viewport: {
            getContainerSize: () => ({ x: 1000, y: 800 }),
            getZoom: () => 2,
            zoomTo: vi.fn(),
            zoomBy: vi.fn(),
            panTo: vi.fn(),
            goHome: vi.fn(),
            fitBounds: vi.fn(),
            applyConstraints: vi.fn(),
            getHomeZoom: () => 1,
            getCenter: () => ({ x: 0.5, y: 0.4 }),
            getBounds: () => ({ x: 0, y: 0, width: 1, height: 0.8 }),
            // Screen pixels are viewport units times the container width, which
            // is what OSD's own pair does at zoom 1 and is enough to tell one
            // item's answer from another's.
            pixelFromPoint: (point: { x: number; y: number }) => ({
                x: point.x * 1000,
                y: point.y * 1000,
            }),
            pointFromPixel: (point: { x: number; y: number }) => ({
                x: point.x / 1000,
                y: point.y / 1000,
            }),
            minZoomLevel: 0,
        },
        world: {
            getItemCount: () => items.length,
            getItemAt: (index: number) => items[index] ?? null,
            addHandler: vi.fn(),
            removeHandler: vi.fn(),
        },
        drawer: { canvas: null },
        container: null,
        element: null,
    };

    viewers.push(viewer);
    return viewer;
}

vi.mock('openseadragon', () => ({
    default: Object.assign(
        vi.fn(() => createFakeViewer()),
        {
            Point: class {
                constructor(
                    public x: number,
                    public y: number,
                ) {}
            },
            Rect: vi.fn(),
            ControlAnchor: {},
        },
    ),
}));

const MANIFEST_ID = 'https://example.org/iiif/spread/manifest';
const VERSO = `${MANIFEST_ID}/canvas/1`;
const RECTO = `${MANIFEST_ID}/canvas/2`;
const PAGE = { width: 1200, height: 900 };

function canvas(id: string) {
    return {
        id,
        type: 'Canvas',
        width: PAGE.width,
        height: PAGE.height,
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${id}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        target: id,
                        body: {
                            id: `${id}/image.jpg`,
                            type: 'Image',
                            format: 'image/jpeg',
                            width: PAGE.width,
                            height: PAGE.height,
                        },
                    },
                ],
            },
        ],
    };
}

const MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: MANIFEST_ID,
    type: 'Manifest',
    label: { en: ['Spread'] },
    behavior: ['paged'],
    items: [canvas(VERSO), canvas(RECTO)],
};

/**
 * The two positioned tile sources a spread hands the component — object
 * sources, so `resolveTileSources` passes them straight through with no fetch.
 */
const SPREAD_SOURCES = [
    {
        tileSource: { width: PAGE.width, height: PAGE.height },
        x: 0,
        y: 0,
        width: 1,
        canvasId: VERSO,
    },
    {
        tileSource: { width: PAGE.width, height: PAGE.height },
        x: 1,
        y: 0,
        width: 1,
        canvasId: RECTO,
    },
];

async function mountSpread(canvasId: string) {
    const state = new ViewerState();
    await state.setManifestData(MANIFEST_ID, MANIFEST, { canvasId });
    state.viewingMode = 'paged';
    await tick();

    const target = document.createElement('div');
    document.body.appendChild(target);
    const component = mount(OSDViewer, {
        target,
        props: { tileSources: SPREAD_SOURCES, viewerState: state },
    });

    // The component imports OpenSeadragon dynamically, so settle THAT promise
    // (awaiting the same specifier resolves the module graph) before draining
    // the effects that construct the viewer and resolve the tile sources.
    await import('openseadragon');
    for (let i = 0; i < 12; i++) await tick();

    const viewer = viewers.at(-1)!;
    return {
        state,
        viewer,
        /** Put the spread in the world and fire OSD's `open`, as OSD would. */
        open() {
            viewer.items.push(fakeItem(0, 1), fakeItem(1, 1));
            viewer.fireOpen();
        },
        async dispose() {
            await unmount(component);
            target.remove();
        },
    };
}

beforeEach(() => {
    viewers = [];
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('OSD renderer port — readiness', () => {
    // The promise `rendererReady` (and `whenRendererReady`) makes is that the
    // viewport queries answer with real numbers. Marking it at construction
    // made that a lie on this renderer for the whole window before `open`.
    it('is not ready while the world is still empty', async () => {
        const spread = await mountSpread(VERSO);

        expect(spread.viewer).toBeDefined();
        expect(spread.state.rendererReady).toBe(false);
        expect(spread.state.canvasToScreen({ x: 0, y: 0 })).toBeNull();
        expect(spread.state.viewportCentre).toBeNull();

        await spread.dispose();
    });

    it('becomes ready when the world opens, and answers from that moment', async () => {
        const spread = await mountSpread(VERSO);

        spread.open();
        await tick();

        expect(spread.state.rendererReady).toBe(true);
        expect(spread.state.canvasToScreen({ x: 0, y: 0 })).not.toBeNull();
        expect(spread.state.viewportScale).toBeGreaterThan(0);

        await spread.dispose();
    });

    // The world reopens on every canvas switch. Readiness is a state, not a
    // per-open event, so a second `open` must not attach a second port and
    // leave the first one's detach unable to tear it down.
    it('attaches once across repeated opens, and detaches on unmount', async () => {
        const spread = await mountSpread(VERSO);

        spread.open();
        spread.viewer.fireOpen();
        await tick();
        expect(spread.state.rendererReady).toBe(true);

        await spread.dispose();
        await tick();
        expect(spread.state.rendererReady).toBe(false);
    });
});

describe('OSD renderer port — which canvas answers', () => {
    it('answers for the recto from the recto’s world item, not item 0', async () => {
        const onVerso = await mountSpread(VERSO);
        onVerso.open();
        await tick();
        const versoOrigin = onVerso.state.canvasToScreen({ x: 0, y: 0 });
        await onVerso.dispose();

        const onRecto = await mountSpread(RECTO);
        onRecto.open();
        await tick();
        const rectoOrigin = onRecto.state.canvasToScreen({ x: 0, y: 0 });

        expect(versoOrigin).not.toBeNull();
        expect(rectoOrigin).not.toBeNull();
        // The recto's item starts one world unit to the right of the verso's,
        // which at this container width is 1000 screen pixels. Answering from
        // item 0 for both would make these equal — a full page-width error.
        expect(rectoOrigin!.x - versoOrigin!.x).toBeCloseTo(1000, 6);

        await onRecto.dispose();
    });

    it('refuses a question about a canvas that is not the current one', async () => {
        const spread = await mountSpread(VERSO);
        spread.open();
        await tick();

        expect(spread.state.canvasToScreen({ x: 0, y: 0 }, RECTO)).toBeNull();
        expect(spread.state.screenToCanvas({ x: 0, y: 0 }, RECTO)).toBeNull();

        await spread.dispose();
    });

    // OSD's viewport unit is the width of the first item opened, not of the
    // canvas being asked about. `getScale` that ignores the item's own width
    // reports the verso's scale for every page in the spread.
    it('reports a scale zoomTo takes back unchanged', async () => {
        const spread = await mountSpread(RECTO);
        // The recto laid out at half width — the shape median-height
        // normalization produces, and the case where the item's width matters.
        spread.viewer.items.push(fakeItem(0, 1), fakeItem(1, 0.5));
        spread.viewer.fireOpen();
        await tick();

        const scale = spread.state.viewportScale;
        expect(scale).toBeGreaterThan(0);

        spread.state.zoomTo(scale);

        const [zoom] = spread.viewer.viewport.zoomTo.mock.calls.at(-1)!;
        // OSD's own reading of the current zoom, handed back unchanged.
        expect(zoom).toBeCloseTo(spread.viewer.viewport.getZoom(), 9);

        await spread.dispose();
    });
});
