/**
 * The builder's viewer-configuration controls, declared once as data.
 *
 * Every entry names a real leaf of the viewer's configuration interface, and
 * `tests/unit/builder-surface.test.ts` resolves each path against
 * `api-reports/core.api.md`, so a renamed or removed key fails the suite rather
 * than shipping a control that sets nothing.
 *
 * The surface is everything a reader can decide about the viewer's appearance
 * and behaviour by looking at it. What stays out is what has nothing to look
 * at: network and diagnostic keys, transient runtime state, the renderer's
 * memory and fetch budgets — which are measured rather than seen — and an
 * initial search query, which is material rather than configuration. The same
 * gate refuses those here.
 *
 * Each choice list is written as a `Record` over the union the configuration
 * declares, so a value the viewer adds or drops is a type error here rather
 * than a select that silently omits an arrangement.
 */

import type { ViewerConfig } from '../viewerConfig';

type Nav = NonNullable<ViewerConfig['nav']>;
type Toolbar = NonNullable<ViewerConfig['toolbar']>;
type Gallery = NonNullable<ViewerConfig['gallery']>;
type Information = NonNullable<ViewerConfig['information']>;

export type Choice = { readonly value: string; readonly label: string };

/**
 * A control's `path` is the sequence of keys it writes in the configuration
 * object; `pixels` writes a CSS length string and `count` writes a number,
 * which is the difference between a panel's width and a gallery's size.
 * `colour` writes a CSS colour, and is the one kind whose value the theming
 * tokens do not reach: a marker colour is annotation styling rather than a
 * theme token, so it belongs to the configuration object.
 *
 * `unset` is for the two keys whose absence is itself a choice: viewing mode
 * and viewing direction override what the manifest declares, so a builder that
 * always stated one would silently override every publisher who declared
 * theirs. A control that carries it offers the label as a first option, writes
 * `undefined` when it is picked, and states no default — core reads a falsy
 * value as "the manifest decides".
 */
export type BuilderControl =
    | {
          readonly kind: 'toggle';
          readonly path: readonly string[];
          readonly label: string;
      }
    | {
          readonly kind: 'choice';
          readonly path: readonly string[];
          readonly label: string;
          readonly choices: readonly Choice[];
          readonly unset?: string;
      }
    | {
          readonly kind: 'colour';
          readonly path: readonly string[];
          readonly label: string;
      }
    | {
          readonly kind: 'pixels' | 'count';
          readonly path: readonly string[];
          readonly label: string;
          readonly min: number;
          readonly max: number;
          readonly step: number;
      };

export type ControlGroup = {
    readonly title: string;
    /** One sentence on what the group decides, where that is not obvious. */
    readonly note?: string;
    readonly controls: readonly BuilderControl[];
};

function choices<T extends string>(labels: Record<T, string>): Choice[] {
    return Object.entries(labels).map(([value, label]) => ({
        value,
        label: label as string,
    }));
}

function toggle(path: readonly string[], label: string): BuilderControl {
    return { kind: 'toggle', path, label };
}

/** The three sidebar panels share one side, declared once. */
const sides = choices<NonNullable<Information['position']>>({
    right: 'Right',
    left: 'Left',
});

