/**
 * Gallery thumbnail geometry.
 *
 * `gallery.fixedHeight` is the height of a thumbnail's image frame, and it means
 * exactly that in every gallery view. A thumbnail renders the same way wherever it
 * appears: the frame is `fixedHeight` tall and as wide as the image itself at that
 * height, so nothing is letterboxed or cropped to fit a slot. The horizontal strip
 * flows those frames along a row; the grid views (floating window, docked side rail,
 * expanded overlay) lay them out in fixed-width cells and centre each frame in its
 * cell.
 *
 * A grid can only be told a cell WIDTH, so the cell reserves room for the widest
 * frame it undertakes to show whole (`WIDEST_FRAME_ASPECT`) and portrait thumbnails
 * leave slack either side. That slack is the price of showing every thumbnail at its
 * own shape; the alternative — a fixed-aspect cell the image is letterboxed into —
 * renders the same canvas differently in the two views, which is what this module
 * exists to prevent.
 *
 * These numbers are the single source of truth for the pixels a thumbnail button
 * spends around its frame. `ThumbnailGallery` publishes them to its own scoped CSS
 * as custom properties (`GALLERY_THUMB_VARS`) rather than repeating the values
 * there, because `TriiiceratopsViewer` sizes the docked band and rail from the same
 * numbers — two components and a stylesheet that only agree if exactly one of them
 * owns the arithmetic.
 *
 * Deliberately its own module, not part of `viewerControls`: that one is reachable
 * from a public entry point, so anything exported there lands in the published API
 * report. This is internal layout arithmetic and has no business being a contract.
 */

/** Padding `.thumb-item` puts around its contents, per side. */
const ITEM_PAD = 4;

/** Gap between a thumbnail's frame and its label row. */
const ITEM_GAP = 4;

/**
 * Height of the label row a thumbnail button reserves — always exactly one line,
 * in every view and every viewing mode, so a thumbnail is one size everywhere.
 *
 * A paged pair names two canvases and so has a second line, which is drawn as an
 * overlay riding up over the bottom of the frame instead of being given room of its
 * own. Reserving that room is what used to make a paged strip row taller than an
 * unpaged one, and a band sized for the taller row had no space left for the expand
 * tab's gutter.
 */
const LABEL_LINE = 16;

/**
 * The width a frame falls back to when there is nothing to measure, as a multiple of
 * `fixedHeight`: a portrait 3:4 page, which is what the overwhelming majority of
 * IIIF canvases are.
 *
 * Two things need that fallback. The frame itself, before a lazy thumbnail has
 * loaded or when a canvas offers none — see `.thumb-img`'s `min-width`, which reads
 * this as `--ui-thumb-floor`. And the docked rail, which has to commit to a width
 * before it knows what is in it.
 *
 * Only the rail is a commitment: everything else lays thumbnails out at whatever
 * width they turn out to be. A rail holding wider thumbnails than this crops them,
 * which is the price of a rail that fits its content instead of standing a band of
 * empty space either side of every portrait page.
 */
const FRAME_FLOOR_ASPECT = 3 / 4;

/**
 * `--ui-gallery-pad` from `styles/layout.css`, per side — the padding
 * `.gallery-content` puts around the track. Pinned against that stylesheet by
 * `galleryGeometry.test.ts`, since this is the one number here that CSS owns.
 */
const TRACK_PAD = 4;

/**
 * The expand tab's short axis: the gutter it needs on the gallery's canvas-facing
 * edge. Reserved as padding on the gallery ROOT so the tab sits beside the
 * thumbnails rather than over one — it cannot be padding on `.gallery-content`,
 * because padding on a scroll box scrolls away with its content and rows would pass
 * back underneath the tab.
 */
const CARET_TAB = 12;

/** A pixel or two so a row whose height rounds up is never clipped by the band. */
const BAND_SLACK = 2;

/**
 * The geometry above, as the custom properties `ThumbnailGallery`'s CSS reads. Set
 * on the gallery root so the stylesheet never restates a number this module owns.
 */
export const GALLERY_THUMB_VARS = [
    `--ui-thumb-pad: ${ITEM_PAD}px`,
    `--ui-thumb-gap: ${ITEM_GAP}px`,
    `--ui-thumb-label-line: ${LABEL_LINE}px`,
    `--ui-caret-tab: ${CARET_TAB}px`,
].join('; ');

/**
 * Height of one thumbnail button: the frame, plus the button's own padding, the gap
 * below the frame, and the single label line it reserves. The same in every view and
 * every viewing mode — the strip sets it explicitly so the band below can be sized
 * from this exact number.
 */
export function getGalleryThumbItemHeight(fixedHeight: number) {
    return fixedHeight + ITEM_PAD * 2 + ITEM_GAP + LABEL_LINE;
}

/**
 * Width a frame falls back to with nothing to measure — see `FRAME_FLOOR_ASPECT`.
 * Ceiling, not rounding: a floor a fraction of a pixel under the frame it stands in
 * for would crop it.
 */
export function getGalleryThumbFloorWidth(fixedHeight: number) {
    return Math.ceil(fixedHeight * FRAME_FLOOR_ASPECT);
}

/** …and the whole thumbnail button at that width, its padding included. */
export function getGalleryThumbFloorItemWidth(fixedHeight: number) {
    return getGalleryThumbFloorWidth(fixedHeight) + ITEM_PAD * 2;
}

/**
 * Docked band height (top/bottom), EXCLUDING the root's border — the caller adds
 * `var(--tri-border)` in CSS so a themed border width stays in step with the
 * padding math instead of being baked in here at its default.
 *
 * Sized as: the expand tab's gutter, the track's padding, one thumbnail button, and
 * a pixel or two of slack. Every strip row is the same height now, so the band fits
 * all of them with the tab's gutter genuinely reserved — and comes out slightly
 * SHORTER than the `fixedHeight + 55` it used to be, rather than growing to buy the
 * gutter.
 */
export function getGalleryBandHeight(fixedHeight: number) {
    return (
        CARET_TAB +
        TRACK_PAD * 2 +
        getGalleryThumbItemHeight(fixedHeight) +
        BAND_SLACK
    );
}

/**
 * Docked side-rail width, EXCLUDING the root's border (see `getGalleryBandHeight`).
 *
 * Accounted from the canvas-facing edge inward: the tab's gutter, then one thumbnail
 * at the floor width with nothing between them, then the track's padding on the far
 * side. The rail zeroes its track padding on the tab's side to make that happen, so
 * a thumbnail sits directly against the tab rather than a padding gap away from it.
 *
 * It reserves no width for the rail's scrollbar. Most platforms overlay it, so a
 * reservation would show up as dead space beside the thumbnail rather than as a
 * scrollbar; where the platform does take width, the `minmax(0, …)` cell absorbs it
 * and the rail asks for a thin scrollbar to keep that small.
 */
export function getGalleryRailWidth(fixedHeight: number) {
    return CARET_TAB + getGalleryThumbFloorItemWidth(fixedHeight) + TRACK_PAD;
}
