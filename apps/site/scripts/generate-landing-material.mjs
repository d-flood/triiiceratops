import { execFileSync } from 'node:child_process';
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('..', import.meta.url));
const STATIC = join(SITE, 'static');
const ROOT = join(STATIC, 'material', 'landing');
const IMAGES = join(ROOT, 'images');
const BASE = '/material/landing';
const SOURCES = mkdtempSync(join(tmpdir(), 'triiiceratops-landing-'));
const MANIFEST_ONLY = process.argv.includes('--manifest-only');

const works = [
    {
        slug: 'haeckel',
        file: 'haeckel.jpg',
        url: 'https://iiif.archive.org/image/iiif/2/KunstformenderN00Haec%2Fpage%2Fn48/full/full/0/default.jpg',
        label: 'Ernst Haeckel, Discomedusae (Plate 8), 1904',
        source: 'Smithsonian Libraries and Archives / Biodiversity Heritage Library, item 18431',
        sourceUrl: 'https://www.biodiversitylibrary.org/item/18431',
        rights: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution:
            'Ernst Haeckel, Kunstformen der Natur, Plate 8; Smithsonian Libraries and Archives / Biodiversity Heritage Library.',
    },
    {
        slug: 'cellarius',
        file: 'cellarius.jpg',
        url: 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Cellarius_Harmonia_Macrocosmica_-_Scenographia_Systematis_Copernicani.jpg',
        label: 'Andreas Cellarius, Scenographia Systematis Copernicani (Plate 5), 1661',
        source: 'Wikimedia Commons, Cellarius Harmonia Macrocosmica - Scenographia Systematis Copernicani',
        sourceUrl:
            'https://commons.wikimedia.org/wiki/File:Cellarius_Harmonia_Macrocosmica_-_Scenographia_Systematis_Copernicani.jpg',
        rights: 'https://creativecommons.org/publicdomain/mark/1.0/',
        attribution:
            'Andreas Cellarius, Harmonia Macrocosmica, Plate 5. Public-domain scan via Wikimedia Commons.',
    },
    {
        slug: 'hiroshige',
        file: 'hiroshige.jpg',
        url: 'https://images.metmuseum.org/CRDImages/as/original/DP121525.jpg',
        label: 'Utagawa Hiroshige, Sudden Shower over Shin-Ohashi Bridge and Atake, 1857',
        source: 'The Metropolitan Museum of Art, object 36461',
        sourceUrl: 'https://www.metmuseum.org/art/collection/search/36461',
        rights: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution:
            'Utagawa Hiroshige, Sudden Shower over Shin-Ohashi Bridge and Atake, 1857, The Metropolitan Museum of Art, JP643.',
    },
    {
        slug: 'atkins',
        file: 'atkins.jpg',
        url: 'https://images.metmuseum.org/CRDImages/ph/original/DP-17302-021.jpg',
        label: 'Anna Atkins, Dictyota dichotoma, in the young state and in fruit, 1843-53',
        source: 'The Metropolitan Museum of Art, object 291515',
        sourceUrl: 'https://www.metmuseum.org/art/collection/search/291515',
        rights: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution:
            'Anna Atkins, Dictyota dichotoma, in the young state and in fruit, 1843-53, The Metropolitan Museum of Art, 2005.100.557 (18).',
    },
    {
        slug: 'shahnama',
        file: 'shahnama.jpg',
        url: 'https://images.metmuseum.org/CRDImages/is/original/DP107689.jpg',
        label: 'The Feast of Sada, folio 22v from the Shahnama of Shah Tahmasp, ca. 1525',
        source: 'The Metropolitan Museum of Art, object 452111',
        sourceUrl: 'https://www.metmuseum.org/art/collection/search/452111',
        rights: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution:
            'The Feast of Sada, folio 22v from the Shahnama of Shah Tahmasp, ca. 1525, The Metropolitan Museum of Art, 1970.301.2.',
    },
    {
        slug: 'audubon',
        file: 'audubon.jpg',
        url: 'https://iiif.digitalcommonwealth.org/iiif/2/commonwealth:9s16d002f/full/full/0/default.jpg',
        label: 'John James Audubon, Snowy Owl (Plate 121), 1831',
        source: 'Boston Public Library / Digital Commonwealth, 9s16d0015',
        sourceUrl: 'https://ark.digitalcommonwealth.org/ark:/50959/9s16d0015',
        rights: 'http://rightsstatements.org/vocab/NoC-US/1.0/',
        attribution:
            'John James Audubon, Snowy Owl, Plate 121, 1831. Boston Public Library / Digital Commonwealth.',
    },
    {
        slug: 'spinola-hours',
        file: 'spinola-hours.jpg',
        url: 'https://media.getty.edu/iiif/image/b71db0c8-0688-451e-b236-7228054cdaf4/full/max/0/default.jpg',
        label: 'The Annunciation, The Spinola Hours, folio 92v, ca. 1510-20',
        source: 'J. Paul Getty Museum, Ms. Ludwig IX 18, 83.ML.114.92v',
        sourceUrl: 'https://www.getty.edu/art/collection/object/105VWB',
        rights: 'https://creativecommons.org/publicdomain/zero/1.0/',
        attribution:
            'The Annunciation, The Spinola Hours, folio 92v, ca. 1510-20, J. Paul Getty Museum, Ms. Ludwig IX 18, 83.ML.114.92v.',
    },
    {
        slug: 'milkmaid',
        file: 'milkmaid.jpg',
        url: 'https://iiif.micr.io/QkOGy/full/max/0/default.jpg',
        label: 'Johannes Vermeer, The Milkmaid, ca. 1660',
        source: 'Rijksmuseum, SK-A-2344',
        sourceUrl: 'https://www.rijksmuseum.nl/en/collection/SK-A-2344',
        rights: 'https://creativecommons.org/publicdomain/mark/1.0/',
        attribution:
            'Johannes Vermeer, The Milkmaid, ca. 1660, Rijksmuseum, SK-A-2344.',
    },
    {
        slug: 'merian',
        file: 'merian.jpg',
        url: 'https://archive.org/download/Metamorphosisin00Meri/page/n11.jpg',
        label: 'Maria Sibylla Merian, Plate 1: Pineapple with Insects, 1705',
        source: 'Biodiversity Heritage Library, item 129308, page 41398750',
        sourceUrl: 'https://www.biodiversitylibrary.org/page/41398750',
        rights: 'http://rightsstatements.org/vocab/NoC-US/1.0/',
        attribution:
            'Maria Sibylla Merian, Metamorphosis insectorum Surinamensium, Plate 1, 1705. Biodiversity Heritage Library.',
    },
    {
        slug: 'monte',
        file: 'monte.jp2',
        quality: 70,
        url: 'https://www.davidrumsey.com/static/jp2k/179/10130087.jp2',
        label: 'Urbano Monte, Composite: Tavola 1-60 (Map of the World), 1587',
        source: 'David Rumsey Map Collection, list 10130.087',
        sourceUrl:
            'https://www.davidrumsey.com/luna/servlet/detail/RUMSEY~8~1~303661~90074314',
        rights: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
        attribution:
            'Urbano Monte, Composite: Tavola 1-60 (Map of the World), 1587. David Rumsey Map Collection, list 10130.087. CC BY-NC-SA 3.0.',
    },
    {
        slug: 'aleppo',
        file: 'aleppo.jpg',
        url: 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Aleppo_Codex_%28Deut%29.jpg',
        label: 'Aleppo Codex, Deuteronomy page P. 2-5-v, 10th century',
        source: 'National Library of Israel / Yad Yitzhak Ben-Zvi Institute',
        sourceUrl:
            'https://commons.wikimedia.org/wiki/File:Aleppo_Codex_(Deut).jpg',
        rights: 'https://creativecommons.org/publicdomain/mark/1.0/',
        attribution:
            'Aleppo Codex, Deuteronomy page P. 2-5-v, 10th century. Photograph: Ardon Bar Hama, 2007, Yad Yitzhak Ben-Zvi Institute. Via Wikimedia Commons.',
    },
];

