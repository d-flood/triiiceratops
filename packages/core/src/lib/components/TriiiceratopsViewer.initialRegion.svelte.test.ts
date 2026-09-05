/**
 * **A view target's region frames the canvas it opens.**
 *
 * The framing half of a content state (ADR 0006): `#xywh=` names the part of the
 * canvas the reader was sent to, and the viewer must open there rather than on
 * the whole canvas. Driven through the viewer's public inputs — `content-state`
 * and the discrete `initialCanvasRegion` prop — over a mounted viewer with a
 * measurable surface, because the property is about the view the viewer ADOPTS,
 * which only a mounted renderer has.
 *
 * The sequencing is the substance, and each hazard has its own case here: a
 * manifest that resolves after mount, a canvas switch afterwards, a region that
 * arrives too late to be an opening at all, a canvas resolving different
 * intrinsic dimensions under an unchanged world, a refit that changes nothing
 * but a tile-source list, and a region that runs off the edge of the canvas or
 * misses it entirely.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import { installViewerSurface } from '../test/utils/mockViewerSurface';
import type { ViewerError } from '../types/viewerError';

const MANIFEST_ID = 'https://example.org/iiif/book/manifest';
const CANVAS = (name: string) => `${MANIFEST_ID}/canvas/${name}`;

/** The surface every case mounts against, and the canvas dimensions it frames. */
const SURFACE = { width: 800, height: 600 };
const CANVAS_SIZE = { width: 1000, height: 800 };

/**
 * The region every framing case uses, and the view it must produce.
 *
 * Its aspect ratio differs from the canvas's on purpose: a region of the same
 * shape as the canvas fits at a scale a whole-canvas fit could also have
 * reached, so the assertion would not distinguish them.
 */
const REGION = { x: 500, y: 400, width: 250, height: 200 };
const REGION_SCALE = Math.min(
    SURFACE.width / REGION.width,
    SURFACE.height / REGION.height,
);
const WHOLE_CANVAS_SCALE = Math.min(
    SURFACE.width / CANVAS_SIZE.width,
    SURFACE.height / CANVAS_SIZE.height,
);

function makeCanvas(name: string, size = CANVAS_SIZE) {
    const id = CANVAS(name);
    return {
        id,
        type: 'Canvas',
        label: { en: [name] },
        width: size.width,
        height: size.height,
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${id}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `https://example.org/images/${name}.jpg`,
                            type: 'Image',
                            format: 'image/jpeg',
                            width: size.width,
                            height: size.height,
                        },
                        target: id,
                    },
                ],
            },
        ],
    };
}

function makeManifest(size = CANVAS_SIZE) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: MANIFEST_ID,
        type: 'Manifest',
        label: { en: ['book'] },
        items: [makeCanvas('p1', size), makeCanvas('p2', size)],
    };
}

/** A content-state Annotation in the shape the cookbook publishes. */
function contentStateAnnotation(canvasName: string, fragment = '') {
    return {
        id: 'https://example.org/state/annotation',
        type: 'Annotation',
        motivation: 'contentState',
        target: {
            id: `${CANVAS(canvasName)}${fragment}`,
            type: 'Canvas',
            partOf: [{ id: MANIFEST_ID, type: 'Manifest' }],
        },
    };
}

function encode(document: unknown): string {
    return Buffer.from(JSON.stringify(document), 'utf8')
        .toString('base64url')
        .replace(/=+$/, '');
}

async function settle(ms = 200) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

/** The number of consecutive identical reads that count as settled. */
const STABLE_READS = 3;

/**
 * Poll the reader's view until it stops moving, and answer with it.
 *
 * A fit is eased, so every expectation below is about the end of an animation:
 * a fixed wait either reads mid-curve or pads each case with the slowest
 * plausible one. Repeats are required rather than one match because an easing
 * curve has plateaux, most obviously at its start.
 */
async function settledView(state: {
    viewportScale: number;
    viewportCentre: { x: number; y: number } | null;
}) {
    let previous = '';
    let unchanged = 0;

    for (let poll = 0; poll < 400 && unchanged < STABLE_READS; poll += 1) {
        await settle(20);
        const sample = JSON.stringify([
            state.viewportScale,
            state.viewportCentre,
        ]);
        if (sample === previous) unchanged += 1;
        else {
            unchanged = 0;
            previous = sample;
        }
    }

    return { scale: state.viewportScale, centre: state.viewportCentre };
}

