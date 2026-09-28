/** The features `/features/` shows, each with the material that exercises it. */

import type { ThemeConfig, ViewerState } from 'triiiceratops';

import type { DragTarget } from './dragSource';
import type { Example } from './examples';
import type { SitePlugin } from './sitePlugins';
import type { ViewerConfig } from './viewerConfig';

export const FEATURE_GROUPS = [
    'Image Features',
    'Sound and Video Features',
    'Notes and text',
    'Metadata',
    'First Party Plugins',
] as const;

export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

export const FEATURE_GROUP_TABS: Record<FeatureGroup, string> = {
    'Image Features': 'Images',
    'Sound and Video Features': 'Sound & video',
    'Notes and text': 'Notes & text',
    Metadata: 'Metadata',
    'First Party Plugins': 'Plugins',
};

export type Feature = {
    readonly name: string;
    readonly group: FeatureGroup;
    readonly what: string;
    readonly material: string;
    readonly source: { readonly who: string; readonly href: string };
    readonly example: Example;
    readonly canvasId?: string;
    readonly config: ViewerConfig;
    readonly themeConfig?: ThemeConfig;
    readonly plugin?: () => Promise<SitePlugin>;
    readonly drive?: (viewer: ViewerState) => void;
    readonly captionsOn?: boolean;
    readonly dragPayloads?: readonly DragChip[];
};

export type DragChip = {
    readonly label: string;
    readonly state: DragTarget;
    readonly carries?: {
        readonly example: Example;
        readonly material: string;
        readonly source: { readonly who: string; readonly href: string };
    };
};

const BASE_CONFIG: ViewerConfig = {
    controls: 'unified',
    toolbarOpen: false,
    showToggle: true,
    showCanvasNav: true,
    showZoomControls: true,
    viewingMode: 'individuals',
    locale: 'en',
    gallery: { open: false, expanded: false },
    information: { open: false },
    structures: { open: false },
    annotations: { open: false },
    search: { open: false },
    collection: { open: false },
};

function showing(highlight: ViewerConfig): ViewerConfig {
    return { ...BASE_CONFIG, ...highlight };
}

function bare(): ViewerConfig {
    return showing({
        controls: 'split',
        showToggle: false,
        showCanvasNav: false,
        showZoomControls: false,
    });
}

const LANDING = {
    manifest: '/material/landing/manifest.json',
    canvases: 11,
    source: {
        who: 'this site’s own public-domain set',
        href: '/material/landing/manifest.json',
    },
    plate: '/material/landing/canvas/haeckel',
    /** 62,079 × 62,160. */
    map: '/material/landing/canvas/monte',
    verso: '/material/landing/canvas/cellarius',
    middle: '/material/landing/canvas/shahnama',
} as const;

const SOUND = {
    manifest: '/material/sound/manifest.json',
    canvases: 2,
    source: {
        who: 'this site’s own public-domain set',
        href: '/material/sound/manifest.json',
    },
    cylinder: '/material/sound/canvas/lost-chord',
    marches: '/material/sound/canvas/marine-band',
} as const;

const MARCHES = 'Four Sousa marches, United States Marine Band';

const NEWSREEL = {
    manifest:
        'https://iiif.io/api/cookbook/recipe/0074-multiple-language-captions/manifest.json',
    canvases: 1,
    source: {
        who: 'The IIIF Cookbook',
        href: 'https://iiif.io/api/cookbook/recipe/0074-multiple-language-captions/manifest.json',
    },
    material: 'Per voi signore. Modelli francesi, Cinecittà Luce',
    firstCanvas: { width: 288, height: 384 },
} as const;

const AV_PLUGIN = async () =>
    (await import('@triiiceratops/plugin-av'))
        .AvPlugin as unknown as SitePlugin;

const PDF_PLUGIN = async () =>
    (await import('@triiiceratops/plugin-pdf-export'))
        .PdfExportPlugin as unknown as SitePlugin;
const IMAGE_DOWNLOAD_PLUGIN = async () =>
    (await import('@triiiceratops/plugin-image-export'))
        .ImageDownloadPlugin as unknown as SitePlugin;

const NOTE_ID =
    'https://iiif.io/api/cookbook/recipe/0346-multilingual-annotation-body/annotation/p0001-comment';

