export interface GalleryConfig {
    /**
     * Where the gallery should be docked by default if shown.
     * @default 'bottom'
     */
    dockPosition?: 'left' | 'right' | 'top' | 'bottom';
    /**
     * Whether the gallery is currently open/visible.
     * @default false
     */
    open?: boolean;
    /**
     * Whether to show the close button on the gallery.
     * @default true
     */
    showCloseButton?: boolean;
    /**
     * How much of the viewer the gallery takes, in pixels, and the only knob that
     * changes a thumbnail's size. It applies to whichever axis the gallery's
     * position commits to: the strip's HEIGHT when docked to the top or bottom, and
     * the rail's WIDTH when docked to the left or right.
     *
     * Thumbnails are derived from it rather than the reverse. A thumbnail is fixed
     * on the axis its gallery committed to and takes its own image's shape on the
     * other — a portrait page in a rail is tall, a landscape page in the same rail
     * is short, and both are exactly as wide as the rail. Nothing is cropped and
     * nothing is letterboxed into a slot, so the cost is a track of ragged rows
     * when a manifest mixes shapes.
     *
     * The expanded gallery uses the same constrained axis as the position it was
     * expanded from, so a thumbnail is exactly the same size expanded as collapsed.
     *
     * Because the axis follows the position, moving the gallery from the bottom to
     * the left changes thumbnail size: at 100, a 3:4 page is 47x62 in the bottom
     * strip and 84x112 in the left rail.
     * @default 100
     */
    size?: number;
    /**
     * Whether the gallery starts expanded — filling the viewer's center column
     * as a full grid of thumbnails instead of a docked strip or rail.
     * Implies `open`, since an expanded gallery is necessarily visible.
     * @default false
     */
    expanded?: boolean;
}
