/**
 * Synthetic IIIF manifests covering parsing branches that no real manifest in
 * the vendored corpus reaches.
 *
 * Part of the parser corpus (see `.tracker/remove-manifesto/SPEC.md`). The
 * vendored manifests in
 * `./manifests/` are the manifests that broke a real library over a decade;
 * these are the branches we KNOW exist and want hit deliberately, so a
 * regression reads as a named failing case rather than as an absence.
 *
 * Every fixture here is minimal on purpose: one feature per manifest, the
 * smallest canvas that still enumerates. They are NOT a style guide for real
 * manifests — several are deliberately shaped the awkward way real publishers
 * shape them.
 *
 * `./manifests.ts` holds an older, separate set of synthetic fixtures used by
 * targeted unit tests. Those are untouched; this module is additive.
 */

const BASE = 'http://example.org/synthetic';

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** A minimal IIIF Presentation 2 canvas with one painting annotation. */
function v2Canvas(id: string, label: string) {
    return {
        '@id': id,
        '@type': 'sc:Canvas',
        label,
        height: 1000,
        width: 800,
        images: [
            {
                '@id': `${id}/annotation`,
                '@type': 'oa:Annotation',
                motivation: 'sc:painting',
                on: id,
                resource: {
                    '@id': `${id}/image/full/full/0/default.jpg`,
                    '@type': 'dctypes:Image',
                    format: 'image/jpeg',
                    height: 1000,
                    width: 800,
                    service: {
                        '@context': 'http://iiif.io/api/image/2/context.json',
                        '@id': `${id}/image`,
                        profile: 'http://iiif.io/api/image/2/level2.json',
                    },
                },
            },
        ],
    };
}

function v2Sequence(id: string, canvases: unknown[], extra: object = {}) {
    return {
        '@id': id,
        '@type': 'sc:Sequence',
        ...extra,
        canvases,
    };
}

function v2Manifest(id: string, label: string, rest: object) {
    return {
        '@context': 'http://iiif.io/api/presentation/2/context.json',
        '@id': id,
        '@type': 'sc:Manifest',
        label,
        ...rest,
    };
}

// ---------------------------------------------------------------------------
// 1. v2 ranges in all three spellings
// ---------------------------------------------------------------------------

/**
 * IIIF v2 `structures` exercising all three ways a Range names its contents —
 * `canvases`, `members`, and `ranges` — in one manifest.
 *
 * `parseV2Range` (`src/lib/utils/structures.ts`) has a separate branch for each
 * and only the `canvases` branch had a fixture before this. The `ranges` branch
 * is additionally exercised BOTH ways it occurs in the wild: as a string URI
 * resolved against the sibling ranges, and as an embedded Range object.
 */
export const syntheticV2RangesAllSpellings = v2Manifest(
    `${BASE}/v2-ranges-all-spellings/manifest`,
    'v2 ranges — canvases, members, and ranges spellings',
    {
        sequences: [
            v2Sequence(`${BASE}/v2-ranges-all-spellings/sequence/normal`, [
                v2Canvas(`${BASE}/v2-ranges-all-spellings/canvas/1`, 'Page 1'),
                v2Canvas(`${BASE}/v2-ranges-all-spellings/canvas/2`, 'Page 2'),
                v2Canvas(`${BASE}/v2-ranges-all-spellings/canvas/3`, 'Page 3'),
                v2Canvas(`${BASE}/v2-ranges-all-spellings/canvas/4`, 'Page 4'),
            ]),
        ],
        structures: [
            {
                '@id': `${BASE}/v2-ranges-all-spellings/range/top`,
                '@type': 'sc:Range',
                label: 'Table of contents',
                viewingHint: 'top',
                // `ranges` given as string URIs, resolved against the siblings
                // below — the spelling `parseV2Range` looks up in its range map.
                ranges: [
                    `${BASE}/v2-ranges-all-spellings/range/by-canvases`,
                    `${BASE}/v2-ranges-all-spellings/range/by-members`,
                ],
            },
            {
                '@id': `${BASE}/v2-ranges-all-spellings/range/by-canvases`,
                '@type': 'sc:Range',
                label: 'Front matter (canvases spelling)',
                canvases: [`${BASE}/v2-ranges-all-spellings/canvas/1`],
            },
            {
                '@id': `${BASE}/v2-ranges-all-spellings/range/by-members`,
                '@type': 'sc:Range',
                label: 'Body (members spelling)',
                // `members` mixes Canvas and Range entries in one array. The
                // Range entry is a reference resolved against the siblings.
                members: [
                    {
                        '@id': `${BASE}/v2-ranges-all-spellings/canvas/2`,
                        '@type': 'sc:Canvas',
                        label: 'Page 2',
                    },
                    {
                        '@id': `${BASE}/v2-ranges-all-spellings/range/embedded`,
                        '@type': 'sc:Range',
                        label: 'Chapter 1 (member range)',
                    },
                ],
            },
            {
                '@id': `${BASE}/v2-ranges-all-spellings/range/embedded`,
                '@type': 'sc:Range',
                label: 'Chapter 1 (member range)',
                canvases: [`${BASE}/v2-ranges-all-spellings/canvas/3`],
                // `ranges` given as an EMBEDDED Range object rather than a URI.
                ranges: [
                    {
                        '@id': `${BASE}/v2-ranges-all-spellings/range/inline`,
                        '@type': 'sc:Range',
                        label: 'Plate (inline sub-range)',
                        canvases: [`${BASE}/v2-ranges-all-spellings/canvas/4`],
                    },
                ],
            },
        ],
    },
);

