// @vitest-environment node
/**
 * Companion canvases through the ordinary descriptor builder.
 *
 * The vendored AV fixtures are the three shapes the corpus actually has —
 * `0014` adopts its companion's rect, `0013` matches it, and the Avalon MP3
 * keeps a 1280×40 rect against a 1280×720 companion — and the hand-built
 * canvases beside them cover the shapes the Cookbook does not exercise but
 * music and oral-history collections do.
 *
 * Node environment, like `unsupportedPresentation.test.ts` and for its reason:
 * this whole import graph must load with no DOM globals.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    toPlannerCanvas,
    unsupportedPresentationIds,
} from './canvasDescriptors';
import {
    resolveCompanionCanvases,
    withCompanion,
    type CompanionCanvases,
} from './companionCanvases';
import type { PlannerCanvas } from './types';

const AV_DIR = join(import.meta.dirname, '../test/fixtures/manifests/av');

function firstCanvasOf(file: string): Record<string, unknown> {
    const manifest = JSON.parse(readFileSync(join(AV_DIR, file), 'utf8'));
    return manifest.items[0];
}

/** The claimed canvas's own descriptor, which is what resolution starts from. */
function baseOf(canvas: unknown): PlannerCanvas {
    const base = toPlannerCanvas(canvas);
    if (!base) throw new Error('fixture canvas produced no descriptor');
    return base;
}

function companionsOf(canvas: unknown): CompanionCanvases {
    const resolved = resolveCompanionCanvases(canvas, baseOf(canvas));
    if (!resolved) throw new Error('canvas resolved no companions');
    return resolved;
}

/** An imageless claimed canvas carrying whatever companions are handed in. */
function claimedCanvas(
    companions: Record<string, unknown>,
    canvas: Record<string, unknown> = {},
) {
    return {
        id: 'https://example.test/canvas/1',
        type: 'Canvas',
        duration: 120,
        items: [
            {
                id: 'https://example.test/page/1',
                type: 'AnnotationPage',
                items: [
                    {
                        id: 'https://example.test/anno/1',
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: 'https://example.test/audio.mp3',
                            type: 'Sound',
                            format: 'audio/mp3',
                            duration: 120,
                        },
                        target: 'https://example.test/canvas/1',
                    },
                ],
            },
        ],
        ...companions,
        ...canvas,
    };
}

/** A companion Canvas painting the bodies handed in, at the given size. */
function companionCanvas(
    id: string,
    size: { width: number; height: number } | null,
    bodies: unknown[],
) {
    return {
        id,
        type: 'Canvas',
        ...(size ?? {}),
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: bodies.map((body, index) => ({
                    id: `${id}/anno/${index}`,
                    type: 'Annotation',
                    motivation: 'painting',
                    body,
                    target: id,
                })),
            },
        ],
    };
}

const PLAIN_IMAGE = {
    id: 'https://example.test/poster.jpg',
    type: 'Image',
    format: 'image/jpeg',
    width: 800,
    height: 600,
};

