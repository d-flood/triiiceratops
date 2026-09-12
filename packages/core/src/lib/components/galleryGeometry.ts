/**
 * Gallery thumbnail geometry.
 *
 * `gallery.size` is how much of the viewer the gallery takes: the docked band's
 * HEIGHT when it sits at the top or bottom, and the docked rail's WIDTH when it sits
 * at the left or right. One knob, applied to whichever axis the dock commits to.
 *
 * Everything about a thumbnail is derived from it, in that same direction. The
 * gallery is given the number; the thumbnail gets what is left over once the track's
 * padding, the button's padding, and its label line are paid for. So a band 150px
 * tall holds a 112px-tall thumbnail, and a rail 150px wide holds a 134px-wide one.
 *
 * Deriving in that direction is the whole point. A gallery that instead guessed its
 * committed axis from a thumbnail — a rail whose width was a portrait 3:4 of the
 * thumbnail height — has no width to offer a landscape page: at full height it wants
 * nearly double what the rail committed to, and `object-fit: contain` answers that by
 * shrinking the image to a sliver inside a full-height frame. A rail that owns its
 * width and lets the thumbnail's height fall out of it cannot have that problem,
 * whatever shape the image is.
 *
 * ## The constrained axis
 *
 * A thumbnail is fixed on the axis its gallery committed to and free on the other:
 *
 * - Band (top/bottom): fixed HEIGHT, width from the image.
 * - Rail (left/right): fixed WIDTH, height from the image.
 *
 * The EXPANDED overlay takes its constrained axis from the dock side too, not from
 * its own layout — which is what makes a thumbnail exactly the same size expanded as
 * collapsed. An overlay that constrained height while the rail beneath it constrained
 * width would render the same canvas as a tall sliver in one and a short wide card in
 * the other.
 *
 * Nothing here crops, and nothing is letterboxed into a slot: an image grows to fill
 * the constrained axis and is whatever it is on the other. The cost is a ragged
 * track — a rail of mixed portrait and landscape pages has rows of differing heights
 * — which is the honest rendering of a manifest whose canvases are different shapes.
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
 * The aspect ratio a frame stands in at when there is nothing to measure: a portrait
 * 3:4 page, which is what the overwhelming majority of IIIF canvases are.
 *
 * Published to the CSS as `--ui-thumb-floor-aspect` and applied as
 * `aspect-ratio: auto <this>` — a fallback ratio that a replaced element uses only
 * until it has a natural one of its own. It is load-bearing rather than cosmetic: an
 * image sized on one axis with `auto` on the other has NO size on the free axis
 * before it loads, a zero-area box never intersects the viewport, and so a lazy
 * image is never loaded — leaving it permanently sizeless. The fallback ratio breaks
 * that deadlock on whichever axis is the free one, and incidentally keeps a track of
 * loading thumbnails at roughly its final shape instead of popping open row by row.
 *
 * `auto` first is what keeps this a fallback: once the image has loaded, its own
 * ratio wins and the thumbnail renders at its true shape. A bare ratio would override
 * the natural one and letterbox every non-portrait canvas forever.
 */
const FRAME_FLOOR_ASPECT = '3 / 4';

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

/**
 * A pixel or two the band keeps back so a row whose height rounds up is never clipped
 * by it. It comes out of the thumbnail: the band's height is the number the host asked
 * for, so slack cannot be added on top of it.
 */
const BAND_SLACK = 2;

/**
 * The smallest frame a thumbnail is allowed, on either axis.
 *
 * The chrome around a frame is a fixed cost (38px on the constrained axis in a band,
 * 16px in a rail), so a small enough `gallery.size` would otherwise derive a zero or
 * negative frame and render a row of labels with nothing above them. The settings
 * slider does not go low enough to reach it; a host writing the config directly can.
 */
const MIN_FRAME = 24;

/**
 * The geometry above, as the custom properties `ThumbnailGallery`'s CSS reads. Set
 * on the gallery root so the stylesheet never restates a number this module owns.
 */
export const GALLERY_THUMB_VARS = [
    `--ui-thumb-pad: ${ITEM_PAD}px`,
    `--ui-thumb-gap: ${ITEM_GAP}px`,
    `--ui-thumb-pane-gap: ${PANE_GAP}px`,
    `--ui-thumb-label-line: ${LABEL_LINE}px`,
    `--ui-thumb-floor-aspect: ${FRAME_FLOOR_ASPECT}`,
    `--ui-caret-tab: ${CARET_TAB}px`,
].join('; ');

/**
 * The chrome a thumbnail button spends on its CONSTRAINED axis when that axis is the
 * height: its own padding, the gap under the frame, and the single label line.
 */
const ITEM_CHROME_H = ITEM_PAD * 2 + ITEM_GAP + LABEL_LINE;

/**
 * Height of one thumbnail button in a horizontal strip — the band's height, less the
 * track's padding and the slack the band keeps back. The strip sets it explicitly
 * rather than leaving it intrinsic, so a row is exactly the height the band was
 * given room for instead of a number the two components arrived at separately.
 */
export function getGalleryThumbItemHeight(size: number) {
    return Math.max(
        MIN_FRAME + ITEM_CHROME_H,
        size - TRACK_PAD * 2 - BAND_SLACK,
    );
}

/**
 * Frame height for a HEIGHT-constrained thumbnail — the band and an expanded overlay
 * belonging to it. The button's chrome comes out of the band's height, which is the
 * number the host asked for; the frame gets the rest and is as wide as the image
 * itself at that height.
 */
export function getGalleryThumbFrameHeight(size: number) {
    return getGalleryThumbItemHeight(size) - ITEM_CHROME_H;
}

/**
 * Width of one thumbnail button in a vertical track — the rail's width, less the
 * track's padding. No slack: the rail's free axis is the one that scrolls, so a row
 * that rounds up costs a pixel of scroll rather than being clipped.
 *
 * Set explicitly, and on the button rather than the frame, because it has to hold in
 * the EXPANDED overlay too: the items there sit in a track far wider than the rail,
 * and a width of `100%` would let each one grow to it. Stating the rail's width
 * outright is what makes an expanded thumbnail the same size as the collapsed one.
 */
export function getGalleryThumbItemWidth(size: number) {
    return Math.max(MIN_FRAME + ITEM_PAD * 2, size - TRACK_PAD * 2);
}

/**
 * Frame width for a WIDTH-constrained thumbnail — the docked rail and an expanded
 * overlay belonging to it. The frame fills the button, and its height is whatever
 * the image is at that width.
 *
 * A paged pair splits this between its two panes (`PANE_GAP` between them) and comes
 * out shorter than a single page rather than cropped in half — no special case
 * needed, because a pair constrained on width is just two half-width thumbnails.
 */
export function getGalleryThumbFrameWidth(size: number) {
    return getGalleryThumbItemWidth(size) - ITEM_PAD * 2;
}