// ---------------------------------------------------------------------------
// 2. v2 oa:Choice painting annotation
// ---------------------------------------------------------------------------

/**
 * IIIF v2 `oa:Choice` on a painting annotation: one canvas offering three
 * imaging variants as `default` plus `item`.
 *
 * Choice selection is first-class Triiiceratops API surfaced as an event on
 * every framework wrapper, and the v2 spelling — `oa:Choice` with `default`
 * and `item`, rather than v3's `Choice` with `items` — had no fixture at all.
 * The second canvas is a plain image so a test can tell "this canvas has a
 * Choice" from "this manifest has a Choice".
 */
export const syntheticV2Choice = v2Manifest(
    `${BASE}/v2-choice/manifest`,
    'v2 oa:Choice painting annotation',
    {
        sequences: [
            v2Sequence(`${BASE}/v2-choice/sequence/normal`, [
                {
                    '@id': `${BASE}/v2-choice/canvas/1`,
                    '@type': 'sc:Canvas',
                    label: 'Recto — three imaging variants',
                    height: 1000,
                    width: 800,
                    images: [
                        {
                            '@id': `${BASE}/v2-choice/annotation/1`,
                            '@type': 'oa:Annotation',
                            motivation: 'sc:painting',
                            on: `${BASE}/v2-choice/canvas/1`,
                            resource: {
                                '@type': 'oa:Choice',
                                default: {
                                    '@id': `${BASE}/v2-choice/image/natural.jpg`,
                                    '@type': 'dctypes:Image',
                                    format: 'image/jpeg',
                                    label: 'Natural light',
                                    height: 1000,
                                    width: 800,
                                },
                                item: [
                                    {
                                        '@id': `${BASE}/v2-choice/image/x-ray.jpg`,
                                        '@type': 'dctypes:Image',
                                        format: 'image/jpeg',
                                        label: 'X-ray',
                                        height: 1000,
                                        width: 800,
                                    },
                                    {
                                        '@id': `${BASE}/v2-choice/image/uv.jpg`,
                                        '@type': 'dctypes:Image',
                                        format: 'image/jpeg',
                                        label: 'Ultraviolet',
                                        height: 1000,
                                        width: 800,
                                    },
                                ],
                            },
                        },
                    ],
                },
                v2Canvas(`${BASE}/v2-choice/canvas/2`, 'Verso — single image'),
            ]),
        ],
    },
);

// ---------------------------------------------------------------------------
// 3. v2 viewingHint at manifest AND sequence level (plus viewingDirection)
// ---------------------------------------------------------------------------

/**
 * IIIF v2 declaring `viewingHint` and `viewingDirection` at BOTH the manifest
 * root and the sequence, with the two disagreeing.
 *
 * v2 allows either level and real manifests use both; v3 only has the root. The
 * disagreement is the point: it pins which level wins, so a rewrite that reads
 * only one of them fails here instead of failing on a user's manifest. The
 * sequence values are the more specific ones and are what a v2 reader should
 * prefer.
 */