describe('a duration-only canvas with an accompanying canvas (0014)', () => {
    const canvas = firstCanvasOf('0014-accompanyingcanvas.json');
    const COMPANION_ID =
        'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/canvas/accompanying';

    it('adopts the companion rect and paints the companion through the image service', () => {
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'accompanying',
        );

        expect(painted.width).toBe(772);
        expect(painted.height).toBe(998);
        expect(painted.images).toEqual([
            {
                key: `${COMPANION_ID}#0`,
                source: {
                    kind: 'service',
                    serviceId:
                        'https://iiif.io/api/image/3.0/example/reference/4b45bba3ea612ee46f5371ce84dbcd89-mahler-0',
                    profile: 'level1',
                },
                x: 0,
                y: 0,
                width: 1,
                height: 998 / 772,
            },
        ]);
    });

    it('keys the companion image off the companion canvas, not the claimed one', () => {
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'accompanying',
        );

        expect(painted.id).toBe(
            'https://iiif.io/api/cookbook/recipe/0014-accompanyingcanvas/canvas/p1',
        );
        expect(painted.images[0].key.startsWith(COMPANION_ID)).toBe(true);
        expect(painted.images[0].key).not.toContain('/canvas/p1');
    });

    it('is today’s descriptor exactly while its claimant has set no phase', () => {
        // The claim on its own changes nothing about what core renders
        // (user story 27), which is what the renderer's pass-through of an
        // absent phase is; here that is the untouched base descriptor.
        const base = baseOf(canvas);

        expect(base.width).toBeNull();
        expect(base.height).toBeNull();
        expect(base.images).toEqual([]);
    });

    it('keeps the unsupported presentation while unclaimed', () => {
        const base = baseOf(canvas);

        expect(unsupportedPresentationIds([base])).toEqual(new Set([base.id]));
        expect(unsupportedPresentationIds([base], () => true)).toEqual(
            new Set(),
        );
    });

    it('paints nothing under an explicit phase of none, and keeps the rect', () => {
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'none',
        );

        expect(painted.images).toEqual([]);
        // Geometry is decided once and never by the phase: a claimant whose
        // canvas has only a placeholder moves to `none` on first play, and a
        // rect that reverted there would reflow the page at exactly that
        // moment (user story 10).
        expect(painted.width).toBe(772);
        expect(painted.height).toBe(998);
    });

    it('paints nothing under a phase naming a property it does not have', () => {
        const companions = companionsOf(canvas);

        expect(companions.placeholder).toBeNull();
        expect(
            withCompanion(baseOf(canvas), companions, 'placeholder').images,
        ).toEqual([]);
        // Silently: a canvas with one companion and not the other is normal,
        // not a degradation.
        expect(companions.warnings).toEqual([]);
    });
});

describe('a canvas that declares its own dimensions', () => {
    it('keeps them and fits the companion within, aspect preserved (avalon mp3)', () => {
        const canvas = firstCanvasOf(
            'avalon-9g54xh933-skip-transcoding-mp3.json',
        );
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'placeholder',
        );

        expect(painted.width).toBe(1280);
        expect(painted.height).toBe(40);
        expect(painted.images).toHaveLength(1);

        const [image] = painted.images;
        // Placements are normalized by the canvas's own width on both axes, so
        // the claimed canvas's rect is 1 wide and 40/1280 tall.
        expect(image.height / image.width).toBeCloseTo(720 / 1280, 12);
        expect(image.width).toBeCloseTo(40 / 1280 / (720 / 1280), 12);
        expect(image.height).toBeCloseTo(40 / 1280, 12);
        // Centred horizontally, and exactly filling the rect's height.
        expect(image.x).toBeCloseTo((1 - image.width) / 2, 12);
        expect(image.y).toBeCloseTo(0, 12);
    });

    it('transfers a matching companion verbatim (0013)', () => {
        const canvas = firstCanvasOf('0013-placeholderCanvas.json');
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'placeholder',
        );

        expect(painted.width).toBe(640);
        expect(painted.height).toBe(360);
        expect(painted.images).toEqual([
            {
                key: 'https://iiif.io/api/cookbook/recipe/0013-placeholderCanvas/canvas/donizetti/placeholder#0',
                source: {
                    kind: 'static',
                    url: 'https://fixtures.iiif.io/video/indiana/donizetti-elixir/act1-thumbnail.png',
                },
                x: 0,
                y: 0,
                width: 1,
                height: 360 / 640,
            },
        ]);
    });
});

