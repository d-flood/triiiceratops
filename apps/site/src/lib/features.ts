/**
 * The features `/handles/` shows, each declared once with the material that
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

import type { Example } from './examples';
import type { SitePlugin } from './sitePlugins';
import type { ViewerConfig } from './viewerConfig';

/**
 * The headings the rail runs under, in order. A feature names the one it
 * belongs to, and the rail rules between them.
 *
 * The last two divide by who decided the thing being shown. A publisher writes
 * a manifest and the viewer obeys it; a host registers a plugin or names a
 * locale and the viewer obeys that instead. The audio and video features stay
 * under their own heading even though a plugin renders them, because what a
 * reader is looking at there is the material rather than the package.
 */
export const FEATURE_GROUPS = [
    'Moving through the material',
    'Sound and video',
    'Notes and text',
    'What the publisher declares',
    'What the host application adds',
] as const;

export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

export type Feature = {
    /** The feature, named for itself. */
    readonly name: string;
    /** The rail heading this feature sits under. */
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
    /** The content state itself, as the JSON a IIIF drop carries. */
    readonly state: unknown;
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
    // Named for the same reason the panels are, and more sharply: one feature
    // asks for the chrome in German, and the viewer follows a config leaf until
    // another names a different one. Left out here, that feature's German would
    // stand for every feature picked after it.
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
        name: 'Deep zoom on a canvas',
        group: 'Moving through the material',
        what: 'Nearly four billion pixels, tiled: zoom until single ships show.',
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
        name: 'Thumbnail strip',
        group: 'Moving through the material',
        what: 'Every canvas as a strip along the foot, to move between them.',
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
        name: 'Two-page openings',
        group: 'Moving through the material',
        what: 'Leaves paired as facing pages, turned an opening at a time.',
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
        group: 'Moving through the material',
        what: 'One strip of canvases, scrolled through rather than paged.',
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
        group: 'Moving through the material',
        what: 'The book runs the way it was bound: the next opening is left.',
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
        name: 'Another order for the leaves',
        group: 'Moving through the material',
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
        group: 'Moving through the material',
        what: 'The volume’s own divisions; each entry goes to the leaf it names.',
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
        name: 'Opens where the publisher says',
        group: 'Moving through the material',
        what: 'The same eleven plates, arriving at the one the manifest names.',
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
        name: 'A whole collection',
        group: 'Moving through the material',
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
        name: 'Video, with captions',
        group: 'Sound and video',
        what: 'A newsreel plays in the canvas, its captions burnt in by the viewer.',
        material: NEWSREEL.material,
        source: NEWSREEL.source,
        example: {
            manifest: NEWSREEL.manifest,
            canvases: NEWSREEL.canvases,
            label: 'A captioned film in the canvas',
            firstCanvas: NEWSREEL.firstCanvas,
        },
        // The bar's tool group opens so the captions control is beside the film
        // it belongs to; which track is showing is `captionsOn`'s to say, and
        // the list of tracks to choose between is the next feature's subject.
        config: showing({ toolbarOpen: true }),
        captionsOn: true,
        plugin: AV_PLUGIN,
    },
    {
        name: 'Captions in two languages',
        group: 'Sound and video',
        what: 'The same film, with its caption tracks listed to choose between.',
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
        name: 'Sound, with its waveform',
        group: 'Sound and video',
        what: 'An 1888 cylinder drawn as a timeline the viewer’s zoom sharpens.',
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
        group: 'Sound and video',
        what: 'Four marches under one cover photograph, the contents seeking between them.',
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
        name: 'A transcript you can click into',
        group: 'Sound and video',
        what: 'The film’s caption cues as a list; a line seeks the playhead to it.',
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
        name: 'Notes pinned to the recording',
        group: 'Sound and video',
        what: 'Four notes, each at its own second; clicking one seeks to it.',
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
        name: 'A poster before it plays',
        group: 'Sound and video',
        what: 'A still stands in the frame until somebody asks for the film.',
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
        // The one feature whose material being enormous is the argument: a
        // two-hour opera stands behind this canvas, and what a reader is shown
        // is a 640×360 still. A placeholder Canvas is how a publisher says
        // "show this until somebody asks for the film", and it is only legible
        // where the film is something nobody wants by accident.
        //
        // Picking it costs about 6 MB, which is the media element's own
        // `preload="metadata"` reading the head of a 936 MB file — not the
        // film, and the same order as the newsreel three features above
        // already fetch whole. Nothing here can lower it: `preload` is the
        // plugin's, and a poster is what saves the rest.
        //
        // Audio cannot carry this feature, which is why it is not on the sound
        // set. There the photograph is an `accompanyingCanvas` and stays for
        // the whole of playback, which is the better treatment for a recording
        // with nothing to look at — republishing it as a placeholder only made
        // that canvas worse.
        config: showing({}),
        plugin: AV_PLUGIN,
    },
    {
        name: 'Opens at the moment named',
        group: 'Sound and video',
        what: 'Not a leaf but a second: the playhead arrives inside a march.',
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
        name: 'Whichever format will play',
        group: 'Sound and video',
        what: 'One recording published six ways; the one this browser plays is taken.',
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
        name: 'Annotations',
        group: 'Notes and text',
        what: 'A note in two languages, selected, tied to the part it marks.',
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
        name: 'A note that is not a rectangle',
        group: 'Notes and text',
        what: 'An outline traced around the bread basket, and the note it carries.',
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
        name: 'A note pinned to a point',
        group: 'Notes and text',
        what: 'Not a box and not an outline: one point on the plate, marked.',
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
        name: 'Tags, and a note on the leaf',
        group: 'Notes and text',
        what: 'Two tags as badges, and a note that marks no region at all.',
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
        name: 'Notes kept in another file',
        group: 'Notes and text',
        what: 'The canvas names a page of notes; the viewer goes and gets it.',
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
        name: 'Search inside the text',
        group: 'Notes and text',
        what: 'A word looked up in the library’s own transcription, hit by hit.',
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
        name: 'Catalog metadata',
        group: 'What the publisher declares',
        what: 'The label, the summary and the fields, as published.',
        material: 'Ernst Haeckel, Discomedusae (Plate 8), 1904',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'The material’s own catalog entry',
            firstCanvas: { width: 3645, height: 5267 },
        },
        canvasId: LANDING.plate,
        config: showing({ information: { open: true } }),
        // The entry would otherwise sit near-white on the stage: the panel
        // inherits the paper every panel wears, and here it floats over cream.
        themeConfig: { metadataPanelBg: 'var(--bench)' },
    },
    {
        name: 'The languages it is written in',
        group: 'What the publisher declares',
        what: 'Every field in four languages, and the picker that switches them.',
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
        name: 'Links out of the viewer',
        group: 'What the publisher declares',
        what: 'The record it came from, the data behind it, the file to take away.',
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
        name: 'Alternative images',
        group: 'What the publisher declares',
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
        name: 'One canvas from several images',
        group: 'What the publisher declares',
        what: 'A folio photographed in two halves, placed as one leaf.',
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
        name: 'A leaf whose image is missing',
        group: 'What the publisher declares',
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
        name: 'Published as the older IIIF',
        group: 'What the publisher declares',
        what: 'A Presentation 2.1 document: sequences, images, older spellings.',
        material: 'Three plates, described in IIIF Presentation 2.1',
        source: {
            who: 'this site’s own public-domain set',
            href: '/material/presentation2/manifest.json',
        },
        example: {
            manifest: '/material/presentation2/manifest.json',
            canvases: 3,
            label: 'A manifest written in the older Presentation vocabulary',
            firstCanvas: { width: 1335, height: 1908 },
        },
        // The information panel, because the difference between the two
        // versions is all in the description: `description`, `attribution` and
        // `license` where 3.0 has `summary`, `requiredStatement` and `rights`.
        config: showing({ information: { open: true } }),
        themeConfig: { metadataPanelBg: 'var(--bench)' },
    },
    {
        name: 'Dragged in from outside',
        group: 'What the publisher declares',
        what: 'Drag either chip onto the viewer: one names a region, one a whole manifest.',
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
        // Two chips because a content state carries two different sizes of
        // thing, and only the second shows the interesting half: a region names
        // where to look inside material the stage already has, while a manifest
        // names material it does not — so the stage has to fetch it, credit it,
        // and reserve a box shaped like its first canvas. Either chip dropped
        // while the other's material is showing carries the stage back.
        dragPayloads: [
            {
                label: 'The bread basket',
                state: {
                    '@context':
                        'http://iiif.io/api/presentation/3/context.json',
                    id: '/material/landing/content-state/milkmaid-basket',
                    type: 'Annotation',
                    motivation: ['contentState'],
                    target: '/material/landing/canvas/milkmaid#xywh=351,3243,1055,751',
                    partOf: {
                        id: '/material/landing/manifest.json',
                        type: 'Manifest',
                    },
                },
            },
            {
                label: 'Another manifest entirely',
                state: {
                    '@context':
                        'http://iiif.io/api/presentation/3/context.json',
                    id: '/material/multilingual/content-state/hiroshige',
                    type: 'Annotation',
                    motivation: ['contentState'],
                    target: '/material/multilingual/canvas/hiroshige',
                    partOf: {
                        id: '/material/multilingual/manifest.json',
                        type: 'Manifest',
                    },
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
        name: 'Image tools, from a plugin',
        group: 'What the host application adds',
        what: 'Brightness, contrast and rotation, added by a separate package.',
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
        name: 'Pages taken away as a PDF',
        group: 'What the host application adds',
        what: 'A range of leaves as one PDF, the printed lines selectable.',
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
        name: 'The leaf downloaded as an image',
        group: 'What the host application adds',
        what: 'The sizes a level-0 service will actually answer, and no others.',
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
        name: 'A viewer in another language',
        group: 'What the host application adds',
        what: 'The viewer’s own words in German, asked for by the page.',
        material: 'Ernst Haeckel, Discomedusae (Plate 8), 1904',
        source: LANDING.source,
        example: {
            manifest: LANDING.manifest,
            canvases: LANDING.canvases,
            label: 'The viewer’s chrome rendered in German',
            firstCanvas: { width: 3645, height: 5267 },
        },
        canvasId: LANDING.plate,
        // The material is written in one language, which is the point: this is
        // the CHROME's language, not the manifest's, and the two are separate
        // settings. The viewing-mode menu stands open because it is the
        // longest run of the viewer's own words the bar can show at once.
        config: showing({
            locale: 'de',
            toolbarOpen: true,
            openMenu: 'viewing-mode',
        }),
    },
];