export const syntheticV2ViewingHints = v2Manifest(
    `${BASE}/v2-viewing-hints/manifest`,
    'v2 viewingHint and viewingDirection at manifest and sequence level',
    {
        viewingHint: 'paged',
        viewingDirection: 'left-to-right',
        sequences: [
            v2Sequence(
                `${BASE}/v2-viewing-hints/sequence/normal`,
                [
                    v2Canvas(`${BASE}/v2-viewing-hints/canvas/1`, 'Leaf 1'),
                    v2Canvas(`${BASE}/v2-viewing-hints/canvas/2`, 'Leaf 2'),
                    v2Canvas(`${BASE}/v2-viewing-hints/canvas/3`, 'Leaf 3'),
                ],
                {
                    viewingHint: 'individuals',
                    viewingDirection: 'right-to-left',
                },
            ),
        ],
    },
);

// ---------------------------------------------------------------------------
// 4. v2 manifest with more than one sequence
// ---------------------------------------------------------------------------

/**
 * IIIF v2 with two fully-embedded sequences over overlapping canvases.
 *
 * Sequence selection is inventoried command state surfaced by a sequence
 * picker, so multi-sequence v2 is user-visible behavior rather than a vestige —
 * and it had no fixture. Note that the vendored `illustrationsofchina.json` is
 * the OTHER real-world shape: four sequences of which only the first embeds its
 * canvases and the rest are bare references. Both shapes need to survive.
 *
 * The second sequence deliberately reorders and drops a canvas, so "which
 * sequence am I in" is answerable from the canvas list alone.
 */
export const syntheticV2MultipleSequences = v2Manifest(
    `${BASE}/v2-multi-sequence/manifest`,
    'v2 manifest with two sequences',
    {
        sequences: [
            v2Sequence(
                `${BASE}/v2-multi-sequence/sequence/normal`,
                [
                    v2Canvas(`${BASE}/v2-multi-sequence/canvas/1`, 'Page 1'),
                    v2Canvas(`${BASE}/v2-multi-sequence/canvas/2`, 'Page 2'),
                    v2Canvas(`${BASE}/v2-multi-sequence/canvas/3`, 'Page 3'),
                ],
                { label: 'Reading order' },
            ),
            v2Sequence(
                `${BASE}/v2-multi-sequence/sequence/alternate`,
                [
                    v2Canvas(`${BASE}/v2-multi-sequence/canvas/3`, 'Page 3'),
                    v2Canvas(`${BASE}/v2-multi-sequence/canvas/1`, 'Page 1'),
                ],
                { label: 'Plates only' },
            ),
        ],
    },
);

// ---------------------------------------------------------------------------
// 5. Level-0 image service
// ---------------------------------------------------------------------------

/**
 * A level-0 image service, in both the v2 and v3 spellings of the profile.
 *
 * Level 0 means the server serves only precomputed derivatives, so the viewer
 * cannot ask for an arbitrary region or size. The fixture exists so that a
 * change to image-service handling has something to fail against; the tile
 * source itself is out of scope here.
 */
export const syntheticV2Level0Service = v2Manifest(
    `${BASE}/v2-level0/manifest`,
    'v2 level-0 image service',
    {
        sequences: [
            v2Sequence(`${BASE}/v2-level0/sequence/normal`, [
                {
                    '@id': `${BASE}/v2-level0/canvas/1`,
                    '@type': 'sc:Canvas',
                    label: 'Level 0, profile as a string',
                    height: 1000,
                    width: 800,
                    images: [
                        {
                            '@id': `${BASE}/v2-level0/annotation/1`,
                            '@type': 'oa:Annotation',
                            motivation: 'sc:painting',
                            on: `${BASE}/v2-level0/canvas/1`,
                            resource: {
                                '@id': `${BASE}/v2-level0/image/1/full/full/0/default.jpg`,
                                '@type': 'dctypes:Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                                service: {
                                    '@context':
                                        'http://iiif.io/api/image/2/context.json',
                                    '@id': `${BASE}/v2-level0/image/1`,
                                    profile:
                                        'http://iiif.io/api/image/2/level0.json',
                                },
                            },
                        },
                    ],
                },
                {
                    '@id': `${BASE}/v2-level0/canvas/2`,
                    '@type': 'sc:Canvas',
                    label: 'Level 0, profile as an array with a sizes block',
                    height: 1000,
                    width: 800,
                    images: [
                        {
                            '@id': `${BASE}/v2-level0/annotation/2`,
                            '@type': 'oa:Annotation',
                            motivation: 'sc:painting',
                            on: `${BASE}/v2-level0/canvas/2`,
                            resource: {
                                '@id': `${BASE}/v2-level0/image/2/full/full/0/default.jpg`,
                                '@type': 'dctypes:Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                                service: {
                                    '@context':
                                        'http://iiif.io/api/image/2/context.json',
                                    '@id': `${BASE}/v2-level0/image/2`,
                                    // Real level-0 services publish the exact
                                    // derivatives they have; a viewer that
                                    // ignores `sizes` requests URLs that 404.
                                    profile: [
                                        'http://iiif.io/api/image/2/level0.json',
                                        { formats: ['jpg'] },
                                    ],
                                    sizes: [
                                        { width: 200, height: 250 },
                                        { width: 800, height: 1000 },
                                    ],
                                },
                            },
                        },
                    ],
                },
            ]),
        ],
    },
);

