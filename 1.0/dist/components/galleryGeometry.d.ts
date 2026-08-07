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
 * - Band (top/bottom) and floating window: fixed HEIGHT, width from the image.
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
/**
 * The geometry above, as the custom properties `ThumbnailGallery`'s CSS reads. Set
 * on the gallery root so the stylesheet never restates a number this module owns.
 */
export declare const GALLERY_THUMB_VARS: string;
/**
 * Height of one thumbnail button in a horizontal strip — the band's height, less the
 * track's padding and the slack the band keeps back. The strip sets it explicitly
 * rather than leaving it intrinsic, so a row is exactly the height the band was
 * given room for instead of a number the two components arrived at separately.
 */
export declare function getGalleryThumbItemHeight(size: number): number;
/**
 * Frame height for a HEIGHT-constrained thumbnail — the band, the floating window,
 * and an expanded overlay belonging to either. The button's chrome comes out of the
 * band's height, which is the number the host asked for; the frame gets the rest and
 * is as wide as the image itself at that height.
 */
export declare function getGalleryThumbFrameHeight(size: number): number;
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
export declare function getGalleryThumbItemWidth(size: number): number;
/**
 * Frame width for a WIDTH-constrained thumbnail — the docked rail and an expanded
 * overlay belonging to it. The frame fills the button, and its height is whatever
 * the image is at that width.
 *
 * A paged pair splits this between its two panes (`PANE_GAP` between them) and comes
 * out shorter than a single page rather than cropped in half — no special case
 * needed, because a pair constrained on width is just two half-width thumbnails.
 */
export declare function getGalleryThumbFrameWidth(size: number): number;
