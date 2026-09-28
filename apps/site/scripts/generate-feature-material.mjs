/* Derived `/features/` manifests republishing landing/sound canvases with one property changed. */

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

function companion(source, base) {
    const copy = structuredClone(source);
    const slug = copy.id.split('/').slice(-2).join('-');
    copy.id = `${base}/canvas/${slug}`;
    copy.items[0].id = `${base}/page/${slug}`;
    copy.items[0].items[0].id = `${base}/annotation/${slug}`;
    copy.items[0].items[0].target = copy.id;
    return copy;
}

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

// Image id intentionally unwritten: shows the viewer's missing-image placard.
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
