/*
 * The manifests `/handles/` shows that are variations on material already here.
 *
 * Each one republishes canvases from `material/landing/manifest.json` or
 * `material/sound/manifest.json` under an id space of its own, with one IIIF
 * property added or changed: the languages a manifest can be written in, a note
 * anchored to a point, an annotation page kept in another file, an alternative
 * order for the same leaves, a start that names a second rather than a canvas.
 * The images, their tile pyramids and the recordings are the sets they came
 * from — nothing here fetches or writes a pixel or a sample.
 *
 * Generated rather than committed by hand because they are DERIVED: the landing
 * manifest is itself generated (`generate-landing-material.mjs`), and a
 * hand-copied canvas would keep a plate, a dimension or a service path the
 * regenerated set no longer has. Run `pnpm material:features` after
 * `pnpm material:landing`.
 *
 * The recordings' own media and provenance stay where they are, in
 * `static/material/sound/` and its `PROVENANCE.md`: this script republishes
 * their canvases, and the durations it lays segments out from are read from
 * that manifest rather than restated here.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC = fileURLToPath(new URL('../static', import.meta.url));
const MATERIAL = join(STATIC, 'material');
const LANDING = JSON.parse(
    readFileSync(join(MATERIAL, 'landing', 'manifest.json'), 'utf8'),
);
const SOUND = JSON.parse(
    readFileSync(join(MATERIAL, 'sound', 'manifest.json'), 'utf8'),
);

const bySlug = new Map(
    LANDING.items.map((canvas) => [canvas.id.split('/').pop(), canvas]),
);
const soundBySlug = new Map(
    SOUND.items.map((canvas) => [canvas.id.split('/').pop(), canvas]),
);

function en(value) {
    return { en: [value] };
}

/** One landing canvas, republished under `base`'s id space. */
function canvas(slug, base) {
    const source = bySlug.get(slug);
    if (!source) throw new Error(`the landing set has no canvas ${slug}`);
    const copy = structuredClone(source);
    copy.id = `${base}/canvas/${slug}`;
    copy.items[0].id = `${base}/page/${slug}`;
    copy.items[0].items[0].id = `${base}/annotation/${slug}`;
    copy.items[0].items[0].target = copy.id;
    return copy;
}

/**
 * One recording's canvas, republished under `base`'s id space.
 *
 * Unlike a plate, a sound canvas can carry several painting annotations laid
 * end to end on one timeline, and each one's target carries the `#t=` segment
 * it occupies — so the rewrite has to keep every fragment while moving the
 * canvas the fragments hang off. The media ids are left alone: the files stay
 * where `PROVENANCE.md` says they are, and republishing a canvas must not
 * imply a second copy of a recording.
 */
function soundCanvas(slug, base) {
    const source = soundBySlug.get(slug);
    if (!source) throw new Error(`the sound set has no canvas ${slug}`);
    const copy = structuredClone(source);
    const from = copy.id;
    copy.id = `${base}/canvas/${slug}`;
    copy.items[0].id = `${base}/page/${slug}`;
    copy.items[0].items.forEach((annotation, index) => {
        annotation.id = `${base}/annotation/${slug}/${index + 1}`;
        annotation.target = annotation.target.replace(from, copy.id);
    });
    if (copy.accompanyingCanvas) {
        copy.accompanyingCanvas = companion(copy.accompanyingCanvas, base);
    }
    return copy;
}

/** A companion Canvas, moved into `base`'s id space with its painting. */
function companion(source, base) {
    const copy = structuredClone(source);
    const slug = copy.id.split('/').slice(-2).join('-');
    copy.id = `${base}/canvas/${slug}`;
    copy.items[0].id = `${base}/page/${slug}`;
    copy.items[0].items[0].id = `${base}/annotation/${slug}`;
    copy.items[0].items[0].target = copy.id;
    return copy;
}

/** The `#t=` seconds each of a composed canvas's segments begins at. */
function segmentStarts(canvasJson) {
    return canvasJson.items[0].items.map((annotation) =>
        Number(annotation.target.split('#t=')[1].split(',')[0]),
    );
}

let written = 0;