describe('a companion that declares no dimensions', () => {
    /** The same fixture canvas with its companion's rect taken away. */
    function withUnsizedCompanion(file: string, property: string) {
        const canvas = firstCanvasOf(file);
        const companion = { ...(canvas[property] as Record<string, unknown>) };
        delete companion.width;
        delete companion.height;
        return { ...canvas, [property]: companion };
    }

    /**
     * Not "unknown": `toPlannerCanvas` normalizes an unsized canvas's
     * placements against a square fallback, so the companion's effective aspect
     * is 1:1 and painting it verbatim would spill it out of the rect — 1.78×
     * over a 640×360 canvas and 32× over a 1280×40 one.
     */
    it('is fitted as a square into a 640×360 rect (0013)', () => {
        const canvas = withUnsizedCompanion(
            '0013-placeholderCanvas.json',
            'placeholderCanvas',
        );
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'placeholder',
        );

        expect(painted.width).toBe(640);
        expect(painted.height).toBe(360);

        const [image] = painted.images;
        expect(image.width).toBeCloseTo(360 / 640, 12);
        expect(image.height).toBeCloseTo(360 / 640, 12);
        expect(image.x).toBeCloseTo((1 - 360 / 640) / 2, 12);
        expect(image.y).toBeCloseTo(0, 12);
    });

    it('is fitted as a square into a 1280×40 rect (avalon mp3)', () => {
        const canvas = withUnsizedCompanion(
            'avalon-9g54xh933-skip-transcoding-mp3.json',
            'placeholderCanvas',
        );
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'placeholder',
        );

        expect(painted.width).toBe(1280);
        expect(painted.height).toBe(40);

        const [image] = painted.images;
        expect(image.width).toBeCloseTo(40 / 1280, 12);
        expect(image.height).toBeCloseTo(40 / 1280, 12);
        expect(image.x).toBeCloseTo((1 - 40 / 1280) / 2, 12);
        expect(image.y).toBeCloseTo(0, 12);
    });

    it('donates no dimensions to a canvas that declares none either', () => {
        const canvas = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                null,
                [PLAIN_IMAGE],
            ),
        });
        const companions = companionsOf(canvas);

        expect(companions.width).toBeNull();
        expect(companions.height).toBeNull();
        // Nothing to fit within, so the placements transfer untouched.
        expect(companions.accompanying?.[0].width).toBe(1);
        expect(companions.warnings).toEqual([]);
    });
});

describe('geometry', () => {
    const canvas = claimedCanvas({
        placeholderCanvas: companionCanvas(
            'https://example.test/placeholder',
            { width: 640, height: 360 },
            [PLAIN_IMAGE],
        ),
        accompanyingCanvas: companionCanvas(
            'https://example.test/accompanying',
            { width: 772, height: 998 },
            [PLAIN_IMAGE],
        ),
    });

    it('is identical under both painting phases', () => {
        const companions = companionsOf(canvas);
        const base = baseOf(canvas);
        const placeholder = withCompanion(base, companions, 'placeholder');
        const accompanying = withCompanion(base, companions, 'accompanying');

        expect(placeholder.width).toBe(accompanying.width);
        expect(placeholder.height).toBe(accompanying.height);
    });

    it('prefers the accompanying canvas, the permanent companion', () => {
        expect(companionsOf(canvas).width).toBe(772);
        expect(companionsOf(canvas).height).toBe(998);
    });

    it('fits the other companion into that rect rather than stretching it', () => {
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'placeholder',
        );
        const [image] = painted.images;

        // 640×360 into a 772×998 rect: full width, centred vertically.
        expect(image.width).toBeCloseTo(1, 12);
        expect(image.x).toBeCloseTo(0, 12);
        expect(image.height / image.width).toBeCloseTo(360 / 640, 12);
        expect(image.y).toBeCloseTo((998 / 772 - 360 / 640) / 2, 12);
    });

    it('comes only from a companion that resolved to something requestable', () => {
        const unresolvable = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 772, height: 998 },
                [
                    {
                        type: 'Video',
                        format: 'video/mp4',
                        id: 'https://example.test/clip.mp4',
                    },
                ],
            ),
        });
        const companions = companionsOf(unresolvable);

        // `null`/`null` is the planner's signal to place the canvas from the
        // median of its siblings: a companion the reader never sees must not
        // reflow the manifest around itself.
        expect(companions.width).toBeNull();
        expect(companions.height).toBeNull();
    });

    it('falls through to the other companion when the preferred one is broken', () => {
        const canvas = claimedCanvas({
            placeholderCanvas: companionCanvas(
                'https://example.test/placeholder',
                { width: 640, height: 360 },
                [PLAIN_IMAGE],
            ),
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 772, height: 998 },
                [
                    {
                        type: 'Video',
                        format: 'video/mp4',
                        id: 'https://example.test/clip.mp4',
                    },
                ],
            ),
        });
        const companions = companionsOf(canvas);

        expect(companions.width).toBe(640);
        expect(companions.height).toBe(360);
        expect(companions.accompanying).toBeNull();
        expect(companions.placeholder?.[0].width).toBe(1);
    });

    it("takes the canvas's own dimensions over either companion's", () => {
        const sized = claimedCanvas(
            {
                accompanyingCanvas: companionCanvas(
                    'https://example.test/accompanying',
                    { width: 772, height: 998 },
                    [PLAIN_IMAGE],
                ),
            },
            { width: 1280, height: 720 },
        );

        expect(companionsOf(sized).width).toBe(1280);
        expect(companionsOf(sized).height).toBe(720);
    });
});

