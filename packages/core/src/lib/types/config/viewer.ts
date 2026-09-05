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
     *
     * **Inert while a plugin has registered transport chrome**
     * (`ViewerState.registerTransportChrome`): the bar then spans its full
     * available width so the seek bar can take the slack, and a full-width bar
     * has nowhere to align. The setting is not deprecated and nothing is
     * warned about — it resumes meaning the moment the chrome deregisters.
     * `style`, `edge` and the nav inset go on meaning what they meant.
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

/**
 * Renderer tuning — a **small, closed, typed set**.
 *
 * There is deliberately no open partial-options escape hatch into renderer
 * internals. An escape hatch would make the renderer's own surface part of what
 * consumers depend on, which is exactly the pass-through this viewer removed:
 * once someone sets an undocumented internal, changing it becomes a breaking
 * change and the renderer can no longer be rewritten. Every member below is a
 * knob core has decided to support and will keep supporting under its own
 * semver.
 *
 * Every value is optional; omitting one takes core's default, and the defaults
 * are provisional — they are tuned as the renderer is measured, so nothing
 * should assert against a shipped number.
 *
 * If a knob you need is missing, that is a request for core to add it, not a
 * gap for a consumer to reach through.
 */
export interface RendererConfig {
    /**
     * How quickly programmatic and discrete motion — a zoom button, a
     * double-tap, a fit, canvas navigation — settles onto its target, as the
     * time constant in **seconds** of an exponential approach: the time to
     * cover about 63% of the remaining distance. Smaller is stiffer.
     *
     * Ignored under `prefers-reduced-motion: reduce`, where every viewport
     * change is instant.
     */
    animationTimeConstant?: number;

    /**
     * Multiplicative zoom factor for one step of `zoomIn` / `zoomOut` and the
     * toolbar buttons behind them. `2` doubles the zoom per press. Must be
     * greater than 1; zooming out applies its reciprocal, so a step out
     * undoes a step in exactly.
     */
    zoomPerClick?: number;

    /**
     * How far past a whole-canvas fit the reader may zoom in, as a multiple of
     * the fit scale: `8` stops eight times closer than the scale at which the
     * canvas fits the viewport. Must be greater than 1.
     *
     * The fit is measured against the live viewport, so the ceiling follows a
     * window resize and a phone rotation. Because the fit falls as the source
     * grows, the same factor gives a large scan more magnification past 1:1
     * than a small one — raise it for images with more pixels than their fit
     * suggests, lower it to stop the reader short of visible blur.
     */
    maxZoomFactor?: number;

    /**
     * Multiplicative zoom factor for one **wheel notch** — the detent of a
     * classic mouse wheel, which the wheel event reports as about 100 pixels of
     * `deltaY`. `1.15` takes roughly five notches to double the zoom. Must be
     * greater than 1; scrolling the other way applies its reciprocal, so a
     * notch out undoes a notch in exactly.
     *
     * This governs the **trackpad as well**, and there is deliberately no
     * separate knob for one. A trackpad never emits a notch: it emits a stream
     * of much smaller deltas, covers the same 100 pixels over several events,
     * and so gets the same zoom for the same scroll distance. Nothing in the
     * viewer detects which device is in use, because the usual heuristics are
     * unreliable and that branch is a permanent source of hardware-specific
     * bugs. If the trackpad feels different from the mouse here, this one value
     * moves both.
     */
    zoomPerWheelNotch?: number;

    /**
     * The least **device** pixels per level pixel a pyramid level may carry
     * before the next coarser one is taken instead. At `0.5`, up to 2×
     * oversampling is tolerated; a *higher* value accepts a blurrier image for
     * fewer bytes.
     */
    minPixelRatio?: number;

    /**
     * Decoded-byte ceiling for the opportunistic tile cache. Core picks a
     * lower default on devices where memory pressure is fatal rather than slow.
     * This is a ceiling on what is held *beyond* what the current view
     * requires, so lowering it costs re-fetches, never blank canvases.
     */
    byteBudget?: number;

    /**
     * How far beyond the viewport a canvas is still kept resident, as the
     * factor the viewport rect is inflated by. `1` holds only what is on
     * screen; larger values pre-empt more of a scroll at the cost of memory.
     */
    residencyMargin?: number;

    /**
     * Projected on-screen size, in CSS pixels, at or above which a canvas is
     * given the full tile pyramid.
     */
    pyramidThreshold?: number;

    /**
     * Projected on-screen size, in CSS pixels, below which a canvas is drawn as
     * a plain box with no image fetched at all. Between this and
     * {@link pyramidThreshold} a canvas gets a single thumbnail.
     */
    boxThreshold?: number;
}

export interface ViewerConfig {
    /**
     * Preferred locale for the viewer's chrome and for resolving IIIF language
     * maps. When unset, the viewer follows the app locale. The toolbar's
     * language picker outranks this for as long as the host leaves it alone;
     * naming a different `locale` here hands control back.
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
     * Preserve authored IIIF canvas scale in multi-canvas layouts.
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
     * Renderer tuning. See {@link RendererConfig} — a small, closed set.
     */
    renderer?: RendererConfig;

    /**
     * Marker styling for point annotations, shared by the read-only overlay and
     * the annotation editor so a point renders consistently whether selected or
     * not. `radius` is in screen pixels (default 5).
     */
    pointStyle?: PointStyle;

    /**
     * Enable opt-in developer diagnostics. Production distributions are quiet
     * by default: when `false`, the viewer emits no unsolicited
     * console output. When `true`, viewer diagnostics are logged through the
     * core logger (prefixed `[triiiceratops]`). Actionable failures always
     * surface through the structured `viewererror`/`pluginerror` channels
     * regardless of this flag.
     * @default false
     */
    debug?: boolean;
}