function write(name, manifest, file = 'manifest.json') {
    const dir = join(MATERIAL, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), `${JSON.stringify(manifest, null, 4)}\n`);
    written += 1;
}

// ---------------------------------------------------------------------------
// Written in several languages, so the chrome offers a language to read it in.
//
// The titles are the ones the holding institutions use, not translations made
// here: a picker that switched between inventions would demonstrate nothing.
const MULTILINGUAL = '/material/multilingual';
write('multilingual', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${MULTILINGUAL}/manifest.json`,
    type: 'Manifest',
    label: {
        en: ['Three paintings, catalogued in several languages'],
        fr: ['Trois peintures, cataloguées en plusieurs langues'],
        ja: ['多言語で記述された三点の絵画'],
        nl: ['Drie schilderijen, in meerdere talen beschreven'],
    },
    summary: {
        en: [
            'Every descriptive field of this manifest is written in more than one language, so a reader can be served in the one they read.',
        ],
        fr: [
            'Chaque champ descriptif de ce manifeste est rédigé en plusieurs langues, afin que le lecteur soit servi dans la sienne.',
        ],
        ja: [
            'このマニフェストの記述項目はすべて複数の言語で書かれており、読者は自分の読む言語で読むことができます。',
        ],
        nl: [
            'Elk beschrijvend veld van dit manifest is in meer dan één taal geschreven, zodat een lezer bediend wordt in de taal die hij leest.',
        ],
    },
    metadata: [
        {
            label: {
                en: ['Held by'],
                fr: ['Conservé par'],
                ja: ['所蔵'],
                nl: ['Collectie'],
            },
            value: {
                en: ['Public-domain reproductions, served from this site.'],
                fr: [
                    'Reproductions du domaine public, servies depuis ce site.',
                ],
                ja: ['パブリックドメインの複製。当サイトから配信しています。'],
                nl: ['Publiek-domeinreproducties, geserveerd vanaf deze site.'],
            },
        },
    ],
    items: [
        ['hiroshige', 'Sudden Shower over Shin-Ōhashi Bridge and Atake, 1857'],
        ['milkmaid', 'The Milkmaid, ca. 1660'],
        ['shahnama', 'The Feast of Sada, ca. 1525'],
    ].map(([slug, english]) => {
        const item = canvas(slug, MULTILINGUAL);
        item.label = {
            hiroshige: {
                en: [english],
                ja: ['大はしあたけの夕立、1857年'],
                fr: ['Averse soudaine sur le pont Shin-Ōhashi à Atake, 1857'],
            },
            milkmaid: {
                en: [english],
                nl: ['Het melkmeisje, ca. 1660'],
                fr: ['La Laitière, vers 1660'],
            },
            shahnama: {
                en: [english],
                fa: ['جشن سده، حدود ۱۵۲۵'],
                fr: ['La Fête de Sadeh, vers 1525'],
            },
        }[slug];
        return item;
    }),
});

// ---------------------------------------------------------------------------
// The three links IIIF has for leaving the viewer. Each points at something
// that really exists: the record the scan came from, a JPEG of the whole plate
// served from here, and the Image API description of the pyramid behind it.
const LINKS = '/material/links';
write('links', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${LINKS}/manifest.json`,
    type: 'Manifest',
    label: en('Ernst Haeckel, Discomedusae (Plate 8), 1904'),
    summary: en(
        'A plate published with the three links IIIF has for leaving the viewer: the record it came from, the data behind it, and the file to take away.',
    ),
    homepage: [
        {
            id: 'https://www.biodiversitylibrary.org/item/18431',
            type: 'Text',
            label: en(
                'The catalogue record at the Biodiversity Heritage Library',
            ),
            format: 'text/html',
        },
    ],
    rendering: [
        {
            id: `${LINKS}/haeckel-plate.jpg`,
            type: 'Image',
            label: en('The whole plate as a JPEG (912 × 1317)'),
            format: 'image/jpeg',
        },
    ],
    seeAlso: [
        {
            id: '/material/landing/images/haeckel/info.json',
            type: 'Dataset',
            label: en('The IIIF Image API description of this scan'),
            format: 'application/json',
            profile: 'http://iiif.io/api/image/3/level0.json',
        },
    ],
    items: [canvas('haeckel', LINKS)],
});