describe('a phase change', () => {
    it('does not rebuild the companion descriptors', () => {
        let reads = 0;
        const canvas = claimedCanvas({});
        Object.defineProperty(canvas, 'accompanyingCanvas', {
            enumerable: true,
            get() {
                reads += 1;
                return companionCanvas(
                    'https://example.test/accompanying',
                    { width: 772, height: 998 },
                    [PLAIN_IMAGE],
                );
            },
        });

        const base = baseOf(canvas);
        const readsAfterBase = reads;
        const companions = companionsOf(canvas);
        const readsAfterResolution = reads;

        withCompanion(base, companions, 'accompanying');
        withCompanion(base, companions, 'none');
        withCompanion(base, companions, 'accompanying');

        expect(reads).toBe(readsAfterResolution);
        // And resolution itself reads the property a bounded number of times,
        // rather than once per painting phase.
        expect(readsAfterResolution - readsAfterBase).toBeLessThanOrEqual(2);
    });

    it('selects between images already in hand', () => {
        const canvas = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 772, height: 998 },
                [PLAIN_IMAGE],
            ),
        });
        const companions = companionsOf(canvas);
        const base = baseOf(canvas);

        expect(withCompanion(base, companions, 'accompanying').images).toBe(
            withCompanion(base, companions, 'accompanying').images,
        );
    });
});

