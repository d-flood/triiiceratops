import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../logging/logger';
import { syntheticV3SplitAnnotationPages } from '../test/fixtures/syntheticManifests';
import {
    getCanvasesForSequence,
    getChoiceAlternatives,
    getPaintingAnnotations,
    getPaintingBody,
    getSequenceCount,
    isChoiceBody,
} from './iiifParsing';

/**
 * The parsing surface, entered the way a consumer's manifest reaches the viewer
 * — raw manifest JSON in, canvases and painting annotations out — so that both
 * the IIIF v2 and the IIIF v3 spelling of every branch is exercised.
 *
 * Canvases here are the raw Canvas JSON the manifest authored, obtained from
 * `getCanvasesForSequence` exactly as the manifest cache obtains them. Every
 * assertion therefore reads the manifest's own property spelling — `id` in v3,
 * `@id` in v2.
 */

const V2_CANVAS = 'http://example.org/v2/canvas/1';
const V3_CANVAS = 'http://example.org/v3/canvas/1';

function canvasesOf(manifestJson: unknown): any[] {
    return getCanvasesForSequence(manifestJson, 0);
}

function firstCanvasOf(manifestJson: unknown): any {
    return canvasesOf(manifestJson)[0];
}

function manifestV2(canvas: Record<string, unknown>) {
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': 'http://example.org/v2/manifest',
        '@type': 'sc:Manifest',
        label: 'Test Manifest v2',
        sequences: [
            {
                '@id': 'http://example.org/v2/sequence/normal',
                '@type': 'sc:Sequence',
                canvases: [canvas],
            },
        ],
    };
}

function manifestV3(canvas: Record<string, unknown>) {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: 'http://example.org/v3/manifest',
        type: 'Manifest',
        label: { en: ['Test Manifest v3'] },
        items: [canvas],
    };
}

const V2_SEQ = 'http://example.org/v2/sequence';

/** A v2 manifest carrying whatever sequence declaration is handed in. */
function manifestV2Sequences(root: Record<string, unknown>) {
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': 'http://example.org/v2/manifest',
        '@type': 'sc:Manifest',
        label: 'Test Manifest v2',
        ...root,
    };
}

function v2CanvasRef(n: number) {
    return { '@id': `${V2_CANVAS}/${n}`, '@type': 'sc:Canvas' };
}

const ids = (canvases: any[]) =>
    canvases.map((canvas) => canvas.id ?? canvas['@id']);