// ---------------------------------------------------------------------------
// A note anchored to a shape rather than a box.
//
// The outline is traced on the plate's own pixel grid (4649 × 5177) around the
// basket and its loaf, at the lower left of the table.
const OUTLINE = '/material/outline';
const BASKET = [
    [399, 3547],
    [511, 3323],
    [879, 3243],
    [1278, 3323],
    [1406, 3547],
    [1246, 3882],
    [879, 3994],
    [511, 3882],
];
const milkmaid = canvas('milkmaid', OUTLINE);
milkmaid.annotations = [
    {
        id: `${OUTLINE}/annotation-page/milkmaid`,
        type: 'AnnotationPage',
        items: [
            {
                id: `${OUTLINE}/annotation/basket`,
                type: 'Annotation',
                motivation: 'commenting',
                body: {
                    type: 'TextualBody',
                    language: 'en',
                    format: 'text/plain',
                    value: 'The bread basket. Its lit surfaces are built from the small dots of paint — pointillés — that Vermeer used wherever light catches an edge.',
                },
                target: {
                    type: 'SpecificResource',
                    source: milkmaid.id,
                    selector: {
                        type: 'SvgSelector',
                        value: `<svg xmlns="http://www.w3.org/2000/svg"><path d="M ${BASKET.map(
                            ([x, y]) => `${x},${y}`,
                        ).join(' L ')} Z"/></svg>`,
                    },
                },
            },
        ],
    },
];
write('outline', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${OUTLINE}/manifest.json`,
    type: 'Manifest',
    label: en('Johannes Vermeer, The Milkmaid, ca. 1660'),
    summary: en('One note, anchored to a shape that is not a rectangle.'),
    items: [milkmaid],
});

// ---------------------------------------------------------------------------
// The whole set again, with the publisher naming where a reader should arrive.
const START = '/material/start';
write('start', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${START}/manifest.json`,
    type: 'Manifest',
    label: en('Public-domain visual study set, opening at the owl'),
    summary: en(
        'The same eleven plates, published with a start canvas: the publisher names where a reader should arrive, and it is not the first leaf.',
    ),
    start: { id: `${START}/canvas/audubon`, type: 'Canvas' },
    items: [...bySlug.keys()].map((slug) => canvas(slug, START)),
});

// ---------------------------------------------------------------------------
// A canvas the server has no picture for. The image id is deliberately one
// nothing is written to: what the page shows is the viewer's placard, and a
// file placed there later would quietly retire the feature.
const MISSING = '/material/missing';
write('missing', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${MISSING}/manifest.json`,
    type: 'Manifest',
    label: en('A plate, and a leaf whose image is missing'),
    summary: en(
        'The second canvas names an image file that is not on the server. It is declared, counted and navigable all the same.',
    ),
    items: [
        canvas('haeckel', MISSING),
        {
            id: `${MISSING}/canvas/plate-9`,
            type: 'Canvas',
            label: en('Plate 9 — the image for this leaf is not there'),
            width: 3645,
            height: 5267,
            items: [
                {
                    id: `${MISSING}/page/plate-9`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${MISSING}/annotation/plate-9`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: `${MISSING}/images/plate-9.jpg`,
                                type: 'Image',
                                format: 'image/jpeg',
                                width: 3645,
                                height: 5267,
                            },
                            target: `${MISSING}/canvas/plate-9`,
                        },
                    ],
                },
            ],
        },
    ],
});

