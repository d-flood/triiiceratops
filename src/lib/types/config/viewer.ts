import type { GalleryConfig } from './gallery';
import type {
    AnnotationsConfig,
    CollectionConfig,
    InformationConfig,
    PluginUiConfig,
    SearchConfig,
    StructuresConfig,
} from './panels';
import type { RequestConfig } from './requests';
import type { ToolbarConfig } from './toolbar';

export interface ViewerConfig {
    /**
     * Preferred locale for resolving IIIF language maps.
     * When unset, the viewer follows the app locale.
     */
    locale?: string;

    /**
     * Whether to show the canvas navigation arrows/controls.
     * @default true
     */
    showCanvasNav?: boolean;

    /**
     * The viewing mode for the viewer.
     * 'individuals' = Single canvas view
     * 'paged' = Dual canvas view (book view)
     * 'continuous' = Continuous scroll view
     * Overrides the manifest's viewing mode behavior if set.
     * @default 'individuals'
     */
    viewingMode?: 'individuals' | 'paged' | 'continuous';

    /**
     * The viewing direction for the viewer.
     * Overrides the manifest's viewing direction if set.
     */
    viewingDirection?:
        | 'left-to-right'
        | 'right-to-left'
        | 'top-to-bottom'
        | 'bottom-to-top';

    /**
     * Whether to offset the paged view by one canvas (e.g. cover page).
     * @default true
     */
    pagedViewOffset?: boolean;

    /**
     * Whether to show the zoom controls in the canvas navigation.
     * @default true
     */
    showZoomControls?: boolean;

    /**
     * Configuration for the thumbnail gallery pane.
     */
    gallery?: GalleryConfig;

    /**
     * Width of the left side panel column.
     * @default '320px'
     */
    leftPanelWidth?: string;

    /**
     * Width of the right side panel column.
     * @default '320px'
     */
    rightPanelWidth?: string;

    /**
     * Configuration for the search pane.
     */
    search?: SearchConfig;

    /**
     * Configuration for annotations.
     */
    annotations?: AnnotationsConfig;

    /**
     * Configuration for the information pane.
     */
    information?: InformationConfig;

    /**
     * Configuration for the structures / table of contents pane.
     */
    structures?: StructuresConfig;

    /**
     * Configuration for the collection navigation pane.
     */
    collection?: CollectionConfig;

    /**
     * Configuration for network requests (manifests, etc)
     */
    requests?: RequestConfig;

    /**
     * Whether the viewer background should be transparent.
     * @default false
     */
    transparentBackground?: boolean;

    /**
     * Whether the toolbar open/close toggle button is visible.
     * @default true
     */
    showToggle?: boolean;

    /**
     * Whether the toolbar is currently expanded/open.
     * @default false
     */
    toolbarOpen?: boolean;

    /**
     * Which side the toolbar should appear on.
     * @default 'left'
     */
    toolbarPosition?: 'left' | 'right' | 'top-left' | 'top-right';

    /**
     * Configuration for the toolbar items.
     */
    toolbar?: ToolbarConfig;

    /**
     * Whether the Table of Contents (Structures) toolbar button is shown.
     * Prefer `toolbar.showStructures` for new configurations.
     * @default true
     */
    showStructures?: boolean;

    /**
     * Per-plugin UI overrides keyed by plugin ID.
     *
     * Example:
     * {
     *   "pdf-export": { "visible": true, "open": false }
     * }
     */
    plugins?: Record<string, PluginUiConfig>;

    /**
     * Additional OpenSeadragon viewer options.
     * These are merged into the OSD constructor options, allowing you to
     * override defaults or set any OSD option (e.g. maxZoomPixelRatio,
     * zoomPerScroll, animationTime, etc.).
     * @see https://openseadragon.github.io/docs/OpenSeadragon.html#.Options
     */
    openSeadragonConfig?: Partial<OpenSeadragon.Options>;

    /**
     * Enable drag-and-drop loading of IIIF manifest URLs/content state text.
     * @default false
     */
    enableDragDrop?: boolean;
}