describe('getSequenceCount / getCanvasesForSequence', () => {
    it("reads a IIIF v2 manifest's sequences and their canvases", () => {
        const manifest = manifestV2Sequences({
            sequences: [
                {
                    '@id': `${V2_SEQ}/1`,
                    '@type': 'sc:Sequence',
                    canvases: [v2CanvasRef(1), v2CanvasRef(2)],
                },
                {
                    '@id': `${V2_SEQ}/2`,
                    '@type': 'sc:Sequence',
                    canvases: [v2CanvasRef(3)],
                },
            ],
        });

        // Multi-sequence v2 is user-visible: the toolbar shows a sequence
        // picker whenever this count exceeds one.
        expect(getSequenceCount(manifest)).toBe(2);
        expect(ids(getCanvasesForSequence(manifest, 0))).toEqual([
            `${V2_CANVAS}/1`,
            `${V2_CANVAS}/2`,
        ]);
        expect(ids(getCanvasesForSequence(manifest, 1))).toEqual([
            `${V2_CANVAS}/3`,
        ]);
    });

    it('gives a IIIF v3 manifest exactly one sequence, from items', () => {
        const manifest = manifestV3({ id: V3_CANVAS, type: 'Canvas' });

        expect(getSequenceCount(manifest)).toBe(1);
        expect(ids(getCanvasesForSequence(manifest, 0))).toEqual([V3_CANVAS]);
    });

    it('prefers IxIF mediaSequences OVER sequences, not as a fallback', () => {
        // `vendored/audio.json` carries both, so the order is load-bearing:
        // reversing it enumerates that manifest's `sequences` instead of its
        // `elements`.
        const manifest = manifestV2Sequences({
            mediaSequences: [
                { '@type': 'ixif:MediaSequence', elements: [v2CanvasRef(1)] },
            ],
            sequences: [{ '@type': 'sc:Sequence', canvases: [v2CanvasRef(9)] }],
        });

        expect(getSequenceCount(manifest)).toBe(1);
        expect(ids(getCanvasesForSequence(manifest, 0))).toEqual([
            `${V2_CANVAS}/1`,
        ]);
    });

    it('accepts elements as an alias for canvases', () => {
        const manifest = manifestV2Sequences({
            sequences: [{ '@type': 'sc:Sequence', elements: [v2CanvasRef(1)] }],
        });

        expect(ids(getCanvasesForSequence(manifest, 0))).toEqual([
            `${V2_CANVAS}/1`,
        ]);
    });

    it('enumerates a sequences that is a bare object rather than an array', () => {
        const manifest = manifestV2Sequences({
            sequences: {
                '@id': `${V2_SEQ}/1`,
                '@type': 'sc:Sequence',
                canvases: [v2CanvasRef(1), v2CanvasRef(2)],
            },
        });

        expect(getSequenceCount(manifest)).toBe(1);
        expect(ids(getCanvasesForSequence(manifest, 0))).toEqual([
            `${V2_CANVAS}/1`,
            `${V2_CANVAS}/2`,
        ]);
    });

    it('enumerates a canvases that is a bare object rather than an array', () => {
        const manifest = manifestV2Sequences({
            sequences: [{ '@type': 'sc:Sequence', canvases: v2CanvasRef(1) }],
        });

        expect(ids(getCanvasesForSequence(manifest, 0))).toEqual([
            `${V2_CANVAS}/1`,
        ]);
    });

    it('clamps an out-of-range sequence index instead of returning empty', () => {
        // Existing behavior, preserved: a viewer holding a stale
        // `selectedSequenceIndex` shows the last sequence, not a blank page.
        const manifest = manifestV2Sequences({
            sequences: [
                { '@type': 'sc:Sequence', canvases: [v2CanvasRef(1)] },
                { '@type': 'sc:Sequence', canvases: [v2CanvasRef(2)] },
            ],
        });

        expect(ids(getCanvasesForSequence(manifest, 7))).toEqual([
            `${V2_CANVAS}/2`,
        ]);
        expect(ids(getCanvasesForSequence(manifest, -3))).toEqual([
            `${V2_CANVAS}/1`,
        ]);
    });

    it('enumerates nothing for a v2 sequence that is a bare reference', () => {
        // `vendored/illustrationsofchina.json` has four sequences, three of
        // which are `@id`/`@type`/`label` references to external Sequence
        // documents. They stay unresolved: dereferencing one is an HTTP fetch,
        // and these functions are synchronous and pure over the cached JSON.
        const manifest = manifestV2Sequences({
            sequences: [
                { '@type': 'sc:Sequence', canvases: [v2CanvasRef(1)] },
                {
                    '@id': `${V2_SEQ}/2`,
                    '@type': 'sc:Sequence',
                    label: 'Volume 2',
                },
            ],
        });

        expect(getSequenceCount(manifest)).toBe(2);
        expect(getCanvasesForSequence(manifest, 1)).toEqual([]);
    });

    it('drops a null canvas rather than throwing on it', () => {
        const manifest = manifestV2Sequences({
            sequences: [
                {
                    '@type': 'sc:Sequence',
                    canvases: [v2CanvasRef(1), null, v2CanvasRef(2)],
                },
            ],
        });

        expect(ids(getCanvasesForSequence(manifest, 0))).toEqual([
            `${V2_CANVAS}/1`,
            `${V2_CANVAS}/2`,
        ]);
    });

    it('gives a Collection no sequences at all', () => {
        // A Collection has members, not canvases. A v3 Collection's `items`
        // are its member Manifests, so enumerating them as canvases would be
        // wrong too.
        for (const collection of [
            { type: 'Collection', items: [{ id: 'a', type: 'Manifest' }] },
            { '@type': 'sc:Collection', manifests: [{ '@id': 'a' }] },
        ]) {
            expect(getSequenceCount(collection)).toBe(0);
            expect(getCanvasesForSequence(collection, 0)).toEqual([]);
        }
    });

    it('is total for anything that is not a manifest', () => {
        for (const value of [null, undefined, '', 'a string', 42, {}, []]) {
            expect(getSequenceCount(value)).toBe(0);
            expect(getCanvasesForSequence(value, 0)).toEqual([]);
        }
    });
});