// ---------------------------------------------------------------------------
// The same leaves in a second order the publisher declares.
//
// A Range carrying `behavior: sequence` is an alternative ordering of canvases
// the manifest already has, so both orders here are the same eleven plates and
// neither adds or hides one. The second is by the date of the work, which the
// canvas labels themselves record — an order invented for the demonstration
// would show the picker working and mean nothing.
const SEQUENCES = '/material/sequences';
const BY_DATE = [
    'aleppo',
    'spinola-hours',
    'shahnama',
    'monte',
    'milkmaid',
    'cellarius',
    'merian',
    'audubon',
    'atkins',
    'hiroshige',
    'haeckel',
];
const asGathered = [...bySlug.keys()];
if (BY_DATE.length !== asGathered.length) {
    throw new Error('the dated order and the landing set have drifted apart');
}
write('sequences', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${SEQUENCES}/manifest.json`,
    type: 'Manifest',
    label: en('Public-domain visual study set, in two orders'),
    summary: en(
        'The same eleven plates published twice over: the order they were gathered in, and the order they were made in. Each is a Range the manifest declares as a sequence.',
    ),
    items: asGathered.map((slug) => canvas(slug, SEQUENCES)),
    structures: [
        ['as-gathered', 'As gathered', asGathered],
        ['by-date', 'Oldest first', BY_DATE],
    ].map(([id, label, order]) => ({
        id: `${SEQUENCES}/range/${id}`,
        type: 'Range',
        label: en(label),
        behavior: ['sequence'],
        items: order.map((slug) => ({
            id: `${SEQUENCES}/canvas/${slug}`,
            type: 'Canvas',
        })),
    })),
});

// ---------------------------------------------------------------------------
// A note anchored to a point.
//
// The Sun's face on Cellarius's plate, at the centre of the arrangement the
// plate is about. A point rather than a box because the thing being marked is a
// position, not an area: the marker is the whole of what a PointSelector says.
const POINT = '/material/point';
const cellarius = canvas('cellarius', POINT);
cellarius.annotations = [
    {
        id: `${POINT}/annotation-page/cellarius`,
        type: 'AnnotationPage',
        items: [
            {
                id: `${POINT}/annotation/sun`,
                type: 'Annotation',
                motivation: 'commenting',
                body: {
                    type: 'TextualBody',
                    language: 'en',
                    format: 'text/plain',
                    value: 'The Sun, drawn with a face, at the centre of the scheme. That is what makes the plate Copernican: in the Ptolemaic plates of the same atlas the Earth is here instead.',
                },
                target: {
                    type: 'SpecificResource',
                    source: cellarius.id,
                    selector: { type: 'PointSelector', x: 1448, y: 1216 },
                },
            },
        ],
    },
];
write('point', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${POINT}/manifest.json`,
    type: 'Manifest',
    label: en(
        'Andreas Cellarius, Scenographia Systematis Copernicani (Plate 5), 1661',
    ),
    summary: en('One note, anchored to a point rather than to a region.'),
    items: [cellarius],
});

