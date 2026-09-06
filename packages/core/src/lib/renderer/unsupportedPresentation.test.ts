// @vitest-environment node
/**
 * The **unsupported presentation**, asserted over the vendored audiovisual
 * fixtures rather than over hand-built canvases (CONTEXT.md; ADR 0017).
 *
 * Two claims, and the first is the one the epic exists for: **no media URL is
 * ever requested**. A scene plan is the complete list of everything the host
 * will fetch or decode for a frame — tiles, thumbnails, `info.json`, static
 * images — so "the plan names no `.mp4`" is not a proxy for "nothing was
 * fetched", it is the whole of it. Nothing is fetched means nothing can fail,
 * which is why there is no negative-cache entry to look for either: the
 * negative cache (`staticImageFailures`) is only ever written from a failed
 * load.
 *
 * The second is that the canvas survives: it keeps a layout rect and a
 * residency tier, including the duration-only audio canvas that declares no
 * `width` or `height` and used to vanish from layout entirely.
 *
 * Node environment, like `planScene.test.ts` and for its reason: the planner's
 * whole import graph must load with no DOM globals.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    toPlannerCanvas,
    toPlannerCanvases,
    unsupportedPresentationIds,
} from './canvasDescriptors';
import { planScene } from './planScene';
import type { PlannerBudgets, ScenePlan, Viewport } from './types';
import { getThumbnailSrc } from '../utils/getThumbnailSrc';
import { getCanvasesForSequence } from '../utils/iiifParsing';
import { isUnsupportedCanvas } from '../utils/paintingBodies';
import {
    canvasPaintsImage,
    getVisibleViewerCanvases,
} from '../utils/resolveCanvasImage';

const AV_DIR = join(import.meta.dirname, '../test/fixtures/manifests/av');
const VENDORED_DIR = join(
    import.meta.dirname,
    '../test/fixtures/manifests/vendored',
);
const COOKBOOK_DIR = join(
    import.meta.dirname,
    '../test/fixtures/manifests/cookbook',
);

const BUDGETS: PlannerBudgets = {
    byteBudget: 64 * 1024 * 1024,
    marginFactor: 1.5,
    pyramidThreshold: 400,
    boxThreshold: 40,
    minPixelRatio: 0.5,
    maxDecodedPixels: 64 * 1024 * 1024,
};

/** Wide enough, and centred on the origin, that every fixture here is on screen. */
const VIEWPORT: Viewport = {
    width: 1200,
    height: 900,
    centre: { x: 0, y: 0 },
    scale: 1,
};

function manifestOf(dir: string, file: string): any {
    return JSON.parse(readFileSync(join(dir, file), 'utf8'));
}

function canvasesOf(dir: string, file: string): unknown[] {
    const manifest = manifestOf(dir, file);
    // Every fixture read here is IIIF v3 or pre-release v3; the v2 sequence
    // spelling is read for `lunchroom-manners`, which nests its canvases one
    // level down.
    return manifest.items ?? manifest.sequences?.[0]?.canvases ?? [];
}

function planFor(canvases: unknown[]): ScenePlan {
    return planScene({
        canvases: toPlannerCanvases(canvases),
        mode: 'individuals',
        direction: 'left-to-right',
        preserveCanvasScale: false,
        gapFraction: 0.01,
        viewport: VIEWPORT,
        knownMetadata: {},
        budgets: BUDGETS,
    });
}

/** Every URL and canvas id a plan would have the host act on. */
function planUrls(plan: ScenePlan): string[] {
    return [
        ...plan.tileRequests.map((request) => request.url),
        ...plan.thumbnailRequests.map((request) => request.url),
        ...plan.staticImages.map((image) => image.url),
        ...plan.metadataRequests,
    ];
}