export const CONTROL_GROUPS: readonly ControlGroup[] = [
    {
        title: 'Arrangement',
        note: 'Where the viewer puts its own chrome around the material.',
        controls: [
            {
                kind: 'choice',
                path: ['controls'],
                label: 'Controls',
                choices: choices<NonNullable<ViewerConfig['controls']>>({
                    split: 'A separate toolbar rail',
                    unified: 'One control bar',
                }),
            },
            {
                kind: 'choice',
                path: ['nav', 'style'],
                label: 'Canvas nav',
                choices: choices<NonNullable<Nav['style']>>({
                    docked: 'Docked to the edge',
                    floating: 'Floating off it',
                }),
            },
            {
                kind: 'choice',
                path: ['nav', 'edge'],
                label: 'Canvas nav edge',
                choices: choices<NonNullable<Nav['edge']>>({
                    top: 'Top',
                    bottom: 'Bottom',
                }),
            },
            {
                kind: 'choice',
                path: ['nav', 'align'],
                label: 'Canvas nav alignment',
                choices: choices<NonNullable<Nav['align']>>({
                    start: 'Start',
                    center: 'Center',
                    end: 'End',
                }),
            },
            {
                kind: 'choice',
                path: ['toolbar', 'side'],
                label: 'Toolbar side',
                choices: choices<NonNullable<Toolbar['side']>>({
                    left: 'Left',
                    right: 'Right',
                }),
            },
            {
                kind: 'choice',
                path: ['toolbar', 'anchor'],
                label: 'Toolbar anchor',
                choices: choices<NonNullable<Toolbar['anchor']>>({
                    center: 'Centered on its side',
                    top: 'Pinned to the top',
                }),
            },
            {
                kind: 'choice',
                path: ['gallery', 'dockPosition'],
                label: 'Gallery position',
                choices: choices<NonNullable<Gallery['dockPosition']>>({
                    bottom: 'Bottom',
                    top: 'Top',
                    left: 'Left',
                    right: 'Right',
                }),
            },
        ],
    },
    {
        title: 'Behavior',
        note: 'How the material itself is presented and how it moves. The first two override what the manifest declares, so both start out following it; the zoom terms below all take effect on the viewer above, so drag one and then use the wheel, the zoom buttons, or a double-tap.',
        controls: [
            {
                kind: 'choice',
                path: ['viewingMode'],
                label: 'Viewing mode',
                unset: 'Whatever the manifest declares',
                choices: choices<NonNullable<ViewerConfig['viewingMode']>>({
                    individuals: 'One canvas at a time',
                    paged: 'Two-page spread',
                    continuous: 'Continuous scroll',
                }),
            },
            {
                kind: 'choice',
                path: ['viewingDirection'],
                label: 'Viewing direction',
                unset: 'Whatever the manifest declares',
                choices: choices<NonNullable<ViewerConfig['viewingDirection']>>(
                    {
                        'left-to-right': 'Left to right',
                        'right-to-left': 'Right to left',
                        'top-to-bottom': 'Top to bottom',
                        'bottom-to-top': 'Bottom to top',
                    },
                ),
            },
            toggle(
                ['pagedViewOffset'],
                'Offset the spread by one canvas, for a cover page',
            ),
            toggle(
                ['preserveCanvasScale'],
                'Preserve the authored canvas scale in multi-canvas layouts',
            ),
            {
                kind: 'count',
                path: ['renderer', 'zoomPerWheelNotch'],
                label: 'Zoom per wheel notch',
                min: 1.05,
                max: 2,
                step: 0.05,
            },
            {
                kind: 'count',
                path: ['renderer', 'zoomPerClick'],
                label: 'Zoom per button press',
                min: 1.05,
                max: 3,
                step: 0.05,
            },
            /*
             * The ceiling is the more generous of the next two, so a reader
             * who lowers one and sees nothing change has not found a bug: the
             * other is still the binding term for this material.
             */
            {
                kind: 'count',
                path: ['renderer', 'maxZoomFactor'],
                label: 'Zoom ceiling, in multiples of a whole-canvas fit',
                min: 2,
                max: 32,
                step: 1,
            },
            {
                kind: 'count',
                path: ['renderer', 'maxZoomPixelRatio'],
                label: 'Zoom ceiling, in device pixels per source pixel',
                min: 0.5,
                max: 8,
                step: 0.5,
            },
            {
                kind: 'count',
                path: ['renderer', 'animationTimeConstant'],
                label: 'Settling time for discrete motion, in seconds',
                min: 0.02,
                max: 0.5,
                step: 0.01,
            },
        ],
    },
    {
        title: 'Chrome',
        note: 'Which parts of the viewer’s own furniture a reader is given, and whether it paints its own ground.',
        controls: [
            toggle(['showToggle'], 'The toolbar’s open/close toggle'),
            toggle(['toolbarOpen'], 'Open the toolbar to begin with'),
            toggle(['showCanvasNav'], 'The canvas nav bar'),
            toggle(['showZoomControls'], 'Zoom controls in the nav bar'),
            toggle(
                ['information', 'showButton'],
                'The canvas info button, where a canvas carries metadata',
            ),
            toggle(
                ['transparentBackground'],
                'A transparent background, so the host page shows through',
            ),
        ],
    },
    {
        title: 'Toolbar buttons',
        note: 'Each button, one at a time. A button whose feature the manifest does not carry stays hidden whatever this says.',
        controls: [
            toggle(['toolbar', 'showSearch'], 'Search'),
            toggle(['toolbar', 'showGallery'], 'Gallery'),
            toggle(['toolbar', 'showAnnotations'], 'Annotations'),
            toggle(['toolbar', 'showInfo'], 'Information'),
            toggle(['toolbar', 'showStructures'], 'Contents'),
            toggle(['toolbar', 'showCollection'], 'Collection'),
            toggle(['toolbar', 'showLocalePicker'], 'Language'),
            toggle(['toolbar', 'showViewingMode'], 'Viewing mode switch'),
            toggle(['toolbar', 'showFullscreen'], 'Fullscreen'),
        ],
    },
    {
        title: 'Panels',
        note: 'Which panels are already open when a reader arrives, which side the three that can move sit on, and which of them a reader can close again.',
        controls: [
            toggle(['gallery', 'open'], 'Gallery open'),
            toggle(['gallery', 'expanded'], 'Gallery expanded to a full grid'),
            toggle(['search', 'open'], 'Search open'),
            toggle(['annotations', 'open'], 'Annotations open'),
            toggle(['information', 'open'], 'Information open'),
            toggle(['structures', 'open'], 'Contents open'),
            toggle(['collection', 'open'], 'Collection open'),
            toggle(['gallery', 'showCloseButton'], 'Gallery close button'),
            toggle(['search', 'showCloseButton'], 'Search close button'),
            toggle(
                ['annotations', 'showCloseButton'],
                'Annotations close button',
            ),
            toggle(
                ['information', 'showCloseButton'],
                'Information close button',
            ),
            toggle(['structures', 'showCloseButton'], 'Contents close button'),
            toggle(
                ['collection', 'showCloseButton'],
                'Collection close button',
            ),
            {
                kind: 'choice',
                path: ['search', 'position'],
                label: 'Search panel side',
                choices: sides,
            },
            {
                kind: 'choice',
                path: ['annotations', 'position'],
                label: 'Annotations panel side',
                choices: sides,
            },
            {
                kind: 'choice',
                path: ['information', 'position'],
                label: 'Information panel side',
                choices: sides,
            },
        ],
    },
    {
        title: 'Sizes',
        note: 'The gallery’s size is the only knob that changes a thumbnail: it sets the strip’s height, or the rail’s width, and a thumbnail follows.',
        controls: [
            {
                kind: 'pixels',
                path: ['leftPanelWidth'],
                label: 'Left panel width',
                min: 180,
                max: 520,
                step: 10,
            },
            {
                kind: 'pixels',
                path: ['rightPanelWidth'],
                label: 'Right panel width',
                min: 180,
                max: 520,
                step: 10,
            },
            {
                kind: 'count',
                path: ['gallery', 'size'],
                label: 'Gallery size',
                min: 60,
                max: 240,
                step: 4,
            },
        ],
    },
    {
        title: 'Annotation markers',
        note: 'How a point annotation is drawn. Load a manifest whose canvases carry point annotations to watch these land — the example above has none, and the three colour and stroke terms are read by the annotation editor rather than by the read-only overlay.',
        controls: [
            {
                kind: 'count',
                path: ['pointStyle', 'radius'],
                label: 'Marker radius, in screen pixels',
                min: 2,
                max: 24,
                step: 1,
            },
            {
                kind: 'colour',
                path: ['pointStyle', 'fill'],
                label: 'Marker fill',
            },
            {
                kind: 'colour',
                path: ['pointStyle', 'stroke'],
                label: 'Marker stroke',
            },
            {
                kind: 'count',
                path: ['pointStyle', 'strokeWidth'],
                label: 'Marker stroke width, in pixels',
                min: 0,
                max: 8,
                step: 1,
            },
        ],
    },
];