/** The IIIF v3 spelling of the same thing: `profile: 'level0'` on an ImageService3. */
export const syntheticV3Level0Service = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${BASE}/v3-level0/manifest`,
    type: 'Manifest',
    label: { en: ['v3 level-0 image service'] },
    items: [
        {
            id: `${BASE}/v3-level0/canvas/1`,
            type: 'Canvas',
            height: 1000,
            width: 800,
            items: [
                {
                    id: `${BASE}/v3-level0/canvas/1/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${BASE}/v3-level0/canvas/1/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: `${BASE}/v3-level0/canvas/1`,
                            body: {
                                id: `${BASE}/v3-level0/image/1/full/max/0/default.jpg`,
                                type: 'Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                                service: [
                                    {
                                        id: `${BASE}/v3-level0/image/1`,
                                        type: 'ImageService3',
                                        profile: 'level0',
                                        sizes: [{ width: 800, height: 1000 }],
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// 6. Painting annotations split across two annotation pages
// ---------------------------------------------------------------------------

/**
 * A IIIF v3 canvas whose painting annotations are split across TWO
 * `AnnotationPage`s in its `items`.
 *
 * This is the fixture the fix is verified against: the removed library read
 * only the first annotation page, silently dropping every image after it. The
 * fixture must exist before the fix, so that the fix is demonstrable rather
 * than asserted.
 *
 * Canvas 1 splits two images across two pages. Canvas 2 is the ordinary
 * single-page shape, so a test can show the fix did not change it. Canvas 3
 * uses the pre-release `content` spelling of `items`, which the enumerator
 * accepts as an alias — also split across two pages.
 */
export const syntheticV3SplitAnnotationPages = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${BASE}/v3-split-annotation-pages/manifest`,
    type: 'Manifest',
    label: {
        en: ['v3 painting annotations split across two annotation pages'],
    },
    items: [
        {
            id: `${BASE}/v3-split-annotation-pages/canvas/1`,
            type: 'Canvas',
            label: { en: ['Two annotation pages, one image each'] },
            height: 1000,
            width: 1600,
            items: [
                {
                    id: `${BASE}/v3-split-annotation-pages/canvas/1/page/1`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${BASE}/v3-split-annotation-pages/canvas/1/annotation/left`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: `${BASE}/v3-split-annotation-pages/canvas/1#xywh=0,0,800,1000`,
                            body: {
                                id: `${BASE}/v3-split-annotation-pages/image/left.jpg`,
                                type: 'Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                            },
                        },
                    ],
                },
                {
                    id: `${BASE}/v3-split-annotation-pages/canvas/1/page/2`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${BASE}/v3-split-annotation-pages/canvas/1/annotation/right`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: `${BASE}/v3-split-annotation-pages/canvas/1#xywh=800,0,800,1000`,
                            body: {
                                id: `${BASE}/v3-split-annotation-pages/image/right.jpg`,
                                type: 'Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                            },
                        },
                    ],
                },
            ],
        },
        {
            id: `${BASE}/v3-split-annotation-pages/canvas/2`,
            type: 'Canvas',
            label: { en: ['One annotation page, one image — the control'] },
            height: 1000,
            width: 800,
            items: [
                {
                    id: `${BASE}/v3-split-annotation-pages/canvas/2/page/1`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${BASE}/v3-split-annotation-pages/canvas/2/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: `${BASE}/v3-split-annotation-pages/canvas/2`,
                            body: {
                                id: `${BASE}/v3-split-annotation-pages/image/single.jpg`,
                                type: 'Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                            },
                        },
                    ],
                },
            ],
        },
        {
            id: `${BASE}/v3-split-annotation-pages/canvas/3`,
            type: 'Canvas',
            label: { en: ['Two annotation pages under the `content` alias'] },
            height: 1000,
            width: 1600,
            content: [
                {
                    id: `${BASE}/v3-split-annotation-pages/canvas/3/page/1`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${BASE}/v3-split-annotation-pages/canvas/3/annotation/left`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: `${BASE}/v3-split-annotation-pages/canvas/3#xywh=0,0,800,1000`,
                            body: {
                                id: `${BASE}/v3-split-annotation-pages/image/content-left.jpg`,
                                type: 'Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                            },
                        },
                    ],
                },
                {
                    id: `${BASE}/v3-split-annotation-pages/canvas/3/page/2`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${BASE}/v3-split-annotation-pages/canvas/3/annotation/right`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: `${BASE}/v3-split-annotation-pages/canvas/3#xywh=800,0,800,1000`,
                            body: {
                                id: `${BASE}/v3-split-annotation-pages/image/content-right.jpg`,
                                type: 'Image',
                                format: 'image/jpeg',
                                height: 1000,
                                width: 800,
                            },
                        },
                    ],
                },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// 7. `sequences` as a bare object rather than an array
