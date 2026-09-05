/**
 * The example material embedded viewers run on.
 *
 * Two tiers, kept apart on purpose. This is the first: the repository's own
 * manifest set, copied into `static/material/` so a page costs one same-origin
 * request rather than a round trip to somebody else's IIIF server. The second —
 * public-domain material tiled for fast first paint — replaces it as a tracked
 * swap, and must not drift into demonstrating range instead.
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
     * The shape the box reserves, where the arrangement shows something other
     * than the first canvas on its own: a paged arrangement shows an opening,
     * two canvases wide, and a box shaped like one of them letterboxes it into
     * a third of its own height. Defaults to `firstCanvas`.
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
         * something to show, at the canvas's own dimensions.
         *
         * Only for material this site serves itself. An embed running somebody
         * else's manifest has nothing here: prerendering it would put a request
         * to their server on this page's own load, which is exactly what the
         * deferral exists to avoid.
         */
        readonly prerender?: {
            readonly src: string;
            readonly alt: string;
        };
    };
};

export const HERO_EXAMPLE: Example = {
    manifest: '/material/plate/manifest.json',
    canvases: 2,
    label: 'Reference plate',
    firstCanvas: {
        width: 1200,
        height: 900,
        prerender: {
            src: '/material/plate/plate.png',
            alt: 'The first canvas of the example manifest, a numbered reference grid.',
        },
    },
};
