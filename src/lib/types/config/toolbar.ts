export interface ToolbarConfig {
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