// ---------------------------------------------------------------------------

/**
 * IIIF v2 whose `sequences` is a bare object, not an array.
 *
 * Invalid per the spec and present in the wild — the vendored
 * `audio.json` does exactly this. The removed library tolerated it, so every
 * enumerator that replaces it must guard its array access rather than assume
 * one. Its `structures` also uses a bare object, for the same reason.
 */
export const syntheticV2SequencesBareObject = v2Manifest(
    `${BASE}/v2-bare-sequences/manifest`,
    'v2 sequences as a bare object rather than an array',
    {
        sequences: v2Sequence(`${BASE}/v2-bare-sequences/sequence/normal`, [
            v2Canvas(`${BASE}/v2-bare-sequences/canvas/1`, 'Page 1'),
            v2Canvas(`${BASE}/v2-bare-sequences/canvas/2`, 'Page 2'),
        ]),
        structures: {
            '@id': `${BASE}/v2-bare-sequences/range/top`,
            '@type': 'sc:Range',
            label: 'Table of contents',
            viewingHint: 'top',
            canvases: [`${BASE}/v2-bare-sequences/canvas/1`],
        },
    },
);

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

export interface SyntheticFixture {
    /** Stable name, used as the smoke test's case name. */
    name: string;
    /** The manifest id these are registered under. */
    id: string;
    /** The manifest JSON. */
    json: any;
    /** Which branch this fixture exists to reach. */
    coverage: string;
}

/**
 * Every synthetic fixture, for the corpus smoke test. Adding an export above
 * without adding it here means it is never loaded — keep the two in step.
 */
export const syntheticManifestCorpus: SyntheticFixture[] = [
    {
        name: 'v2 ranges — canvases, members, and ranges spellings',
        id: syntheticV2RangesAllSpellings['@id'],
        json: syntheticV2RangesAllSpellings,
        coverage: 'parseV2Range: all three range-content spellings',
    },
    {
        name: 'v2 oa:Choice painting annotation',
        id: syntheticV2Choice['@id'],
        json: syntheticV2Choice,
        coverage: 'v2 Choice painting body (default + item)',
    },
    {
        name: 'v2 viewingHint and viewingDirection at two levels',
        id: syntheticV2ViewingHints['@id'],
        json: syntheticV2ViewingHints,
        coverage: 'v2 manifest-level vs sequence-level viewing scalars',
    },
    {
        name: 'v2 manifest with two sequences',
        id: syntheticV2MultipleSequences['@id'],
        json: syntheticV2MultipleSequences,
        coverage: 'multi-sequence v2 enumeration and sequence selection',
    },
    {
        name: 'v2 level-0 image service',
        id: syntheticV2Level0Service['@id'],
        json: syntheticV2Level0Service,
        coverage: 'level-0 image service, v2 profile spelling',
    },
    {
        name: 'v3 level-0 image service',
        id: syntheticV3Level0Service.id,
        json: syntheticV3Level0Service,
        coverage: 'level-0 image service, v3 profile spelling',
    },
    {
        name: 'v3 painting annotations split across two annotation pages',
        id: syntheticV3SplitAnnotationPages.id,
        json: syntheticV3SplitAnnotationPages,
        coverage: 'every annotation page in canvas.items, not just the first',
    },
    {
        name: 'v2 sequences as a bare object',
        id: syntheticV2SequencesBareObject['@id'],
        json: syntheticV2SequencesBareObject,
        coverage: 'array access guarded against a bare object',
    },
];
