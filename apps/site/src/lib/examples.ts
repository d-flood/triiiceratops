/**
 * The example material embedded viewers run on.
 *
 * Two tiers, kept apart on purpose. This is the first: the repository's own
 * manifest set, copied into `static/material/` so a page costs one same-origin
 * request rather than a round trip to somebody else's IIIF server. The second —
 * public-domain material tiled for fast first paint — replaces it as a tracked
 * swap, and must not drift into demonstrating range instead.
 *
 * `firstCanvas` is what the hero prerenders while the renderer starts: the image
 * the first canvas is painted by, at its own pixel dimensions. They are the
 * canvas dimensions too, which is what lets the reserved box and the image agree
 * on one aspect ratio and hold layout still.
 */

export type Example = {
    /** Manifest URL within this site. */
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
    readonly firstCanvas: {
        readonly src: string;
        readonly width: number;
        readonly height: number;
        readonly alt: string;
    };
};

export const HERO_EXAMPLE: Example = {
    manifest: '/material/plate/manifest.json',
    canvases: 2,
    label: 'Reference plate',
    firstCanvas: {
        src: '/material/plate/plate.png',
        width: 1200,
        height: 900,
        alt: 'The first canvas of the example manifest, a numbered reference grid.',
    },
};
