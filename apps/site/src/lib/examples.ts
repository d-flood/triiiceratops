/**
 * The example material embedded viewers run on.
 *
 * Two tiers, kept apart on purpose. This is the first: locally served material
 * behind level-0 Image API services, chosen for visual variety and deep zoom.
 *
 * The second tier is the repository's own manifest set in `static/material/`,
 * which the builder falls back to and the drag-and-drop screens use; it
 * demonstrates shapes, not speed.
 *
 * The material that demonstrates range is a third thing again, and lives in
 * `materialClasses.ts`: it is somebody else's, it is fetched from their server,
 * and neither tier here may be spent on it.
 */

export type Example = {
    /** Where the manifest is fetched from. */
    readonly manifest: string;
    /**
     * How many canvases the manifest has.
     *
     * The prerendered chrome shows the reader where they are in the material,
     * and it has to say so before the manifest has been fetched.
     */
    readonly canvases: number;
    /** Named for a reader, not for the fixture it came from. */
    readonly label: string;
    /**
     * The shape the box reserves, where that is not the first canvas's own.
     *
     * A paged arrangement shows an opening, two canvases wide, and a box shaped
     * like one of them letterboxes it into a third of its own height. A shape
     * declared here is also gentler than a folio's own: a page much taller than
     * it is wide would give an embed a box taller than the screen.
     *
     * It is what sizes every embed, and what sizes the hero at the widths where
     * the band has no height of its own to give it.
     */
    readonly reserve?: {
        readonly width: number;
        readonly height: number;
    };
    /**
     * The first canvas's own pixel dimensions, which are what the reserved box
     * takes its aspect ratio from unless `reserve` says otherwise.
     */
    readonly firstCanvas: {
        readonly width: number;
        readonly height: number;
        /**
         * The image painted into the reserved box until the renderer has
         * something to show.
         *
         * Same-origin only. This is the one image on the page's own critical
         * path, so it is served from `static/` even where the manifest and the
         * tiles are not: a cross-origin first paint would spend a connection
         * setup on the request the deferral exists to protect.
         */
        readonly prerender?: {
            readonly src: string;
            readonly alt: string;
        };
    };
};

/**
 * The locally tiled visual study set.
 */
export const HERO_EXAMPLE: Example = {
    manifest: '/material/landing/manifest.json',
    canvases: 11,
    label: 'Public-domain visual study set',
    /*
     * Close to the folio's own 5:6, rather than the landscape frame the hero
     * used to sit a portrait page inside. The hero's band now declares its own
     * height, so this shape is what the box takes below that band's width —
     * where the column is narrow enough that a nearly-square folio is the right
     * thing to reserve, and letterboxing it inside a landscape box would waste
     * a third of a phone's screen.
     */
    reserve: {
        width: 1200,
        height: 1400,
    },
    firstCanvas: {
        width: 3645,
        height: 5267,
        prerender: {
            src: '/material/landing/images/haeckel/0,0,3645,5267/228,330/0/default.jpg',
            alt: 'Plate 8 from Ernst Haeckel’s Kunstformen der Natur, showing jellyfish with coral, ochre, and aqua anatomy.',
        },
    },
};
