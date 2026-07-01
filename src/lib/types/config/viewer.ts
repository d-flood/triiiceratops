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

/**
 * The viewer chrome layout is configured by three orthogonal axes — `controls`,
 * `nav`, and `navPosition` — instead of a single preset. All are layout-only;
 * colors and border-radii remain governed entirely by the theme.
 */

/**
 * How the toolbar relates to the canvas nav.
 * - `split`   — the toolbar is its own element (a side rail / top bar, placed by
 *               `toolbarPosition`), separate from the nav (default).
 * - `unified` — the toolbar buttons are embedded into the canvas nav bar.
 */
export type ControlsMode = 'split' | 'unified';

/**
 * How the canvas nav (control bar) sits relative to the bottom edge.
 * - `docked`   — flush to the bottom edge, flat (default).
 * - `floating` — an inset island above the edge, with a shadow.
 */
export type NavStyle = 'docked' | 'floating';

/** Horizontal alignment of the bottom control bar (and, in `unified` mode, its embedded tools). */
export type NavPosition = 'left' | 'center' | 'right';

export const CONTROLS_MODES: readonly ControlsMode[] = ['split', 'unified'];
export const NAV_STYLES: readonly NavStyle[] = ['docked', 'floating'];
export const NAV_POSITIONS: readonly NavPosition[] = ['left', 'center', 'right'];

export const DEFAULT_CONTROLS: ControlsMode = 'split';
export const DEFAULT_NAV: NavStyle = 'docked';
export const DEFAULT_NAV_POSITION: NavPosition = 'center';

export interface ViewerConfig {
    /**
     * Preferred locale for resolving IIIF language maps.
     * When unset, the viewer follows the app locale.
     */
    locale?: string;

    /**
     * How the toolbar relates to the canvas nav — `split` (separate toolbar,
     * placed by `toolbarPosition`) or `unified` (toolbar buttons embedded in the
     * nav bar). Layout only; theme still controls colors/radii.
     * @default 'split'
     */
    controls?: ControlsMode;

    /**
     * How the canvas nav sits relative to the bottom edge — `docked` (flush) or
     * `floating` (inset island with a shadow).
     * @default 'docked'
     */
    nav?: NavStyle;

    /**
     * Horizontal alignment of the bottom control bar (and, in `unified` mode, the
     * embedded toolbar buttons, since they form one bar).
     * @default 'center'
     */
    navPosition?: NavPosition;

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
     * Preserve authored IIIF canvas scale in multi-canvas OpenSeadragon layouts.
     * When false, paged and continuous modes normalize canvas display heights
     * so unusually wide/tall canvases remain readable and comparable.
     * Single-canvas individuals mode is unchanged.
     * @default false
     */
    preserveCanvasScale?: boolean;

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