describe('a composed companion', () => {
    it('contributes every one of its images, in annotation order', () => {
        const canvas = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 1000, height: 1000 },
                [
                    PLAIN_IMAGE,
                    {
                        ...PLAIN_IMAGE,
                        id: 'https://example.test/miniature.jpg',
                    },
                ],
            ),
        });
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'accompanying',
        );

        expect(painted.images.map((image) => image.source)).toEqual([
            { kind: 'static', url: 'https://example.test/poster.jpg' },
            { kind: 'static', url: 'https://example.test/miniature.jpg' },
        ]);
    });

    it('preserves a region-targeted placement', () => {
        const id = 'https://example.test/accompanying';
        const companion = companionCanvas(id, { width: 1000, height: 1000 }, [
            PLAIN_IMAGE,
        ]);
        companion.items[0].items[0].target = `${id}#xywh=100,200,400,300`;

        const canvas = claimedCanvas({ accompanyingCanvas: companion });
        const painted = withCompanion(
            baseOf(canvas),
            companionsOf(canvas),
            'accompanying',
        );

        expect(painted.images[0].x).toBeCloseTo(0.1, 12);
        expect(painted.images[0].y).toBeCloseTo(0.2, 12);
        expect(painted.images[0].width).toBeCloseTo(0.4, 12);
        expect(painted.images[0].height).toBeCloseTo(0.3, 12);
    });

    it('resolves a Choice through the existing Choice path', () => {
        const id = 'https://example.test/accompanying';
        const canvas = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                id,
                { width: 1000, height: 1000 },
                [
                    {
                        type: 'Choice',
                        items: [
                            {
                                ...PLAIN_IMAGE,
                                id: 'https://example.test/a.jpg',
                            },
                            {
                                ...PLAIN_IMAGE,
                                id: 'https://example.test/b.jpg',
                            },
                        ],
                    },
                ],
            ),
        });
        const base = baseOf(canvas);

        const first = resolveCompanionCanvases(canvas, base);
        expect(first?.accompanying?.[0].source).toEqual({
            kind: 'static',
            url: 'https://example.test/a.jpg',
        });

        const selected = resolveCompanionCanvases(canvas, base, (canvasId) =>
            canvasId === id ? 'https://example.test/b.jpg' : undefined,
        );
        expect(selected?.accompanying?.[0].source).toEqual({
            kind: 'static',
            url: 'https://example.test/b.jpg',
        });
    });
});

describe('a modest publishing pipeline', () => {
    it('resolves a level0 service companion to something requestable', () => {
        const canvas = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 1000, height: 800 },
                [
                    {
                        ...PLAIN_IMAGE,
                        service: [
                            {
                                id: 'https://example.test/iiif/score',
                                type: 'ImageService3',
                                profile: 'level0',
                            },
                        ],
                    },
                ],
            ),
        });
        const companions = companionsOf(canvas);

        expect(companions.accompanying?.[0].source).toEqual({
            kind: 'service',
            serviceId: 'https://example.test/iiif/score',
            profile: 'level0',
        });
        expect(companions.warnings).toEqual([]);
    });

    it('resolves a plain-URL companion with no service at all', () => {
        const canvas = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 800, height: 600 },
                [PLAIN_IMAGE],
            ),
        });
        const companions = companionsOf(canvas);

        expect(companions.accompanying?.[0].source).toEqual({
            kind: 'static',
            url: 'https://example.test/poster.jpg',
        });
        expect(companions.warnings).toEqual([]);
    });
});

