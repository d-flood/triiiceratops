/**
 * **A table-of-contents entry that names a region frames it.**
 *
 * Cookbook 0025 publishes a newspaper whose articles are `SpecificResource`
 * range items — a canvas plus an `xywh` selector — so choosing an article is a
 * navigation carrying a region, the spatial peer of the `#t=` a chapter
 * carries. Driven through the panel a reader actually presses, over a mounted
 * viewer with a measurable surface, because what is asserted is the view the
 * viewer adopts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import { installViewerSurface } from '../test/utils/mockViewerSurface';

const MANIFEST_ID = 'https://example.org/iiif/newspaper/manifest';
const CANVAS = (name: string) => `${MANIFEST_ID}/canvas/${name}`;

const SURFACE = { width: 800, height: 600 };
const CANVAS_SIZE = { width: 1000, height: 800 };

/** The article region, shaped unlike the canvas so its fit is distinguishable. */
const REGION = { x: 500, y: 400, width: 250, height: 200 };
const REGION_SCALE = Math.min(
    SURFACE.width / REGION.width,
    SURFACE.height / REGION.height,
);
const WHOLE_CANVAS_SCALE = Math.min(
    SURFACE.width / CANVAS_SIZE.width,
    SURFACE.height / CANVAS_SIZE.height,
);

function makeCanvas(name: string) {
    const id = CANVAS(name);
    return {
        id,
        type: 'Canvas',
        label: { en: [name] },
        width: CANVAS_SIZE.width,
        height: CANVAS_SIZE.height,
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
                            width: CANVAS_SIZE.width,
                            height: CANVAS_SIZE.height,
                        },
                        target: id,
                    },
                ],
            },
        ],
    };
}

/**
 * 0025's own structure, in miniature: an "Articles" range whose children are
 * the articles, each a `SpecificResource` naming a region of a page. "Das
 * Turnier" targets a plain canvas so the unchanged path is asserted beside the
 * new one.
 */
function makeManifest(regionItem: unknown) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: MANIFEST_ID,
        type: 'Manifest',
        label: { en: ['Bozner Zeitung'] },
        items: [makeCanvas('p1'), makeCanvas('p2')],
        structures: [
            {
                id: `${MANIFEST_ID}/range/articles`,
                type: 'Range',
                label: { none: ['Articles'] },
                items: [
                    {
                        id: `${MANIFEST_ID}/range/tagesneuigkeiten`,
                        type: 'Range',
                        label: { de: ['Tagesneuigkeiten'] },
                        items: [regionItem],
                    },
                    {
                        id: `${MANIFEST_ID}/range/turnier`,
                        type: 'Range',
                        label: { de: ['Das Turnier'] },
                        items: [{ id: CANVAS('p1'), type: 'Canvas' }],
                    },
                ],
            },
        ],
    };
}

/** 0025's spelling: a `SpecificResource` over a `FragmentSelector`. */
const SPECIFIC_RESOURCE = {
    type: 'SpecificResource',
    source: { id: CANVAS('p2'), type: 'Canvas' },
    selector: {
        type: 'FragmentSelector',
        value: `xywh=${REGION.x},${REGION.y},${REGION.width},${REGION.height}`,
    },
};

/** The general spelling, which no cookbook recipe publishes. */
const STRING_TARGET = `${CANVAS('p2')}#xywh=${REGION.x},${REGION.y},${REGION.width},${REGION.height}`;

// happy-dom lacks the Web Animations API the panel's transitions use.
function stubAnimate() {
    if ('animate' in Element.prototype) return;
    (Element.prototype as unknown as Record<string, unknown>).animate =
        function () {
            return {
                onfinish: null,
                cancel() {},
                finish() {},
                finished: Promise.resolve(),
                playState: 'finished',
            } as unknown as Animation;
        };
}

async function settle(ms = 200) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

/** The number of consecutive identical reads that count as settled. */
const STABLE_READS = 3;

/**
 * Poll the reader's view until it stops moving, and answer with it. A fit is
 * eased, so a single read is a moment of an animation; repeats are required
 * because an easing curve has plateaux.
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

describe('navigating from a table of contents entry that names a region', () => {
    const mockFetch = vi.fn();
    let target: HTMLElement;
    let surface: ReturnType<typeof installViewerSurface>;
    const apps: Array<ReturnType<typeof mount>> = [];

    beforeEach(() => {
        stubAnimate();
        mockFetch.mockReset();
        vi.stubGlobal('fetch', mockFetch);
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

    /** Open the viewer on a manifest with its table of contents showing. */
    async function openViewer(regionItem: unknown) {
        const props: { viewerState?: any } = $state({
            viewerState: undefined,
            manifestId: MANIFEST_ID,
            manifestJson: makeManifest(regionItem),
        });
        apps.push(mount(TriiiceratopsViewer, { target, props }));
        await settle();

        const state = props.viewerState;
        state.toggleStructuresPanel();
        await settle();
        return state;
    }

    /** Choose an entry by its label, as a reader does. */
    function chooseEntry(label: string) {
        const panel = target.querySelector('[data-panel-id="structures"]');
        expect(panel).not.toBeNull();
        const entry = [...panel!.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === label,
        );
        expect(entry, `no entry labelled ${label}`).toBeDefined();
        entry!.click();
    }

    it('lands on the canvas and frames the region of a `SpecificResource`', async () => {
        const state = await openViewer(SPECIFIC_RESOURCE);
        await settledView(state);

        chooseEntry('Tagesneuigkeiten');
        await settle();

        expect(state.canvasId).toBe(CANVAS('p2'));
        const view = await settledView(state);
        expect(view.scale).toBeCloseTo(REGION_SCALE, 4);
        expect(view.centre!.x).toBeCloseTo(REGION.x + REGION.width / 2, 0);
        expect(view.centre!.y).toBeCloseTo(REGION.y + REGION.height / 2, 0);
    });

    it('frames the same region from a `#xywh=` string target', async () => {
        const state = await openViewer(STRING_TARGET);
        await settledView(state);

        chooseEntry('Tagesneuigkeiten');
        await settle();

        expect(state.canvasId).toBe(CANVAS('p2'));
        const view = await settledView(state);
        expect(view.scale).toBeCloseTo(REGION_SCALE, 4);
        expect(view.centre!.x).toBeCloseTo(REGION.x + REGION.width / 2, 0);
        expect(view.centre!.y).toBeCloseTo(REGION.y + REGION.height / 2, 0);
    });

    it('fits the whole canvas for an entry that names no region', async () => {
        const state = await openViewer(SPECIFIC_RESOURCE);
        await settledView(state);

        chooseEntry('Tagesneuigkeiten');
        await settle();
        await settledView(state);

        chooseEntry('Das Turnier');
        await settle();

        expect(state.canvasId).toBe(CANVAS('p1'));
        const view = await settledView(state);
        expect(view.scale).toBeCloseTo(WHOLE_CANVAS_SCALE, 4);
        expect(view.centre!.x).toBeCloseTo(CANVAS_SIZE.width / 2, 0);
        expect(view.centre!.y).toBeCloseTo(CANVAS_SIZE.height / 2, 0);
    });
});
