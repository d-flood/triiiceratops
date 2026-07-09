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
import type { PointStyle } from '../../utils/pointMarker';

/**
 * The viewer chrome layout is configured by a few independent knobs, each of
 * which answers exactly one question — all layout-only; colors and border-radii
 * remain governed entirely by the theme:
 *   - `controls`      — one bar or two (unified vs split)
 *   - `nav.style`     — the nav bar's look (docked vs floating)
 *   - `nav.edge`      — which horizontal edge the nav bar lives on (top/bottom)
 *   - `nav.align`     — where along that edge it sits (start/center/end)
 *   - `toolbar.side`  — which vertical side the split toolbar rail lives on
 *   - `toolbar.anchor`— where along that side the rail sits (top/center)
 *
 * The toolbar rail and the nav bar both compete for the top edge. Rather than
 * try to fit both, the toolbar owns the top: if the rail is top-anchored
 * (`toolbar.anchor === 'top'`) while `nav.edge === 'top'`, the nav yields to the
 * bottom edge (see the resolver in `TriiiceratopsViewer.svelte`).
 */

/**
 * How the toolbar relates to the canvas nav.
 * - `split`   — the toolbar is its own element (a side rail), placed by
 *               `toolbar.side` / `toolbar.anchor`, separate from the nav (default).
 * - `unified` — the toolbar buttons are embedded into the canvas nav bar.
 */
export type ControlsMode = 'split' | 'unified';

/**
 * How the canvas nav (control bar) sits relative to its edge.
 * - `docked`   — flush to the edge, flat (default).
 * - `floating` — an inset island off the edge, with a shadow.
 */
export type NavStyle = 'docked' | 'floating';

/** Which horizontal edge the canvas nav bar lives on. */
export type NavEdge = 'top' | 'bottom';

/** Alignment of the nav bar along its edge (logical: `start`/`end` flip with writing direction). */
export type NavAlign = 'start' | 'center' | 'end';

/**
 * Placement + style of the canvas nav bar. Each field is independent; omit any to
 * take its default.
 */
export interface NavConfig {
    /**
     * The nav bar's look — `docked` (flush to the edge, flat) or `floating` (an
     * inset island off the edge, with a shadow).
     * @default 'docked'
     */
    style?: NavStyle;
    /**
     * Which horizontal edge the nav bar lives on. If set to `top` while a
     * top-anchored toolbar rail also claims the top, the nav yields to `bottom`.
     * @default 'bottom'
     */
    edge?: NavEdge;
    /**
     * Where the nav bar sits along its edge. In `unified` mode this also aligns
     * the embedded toolbar buttons, since they form one bar.
     * @default 'center'
     */
    align?: NavAlign;
}

export const CONTROLS_MODES: readonly ControlsMode[] = ['split', 'unified'];
export const NAV_STYLES: readonly NavStyle[] = ['docked', 'floating'];
export const NAV_EDGES: readonly NavEdge[] = ['top', 'bottom'];
export const NAV_ALIGNS: readonly NavAlign[] = ['start', 'center', 'end'];

export const DEFAULT_CONTROLS: ControlsMode = 'split';
export const DEFAULT_NAV_STYLE: NavStyle = 'docked';
export const DEFAULT_NAV_EDGE: NavEdge = 'bottom';
export const DEFAULT_NAV_ALIGN: NavAlign = 'center';

export interface ViewerConfig {
    /**
     * Preferred locale for resolving IIIF language maps.
     * When unset, the viewer follows the app locale.
     */
    locale?: string;

    /**
     * How the toolbar relates to the canvas nav — `split` (separate toolbar rail,
     * placed by `toolbar.side` / `toolbar.anchor`) or `unified` (toolbar buttons
     * embedded in the nav bar). Layout only; theme still controls colors/radii.
     * @default 'split'
     */
    controls?: ControlsMode;

    /**
     * Placement + style of the canvas nav bar — its `style` (docked/floating),
     * `edge` (top/bottom), and `align` (start/center/end). Each field is
     * independent; omit any to take its default.
     */
    nav?: NavConfig;

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
     * Configuration for the toolbar — item visibility plus its placement
     * (`toolbar.side` = left/right, `toolbar.anchor` = top/center). Only applies
     * in `split` controls mode; ignored when `controls === 'unified'`.
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
     * Marker styling for point annotations, shared by the read-only overlay and
     * the annotation editor so a point renders consistently whether selected or
     * not. `radius` is in screen pixels (default 5).
     */
    pointStyle?: PointStyle;

    /**
     * Enable drag-and-drop loading of IIIF manifest URLs/content state text.
     * @default false
     */
    enableDragDrop?: boolean;
}
