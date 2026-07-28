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
     * Thumbnail size in pixels: the row height in the horizontal strip view, and
     * the minimum cell width of the grid used by the floating and expanded views
     * (cells flex wider to fill the row, so this sets how many fit across).
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
