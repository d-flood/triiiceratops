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
     * The grid views wrap those thumbnails, so each one is exactly as wide as its
     * own image at this height rather than sitting in a fixed cell. The docked band
     * and side rail size themselves from this number — the rail to one portrait
     * page's width, which is the one place an image wider than portrait crops.
     * @default 115
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
