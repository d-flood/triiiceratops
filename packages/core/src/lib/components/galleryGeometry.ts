/**
 * Gallery thumbnail geometry.
 *
 * `gallery.fixedHeight` is the height of a thumbnail's image frame, and it means
 * exactly that in every gallery view. A thumbnail renders the same way wherever it
 * appears: the frame is `fixedHeight` tall and as wide as the image itself at that
 * height, so nothing is letterboxed or cropped to fit a slot. The horizontal strip
 * flows those frames along a row; every other view (floating window, docked side
 * rail, expanded overlay) is that same row, wrapped.
 *
 * So there is no cell size here, deliberately. A fixed-width grid has to reserve its
 * cell for the widest thumbnail it might hold, which leaves a portrait page — most
 * pages — sitting in a box of empty space, and a paged pair in twice that. Only two
 * things below commit to a size at all: the docked band's height and the docked
 * rail's width, because their host has to be given a number before it knows what is
 * going in it.
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

/** Gap between the two panes of a paged pair's frame. */
const PANE_GAP = 1;

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
 * The expand tab's short axis.
 *
 * 24px because that is WCAG 2.5.8's minimum target size, and the tab has to meet it
 * on the size criterion rather than its spacing exception — a tab centred on the
 * gallery's edge has thumbnails a few pixels inboard of it, which the exception's
 * 24px-radius clearance circle can never be satisfied by. It was 12px once, and an
 * obscured 12px control is one axe declines to audit, so the violation stayed hidden
 * for exactly as long as the tab was hard to click. `a11y-axe.spec.ts` fails the
 * build if this drops back under 24.
 *
 * Only the EXPANDED overlay reserves that 24px as a gutter beside the thumbnails
 * (root padding — see `.gallery-root.expanded.caret-*`). The docked band and rail do
 * not: 24px is a large fraction of a strip barely wider than one thumbnail, and
 * spending it on empty space made the collapsed strip conspicuously fat and its
 * thumbnails visibly off-centre within it. Docked, the tab floats OVER whichever
 * thumbnail is under the middle of the canvas-facing edge instead — it is drawn above
 * the track (`z-index`) and keeps its full 24px hit area, so it stays clickable and
 * auditable; it just costs the strip nothing.
 */
const CARET_TAB = 24;

/** A pixel or two so a row whose height rounds up is never clipped by the band. */
const BAND_SLACK = 2;

/**
 * The geometry above, as the custom properties `ThumbnailGallery`'s CSS reads. Set
 * on the gallery root so the stylesheet never restates a number this module owns.
 */
export const GALLERY_THUMB_VARS = [
    `--ui-thumb-pad: ${ITEM_PAD}px`,
    `--ui-thumb-gap: ${ITEM_GAP}px`,
    `--ui-thumb-pane-gap: ${PANE_GAP}px`,
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
 * Sized as: the track's padding, one thumbnail button, and a pixel or two of slack.
 * Every strip row is the same height now, whatever the viewing mode, so one row's
 * worth is all the band ever needs.
 *
 * Nothing is reserved for the expand tab — it overlays the middle thumbnail rather
 * than sitting in a gutter of its own (see `CARET_TAB`), which is what keeps the band
 * exactly as tall as the row it holds.
 */
export function getGalleryBandHeight(fixedHeight: number) {
    return TRACK_PAD * 2 + getGalleryThumbItemHeight(fixedHeight) + BAND_SLACK;
}

/**
 * Docked side-rail width, EXCLUDING the root's border (see `getGalleryBandHeight`).
 *
 * Accounted from the canvas-facing edge inward: the track's padding, one thumbnail at
 * the floor width, and the track's padding again. Nothing for the expand tab, which
 * overlays the middle thumbnail instead of taking a gutter (see `CARET_TAB`) — so the
 * thumbnail sits centred in the rail, with the same padding either side of it.
 *
 * A thumbnail wider than the floor is clamped to the track rather than allowed to
 * overflow it — see `.thumb-item`'s `max-width`.
 *
 * It reserves no width for the rail's scrollbar. Most platforms overlay it, so a
 * reservation would show up as dead space beside the thumbnail rather than as a
 * scrollbar; where the platform does take width, the clamp above absorbs it and the
 * rail asks for a thin scrollbar to keep that small.
 */
export function getGalleryRailWidth(fixedHeight: number) {
    return TRACK_PAD * 2 + getGalleryThumbFloorItemWidth(fixedHeight);
}

/**
 * The frame height a paged PAIR falls back to in the docked rail, and the pane width
 * that goes with it.
 *
 * The rail commits to one portrait page's width (see `getGalleryRailWidth`), and two
 * pages cannot both be shown at that width and full height. At `fixedHeight` the pair
 * overflowed the frame, which clips — so each page was cropped to roughly half of
 * itself and neither was legible. Shrinking the pair is the honest trade: both pages
 * stay whole, just smaller than a single page in the same rail.
 *
 * Derived by inverting the rail's own arithmetic rather than measuring: the frame gets
 * the floor width, the two panes split it with `PANE_GAP` between them, and the height
 * is whatever a portrait page is at that pane width. So a pair fits the rail by
 * construction, at every `fixedHeight`, before anything has loaded.
 *
 * A page wider than portrait still crops here, exactly as a single page does at the
 * rail's committed width — that concession is the rail's, not this function's.
 */
export function getGalleryPairFrame(fixedHeight: number) {
    const paneWidth = Math.floor(
        (getGalleryThumbFloorWidth(fixedHeight) - PANE_GAP) / 2,
    );
    return {
        paneWidth,
        // Ceiling for the same reason `getGalleryThumbFloorWidth` uses one: a height
        // a fraction of a pixel short of the page it stands in for would crop it.
        frameHeight: Math.ceil(paneWidth / FRAME_FLOOR_ASPECT),
    };
}