describe('a video canvas', () => {
    const canvases = canvasesOf(AV_DIR, '0003-mvm-video.json');

    it('is never asked for over the network, by any channel', () => {
        const plan = planFor(canvases);

        expect(plan.tileRequests).toEqual([]);
        expect(plan.thumbnailRequests).toEqual([]);
        expect(plan.staticImages).toEqual([]);
        expect(plan.tileDraws).toEqual([]);
        // A metadata request is an `info.json` fetch against a fabricated
        // image-service id, which is how a `/iiif/`-shaped media URL used to
        // enter the pipeline without any service being declared at all.
        expect(plan.metadataRequests).toEqual([]);
        expect(planUrls(plan)).toEqual([]);
    });

    it('is not reported as a canvas whose thumbnail could not be resolved', () => {
        // That report is a developer warning about a resolution FAILURE. There
        // was no resolution and no failure — nothing was ever asked for.
        expect(planFor(canvases).unresolvedThumbnails).toEqual([]);
    });

    it('keeps its layout rect and its residency tier', () => {
        const plan = planFor(canvases);
        const canvasId =
            'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas';

        expect(plan.layout.map((rect) => rect.canvasId)).toEqual([canvasId]);
        expect(plan.layout[0].width).toBeGreaterThan(0);
        expect(plan.layout[0].height).toBeGreaterThan(0);
        expect(plan.tiers[canvasId]).toBeDefined();
    });

    it('reaches the planner as a canvas with no images on it', () => {
        // `images: []` is the descriptor's whole statement of the unsupported
        // presentation, and the host reads it to place the DOM placeholder.
        const descriptor = toPlannerCanvas(canvases[0]);

        expect(descriptor).not.toBeNull();
        expect(descriptor!.images).toEqual([]);
    });

    it('resolves no image and no thumbnail src', () => {
        expect(canvasPaintsImage(canvases[0])).toBe(false);
        expect(getThumbnailSrc(canvases[0])).toBe('');
    });
});

describe('a duration-only audio canvas', () => {
    // `0002-mvm-audio` declares `duration` and NO width or height. It used to
    // vanish from layout altogether, so navigation and the thumbnail strip
    // disagreed with the manifest (SPEC, Problem Statement).
    const canvases = canvasesOf(AV_DIR, '0002-mvm-audio.json');

    it('is laid out from the geometry fallback rather than dropped', () => {
        const plan = planFor(canvases);

        expect(plan.layout).toHaveLength(1);
        expect(plan.layout[0].width).toBeGreaterThan(0);
        expect(plan.layout[0].height).toBeGreaterThan(0);
    });

    it('requests nothing', () => {
        expect(planUrls(planFor(canvases))).toEqual([]);
    });
});

describe("lunchroom-manners' Choice of videos", () => {
    // `body: [Choice(three Videos), Text(vtt)]` — the array/Choice ordering bug
    // (user story 40). The Choice is now genuinely resolved and its alternative
    // classified as non-image, rather than the Choice object being taken as the
    // body and dropping out for want of an id.
    const canvases = canvasesOf(VENDORED_DIR, 'lunchroom-manners.json');

    it('resolves as non-image rather than being dropped as null', () => {
        const descriptor = toPlannerCanvas(canvases[0]);

        expect(descriptor).not.toBeNull();
        expect(descriptor!.images).toEqual([]);
    });

    it('never puts an .mp4 into the plan or the thumbnail strip', () => {
        expect(planUrls(planFor(canvases))).toEqual([]);
        expect(getThumbnailSrc(canvases[0])).toBe('');
    });
});

describe('a canvas with image and non-image bodies together', () => {
    // `0489-multimedia-canvas`: an Image body with an Image API service, a
    // Video body, and three TextualBody ones. It paints its image and ignores
    // the rest silently — it is not an unsupported canvas.
    const canvases = canvasesOf(AV_DIR, '0489-multimedia-canvas.json');

    it('paints its image', () => {
        const descriptor = toPlannerCanvas(canvases[0]);

        expect(descriptor!.images).toHaveLength(1);
        expect(descriptor!.images[0].source).toEqual({
            kind: 'service',
            serviceId:
                'https://iiif.io/api/image/3.0/example/reference/36ca0a3370db128ec984b33d71a1543d-100320001004',
            profile: 'level1',
        });
    });

    it('asks for nothing that is not the image', () => {
        expect(
            planUrls(planFor(canvases)).some((url) => url.includes('.mp4')),
        ).toBe(false);
    });
});