/**
 * The configuration the controls start from: each key's own documented default,
 * so a control the reader never touches contributes nothing to what is emitted.
 *
 * Stated rather than left absent because a `<select>` bound to `undefined`
 * shows no arrangement at all, and a slider bound to it has no position. Every
 * value here is the key's own documented default, which is what makes
 * materializing it harmless: the report declares most of them inline, and the
 * rest are transcribed from the constants behind them — the renderer's from
 * `renderer/rendererDefaults.ts` and the marker radius from
 * `DEFAULT_POINT_RADIUS`, neither of which the report states as a `@default`.
 *
 * The exception is a control declaring `unset`, whose whole point is that the
 * key stays absent until a reader names a value: stating a default for one
 * would override the manifest on a page nobody had touched. Nothing here may
 * name `viewingMode` or `viewingDirection`, and the suite holds that.
 */
export const BUILDER_DEFAULTS: ViewerConfig = {
    controls: 'split',
    nav: { style: 'docked', edge: 'bottom', align: 'center' },
    showCanvasNav: true,
    showZoomControls: true,
    showToggle: true,
    toolbarOpen: false,
    pagedViewOffset: true,
    preserveCanvasScale: false,
    transparentBackground: false,
    leftPanelWidth: '320px',
    rightPanelWidth: '320px',
    toolbar: {
        side: 'left',
        anchor: 'center',
        showSearch: true,
        showGallery: true,
        showAnnotations: true,
        showInfo: true,
        showStructures: true,
        showCollection: true,
        showLocalePicker: true,
        showViewingMode: true,
        showFullscreen: true,
    },
    renderer: {
        zoomPerWheelNotch: 1.15,
        zoomPerClick: 1.5,
        maxZoomFactor: 8,
        maxZoomPixelRatio: 2,
        animationTimeConstant: 1 / 7,
    },
    gallery: {
        open: false,
        expanded: false,
        dockPosition: 'bottom',
        size: 100,
        showCloseButton: true,
    },
    search: { open: false, position: 'right', showCloseButton: true },
    annotations: { open: false, position: 'right', showCloseButton: true },
    information: {
        open: false,
        position: 'right',
        showButton: true,
        showCloseButton: true,
    },
    structures: { open: false, showCloseButton: true },
    collection: { open: false, showCloseButton: true },
    /*
     * Only the radius has a default in core. The editor falls back to its own
     * marker colours when the host names none, and those are private to that
     * package, so the swatches start from the red the read-only overlay's
     * `--anno-red` token approximates — the colour a reader is looking at.
     */
    pointStyle: {
        radius: 5,
        fill: '#e5484d',
        stroke: '#e5484d',
        strokeWidth: 2,
    },
};
