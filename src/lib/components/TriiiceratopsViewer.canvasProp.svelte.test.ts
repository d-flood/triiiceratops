import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, tick } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';

/**
 * Regression tests for loading a manifest with a requested canvas
 * (manifestId + canvasId props set together, e.g. from a shared URL).
 *
 * The canvas prop used to be cleared by setManifest and re-applied after
 * load. Consumers that mirror viewer state back into the canvasId prop
 * (like the demo's "sync canvas back" effect) would echo the transient
 * first-canvas state into the prop before the re-apply ran, and the
 * viewer would land on the first page instead of the requested canvas.
 */

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

const MANIFEST_ID = 'https://example.org/iiif/book/manifest';
const OTHER_MANIFEST_ID = 'https://example.org/iiif/atlas/manifest';
const CANVAS = (name: string) => `${MANIFEST_ID}/canvas/${name}`;
const OTHER_CANVAS = (name: string) => `${OTHER_MANIFEST_ID}/canvas/${name}`;
const FIRST_CANVAS = CANVAS('page-1');
const REQUESTED_CANVAS = CANVAS('page-2');

function makeCanvasFor(manifestId: string, name: string) {
    const id = `${manifestId}/canvas/${name}`;
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
                    service: {
                        '@context': 'http://iiif.io/api/image/2/context.json',
                        '@id': `https://example.org/iiif/${name}`,
                        profile: 'http://iiif.io/api/image/2/level2.json',
                    },
                },
            },
        ],
    };
}

function makeManifest(manifestId: string, label: string) {
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': manifestId,
        '@type': 'sc:Manifest',
        label,
        sequences: [
            {
                '@id': `${manifestId}/sequence/normal`,
                '@type': 'sc:Sequence',
                canvases: [
                    makeCanvasFor(manifestId, 'page-1'),
                    makeCanvasFor(manifestId, 'page-2'),
                    makeCanvasFor(manifestId, 'page-3'),
                ],
            },
        ],
    };
}

const manifestJson = makeManifest(MANIFEST_ID, 'Book');
const otherManifestJson = makeManifest(OTHER_MANIFEST_ID, 'Atlas');

async function settle(ms = 500) {
    await tick();
    await new Promise((r) => setTimeout(r, ms));
    await tick();
}

describe('TriiiceratopsViewer canvasId prop on manifest load', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async (url: string) => ({
            ok: true,
            json: async () =>
                String(url).startsWith(OTHER_MANIFEST_ID)
                    ? otherManifestJson
                    : manifestJson,
        }));
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.restoreAllMocks();
    });

    it('shows the requested canvas when manifestId and canvasId are set together', async () => {
        const props = $state({
            manifestId: MANIFEST_ID,
            canvasId: REQUESTED_CANVAS,
            viewerState: undefined as any,
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        expect(props.viewerState?.canvasId).toBe(REQUESTED_CANVAS);

        await unmount(app);
    });

    it('shows the requested canvas when the consumer mirrors viewer state back into the prop', async () => {
        const props = $state({
            manifestId: MANIFEST_ID,
            canvasId: REQUESTED_CANVAS,
            viewerState: undefined as any,
        });

        // Mirror of the demo's "sync canvas ID back" effect (Demo.svelte)
        const echoed: string[] = [];
        const cleanup = $effect.root(() => {
            $effect(() => {
                if (
                    props.viewerState?.canvasId &&
                    props.viewerState.canvasId !== props.canvasId
                ) {
                    echoed.push(props.viewerState.canvasId);
                    props.canvasId = props.viewerState.canvasId;
                }
            });
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();

        expect(props.viewerState?.canvasId).toBe(REQUESTED_CANVAS);
        expect(props.canvasId).toBe(REQUESTED_CANVAS);
        // The transient first-canvas state must never leak to consumers
        expect(echoed).not.toContain(FIRST_CANVAS);

        await unmount(app);
        cleanup();
    });

    it('lands on the target canvas when manifestId and canvasId props change together mid-session', async () => {
        const props = $state({
            manifestId: MANIFEST_ID,
            canvasId: '',
            viewerState: undefined as any,
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();
        expect(props.viewerState?.canvasId).toBe(FIRST_CANVAS);

        props.manifestId = OTHER_MANIFEST_ID;
        props.canvasId = OTHER_CANVAS('page-3');
        await settle();

        expect(props.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
        expect(props.viewerState?.canvasId).toBe(OTHER_CANVAS('page-3'));

        await unmount(app);
    });

    it('lands on the target canvas when manifestJson and canvasId props change together mid-session', async () => {
        const props = $state({
            manifestId: MANIFEST_ID,
            manifestJson: manifestJson as any,
            canvasId: '',
            viewerState: undefined as any,
        });

        const app = mount(TriiiceratopsViewer, { target, props });
        await settle();
        expect(props.viewerState?.canvasId).toBe(FIRST_CANVAS);

        props.manifestId = OTHER_MANIFEST_ID;
        props.manifestJson = otherManifestJson;
        props.canvasId = OTHER_CANVAS('page-3');
        await settle();

        expect(props.viewerState?.manifestId).toBe(OTHER_MANIFEST_ID);
        expect(props.viewerState?.canvasId).toBe(OTHER_CANVAS('page-3'));

        await unmount(app);
    });

    // NOTE: a mid-session switch of BOTH props while a parent effect mirrors
    // viewer state back into canvasId is not testable at this seam: the
    // parent's mirror flushes before the child observes the new prop value
    // and overwrites it — the viewer never sees the target canvas at all.
    // Consumers that mirror state must not fight external prop writes in the
    // same flush.
});