// ---------------------------------------------------------------------------
// Tags, and a note that marks no region.
//
// Every annotation here targets the whole canvas, which is the point: a note
// about the sheet as a whole has no region to draw, and the viewer lists it
// rather than inventing an outline for it. Two of the three carry `tagging`
// bodies, which the panel shows as badges instead of prose.
const TAGS = '/material/tags';
const atkins = canvas('atkins', TAGS);
atkins.annotations = [
    {
        id: `${TAGS}/annotation-page/atkins`,
        type: 'AnnotationPage',
        items: [
            {
                id: `${TAGS}/annotation/note`,
                type: 'Annotation',
                motivation: 'commenting',
                body: {
                    type: 'TextualBody',
                    language: 'en',
                    format: 'text/plain',
                    value: 'A photogram, not a photograph: the alga was laid on sensitised paper and printed by sunlight, so the white shape is where the specimen itself lay.',
                },
                target: atkins.id,
            },
            ...[
                ['cyanotype', 'Cyanotype'],
                ['dictyota', 'Dictyota dichotoma'],
            ].map(([slug, value]) => ({
                id: `${TAGS}/annotation/tag-${slug}`,
                type: 'Annotation',
                motivation: 'tagging',
                body: {
                    type: 'TextualBody',
                    purpose: 'tagging',
                    language: 'en',
                    format: 'text/plain',
                    value,
                },
                target: atkins.id,
            })),
        ],
    },
];
write('tags', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${TAGS}/manifest.json`,
    type: 'Manifest',
    label: en(
        'Anna Atkins, Dictyota dichotoma, in the young state and in fruit, 1843-53',
    ),
    summary: en(
        'Three annotations on one sheet, none of them anchored to a region: a note, and two tags.',
    ),
    items: [atkins],
});

// ---------------------------------------------------------------------------
// Notes the canvas names and does not carry.
//
// The canvas's `annotations` is a reference — an id and a type, no `items` —
// so the page is a second document the viewer has to go and fetch when the
// reader reaches the canvas. Written as two files for that reason: a page
// inlined here would be the very thing this manifest is not.
//
// The regions are the page's own layout, measured on the scan: three columns
// of text, and the marginal masora written above and below the block.
const REFERENCED = '/material/referenced';
const aleppo = canvas('aleppo', REFERENCED);
aleppo.annotations = [
    {
        id: `${REFERENCED}/annotations.json`,
        type: 'AnnotationPage',
    },
];
write('referenced', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${REFERENCED}/manifest.json`,
    type: 'Manifest',
    label: en('Aleppo Codex, Deuteronomy page P. 2-5-v, 10th century'),
    summary: en(
        'The canvas names an annotation page instead of carrying one, so the notes on it arrive in a second request.',
    ),
    items: [aleppo],
});
write(
    'referenced',
    {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: `${REFERENCED}/annotations.json`,
        type: 'AnnotationPage',
        items: [
            [
                'column-right',
                '2277,335,838,3260',
                'The right-hand column. The Aleppo Codex is written three columns to the page, and Hebrew is read right to left, so this column is the first of the three.',
            ],
            ['column-middle', '1278,335,919,3260', 'The middle column.'],
            [
                'column-left',
                '280,335,918,3260',
                'The left-hand column, and the last of the page.',
            ],
            [
                'masora-upper',
                '200,64,2995,216',
                'The masora written across the upper margin, in a hand smaller than the text it annotates.',
            ],
            [
                'masora-lower',
                '240,3612,2875,207',
                'The masora continued below the text block.',
            ],
        ].map(([slug, xywh, value]) => ({
            id: `${REFERENCED}/annotation/${slug}`,
            type: 'Annotation',
            motivation: 'commenting',
            body: {
                type: 'TextualBody',
                language: 'en',
                format: 'text/plain',
                value,
            },
            target: `${aleppo.id}#xywh=${xywh}`,
        })),
    },
    'annotations.json',
);

// ---------------------------------------------------------------------------
// Two plates with their printed lines transcribed.
//
// `supplementing` annotations targeting the region each line occupies: the
// shape an OCR pipeline emits, and what the PDF export reads to lay selectable
// text under the picture. Transcribed from these scans rather than recognised
// by a program, which is why there are six lines and not six hundred — every
// line of type on either plate is here, because these are plates rather than
// pages of prose.
const OCR = '/material/ocr';
const OCR_LINES = {
    haeckel: [
        ['283,363,795,60', 'Haeckel, Kunstformen der Natur.', 'de'],
        ['2620,363,585,58', 'Tafel 8 — Desmonema.', 'de'],
        ['1078,4795,1350,72', 'Discomedusae. — Scheibenquallen.', 'de'],
    ],
    audubon: [
        [
            '270,7578,520,55',
            'Drawn from Nature by J.J.Audubon, F.R.S., F.L.S.',
            'en',
        ],
        [
            '1700,7513,1440,125',
            'Snowy Owl, STRIX NYCTEA, Linn, Male 1. Female 2.',
            'en',
        ],
        [
            '4330,7573,590,55',
            'Engraved, Printed & Coloured by R. Havell, London.',
            'en',
        ],
    ],
};
write('ocr', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${OCR}/manifest.json`,
    type: 'Manifest',
    label: en('Two plates, with their printed lines transcribed'),
    summary: en(
        'Every line of type on either plate, each anchored to the region it occupies, so that a PDF made from these canvases carries text and not only a picture.',
    ),
    items: Object.entries(OCR_LINES).map(([slug, lines]) => {
        const plate = canvas(slug, OCR);
        plate.annotations = [
            {
                id: `${OCR}/annotation-page/${slug}`,
                type: 'AnnotationPage',
                items: lines.map(([xywh, value, language], index) => ({
                    id: `${OCR}/annotation/${slug}/${index + 1}`,
                    type: 'Annotation',
                    motivation: 'supplementing',
                    body: {
                        type: 'TextualBody',
                        purpose: 'supplementing',
                        language,
                        format: 'text/plain',
                        value,
                    },
                    target: `${plate.id}#xywh=${xywh}`,
                })),
            },
        ];
        return plate;
    }),
});

