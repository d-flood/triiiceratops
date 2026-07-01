/** Which vertical side the split toolbar rail lives on. */
export type ToolbarSide = 'left' | 'right';

/** Where the split toolbar rail sits along its side. */
export type ToolbarAnchor = 'top' | 'center';

export const TOOLBAR_SIDES: readonly ToolbarSide[] = ['left', 'right'];
export const TOOLBAR_ANCHORS: readonly ToolbarAnchor[] = ['top', 'center'];

export const DEFAULT_TOOLBAR_SIDE: ToolbarSide = 'left';
export const DEFAULT_TOOLBAR_ANCHOR: ToolbarAnchor = 'center';

export interface ToolbarConfig {
    /**
     * Which vertical side the split toolbar rail lives on. Ignored in `unified`
     * controls mode.
     * @default 'left'
     */
    side?: ToolbarSide;
    /**
     * Where the rail sits along its side — `center` (vertically centered) or
     * `top` (pinned to the top corner). A top-anchored rail claims the top edge,
     * forcing a `top`-edge nav to yield to the bottom.
     * @default 'center'
     */
    anchor?: ToolbarAnchor;
    /**
     * Whether the Search button is shown in this menu.
     * @default true
     */
    showSearch?: boolean;
    /**
     * Whether the Gallery toggle button is shown in this menu.
     * @default true
     */
    showGallery?: boolean;
    /**
     * Whether the Annotations toggle button is shown in this menu.
     * @default true
     */
    showAnnotations?: boolean;
    /**
     * Whether the Info/Metadata button is shown in this menu.
     * @default true
     */
    showInfo?: boolean;
    /**
     * Whether the Fullscreen button is shown in this menu.
     * @default true
     */
    showFullscreen?: boolean;
    /**
     * Whether the Viewing Mode button/menu is shown in this menu.
     * @default true
     */
    showViewingMode?: boolean;
    /**
     * Whether the Table of Contents (Structures) button is shown in this menu.
     * Only visible when the manifest has structures/ranges.
     * @default true
     */
    showStructures?: boolean;
    /**
     * Whether the Collection button is shown in this menu.
     * Only visible when a collection is loaded.
     * @default true
     */
    showCollection?: boolean;
}