export const FEATURES: readonly Feature[] = [
    {
        name: 'Deep zoom on a single canvas',
        group: 'Image Features',
        what: 'Nearly four billion pixels. You can zoom in to see those little ships!',
        material: 'Urbano Monte, Tavola 1–60 (Map of the World), 1587',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'Deep zoom into a gigapixel map',
            firstCanvas: {
                width: 62079,
                height: 62160,
                prerender: {
                    src: '/material/landing/images/monte/0,0,62079,62160/485,486/0/default.jpg',
                    alt: 'Urbano Monte’s 1587 planisphere, a circular world map drawn from the north pole outward.',
                },
            },
        },
        canvasId: LANDING.map,
        config: bare(),
    },
    {
        name: 'Thumbnail gallery strip',
        group: 'Image Features',
        what: 'Every canvas as a strip to move between them.',
        material: 'Eleven plates, prints and paintings',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'Every canvas as a thumbnail strip',
            firstCanvas: { width: 3645, height: 5267 },
        },
        canvasId: LANDING.plate,
        config: showing({
            gallery: { open: true, expanded: false, dockPosition: 'bottom' },
        }),
    },
    {
        name: 'Book view',
        group: 'Image Features',
        what: 'Show two canvases at once as a book spread.',
        material: 'Eleven plates, prints and paintings',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'Canvases paired as facing pages',
            firstCanvas: { width: 2928, height: 2469 },
            reserve: { width: 2928 * 2, height: 2469 },
        },
        canvasId: LANDING.verso,
        config: showing({ viewingMode: 'paged' }),
    },
    {
        name: 'Continuous scroll',
        group: 'Image Features',
        what: 'All canvases in a continuous scroll',
        material: 'Eleven plates, prints and paintings',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'Canvases as one continuous strip',
            firstCanvas: { width: 2802, height: 4000 },
        },
        canvasId: LANDING.middle,
        config: showing({ viewingMode: 'continuous' }),
    },
    {
        name: 'Right to left',
        group: 'Image Features',
        what: 'Canvases read from right to left',
        material: 'A playbill for the Chikugo Theater, Osaka, 1849',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0010-book-2-viewing-direction/manifest-rtl.json',
            canvases: 5,
            label: 'Material read from right to left',
            firstCanvas: { width: 3497, height: 4823 },
        },
        config: showing({}),
    },
    {
        name: 'Alternative order of canvases',
        group: 'Image Features',
        what: 'The same eleven plates in a second order the manifest declares.',
        material: 'Eleven plates, prints and paintings, twice over',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/sequences/manifest.json',
        },
        example: {
            manifest: '/material/sequences/manifest.json',
            canvases: LANDING.canvases,
            label: 'Two orders declared for one set of canvases',
            firstCanvas: { width: 3645, height: 5267 },
        },
        config: showing({
            toolbarOpen: true,
            openMenu: 'sequence',
            gallery: { open: true, expanded: false, dockPosition: 'bottom' },
        }),
    },
    {
        name: 'Table of contents',
        group: 'Image Features',
        what: 'Navigate to canvases via the table of contents.',
        material: 'Ethiopic Ms 10',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0024-book-4-toc/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0024-book-4-toc/manifest.json',
            canvases: 6,
            label: 'A volume’s own table of contents',
            firstCanvas: { width: 1768, height: 2504 },
        },
        config: showing({ structures: { open: true } }),
    },
    {
        name: 'Start canvas',
        group: 'Image Features',
        what: 'Open on the canvas specified by the manifest instead of the first one.',
        material: 'John James Audubon, Snowy Owl (Plate 121), 1831',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/start/manifest.json',
        },
        example: {
            manifest: '/material/start/manifest.json',
            canvases: LANDING.canvases,
            label: 'A manifest that names the canvas to open on',
            firstCanvas: { width: 5230, height: 7884 },
        },
        config: showing({}),
    },
    {
        name: 'Collection',
        group: 'Image Features',
        what: 'Four volumes in one collection, moved between in place.',
        material: 'Eleven plates, gathered into four volumes by subject',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/collection/collection.json',
        },
        example: {
            manifest: '/material/collection/collection.json',
            canvases: 4,
            label: 'The manifests inside one collection',
            firstCanvas: { width: 3645, height: 5267 },
        },
        config: showing({
            collection: { open: true },
            gallery: { open: true, expanded: false, dockPosition: 'bottom' },
        }),
    },
    {
        name: 'Alternative images',
        group: 'Image Features',
        what: 'Natural light or x-ray of the same painting, switched in the bar.',
        material: 'John Dee performing an experiment before Queen Elizabeth I',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0033-choice/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0033-choice/manifest.json',
            canvases: 1,
            label: 'Two images of the same page to choose between',
            firstCanvas: { width: 2000, height: 1271 },
        },
        config: showing({ toolbarOpen: true }),
    },
    {
        name: 'Composite image',
        group: 'Image Features',
        what: 'Two images painted onto one canvas: a cut-out illustration, reconstructed.',
        material: 'Folio from Grandes Chroniques de France, ca. 1460',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0036-composition-from-multiple-images/manifest.json',
            canvases: 1,
            label: 'One canvas painted from two photographs',
            firstCanvas: { width: 7216, height: 5412 },
        },
        config: showing({}),
    },
    {
        name: 'Captions in two languages',
        group: 'Sound and Video Features',
        what: 'Video with captions available in multiple languages.',
        material: NEWSREEL.material,
        source: NEWSREEL.source,
        example: {
            manifest: NEWSREEL.manifest,
            canvases: NEWSREEL.canvases,
            label: 'Caption tracks in more than one language',
            firstCanvas: NEWSREEL.firstCanvas,
        },
        config: showing({ toolbarOpen: true, openMenu: 'captions' }),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Sound with waveform',
        group: 'Sound and Video Features',
        what: 'Display a zoomable waveform provided by the manifest.',
        material: 'The Lost Chord, on an Edison “Perfected” cylinder, 1888',
        source: SOUND.source,
        example: {
            manifest: SOUND.manifest,
            canvases: SOUND.canvases,
            label: 'A recording drawn as a waveform',
            firstCanvas: { width: 1000, height: 160 },
        },
        canvasId: SOUND.cylinder,
        config: showing({}),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Chapters in a recording',
        group: 'Sound and Video Features',
        what: 'Zoomable cover image and chapters for audio.',
        material: MARCHES,
        source: SOUND.source,
        example: {
            manifest: SOUND.manifest,
            canvases: SOUND.canvases,
            label: 'A recording divided into chapters',
            firstCanvas: { width: 797, height: 1000 },
        },
        canvasId: SOUND.marches,
        config: showing({ structures: { open: true } }),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Video/audio transcription',
        group: 'Sound and Video Features',
        what: 'Transcription with clickable timestamps.',
        material: NEWSREEL.material,
        source: NEWSREEL.source,
        example: {
            manifest: NEWSREEL.manifest,
            canvases: NEWSREEL.canvases,
            label: 'A transcript beside the film it belongs to',
            firstCanvas: NEWSREEL.firstCanvas,
        },
        config: showing({ toolbarOpen: true, plugins: { av: { open: true } } }),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Time-based text annotations',
        group: 'Sound and Video Features',
        what: 'Clickable timestamped notes for audio or video.',
        material: MARCHES,
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/timed/manifest.json',
        },
        example: {
            manifest: '/material/timed/manifest.json',
            canvases: 1,
            label: 'Timed notes listed beside the recording',
            firstCanvas: { width: 797, height: 1000 },
        },
        config: showing({ toolbarOpen: true, plugins: { av: { open: true } } }),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Placeholder image',
        group: 'Sound and Video Features',
        what: 'A still image to display until playing video.',
        material: 'Donizetti, L’elisir d’amore, Indiana University',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0013-placeholderCanvas/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0013-placeholderCanvas/manifest.json',
            canvases: 1,
            label: 'A film standing behind its poster frame',
            firstCanvas: { width: 640, height: 360 },
        },
        config: showing({}),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Start at a specific time',
        group: 'Sound and Video Features',
        what: 'Start playback at a specific time within the media.',
        material: MARCHES,
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/moment/manifest.json',
        },
        example: {
            manifest: '/material/moment/manifest.json',
            canvases: 2,
            label: 'A manifest that names the second to open at',
            firstCanvas: { width: 797, height: 1000 },
        },
        config: showing({}),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Media format choice',
        group: 'Sound and Video Features',
        what: 'Defaults to the first option supported by the current browser.',
        material: 'Excerpt from Egbe Iyawo, Kabba Division, Kwara State',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0434-choice-av/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0434-choice-av/manifest.json',
            canvases: 1,
            label: 'A recording offered in several formats at once',
            firstCanvas: { width: 1000, height: 160 },
        },
        config: showing({ toolbarOpen: true }),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Simple rectangle annotation',
        group: 'Notes and text',
        what: 'Annotation text in multiple languages, with connector to target.',
        material: 'Koto, chess, calligraphy, and painting',
        source: {
            who: 'The IIIF Cookbook',
            href: 'https://iiif.io/api/cookbook/recipe/0346-multilingual-annotation-body/manifest.json',
        },
        example: {
            manifest:
                'https://iiif.io/api/cookbook/recipe/0346-multilingual-annotation-body/manifest.json',
            canvases: 1,
            label: 'A note anchored to part of a painting',
            firstCanvas: { width: 8800, height: 3966 },
        },
        config: showing({ annotations: { open: true } }),
        drive: (viewer) => viewer.setActiveAnnotationId(NOTE_ID),
    },
    {
        name: 'Polygon annotation',
        group: 'Notes and text',
        what: 'An outline traced around the bread basket.',
        material: 'Johannes Vermeer, The Milkmaid, ca. 1660',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/outline/manifest.json',
        },
        example: {
            manifest: '/material/outline/manifest.json',
            canvases: 1,
            label: 'A note anchored to a shape, not a box',
            firstCanvas: { width: 4649, height: 5177 },
        },
        config: showing({ annotations: { open: true } }),
        drive: (viewer) =>
            viewer.setActiveAnnotationId('/material/outline/annotation/basket'),
    },
    {
        name: 'Point annotation',
        group: 'Notes and text',
        what: 'A single point, no bounding box or outline.',
        material:
            'Andreas Cellarius, Scenographia Systematis Copernicani (Plate 5), 1661',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/point/manifest.json',
        },
        example: {
            manifest: '/material/point/manifest.json',
            canvases: 1,
            label: 'A note anchored to a point, not a region',
            firstCanvas: { width: 2928, height: 2469 },
        },
        config: showing({ annotations: { open: true } }),
        drive: (viewer) =>
            viewer.setActiveAnnotationId('/material/point/annotation/sun'),
    },
    {
        name: 'Annotations on the whole canvas',
        group: 'Notes and text',
        what: 'Text comment and two tags, all targeting the entire canvas.',
        material:
            'Anna Atkins, Dictyota dichotoma, in the young state and in fruit',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/tags/manifest.json',
        },
        example: {
            manifest: '/material/tags/manifest.json',
            canvases: 1,
            label: 'Tags and a whole-canvas note, listed together',
            firstCanvas: { width: 3266, height: 4000 },
        },
        config: showing({ annotations: { open: true } }),
    },
    {
        name: 'Annotations from a server',
        group: 'Notes and text',
        what: 'Render linked annotations from an annotation server.',
        material: 'Aleppo Codex, Deuteronomy page P. 2-5-v, 10th century',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/referenced/manifest.json',
        },
        example: {
            manifest: '/material/referenced/manifest.json',
            canvases: 1,
            label: 'Notes fetched from the page the canvas names',
            firstCanvas: { width: 3377, height: 3963 },
        },
        config: showing({ annotations: { open: true } }),
        drive: (viewer) =>
            viewer.setActiveAnnotationId(
                '/material/referenced/annotation/column-right',
            ),
    },
    {
        name: 'IIIF Content Search',
        group: 'Notes and text',
        what: 'Supports versions 2.0, 1.0, and 0.9 of the content search API.',
        material: 'Fritz Bolle, Wunder der Vererbung',
        source: {
            who: 'Wellcome Collection',
            href: 'https://iiif.wellcomecollection.org/presentation/b18035723',
        },
        example: {
            manifest:
                'https://iiif.wellcomecollection.org/presentation/b18035723',
            canvases: 36,
            label: 'A search run against the material’s own text',
            firstCanvas: { width: 2411, height: 3372 },
        },
        canvasId:
            'https://iiif.wellcomecollection.org/presentation/b18035723/canvases/b18035723_0005.JP2',
        config: showing({ search: { open: true, query: 'Vererbung' } }),
    },
    {
        name: 'IIIF resource metadata',
        group: 'Metadata',
        what: 'Metadata at the collection, manifest, and canvas levels.',
        material: 'Ernst Haeckel, Discomedusae (Plate 8), 1904',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/links/manifest.json',
        },
        example: {
            manifest: '/material/links/manifest.json',
            canvases: 1,
            label: 'A manifest’s links out to the record and the files',
            firstCanvas: { width: 3645, height: 5267 },
        },
        config: showing({ information: { open: true } }),
        themeConfig: { metadataPanelBg: 'var(--bench)' },
    },
    {
        name: 'Multilingual metadata',
        group: 'Metadata',
        what: 'Switch between languages provided by the manifest.',
        material: 'Three paintings, cataloged in several languages',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/multilingual/manifest.json',
        },
        example: {
            manifest: '/material/multilingual/manifest.json',
            canvases: 3,
            label: 'A manifest cataloged in several languages',
            firstCanvas: { width: 1335, height: 1908 },
        },
        config: showing({
            toolbarOpen: true,
            information: { open: true },
            openMenu: 'locale',
        }),
        themeConfig: { metadataPanelBg: 'var(--bench)' },
    },
    {
        name: 'Gracefully handle missing images',
        group: 'Metadata',
        what: 'A canvas the server has no picture for, still counted and navigable.',
        material: 'A plate, and a leaf whose image is missing',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/missing/manifest.json',
        },
        example: {
            manifest: '/material/missing/manifest.json',
            canvases: 2,
            label: 'A canvas whose image is not on the server',
            firstCanvas: { width: 3645, height: 5267 },
        },
        canvasId: '/material/missing/canvas/plate-9',
        config: showing({}),
    },
    {
        name: 'Drag and drop IIIF content state',
        group: 'Metadata',
        what: 'Drag either chip onto the viewer.',
        material: 'Johannes Vermeer, The Milkmaid, ca. 1660',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'A view carried in as a IIIF Content State',
            firstCanvas: { width: 4649, height: 5177 },
        },
        canvasId: '/material/landing/canvas/milkmaid',
        config: showing({}),
        dragPayloads: [
            {
                label: 'The bread basket',
                state: {
                    id: '/material/landing/content-state/milkmaid-basket',
                    canvasId:
                        '/material/landing/canvas/milkmaid#xywh=351,3243,1055,751',
                    manifestId: '/material/landing/manifest.json',
                },
            },
            {
                label: 'Another manifest entirely',
                state: {
                    id: '/material/multilingual/content-state/hiroshige',
                    canvasId: '/material/multilingual/canvas/hiroshige',
                    manifestId: '/material/multilingual/manifest.json',
                },
                carries: {
                    example: {
                        manifest: '/material/multilingual/manifest.json',
                        canvases: 3,
                        label: 'A manifest carried in as a IIIF Content State',
                        firstCanvas: { width: 1335, height: 1908 },
                    },
                    material:
                        'Utagawa Hiroshige, Sudden Shower over Shin-Ōhashi Bridge and Atake, 1857',
                    source: {
                        who: 'this site’s own public-domain set',
                        href: '/material/multilingual/manifest.json',
                    },
                },
            },
        ],
    },
    {
        name: 'Image modification plugin',
        group: 'First Party Plugins',
        what: 'Adjust brightness, contrast, saturation, invert colors, or make grayscale.',
        material: 'Ernst Haeckel, Discomedusae (Plate 8), 1904',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'Image tools added by a plugin',
            firstCanvas: { width: 3645, height: 5267 },
        },
        canvasId: LANDING.plate,
        config: showing({
            toolbarOpen: true,
            plugins: { 'image-manipulation': { open: true } },
        }),
        plugin: async () =>
            (await import('@triiiceratops/plugin-image-manipulation'))
                .ImageManipulationPlugin as unknown as SitePlugin,
    },
    {
        name: 'PDF export plugin',
        group: 'First Party Plugins',
        what: 'OCR text carried as annotations, rendered as selectable text.',
        material: 'Two plates, with their printed lines transcribed',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/ocr/manifest.json',
        },
        example: {
            manifest: '/material/ocr/manifest.json',
            canvases: 2,
            label: 'A range of canvases exported as one PDF',
            firstCanvas: { width: 3645, height: 5267 },
        },
        config: showing({
            toolbarOpen: true,
            plugins: { 'pdf-export': { open: true } },
        }),
        plugin: PDF_PLUGIN,
    },
    {
        name: 'Image download plugin',
        group: 'First Party Plugins',
        what: 'Download the canvas, which may hold one or more images.',
        material: 'Ernst Haeckel, Discomedusae (Plate 8), 1904',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'A canvas offered for download at its own resolutions',
            firstCanvas: { width: 3645, height: 5267 },
        },
        canvasId: LANDING.plate,
        config: showing({
            toolbarOpen: true,
            plugins: { 'image-download': { open: true } },
        }),
        plugin: IMAGE_DOWNLOAD_PLUGIN,
    },
    {
        name: 'Annotation editor plugin',
        group: 'First Party Plugins',
        what: 'Draw a region — box, ellipse, outline or point — and write a note on it.',
        material: 'Ernst Haeckel, Discomedusae (Plate 8), 1904',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'Regions drawn on a canvas by a plugin',
            firstCanvas: { width: 3645, height: 5267 },
        },
        canvasId: LANDING.plate,
        config: showing({
            toolbarOpen: true,
            plugins: { 'annotation-editor': { open: true } },
        }),
        plugin: async () =>
            (await import('@triiiceratops/plugin-annotation-editor'))
                .AnnotationEditorPlugin as unknown as SitePlugin,
    },
];