describe('degradation', () => {
    it('skips a claimed canvas that paints images of its own, and warns', () => {
        const canvas = {
            id: 'https://example.test/canvas/1',
            type: 'Canvas',
            width: 1000,
            height: 750,
            duration: 120,
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 772, height: 998 },
                [PLAIN_IMAGE],
            ),
            items: [
                {
                    id: 'https://example.test/page/1',
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: 'https://example.test/anno/1',
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                ...PLAIN_IMAGE,
                                id: 'https://example.test/folio.jpg',
                            },
                            target: 'https://example.test/canvas/1',
                        },
                    ],
                },
            ],
        };
        const base = baseOf(canvas);
        const companions = companionsOf(canvas);

        expect(companions.accompanying).toBeNull();
        expect(companions.placeholder).toBeNull();
        expect(companions.warnings).toEqual([
            'canvas https://example.test/canvas/1 paints images of its own; its companion canvas will not be painted under them',
        ]);
        // Skipped entirely: the canvas's own images and rect survive whatever
        // phase the claimant asks for.
        const painted = withCompanion(base, companions, 'accompanying');
        expect(painted.images).toEqual(base.images);
        expect(painted.width).toBe(1000);
        expect(painted.height).toBe(750);
    });

    it('paints nothing and warns for a companion that resolves to nothing requestable', () => {
        const canvas = claimedCanvas({
            accompanyingCanvas: companionCanvas(
                'https://example.test/accompanying',
                { width: 772, height: 998 },
                [
                    {
                        type: 'Video',
                        format: 'video/mp4',
                        id: 'https://example.test/clip.mp4',
                    },
                ],
            ),
        });
        const companions = companionsOf(canvas);

        expect(companions.accompanying).toBeNull();
        expect(companions.warnings).toEqual([
            'the accompanyingCanvas of canvas https://example.test/canvas/1 resolved to nothing requestable; it will not be painted',
        ]);
        // The claimed canvas keeps the treatment it would otherwise have had:
        // a broken companion costs a picture, not the canvas.
        expect(
            withCompanion(baseOf(canvas), companions, 'accompanying').images,
        ).toEqual([]);
    });

    it('treats a companion that is not an object as absent', () => {
        const canvas = claimedCanvas({
            accompanyingCanvas: 'https://example.test/accompanying',
        });

        expect(resolveCompanionCanvases(canvas, baseOf(canvas))).toBeNull();
    });

    it('treats a companion with no items as absent', () => {
        const canvas = claimedCanvas({
            placeholderCanvas: {
                id: 'https://example.test/placeholder',
                type: 'Canvas',
                width: 640,
                height: 360,
            },
        });

        expect(resolveCompanionCanvases(canvas, baseOf(canvas))).toBeNull();
    });

    it('treats a companion with an empty items array as absent', () => {
        const canvas = claimedCanvas({
            placeholderCanvas: {
                id: 'https://example.test/placeholder',
                type: 'Canvas',
                width: 640,
                height: 360,
                items: [],
            },
        });

        // Absent, not broken: a companion that carries no annotation earns no
        // warning and donates no rect, exactly as one with no `items` key.
        expect(resolveCompanionCanvases(canvas, baseOf(canvas))).toBeNull();
    });

    it('treats a companion whose annotation pages are all empty as absent', () => {
        const canvas = claimedCanvas({
            placeholderCanvas: companionCanvas(
                'https://example.test/placeholder',
                { width: 640, height: 360 },
                [],
            ),
        });

        expect(resolveCompanionCanvases(canvas, baseOf(canvas))).toBeNull();
    });

    it('says nothing at all about a canvas with no companion', () => {
        const canvas = claimedCanvas({});

        expect(resolveCompanionCanvases(canvas, baseOf(canvas))).toBeNull();
    });
});

describe('warming the companion the phase is about to name', () => {
    const both = claimedCanvas({
        placeholderCanvas: companionCanvas(
            'https://example.test/placeholder',
            { width: 640, height: 360 },
            [PLAIN_IMAGE],
        ),
        accompanyingCanvas: companionCanvas(
            'https://example.test/accompanying',
            { width: 772, height: 998 },
            [PLAIN_IMAGE],
        ),
    });

    it('offers the accompanying canvas while the placeholder is painting', () => {
        const companions = companionsOf(both);
        const painted = withCompanion(baseOf(both), companions, 'placeholder');

        // The same placements the `accompanying` phase would paint, so the
        // handover is a selection between two pictures already in hand.
        expect(painted.warmImages).toEqual(companions.accompanying);
        expect(painted.images).toEqual(companions.placeholder);
    });

    it('offers nothing once the accompanying canvas is the picture', () => {
        // The placeholder is spent: nothing ever paints it again, so warming
        // it would buy a request for a picture no phase can name.
        expect(
            withCompanion(baseOf(both), companionsOf(both), 'accompanying')
                .warmImages,
        ).toBeUndefined();
        expect(
            withCompanion(baseOf(both), companionsOf(both), 'none').warmImages,
        ).toBeUndefined();
    });

    it('offers nothing for a canvas carrying one companion', () => {
        const only = claimedCanvas({
            placeholderCanvas: companionCanvas(
                'https://example.test/placeholder',
                { width: 640, height: 360 },
                [PLAIN_IMAGE],
            ),
        });

        expect(
            withCompanion(baseOf(only), companionsOf(only), 'placeholder')
                .warmImages,
        ).toBeUndefined();
    });
});
