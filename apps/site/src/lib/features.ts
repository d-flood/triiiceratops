/**
 * The features `/features/` shows, each declared once with the material that
 * exercises it.
 *
 * The page answers one question — what can this viewer actually do — by doing
 * it. So a feature is named plainly, for the thing itself, and every entry
 * carries whatever the running viewer needs in order to stand with that one
 * feature open in front of the reader: the manifest that has it, the canvas
 * worth opening on, the arrangement the stage takes, and the odd command no
 * config leaf expresses.
 *
 * This is not the recipe matrix and must never become one. Compliance is
 * claimed in exactly one place, `@triiiceratops/cookbook`, and nothing here
 * carries a recipe number, a support status or a comparison.
 *
 * Material is this site's own wherever a feature can be shown with it, because
 * it is served from this origin behind pre-cut tiles and arrives in a fraction
 * of the time somebody else's endpoint takes. Where a feature needs a property
 * the front page's set does not declare, the set is republished under an id
 * space of its own with that one property added, by
 * `scripts/generate-feature-material.mjs`. The rest need something this site
 * has no way to serve — a right-to-left codex, an OCR search service, a
 * collection, a film, a recording published in six formats — and those run on
 * the publisher's own server, which is the honest way to show them and the
 * reason the page fetches only the feature showing.
 *
 * `firstCanvas` is the opening canvas's own declared dimensions, recorded here
 * so the reserved box has an aspect ratio before anything has been fetched.
 */

import type { ThemeConfig, ViewerState } from 'triiiceratops';

import type { DragTarget } from './dragSource';
import type { Example } from './examples';
import type { SitePlugin } from './sitePlugins';
import type { ViewerConfig } from './viewerConfig';

/**
 * The kinds of feature the rail is divided into, in order. A feature names the
 * one it belongs to, and the rail shows one kind at a time.
 *
 * The last two divide by who decided the thing being shown. A publisher writes
 * a manifest and the viewer obeys it; a host registers a plugin and the viewer
 * obeys that instead. The audio and video features stay under their own
 * heading even though a plugin renders them, because what a reader is looking
 * at there is the material rather than the package.
 */
export const FEATURE_GROUPS = [
    'Image Features',
    'Sound and Video Features',
    'Notes and text',
    'Metadata',
    'First Party Plugins',
] as const;

export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

/**
 * What each kind is called on the rail's tab strip.
 *
 * Shorter than the group's own name because a tab is read at a glance and five
 * of them share the width of the rail: the strip is the navigation, and the
 * word that distinguishes one kind from the next is the whole of what it has
 * to carry.
 */
export const FEATURE_GROUP_TABS: Record<FeatureGroup, string> = {
    'Image Features': 'Images',
    'Sound and Video Features': 'Sound & video',
    'Notes and text': 'Notes & text',
    Metadata: 'Metadata',
    'First Party Plugins': 'Plugins',
};

export type Feature = {
    /** The feature, named for itself. */
    readonly name: string;
    /** The rail tab this feature sits under. */
    readonly group: FeatureGroup;
    /** What the reader is about to see, in one clause. */
    readonly what: string;
    /** The material it runs on, as its publisher labels it. */
    readonly material: string;
    /** Who publishes that material, and where the manifest a reader can open lives. */
    readonly source: { readonly who: string; readonly href: string };
    readonly example: Example;
    /**
     * The canvas the stage opens on, where the feature lives on one in
     * particular. Unset means the manifest's first.
     */
    readonly canvasId?: string;
    /**
     * The arrangement the stage takes: the route's one shared chrome with this
     * feature switched on. Built by `showing` below, so the shared part cannot
     * drift between features — what a reader notices is the feature, never the
     * configuration.
     */
    readonly config: ViewerConfig;
    /**
     * Tokens layered over the site's own inside this feature's viewer, for
     * presentation no config leaf expresses — here, the metadata panel's
     * ground. The rounded chrome is the whole route's, not one feature's, so no
     * feature sets a radius.
     */
    readonly themeConfig?: ThemeConfig;
    /**
     * The plugin this feature is about, loaded only once the feature is picked.
     *
     * A reader who never asks for the image tools never downloads them, which
     * is the same deferral the viewer itself is under on this page.
     */
    readonly plugin?: () => Promise<SitePlugin>;
    /**
     * What this feature does to the running viewer that no config leaf says.
     *
     * Config opens the feature; this puts the reader in front of it — the
     * annotated material selects its note, which is what draws the line from
     * the note to the part of the painting it is about. Called once the
     * feature's own manifest has loaded, because everything worth driving is
     * named in it.
     */
    readonly drive?: (viewer: ViewerState) => void;
    /**
     * Show the canvas's first caption track as soon as one has loaded.
     *
     * Not a config leaf and not `drive`'s business: captions start off in every
     * viewer, and a track joins the offered set only once its file has parsed
     * with cues in it — which happens on the network's own schedule, long after
     * the manifest this feature's `drive` waits for. So this is a standing wish
     * the stage settles when the plugin can honour it, through the caption
     * members of the plugin's published AVState.
     */
    readonly captionsOn?: boolean;
    /**
     * IIIF Content States this feature offers the reader to drag onto the
     * viewer beside it.
     *
     * The one feature a reader has to do something to see: a link that opens a
     * region can be described, but a payload dragged out of the page and onto a
     * viewer is only believable when the two are on screen together.
     */
    readonly dragPayloads?: readonly DragChip[];
};