describe('a claimed canvas', () => {
    // The **canvas claim**'s entire effect on rendering: the unsupported
    // presentation stops appearing for that canvas, and nothing else changes
    // (CONTEXT.md; ADR 0017).
    const videoCanvases = canvasesOf(AV_DIR, '0003-mvm-video.json');
    const videoId = 'https://iiif.io/api/cookbook/recipe/0003-mvm-video/canvas';
    const compositeCanvases = canvasesOf(AV_DIR, '0489-multimedia-canvas.json');
    const compositeId =
        'https://iiif.io/api/cookbook/recipe/0489-multimedia-canvas/canvas';

    const claimedBy =
        (...ids: string[]) =>
        (canvasId: string) =>
            ids.includes(canvasId);

    it('loses its unsupported presentation while the claim is held', () => {
        const descriptors = toPlannerCanvases(videoCanvases);

        expect([...unsupportedPresentationIds(descriptors)]).toEqual([videoId]);
        expect([
            ...unsupportedPresentationIds(descriptors, claimedBy(videoId)),
        ]).toEqual([]);
    });

    it('keeps painting its image bodies when it is a composite canvas', () => {
        // The reason the claim is scoped to non-image content: an image+video
        // canvas relies on core's tile pipeline continuing under the
        // claimant's overlay (ADR 0017).
        //
        // The video canvas rides along so the empty result below is the CLAIM's
        // doing. A composite canvas is never in the unsupported set, claimed or
        // not, so asserting on it alone would pass with the claim gate deleted.
        const descriptors = toPlannerCanvases([
            ...compositeCanvases,
            ...videoCanvases,
        ]);
        const composite = descriptors.find(
            (canvas) => canvas.id === compositeId,
        );

        expect([...unsupportedPresentationIds(descriptors)]).toEqual([videoId]);
        expect(
            unsupportedPresentationIds(
                descriptors,
                claimedBy(compositeId, videoId),
            ).size,
        ).toBe(0);

        // A claim reaches this set and nothing else: the composite's image body
        // is in the tile pipeline whoever holds the canvas.
        expect(composite?.images).toHaveLength(1);
    });

    it('suppresses nothing for the canvases it did not claim', () => {
        const descriptors = toPlannerCanvases([
            ...videoCanvases,
            ...canvasesOf(AV_DIR, '0002-mvm-audio.json'),
        ]);
        const audioId =
            'https://iiif.io/api/cookbook/recipe/0002-mvm-audio/canvas';

        expect([
            ...unsupportedPresentationIds(descriptors, claimedBy(videoId)),
        ]).toEqual([audioId]);
    });
});

describe('the viewer-wide "no image found" cover', () => {
    /**
     * `TriiiceratopsViewer` covers its whole surface when nothing VISIBLE
     * resolved a tile source, and yields the surface to the renderer when a
     * visible canvas is merely unsupported. This is that gate, computed the
     * same way the component computes it.
     */
    function yieldsToUnsupported(
        canvases: unknown[],
        currentCanvasIndex: number,
        viewingMode: 'individuals' | 'paged' | 'continuous',
    ): boolean {
        return getVisibleViewerCanvases({
            canvases,
            currentCanvasIndex,
            currentCanvasId: (canvases[currentCanvasIndex] as any)?.id ?? null,
            viewingMode,
            pagedOffset: 0,
        }).some((canvas) => isUnsupportedCanvas(canvas));
    }

    /** A canvas that paints nothing at all: no annotation, nothing to treat. */
    const PAINTS_NOTHING = {
        id: 'https://example.test/canvas/blank',
        type: 'Canvas',
        width: 640,
        height: 360,
        items: [],
    };

    const audioCanvas = canvasesOf(AV_DIR, '0002-mvm-audio.json')[0];

    it('yields to a visible SIBLING the current canvas knows nothing about', () => {
        // A spread pairing a blank canvas with the audio one. The current
        // canvas is correctly not unsupported — it paints nothing — so asking
        // only about it would take the cover and lose the sibling's treatment.
        const spread = [PAINTS_NOTHING, audioCanvas];

        expect(isUnsupportedCanvas(PAINTS_NOTHING)).toBe(false);
        expect(yieldsToUnsupported(spread, 0, 'paged')).toBe(true);
        expect(yieldsToUnsupported(spread, 0, 'continuous')).toBe(true);
    });

    it('still covers a canvas that paints nothing — Cookbook 0283 p2', () => {
        // `items: []`. Nothing to be unsupported ABOUT, so the reader gets the
        // viewer's own "no image found", not a statement about content.
        const canvases = canvasesOf(COOKBOOK_DIR, '0283-missing-image.json');
        const index = 1;

        expect(canvasPaintsImage(canvases[index])).toBe(false);
        expect(yieldsToUnsupported(canvases, index, 'individuals')).toBe(false);
    });

    it('still covers IxIF — vendored/audio.json', () => {
        // Its canvases are IxIF `elements` with no painting annotations at all.
        // It stays paint-nothing, as its baseline prose documents.
        const canvases = getCanvasesForSequence(
            manifestOf(VENDORED_DIR, 'audio.json'),
            0,
        );

        expect(canvases.length).toBeGreaterThan(0);
        for (const [index] of canvases.entries()) {
            expect(canvasPaintsImage(canvases[index])).toBe(false);
            expect(yieldsToUnsupported(canvases, index, 'individuals')).toBe(
                false,
            );
        }
    });
});