// ---------------------------------------------------------------------------
// The older IIIF, in the vocabulary it actually uses.
//
// Presentation 2.1 throughout: `@id` and `@type`, a `sequences` array with the
// canvases inside it, `images` carrying an `oa:Annotation` whose `resource` is
// `on` the canvas, `description` where 3.0 has `summary`, and `attribution`
// where 3.0 has `requiredStatement`. A great many published manifests are still
// this document, which is the whole reason to serve one.
//
// The image service stays the Image API 3.0 level-0 one the tiles are actually
// cut for: the two APIs version separately, and a v2 Presentation document
// naming a v3 service is a real combination rather than a contrivance. It is
// declared with both spellings of id and profile so the service is legible
// whichever version a reader's tooling expects.
const V2 = '/material/presentation2';
write('presentation2', {
    '@context': 'http://iiif.io/api/presentation/2/context.json',
    '@id': `${V2}/manifest.json`,
    '@type': 'sc:Manifest',
    label: 'Three plates, published as IIIF Presentation 2.1',
    description:
        'The same tiles as the rest of this site, described in the older Presentation vocabulary: a sequence of canvases, each with an images array.',
    attribution: 'Public-domain reproductions, served from this site.',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    metadata: [
        { label: 'Presentation API', value: '2.1' },
        { label: 'Image API', value: '3.0, level 0' },
    ],
    sequences: [
        {
            '@id': `${V2}/sequence/normal`,
            '@type': 'sc:Sequence',
            label: 'Default order',
            canvases: ['hiroshige', 'spinola-hours', 'merian'].map((slug) => {
                const source = bySlug.get(slug);
                if (!source) {
                    throw new Error(`the landing set has no canvas ${slug}`);
                }
                const id = `${V2}/canvas/${slug}`;
                const body = source.items[0].items[0].body;
                const service = body.service[0];
                return {
                    '@id': id,
                    '@type': 'sc:Canvas',
                    label: source.label.en[0],
                    width: source.width,
                    height: source.height,
                    images: [
                        {
                            '@id': `${V2}/annotation/${slug}`,
                            '@type': 'oa:Annotation',
                            motivation: 'sc:painting',
                            on: id,
                            resource: {
                                '@id': body.id,
                                '@type': 'dctypes:Image',
                                format: body.format,
                                width: body.width,
                                height: body.height,
                                service: {
                                    '@context':
                                        'http://iiif.io/api/image/3/context.json',
                                    '@id': service.id,
                                    id: service.id,
                                    type: service.type,
                                    profile: service.profile,
                                },
                            },
                        },
                    ],
                };
            }),
        },
    ],
});

