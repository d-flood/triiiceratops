export interface GalleryConfig {
    /**
     * Where the gallery should be docked by default if shown.
     * @default 'bottom'
     */
    dockPosition?: 'left' | 'right' | 'top' | 'bottom' | 'none';
    /**
     * Whether the gallery can be dragged/moved by the user.
     * @default true
     */
    draggable?: boolean;
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
     * Height of a thumbnail image in pixels, and the only knob that changes a
     * thumbnail's size. It means the same thing in every view — the horizontal
     * strip, the floating window, the docked side rail, and the expanded gallery
     * all render a thumbnail at this height and at the image's own aspect ratio,
     * so the same canvas looks the same wherever you see it.
     *
     * The grid views lay those thumbnails out in cells wide enough for a 4:3
     * landscape page; cells do not flex, so a portrait thumbnail leaves slack
     * either side rather than stretching. An image wider than 4:3 keeps this
     * height and crops to the cell. The docked rail sizes itself to one cell.
     * @default 75
     */
    fixedHeight?: number;
    /**
     * Whether the gallery starts expanded — filling the viewer's center column
     * as a full grid of thumbnails instead of a docked strip or floating window.
     * Implies `open`, since an expanded gallery is necessarily visible.
     * @default false
     */
    expanded?: boolean;
    /**
     * Width of the gallery window when floating (in pixels).
     */
    width?: number;
    /**
     * Height of the gallery window when floating (in pixels).
     */
    height?: number;
    /**
     * X position of the gallery window when floating (in pixels).
     */
    x?: number;
    /**
     * Y position of the gallery window when floating (in pixels).
     */
    y?: number;
}