function run(command, args) {
    execFileSync(command, args, { stdio: 'inherit' });
}

function dimensions(file) {
    return {
        width: Number(
            execFileSync('vipsheader', ['-f', 'width', file], {
                encoding: 'utf8',
            }),
        ),
        height: Number(
            execFileSync('vipsheader', ['-f', 'height', file], {
                encoding: 'utf8',
            }),
        ),
    };
}

function language(value) {
    return { en: [value] };
}

function canvas(work, { width, height }) {
    const id = `${BASE}/canvas/${work.slug}`;
    const service = `${BASE}/images/${work.slug}`;
    const scale =
        2 ** Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / 512)));
    const previewWidth = Math.ceil(width / scale);
    const previewHeight = Math.ceil(height / scale);
    return {
        id,
        type: 'Canvas',
        label: language(work.label),
        width,
        height,
        rights: work.rights,
        requiredStatement: {
            label: language('Attribution'),
            value: language(work.attribution),
        },
        metadata: [
            { label: language('Source'), value: language(work.source) },
            {
                label: language('Source record'),
                value: language(work.sourceUrl),
            },
        ],
        items: [
            {
                id: `${BASE}/page/${work.slug}`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${BASE}/annotation/${work.slug}`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `${service}/0,0,${width},${height}/${previewWidth},${previewHeight}/0/default.jpg`,
                            type: 'Image',
                            format: 'image/jpeg',
                            width,
                            height,
                            service: [
                                {
                                    id: service,
                                    type: 'ImageService3',
                                    profile: 'level0',
                                },
                            ],
                        },
                        target: id,
                    },
                ],
            },
        ],
    };
}

try {
    if (!MANIFEST_ONLY) {
        // Generated tiles must agree with the manifest written below; never mix
        // a successful earlier run with a changed source list.
        rmSync(ROOT, { recursive: true, force: true });
        mkdirSync(IMAGES, { recursive: true });
    }
    const canvases = [];
    for (const work of works) {
        let size;
        if (MANIFEST_ONLY) {
            const info = JSON.parse(
                readFileSync(join(IMAGES, work.slug, 'info.json'), 'utf8'),
            );
            size = { width: info.width, height: info.height };
        } else {
            const input = join(SOURCES, work.file);
            run('curl', [
                '--fail',
                '--location',
                '--retry',
                '3',
                '--output',
                input,
                work.url,
            ]);

            size = dimensions(input);
            run('vips', [
                'dzsave',
                input,
                join(IMAGES, work.slug),
                '--layout',
                'iiif3',
                '--tile-size',
                '512',
                '--suffix',
                `.jpg[Q=${work.quality ?? 85}]`,
                '--id',
                `${BASE}/images`,
            ]);
        }
        canvases.push(canvas(work, size));
    }

    writeFileSync(
        join(ROOT, 'manifest.json'),
        `${JSON.stringify(
            {
                '@context': 'http://iiif.io/api/presentation/3/context.json',
                id: `${BASE}/manifest.json`,
                type: 'Manifest',
                label: language('Public-domain visual study set'),
                summary: language(
                    'Eleven locally served IIIF Image API tile pyramids selected to demonstrate colour, line, material texture, and deep zoom. The Urbano Monte composite is the sole exception to the public-domain/CC0 set and is made available under CC BY-NC-SA 3.0.',
                ),
                metadata: [
                    {
                        label: language('Image services'),
                        value: language(
                            'Generated with libvips dzsave --layout iiif3.',
                        ),
                    },
                ],
                items: canvases,
            },
            null,
            2,
        )}\n`,
    );
} finally {
    rmSync(SOURCES, { recursive: true, force: true });
}