// ---------------------------------------------------------------------------
// Notes pinned to seconds of a recording.
//
// A `commenting` annotation whose target carries `#t=` is timed commentary: it
// belongs to a moment rather than to a region, and there is nowhere on a
// timeline to draw it, so it is read rather than seen. Each note here begins at
// the second one march's file gives way to the next, and the seconds are read
// off the canvas's own segments so a re-transcode cannot leave them behind.
const TIMED = '/material/timed';
const timedMarches = soundCanvas('marine-band', TIMED);
const STARTS = segmentStarts(timedMarches);
const TIMED_NOTES = [
    'Columbia’s Pride opens the timeline. Four separate recordings are laid end to end across this one canvas, and the transport treats the join between them as an ordinary second.',
    'The Quilting Party. A second file takes over here: the media element behind the transport is swapped at the boundary, which is why a seek across it costs a moment.',
    'Guide Right, the third of the four.',
    'Pet of the Petticoats, the longest, and the last before the canvas ends at 5:58.',
];
timedMarches.annotations = [
    {
        id: `${TIMED}/annotation-page/marine-band`,
        type: 'AnnotationPage',
        items: TIMED_NOTES.map((value, index) => ({
            id: `${TIMED}/annotation/marine-band/${index + 1}`,
            type: 'Annotation',
            motivation: ['commenting'],
            body: {
                type: 'TextualBody',
                language: 'en',
                format: 'text/plain',
                value,
            },
            target: `${timedMarches.id}#t=${STARTS[index]}`,
        })),
    },
];
write('timed', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${TIMED}/manifest.json`,
    type: 'Manifest',
    label: en('Four Sousa marches, annotated by the second'),
    summary: en(
        'The same four-march canvas, with a note at each second one recording hands over to the next.',
    ),
    items: [timedMarches],
});

// ---------------------------------------------------------------------------
// A start that names a second, not just a canvas.
//
// Cookbook 0015's shape: `start` is a SpecificResource whose `source` is the
// canvas and whose `PointSelector` carries `t`. The second named is the third
// march's own beginning, taken from the canvas's segments, so the playhead
// arrives where a chapter does. It is a seek and never a play — nothing here
// asks the browser to make a sound at a reader who did not ask for one.
const MOMENT = '/material/moment';
const momentMarches = soundCanvas('marine-band', MOMENT);
write('moment', {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: `${MOMENT}/manifest.json`,
    type: 'Manifest',
    label: en('Early recordings, opening partway through the third march'),
    summary: en(
        'The publisher names not the leaf to arrive at but the moment: the second canvas, two minutes and thirty-eight seconds in.',
    ),
    start: {
        id: `${MOMENT}/start/guide-right`,
        type: 'SpecificResource',
        source: momentMarches.id,
        selector: { type: 'PointSelector', t: segmentStarts(momentMarches)[2] },
    },
    items: [soundCanvas('lost-chord', MOMENT), momentMarches],
});

// ---------------------------------------------------------------------------
// A collection whose members are real volumes, not single sheets.
//
// The point of a collection is that it holds MANIFESTS, and a member with one
// canvas in it cannot show that: navigating such a collection looks exactly
// like paging a manifest. So the eleven plates are grouped by subject into four
// members of two to four canvases each, and every member is a document of its
// own that the viewer has to fetch when the reader picks it.
//
// Grouped by what the works are rather than by anything invented for the
// demonstration, and no member carries `navDate`: the panel then orders them by
// label, which is the ordinary case and the one worth showing.
const COLLECTION = '/material/collection';
const VOLUMES = [
    [
        'botany',
        'Botany and zoology',
        ['haeckel', 'merian', 'atkins', 'audubon'],
    ],
    ['manuscripts', 'Manuscripts', ['spinola-hours', 'aleppo']],
    ['maps', 'Maps and star charts', ['cellarius', 'monte']],
    [
        'paintings',
        'Paintings and prints',
        ['milkmaid', 'hiroshige', 'shahnama'],
    ],
];
if (VOLUMES.flatMap(([, , slugs]) => slugs).length !== bySlug.size) {
    throw new Error('the volumes and the landing set have drifted apart');
}

/** The small pre-cut rendition of a canvas's own image, for a panel row. */
function thumbnailOf(canvasJson) {
    const body = canvasJson.items[0].items[0].body;
    return [
        {
            id: body.id,
            type: 'Image',
            format: body.format,
        },
    ];
}

const volumes = VOLUMES.map(([slug, label, members]) => {
    const base = `${COLLECTION}/${slug}`;
    const manifest = {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: `${base}.json`,
        type: 'Manifest',
        label: en(label),
        summary: en(
            `${members.length} plates from this site's public-domain set, gathered as one volume of a collection.`,
        ),
        // Each volume republishes its plates under its own id space, exactly as
        // the other derived manifests do: two volumes sharing a canvas id would
        // be one canvas belonging to two documents.
        items: members.map((member) => canvas(member, base)),
    };
    write('collection', manifest, `${slug}.json`);
    return { slug, label, manifest };
});

write(
    'collection',
    {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: `${COLLECTION}/collection.json`,
        type: 'Collection',
        label: en('A public-domain set, gathered into four volumes'),
        summary: en(
            'Eleven plates grouped by subject. Each member is a manifest of its own with several canvases in it, so moving between members is moving between documents rather than between leaves.',
        ),
        items: volumes.map(({ slug, label, manifest }) => ({
            id: `${COLLECTION}/${slug}.json`,
            type: 'Manifest',
            label: en(label),
            thumbnail: thumbnailOf(manifest.items[0]),
        })),
    },
    'collection.json',
);

console.log(`generate-feature-material: wrote ${written} document(s)`);