describe('getPaintingAnnotations', () => {
    it('returns the images of a IIIF v2 canvas', () => {
        const canvas = firstCanvasOf(
            manifestV2({
                '@id': V2_CANVAS,
                '@type': 'sc:Canvas',
                label: 'Page 1',
                height: 1000,
                width: 800,
                images: [
                    {
                        '@id': `${V2_CANVAS}/annotation/1`,
                        '@type': 'oa:Annotation',
                        motivation: 'sc:painting',
                        resource: {
                            '@id': `${V2_CANVAS}/image/1`,
                            '@type': 'dctypes:Image',
                        },
                        on: V2_CANVAS,
                    },
                    {
                        '@id': `${V2_CANVAS}/annotation/2`,
                        '@type': 'oa:Annotation',
                        motivation: 'sc:painting',
                        resource: {
                            '@id': `${V2_CANVAS}/image/2`,
                            '@type': 'dctypes:Image',
                        },
                        on: V2_CANVAS,
                    },
                ],
            }),
        );

        const annotations = getPaintingAnnotations(canvas);

        expect(annotations.map((annotation) => annotation['@id'])).toEqual([
            `${V2_CANVAS}/annotation/1`,
            `${V2_CANVAS}/annotation/2`,
        ]);
        // Raw JSON: the v2 branch reads `canvas.images[]`, and the image
        // lives under `resource`, which is the spelling every consumer must
        // read.
        expect(annotations[0].getResource).toBeUndefined();
        expect(annotations.map((a) => a.resource['@id'])).toEqual([
            `${V2_CANVAS}/image/1`,
            `${V2_CANVAS}/image/2`,
        ]);
    });

    it('reads a v2 canvas whose images is a bare object rather than an array', () => {
        // Invalid per the spec and present in the wild — the same shape the
        // corpus already carries for `sequences`.
        const annotations = getPaintingAnnotations({
            '@id': V2_CANVAS,
            '@type': 'sc:Canvas',
            images: {
                '@id': `${V2_CANVAS}/annotation/1`,
                '@type': 'oa:Annotation',
                resource: { '@id': `${V2_CANVAS}/image/1` },
            },
        });

        expect(Array.isArray(annotations)).toBe(true);
        expect(annotations.map((a) => a['@id'])).toEqual([
            `${V2_CANVAS}/annotation/1`,
        ]);
    });

    it('skips null entries in a v2 images array rather than throwing', () => {
        const annotations = getPaintingAnnotations({
            '@id': V2_CANVAS,
            images: [
                null,
                {
                    '@id': `${V2_CANVAS}/annotation/2`,
                    resource: { '@id': `${V2_CANVAS}/image/2` },
                },
            ],
        });

        expect(annotations.map((a) => a['@id'])).toEqual([
            `${V2_CANVAS}/annotation/2`,
        ]);
    });

    it('returns every image of a v2 composite canvas', () => {
        // A page assembled from several images. All of them must come back —
        // truncating to the first would be silent data loss.
        const canvas = firstCanvasOf(
            manifestV2({
                '@id': V2_CANVAS,
                '@type': 'sc:Canvas',
                height: 1000,
                width: 1600,
                images: [
                    {
                        '@id': `${V2_CANVAS}/annotation/left`,
                        '@type': 'oa:Annotation',
                        motivation: 'sc:painting',
                        on: `${V2_CANVAS}#xywh=0,0,800,1000`,
                        resource: { '@id': `${V2_CANVAS}/image/left` },
                    },
                    {
                        '@id': `${V2_CANVAS}/annotation/right`,
                        '@type': 'oa:Annotation',
                        motivation: 'sc:painting',
                        on: `${V2_CANVAS}#xywh=800,0,800,1000`,
                        resource: { '@id': `${V2_CANVAS}/image/right` },
                    },
                ],
            }),
        );

        expect(getPaintingAnnotations(canvas).map((a) => a['@id'])).toEqual([
            `${V2_CANVAS}/annotation/left`,
            `${V2_CANVAS}/annotation/right`,
        ]);
    });

    it('returns the painting annotations of a IIIF v3 canvas', () => {
        const canvas = firstCanvasOf(
            manifestV3({
                id: V3_CANVAS,
                type: 'Canvas',
                label: { en: ['Page 1'] },
                height: 1000,
                width: 800,
                items: [
                    {
                        id: `${V3_CANVAS}/page/1`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${V3_CANVAS}/annotation/1`,
                                type: 'Annotation',
                                motivation: 'painting',
                                body: {
                                    id: `${V3_CANVAS}/image/1`,
                                    type: 'Image',
                                },
                                target: V3_CANVAS,
                            },
                            {
                                id: `${V3_CANVAS}/annotation/2`,
                                type: 'Annotation',
                                motivation: 'painting',
                                body: {
                                    id: `${V3_CANVAS}/image/2`,
                                    type: 'Image',
                                },
                                target: V3_CANVAS,
                            },
                        ],
                    },
                ],
            }),
        );

        const annotations = getPaintingAnnotations(canvas);

        expect(annotations.map((annotation) => annotation.id)).toEqual([
            `${V3_CANVAS}/annotation/1`,
            `${V3_CANVAS}/annotation/2`,
        ]);
        expect(annotations.map((annotation) => annotation.body.id)).toEqual([
            `${V3_CANVAS}/image/1`,
            `${V3_CANVAS}/image/2`,
        ]);
    });

    it('returns the annotations of EVERY annotation page, in document order', () => {
        const [split, control, contentAlias] = canvasesOf(
            syntheticV3SplitAnnotationPages,
        );

        expect(getPaintingAnnotations(split).map((a) => a.id)).toEqual([
            'http://example.org/synthetic/v3-split-annotation-pages/canvas/1/annotation/left',
            'http://example.org/synthetic/v3-split-annotation-pages/canvas/1/annotation/right',
        ]);

        expect(getPaintingAnnotations(control).map((a) => a.id)).toEqual([
            'http://example.org/synthetic/v3-split-annotation-pages/canvas/2/annotation',
        ]);

        // `content` was the IIIF 3.0-beta spelling of `items`; it is still
        // accepted, and it reads every page too.
        expect(getPaintingAnnotations(contentAlias).map((a) => a.id)).toEqual([
            'http://example.org/synthetic/v3-split-annotation-pages/canvas/3/annotation/left',
            'http://example.org/synthetic/v3-split-annotation-pages/canvas/3/annotation/right',
        ]);
    });

    it('reads a v3 canvas whose items is a bare object rather than an array', () => {
        // Invalid per the spec and present in the wild; array accesses are
        // guarded so the annotation is found rather than silently lost.
        const canvas = firstCanvasOf(
            manifestV3({
                id: V3_CANVAS,
                type: 'Canvas',
                label: { en: ['Page 1'] },
                height: 1000,
                width: 800,
                items: {
                    id: `${V3_CANVAS}/page/1`,
                    type: 'AnnotationPage',
                    items: {
                        id: `${V3_CANVAS}/annotation/1`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: { id: `${V3_CANVAS}/image/1`, type: 'Image' },
                        target: V3_CANVAS,
                    },
                },
            }),
        );

        const annotations = getPaintingAnnotations(canvas);

        expect(Array.isArray(annotations)).toBe(true);
        expect(annotations.map((annotation) => annotation.id)).toEqual([
            `${V3_CANVAS}/annotation/1`,
        ]);
    });

    it('does not filter by motivation', () => {
        // In v3 non-painting content belongs in `canvas.annotations`, so a
        // filter would only defend against already-malformed manifests while
        // newly dropping annotations that simply omit `motivation`.
        const canvas = firstCanvasOf(
            manifestV3({
                id: V3_CANVAS,
                type: 'Canvas',
                label: { en: ['Page 1'] },
                height: 1000,
                width: 800,
                items: [
                    {
                        id: `${V3_CANVAS}/page/1`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${V3_CANVAS}/annotation/no-motivation`,
                                type: 'Annotation',
                                body: {
                                    id: `${V3_CANVAS}/image/1`,
                                    type: 'Image',
                                },
                                target: V3_CANVAS,
                            },
                        ],
                    },
                ],
            }),
        );

        expect(getPaintingAnnotations(canvas).map((a) => a.id)).toEqual([
            `${V3_CANVAS}/annotation/no-motivation`,
        ]);
    });

    it('returns an empty array for a canvas with neither images nor content', () => {
        const canvas = firstCanvasOf(
            manifestV3({
                id: V3_CANVAS,
                type: 'Canvas',
                label: { en: ['Page 1'] },
                height: 1000,
                width: 800,
            }),
        );

        expect(getPaintingAnnotations(canvas)).toEqual([]);
        expect(getPaintingAnnotations({})).toEqual([]);
        expect(getPaintingAnnotations(null)).toEqual([]);
        expect(getPaintingAnnotations(undefined)).toEqual([]);
    });
});