/** One chip a reader drags onto the stage, and the view it carries. */
export type DragChip = {
    /** What the chip says it is. */
    readonly label: string;
    /** The view the chip's content state names, in this site's own relative ids. */
    readonly state: DragTarget;
    /**
     * The material this state names, for a chip that names a DIFFERENT manifest
     * from the feature's own — which the stage has to load, credit and reserve a
     * box for exactly as it does the feature's.
     *
     * Absent means the feature's own manifest, and then the stage moves the view
     * inside the material it is already showing.
     */
    readonly carries?: {
        readonly example: Example;
        readonly material: string;
        readonly source: { readonly who: string; readonly href: string };
    };
};

/**
 * The chrome every feature shares: one rounded bar rather than a toolbar rail,
 * and the viewer's own panel widths and gallery home everywhere else.
 *
 * Every panel and mode this page ever opens is named here in its shut state,
 * and a feature overrides only its own. The stage is a single viewer instance
 * whose state persists across a switch, and the viewer applies the keys a
 * config names rather than resetting the ones it omits — so a feature that
 * named only its own arrangement would leave the previous one's panel standing
 * open beside it. Naming the whole arrangement makes each selection describe
 * the stage completely, which is what lets a reader see one feature at a time.
 */
const BASE_CONFIG: ViewerConfig = {
    controls: 'unified',
    // The bar's tool group starts collapsed, and a feature whose control lives
    // in that group opens it: an unopened group leaves the control the feature
    // is about behind a hamburger, and a plugin flyout opened behind it has no
    // button to anchor to and paints nowhere.
    toolbarOpen: false,
    // The bar's own parts are named here for the same reason the panels are:
    // the one feature that takes the chrome away would otherwise leave the
    // stage bare for every feature picked after it.
    showToggle: true,
    showCanvasNav: true,
    showZoomControls: true,
    viewingMode: 'individuals',
    // Named for the same reason the panels are: the viewer follows a config
    // leaf until another names a different one, so the route states the
    // chrome's language rather than inheriting whatever the stage was left in.
    locale: 'en',
    gallery: { open: false, expanded: false },
    information: { open: false },
    structures: { open: false },
    annotations: { open: false },
    search: { open: false },
    collection: { open: false },
};

/** The shared chrome with one feature switched on. */
function showing(highlight: ViewerConfig): ViewerConfig {
    return { ...BASE_CONFIG, ...highlight };
}

/**
 * The stage with every control taken away, for the one feature whose subject
 * is the surface rather than anything around it.
 *
 * `split` controls rather than the route's `unified`, which is the one place
 * this page departs from its shared chrome and has to: the unified bar is the
 * toolbar's render site, so it stands whether or not the nav and zoom controls
 * are in it. Split returns the toolbar to its own edge, where a closed rail
 * with no toggle draws nothing, and the bar then renders only if something is
 * left to put in it — which, with these three off, there is not.
 */
function bare(): ViewerConfig {
    return showing({
        controls: 'split',
        showToggle: false,
        showCanvasNav: false,
        showZoomControls: false,
    });
}

/** The front page's material, and where a feature shown on it comes from. */
const LANDING = {
    manifest: '/material/landing/manifest.json',
    canvases: 11,
    source: {
        who: 'this site’s own public-domain set',
        href: '/material/landing/manifest.json',
    },
    /**
     * The plate the features on this manifest open on, named rather than left
     * to the manifest's order. The stage keeps the canvas it was on when the
     * manifest does not change, so a feature that named no canvas would open
     * wherever the previous one left the reader.
     */
    plate: '/material/landing/canvas/haeckel',
    /** The map the deep-zoom feature opens on: 62,079 × 62,160. */
    map: '/material/landing/canvas/monte',
    /**
     * The second plate, for the paged feature: canvas one is a lone recto in
     * every paged arrangement, so opening there would show the reader a single
     * leaf on the feature whose whole point is the pair.
     */
    verso: '/material/landing/canvas/cellarius',
    /**
     * The fifth plate, for the continuous strip: it and both its neighbours are
     * portrait, so the three a desktop shows at once read as one strip with
     * more of it either side — which is the whole of what continuous means.
     * Opening on the first plate would put the reader at an end instead.
     */
    middle: '/material/landing/canvas/shahnama',
} as const;