describe('an initial canvas region in a mounted viewer', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;
    let surface: ReturnType<typeof installViewerSurface>;
    let errors: ViewerError[];
    const apps: Array<ReturnType<typeof mount>> = [];

    beforeEach(() => {
        errors = [];
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => makeManifest(),
        }));

        surface = installViewerSurface(SURFACE);
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) await unmount(app);
        target.remove();
        surface.restore();
        vi.restoreAllMocks();
    });

    type Props = {
        viewerState?: any;
        onviewererror?: (error: ViewerError) => void;
        manifestId?: string;
        manifestJson?: unknown;
        contentState?: string;
        initialCanvasRegion?: {
            x: number;
            y: number;
            width: number;
            height: number;
        } | null;
    };

    function mountViewer(props: Props) {
        const state: Props = $state({
            viewerState: undefined,
            onviewererror: (error: ViewerError) => {
                errors.push(error);
            },
            ...props,
        });
        apps.push(mount(TriiiceratopsViewer, { target, props: state }));
        return state;
    }

    /** The framed view, within a canvas unit or two of the region's own. */
    function expectFramed(view: {
        scale: number;
        centre: { x: number; y: number } | null;
    }) {
        expect(view.scale).toBeCloseTo(REGION_SCALE, 4);
        expect(view.centre).not.toBeNull();
        expect(view.centre!.x).toBeCloseTo(REGION.x + REGION.width / 2, 0);
        expect(view.centre!.y).toBeCloseTo(REGION.y + REGION.height / 2, 0);
    }

    /**
     * Move the reader deliberately off the region and answer where they land.
     *
     * Zoom and pan are separate eased commands and `panTo` adopts the scale in
     * force when it is CALLED, so a pan issued before the zoom has settled
     * discards it. Each therefore settles before the next.
     */
    async function panAndZoomAway(state: {
        viewportScale: number;
        viewportCentre: { x: number; y: number } | null;
        zoomTo: (scale: number) => void;
        panTo: (centre: { x: number; y: number }) => void;
    }) {
        state.zoomTo(1.5);
        await settledView(state);
        state.panTo({ x: 200, y: 200 });
        const moved = await settledView(state);

        // The premise of every case that uses this: the reader is somewhere the
        // region is not, so a re-frame would be visible.
        expect(moved.scale).not.toBeCloseTo(REGION_SCALE, 4);
        expect(moved.centre!.x).not.toBeCloseTo(REGION.x + REGION.width / 2, 0);
        return moved;
    }

    it('frames the region a content state names', async () => {
        const props = mountViewer({
            contentState: encode(
                contentStateAnnotation(
                    'p2',
                    `#xywh=${REGION.x},${REGION.y},${REGION.width},${REGION.height}`,
                ),
            ),
        });
        await settle();
        const state = props.viewerState;

        expect(state.canvasId).toBe(CANVAS('p2'));
        expectFramed(await settledView(state));
        // Consumed rather than left standing: the member is an ingestion input,
        // and a viewer that still holds one would re-frame a later canvas.
        expect(state.initialCanvasRegion).toBeNull();
        expect(errors).toEqual([]);
    });

    it('frames the region when the manifest resolves after mount', async () => {
        let release: () => void = () => {};
        const arrival = new Promise<void>((resolve) => {
            release = resolve;
        });
        mockFetch.mockImplementation(async () => {
            await arrival;
            return { ok: true, json: async () => makeManifest() };
        });

        const props = mountViewer({
            contentState: encode(
                contentStateAnnotation(
                    'p1',
                    `#xywh=${REGION.x},${REGION.y},${REGION.width},${REGION.height}`,
                ),
            ),
        });
        // Mounted, measured, and with no world to frame: every fit before the
        // manifest lands has to leave the region unspent.
        await settle();
        expect(props.viewerState.initialCanvasRegion).toEqual(REGION);

        release();
        await settle();
        expectFramed(await settledView(props.viewerState));
    });

    it('does not re-frame the region after a canvas switch', async () => {
        const props = mountViewer({
            initialCanvasRegion: REGION,
            contentState: encode(contentStateAnnotation('p1')),
        });
        await settle();
        const state = props.viewerState;
        expectFramed(await settledView(state));

        state.setCanvas(CANVAS('p2'));
        await settle();
        const after = await settledView(state);

        // The whole of the canvas navigated to, not the region the viewer opened
        // at: a region applies to the canvas the viewer opens at and nothing
        // after it.
        expect(after.scale).toBeCloseTo(WHOLE_CANVAS_SCALE, 4);
        expect(after.centre!.x).toBeCloseTo(CANVAS_SIZE.width / 2, 0);
        expect(after.centre!.y).toBeCloseTo(CANVAS_SIZE.height / 2, 0);
    });

    it('re-frames the region only when the canvas resolves different dimensions', async () => {
        const props = mountViewer({
            manifestId: MANIFEST_ID,
            manifestJson: makeManifest(),
            initialCanvasRegion: REGION,
        });
        await settle();
        const state = props.viewerState;
        expectFramed(await settledView(state));

        const moved = await panAndZoomAway(state);

        // A refit under the dimensions the region was already measured against
        // has no better reading of the region to offer, so it leaves the reader
        // alone. The region is not spent by it, though — a correction may still
        // be coming.
        props.manifestJson = makeManifest();
        await settle();
        expect(await settledView(state)).toEqual(moved);

        // The canvas arriving at its real intrinsic size — a thumbnail giving
        // way to a pyramid — is the one refit that IS a fresh reading of the
        // region, because canvas space is the region's own coordinate system.
        props.manifestJson = makeManifest({ width: 2000, height: 1600 });
        await settle();
        const after = await settledView(state);

        expect(after.scale).toBeCloseTo(REGION_SCALE, 4);
        expect(after.centre!.x).toBeCloseTo(REGION.x + REGION.width / 2, 0);
        expect(after.centre!.y).toBeCloseTo(REGION.y + REGION.height / 2, 0);
    });

    it('does not re-frame the region on a refit under unchanged dimensions', async () => {
        const props = mountViewer({
            manifestId: MANIFEST_ID,
            manifestJson: makeManifest(),
            initialCanvasRegion: REGION,
        });
        await settle();
        const state = props.viewerState;
        expectFramed(await settledView(state));

        const moved = await panAndZoomAway(state);

        // A fresh tile-source list under an unchanged canvas — what selecting a
        // Choice produces — is not the viewer opening, and must not send the
        // reader back to the region at some arbitrary later point in a session.
        props.manifestJson = makeManifest();
        await settle();

        expect(await settledView(state)).toEqual(moved);
    });

    it('does not frame a region that arrives after the viewer has opened', async () => {
        const props = mountViewer({
            manifestId: MANIFEST_ID,
            manifestJson: makeManifest(),
        });
        await settle();
        const state = props.viewerState;
        expect((await settledView(state)).scale).toBeCloseTo(
            WHOLE_CANVAS_SCALE,
            4,
        );

        props.initialCanvasRegion = REGION;
        await settle();

        state.setCanvas(CANVAS('p2'));
        await settle();
        const after = await settledView(state);

        // A region names where the viewer OPENS. This one missed that, so it is
        // stranded rather than held back to spring on the next canvas the
        // reader turns to.
        expect(after.scale).toBeCloseTo(WHOLE_CANVAS_SCALE, 4);
        expect(after.centre!.x).toBeCloseTo(CANVAS_SIZE.width / 2, 0);
        expect(after.centre!.y).toBeCloseTo(CANVAS_SIZE.height / 2, 0);
    });

    it('honours the part of an off-the-edge region that is on the canvas', async () => {
        // The right half of this box hangs off the canvas, so the honoured
        // region is 200 wide starting at 800 — everything that exists.
        const props = mountViewer({
            initialCanvasRegion: { x: 800, y: 400, width: 400, height: 200 },
            contentState: encode(contentStateAnnotation('p1')),
        });
        await settle();
        const view = await settledView(props.viewerState);

        expect(view.scale).toBeCloseTo(
            Math.min(SURFACE.width / 200, SURFACE.height / 200),
            4,
        );
        expect(view.centre!.x).toBeCloseTo(900, 0);
        expect(view.centre!.y).toBeCloseTo(500, 0);
        expect(errors).toEqual([]);
    });

    it('falls back to the whole canvas for a region that misses it entirely', async () => {
        const props = mountViewer({
            initialCanvasRegion: { x: 4000, y: 4000, width: 100, height: 100 },
            contentState: encode(contentStateAnnotation('p1')),
        });
        await settle();
        const view = await settledView(props.viewerState);

        // Degraded, not thrown and not blank: the reader gets the canvas.
        expect(view.scale).toBeCloseTo(WHOLE_CANVAS_SCALE, 4);
        expect(view.centre!.x).toBeCloseTo(CANVAS_SIZE.width / 2, 0);
        expect(view.centre!.y).toBeCloseTo(CANVAS_SIZE.height / 2, 0);
        expect(errors).toEqual([]);
    });
});