describe('getPaintingBody', () => {
    it('reads the v3 body spelling and the v2 resource spelling', () => {
        expect(getPaintingBody({ body: { id: 'v3-image' } })).toEqual({
            id: 'v3-image',
        });
        expect(getPaintingBody({ resource: { '@id': 'v2-image' } })).toEqual({
            '@id': 'v2-image',
        });
    });

    it('returns null when the annotation carries neither spelling', () => {
        expect(getPaintingBody({})).toBeNull();
        expect(getPaintingBody(null)).toBeNull();
        expect(getPaintingBody(undefined)).toBeNull();
    });
});

describe('isChoiceBody', () => {
    it('recognizes both the v3 and the v2 spelling', () => {
        expect(isChoiceBody({ type: 'Choice' })).toBe(true);
        expect(isChoiceBody({ type: 'oa:Choice' })).toBe(true);
        expect(isChoiceBody({ '@type': 'oa:Choice' })).toBe(true);
    });

    it('is false for a plain image body, an array, and nothing at all', () => {
        expect(isChoiceBody({ type: 'Image' })).toBe(false);
        expect(isChoiceBody([{ type: 'Choice' }])).toBe(false);
        expect(isChoiceBody(null)).toBe(false);
    });
});

describe('getChoiceAlternatives', () => {
    it('returns the v3 items, in document order', () => {
        expect(
            getChoiceAlternatives({
                type: 'Choice',
                items: [{ id: 'a' }, { id: 'b' }],
            }),
        ).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    it('accepts the singular item alias', () => {
        expect(
            getChoiceAlternatives({ type: 'Choice', item: [{ id: 'a' }] }),
        ).toEqual([{ id: 'a' }]);
    });

    it('puts the v2 default first, then the items', () => {
        // IIIF v2 splits a Choice's alternatives across `default` (the one to
        // render initially) and `item` (the rest). Offering only `item` would
        // hide the image the publisher chose as the default.
        expect(
            getChoiceAlternatives({
                '@type': 'oa:Choice',
                default: { '@id': 'natural' },
                item: [{ '@id': 'x-ray' }, { '@id': 'uv' }],
            }),
        ).toEqual([{ '@id': 'natural' }, { '@id': 'x-ray' }, { '@id': 'uv' }]);
    });

    it('returns an array when items is a bare object rather than an array', () => {
        // Unguarded, `items.find(...)` on a bare object throws all the way out
        // through `getViewerTileSources`, which has no try/catch on its path.
        expect(
            getChoiceAlternatives({ type: 'Choice', items: { id: 'only' } }),
        ).toEqual([{ id: 'only' }]);
    });

    it('returns an empty array for anything that is not a Choice', () => {
        expect(getChoiceAlternatives({ id: 'image' })).toEqual([]);
        expect(getChoiceAlternatives(null)).toEqual([]);
    });
});

describe('the unreadable-canvas warning', () => {
    // A canvas that is recognized but cannot be read emits a developer
    // warning rather than failing silently; without it, enumeration
    // returning nothing renders a blank canvas and logs at debug level only.

    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('warns when a canvas declaring items yields nothing', () => {
        getPaintingAnnotations({
            id: 'http://example.org/canvas/blank',
            type: 'Canvas',
            items: [{ type: 'AnnotationPage', items: [] }],
        });

        expect(warn).toHaveBeenCalledOnce();
        const message = String(warn.mock.calls[0][0]);
        // The id is what makes the warning actionable -- a warning that does
        // not say WHICH canvas sends the reader back to the manifest.
        expect(message).toContain('http://example.org/canvas/blank');
        expect(message).toContain('`items`');
    });

    it('warns at most once per canvas', () => {
        // Capped per manifest, not per canvas render. `getPaintingAnnotations`
        // is called from the tile source path, the thumbnail path and the
        // choice path, so an uncapped warning fires several times for a single
        // blank canvas and dozens of times for a long book.
        const canvas = { id: 'http://example.org/canvas/1', items: [] };

        getPaintingAnnotations(canvas);
        getPaintingAnnotations(canvas);
        getPaintingAnnotations(canvas);

        expect(warn).toHaveBeenCalledOnce();
    });

    it('does not warn for a canvas that enumerates', () => {
        getPaintingAnnotations({
            id: 'http://example.org/canvas/1',
            items: [
                {
                    type: 'AnnotationPage',
                    items: [{ id: 'anno', body: { id: 'image' } }],
                },
            ],
        });

        expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn for a v2 canvas that enumerates', () => {
        // The v2 branch returns before the warning is reachable. A regression
        // that made `images[]` unreadable would both blank the canvas AND
        // start warning, which is the pairing this asserts.
        getPaintingAnnotations({
            '@id': 'http://example.org/v2/canvas/1',
            images: [{ '@id': 'anno', resource: { '@id': 'image' } }],
        });

        expect(warn).not.toHaveBeenCalled();
    });

    it('is total on a canvas that is not an object', () => {
        expect(() => getPaintingAnnotations('nonsense' as any)).not.toThrow();
        expect(warn).not.toHaveBeenCalled();
    });
});