/** The site's own recordings, and the canvas each sound feature opens on. */
const SOUND = {
    manifest: '/material/sound/manifest.json',
    canvases: 2,
    source: {
        who: 'this site’s own public-domain set',
        href: '/material/sound/manifest.json',
    },
    /**
     * One 1888 cylinder in one file. Duration-only and companionless, so the
     * viewer gives it the whole surface as a timeline.
     */
    cylinder: '/material/sound/canvas/lost-chord',
    /** Four Sousa marches tiling one timeline, under one cover image. */
    marches: '/material/sound/canvas/marine-band',
} as const;

/** The material every feature on the four-march canvas shares. */
const MARCHES = 'Four Sousa marches, United States Marine Band';

/**
 * The Cookbook's captioned newsreel: 65 seconds, and the only Cookbook
 * audiovisual recipe whose media is small enough to fetch on a page that
 * fetches the feature showing. Its captions come in two languages, which is
 * what makes it three features rather than one.
 */
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

/** The AV plugin, which the sound and video features share. */
const AV_PLUGIN = async () =>
    (await import('@triiiceratops/plugin-av'))
        .AvPlugin as unknown as SitePlugin;

/** The two export plugins, each the subject of one feature. */
const PDF_PLUGIN = async () =>
    (await import('@triiiceratops/plugin-pdf-export'))
        .PdfExportPlugin as unknown as SitePlugin;
const IMAGE_DOWNLOAD_PLUGIN = async () =>
    (await import('@triiiceratops/plugin-image-export'))
        .ImageDownloadPlugin as unknown as SitePlugin;

/** The note the annotated material selects, as its manifest names it. */
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
        // Nothing but the surface: the first thing the page shows a reader is
        // the material itself. Every feature after this one arrives with the
        // viewer's own bar, so the bar needs no entry of its own — what this
        // one has to establish is that the material comes first.
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
            // The box is an opening rather than a leaf: two pages side by side
            // is what the reader sees.
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
        // Each canvas here is already a photographed opening, so the reader
        // moves an opening at a time in `individuals`: pairing them again would
        // put two spreads on screen and halve the size of both. No canvas is
        // named — the reader starts at the front cover, where the book itself
        // starts, and the manifest declares it first.
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
        // The strip along the foot is the feature, as much as the picker is: an
        // order is a sequence of leaves, and eleven thumbnails in a row show
        // one where the opening canvas alone cannot. Switching orders reorders
        // the strip in place, which is the whole claim made visible.
        //
        // No canvas named, so each order opens on its own first leaf rather
        // than on one this page chose.
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
        // Named by the manifest's own `start`, so the stage must not name one:
        // a canvas here would be the page overriding the property it is about.
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
            // The opening volume's canvases, not the collection's members: the
            // count the chrome shows is of the material on the stage.
            canvases: 4,
            label: 'The manifests inside one collection',
            // Members carry no `navDate`, so the panel orders them by label and
            // `Botany and zoology` is the volume the stage opens on.
            firstCanvas: { width: 3645, height: 5267 },
        },
        // Both at once, because either alone misreads the feature. The panel
        // lists the manifests; the strip along the foot shows the canvases of
        // the one open. Without the strip, moving between members looks like
        // paging a single manifest — which is the one thing a collection is
        // not — and every member here has several leaves so that the strip
        // has something to say.
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
        // The list belongs to the transport, which the plugin registers into
        // the bar; naming it here is what opens it without a reader hunting.
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
            // The canvas declares a duration and no dimensions, so the viewer
            // lays it out at the shallow box it keeps for bare audio.
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
        // The same panel the caption cues fill, holding the manifest's own
        // timed commentary instead — which is why the panel calls itself Notes
        // here and Transcript there.
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
        // Named by the manifest's own `start`, canvas and second together, so
        // the stage names neither: either would be the page overriding the
        // property it is about. A seek and never a play.
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
            // Duration and no dimensions, like the cylinder: the shallow box
            // the viewer keeps for bare audio.
            firstCanvas: { width: 1000, height: 160 },
        },
        // The bar lists the alternatives exactly as it does an image Choice,
        // with the one the browser can decode already taken — which is the
        // whole of what this feature has to show.
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
        // Nothing to select: every annotation here targets the whole sheet, so
        // the panel listing them IS the feature. Driving a selection would
        // draw an outline around the leaf and suggest the opposite.
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
        // One of the fetched notes selected, because the second request is the
        // feature and a panel that filled itself is the only proof of it.
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
        // The leaf carrying the first hit, named rather than left to the
        // reader: a search whose results are listed over the title page shows
        // the panel working and the material not, and the run is the same
        // either way.
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
        // The picker only appears at all where a manifest carries more than one
        // language, so the entry and the control arrive together.
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
        // Material chosen for what it carries rather than for what it looks
        // like: both plates publish their lines of type as annotations
        // anchored to the region each line occupies, so the PDF this panel
        // makes carries text a reader can select rather than a picture of it.
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
];
