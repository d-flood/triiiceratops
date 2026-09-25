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
type PluginUi = NonNullable<ViewerConfig['plugins']>[string];
type Information = NonNullable<ViewerConfig['information']>;

export type Choice = { readonly value: string; readonly label: string };

/**
 * A control's `path` is the sequence of keys it writes in the configuration
 * object; `pixels` writes a CSS length string and `count` writes a number,
 * which is the difference between a panel's width and a gallery's size.
 * `colour` writes a CSS colour, and is the one kind whose value the theming
 * tokens do not reach: a marker colour is annotation styling rather than a
 * theme token, so it belongs to the configuration object. `text` writes a
 * free string, for the two keys whose values the viewer cannot enumerate.
 * `headers` writes a string map, and is `requests.headers` alone.
 *
 * A `count` may declare `scale` and `unit`: the slider runs in the unit a
 * reader thinks in and the configuration takes the product, which is what lets
 * a byte budget be dragged in megabytes.
 *
 * `unset` is for a key whose absence is itself a choice. Viewing mode and
 * viewing direction override what the manifest declares, so a builder that
 * always stated one would silently override every publisher who declared
 * theirs; an open menu names a flyout, and none standing open is the ordinary
 * case rather than a fourth menu. A control that carries it offers the label
 * as a first option, writes `undefined` when it is picked, and states no
 * default.
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
          readonly kind: 'text';
          readonly path: readonly string[];
          readonly label: string;
          readonly placeholder: string;
      }
    | {
          readonly kind: 'headers';
          readonly path: readonly string[];
          readonly label: string;
          readonly placeholder: string;
      }
    | {
          readonly kind: 'pixels' | 'count';
          readonly path: readonly string[];
          readonly label: string;
          readonly min: number;
          readonly max: number;
          readonly step: number;
          /** What one step of the slider is worth in the configuration. */
          readonly scale?: number;
          /** Appended to the readout, in the unit the slider runs in. */
          readonly unit?: string;
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
        note: 'Viewer behavior and presentation settings.',
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
            {
                kind: 'text',
                path: ['search', 'query'],
                label: 'Search the manifest for this on load',
                placeholder: 'A word to look for',
            },
        ],
    },
    {
        title: 'Chrome',
        note: 'Which parts of the viewer UI to show or hide.',
        controls: [
            toggle(['showToggle'], 'The toolbar’s open/close toggle'),
            toggle(['toolbarOpen'], 'Open the toolbar to begin with'),
            toggle(['showCanvasNav'], 'The canvas nav bar'),
            toggle(['showZoomControls'], 'Zoom controls in the nav bar'),
            toggle(['information', 'showButton'], 'The canvas info button'),
            toggle(
                ['transparentBackground'],
                'A transparent background, so the host page shows through',
            ),
            {
                kind: 'choice',
                path: ['openMenu'],
                label: 'A flyout menu already open',
                unset: 'None',
                choices: choices<NonNullable<ViewerConfig['openMenu']>>({
                    gallery: 'Gallery',
                    'viewing-mode': 'Viewing mode',
                    sequence: 'Sequence',
                    locale: 'Language',
                    captions: 'Captions',
                }),
            },
            /*
             * Free text rather than a list. The key takes any BCP 47 tag and
             * the viewer falls back for one it has no messages for, so a select
             * would both invent a list the package does not publish and imply
             * that naming anything else is an error.
             */
            {
                kind: 'text',
                path: ['locale'],
                label: 'The language the viewer speaks',
                placeholder: 'Your browser’s, unless you name one',
            },
        ],
    },
    {
        title: 'Toolbar buttons',
        note: 'Hide or show specific toolbar buttons.',
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
        note: 'Which panels are open on load, which can be closed, and which side they appear on.',
        controls: [
            toggle(['gallery', 'open'], 'Gallery open'),
            toggle(['gallery', 'expanded'], 'Gallery expanded to a full grid'),

            toggle(['search', 'open'], 'Search open'),
            toggle(['search', 'showCloseButton'], 'Search close button'),
            {
                kind: 'choice',
                path: ['search', 'position'],
                label: 'Search panel side',
                choices: sides,
            },

            toggle(['annotations', 'open'], 'Annotations open'),
            toggle(
                ['annotations', 'showCloseButton'],
                'Annotations close button',
            ),
            {
                kind: 'choice',
                path: ['annotations', 'position'],
                label: 'Annotations panel side',
                choices: sides,
            },

            toggle(['information', 'open'], 'Information open'),
            toggle(
                ['information', 'showCloseButton'],
                'Information close button',
            ),
            {
                kind: 'choice',
                path: ['information', 'position'],
                label: 'Information panel side',
                choices: sides,
            },

            toggle(['structures', 'open'], 'Contents open'),
            toggle(['structures', 'showCloseButton'], 'Contents close button'),

            toggle(['collection', 'open'], 'Collection open'),
            toggle(
                ['collection', 'showCloseButton'],
                'Collection close button',
            ),
        ],
    },
    {
        title: 'Sizes',
        note: 'Panel and thumbnail gallery sizes.',
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
        title: 'Performance',
        note: 'Renderer performance settings.',
        controls: [
            {
                kind: 'count',
                path: ['renderer', 'byteBudget'],
                label: 'Tile cache ceiling',
                min: 16,
                max: 512,
                step: 16,
                scale: 1024 * 1024,
                unit: ' MB',
            },
            {
                kind: 'count',
                path: ['renderer', 'residencyMargin'],
                label: 'Residency margin, as a multiple of the viewport',
                min: 1,
                max: 4,
                step: 0.1,
            },
            {
                kind: 'count',
                path: ['renderer', 'minPixelRatio'],
                label: 'Least device pixels per level pixel',
                min: 0.25,
                max: 2,
                step: 0.05,
            },
            {
                kind: 'count',
                path: ['renderer', 'pyramidThreshold'],
                label: 'Full pyramid at this on-screen size, in pixels',
                min: 80,
                max: 1200,
                step: 20,
            },
            {
                kind: 'count',
                path: ['renderer', 'boxThreshold'],
                label: 'Plain box below this on-screen size, in pixels',
                min: 4,
                max: 200,
                step: 4,
            },
        ],
    },
    {
        title: 'Network and diagnostics',
        note: '',
        controls: [
            /*
             * A textarea of `Name: value` lines rather than a row editor: it is
             * the form a developer already holds headers in, it pastes, and it
             * makes deleting one a matter of deleting a line.
             */
            {
                kind: 'headers',
                path: ['requests', 'headers'],
                label: 'Extra headers on the manifest request',
                placeholder: 'Authorization: Bearer …',
            },
            toggle(
                ['requests', 'withCredentials'],
                'Send cookies with the manifest request',
            ),
            toggle(['debug'], 'Log viewer diagnostics to the console'),
        ],
    },
];

/**
 * The per-plugin UI keys, which `config.plugins` holds under a plugin's own id.
 *
 * Declared apart from `CONTROL_GROUPS` because the key they hang from is not
 * known until a reader turns a plugin on: the route renders one copy of these
 * under each chosen plugin, rooted at `plugins.<id>`. The paths here are
 * therefore relative, and `tests/unit/builder-surface.test.ts` resolves them
 * against `PluginUiConfig` rather than against `ViewerConfig`.
 *
 * `target` and `position` carry `unset` because the plugin was authored with
 * an answer to both: stating one here overrides the plugin's own default, and
 * a reader has to be able to hand that back.
 */
export const PLUGIN_UI_CONTROLS: readonly BuilderControl[] = [
    toggle(['visible'], 'Its toolbar button is visible'),
    toggle(['open'], 'Its panel is open to begin with'),
    toggle(['showCloseButton'], 'Its panel has a close button'),
    {
        kind: 'choice',
        path: ['target'],
        label: 'Renders as',
        unset: 'However the plugin was authored',
        choices: choices<NonNullable<PluginUi['target']>>({
            panel: 'A docked panel',
            flyout: 'A flyout over the canvas',
        }),
    },
    {
        kind: 'choice',
        path: ['position'],
        label: 'Panel position',
        unset: 'However the plugin was authored',
        choices: choices<NonNullable<PluginUi['position']>>({
            left: 'Left',
            right: 'Right',
            bottom: 'Bottom',
            overlay: 'Overlay',
        }),
    },
];

/**
 * Where the per-plugin toggles stand before a reader touches one.
 *
 * Consulted for display only, never written: the key they would be written
 * under does not exist until a plugin is chosen, and materializing them would
 * put a `plugins` block in the emitted configuration the moment a reader turned
 * a plugin on. `target` and `position` are absent because the plugin itself
 * answers both, which is what their `unset` option hands back.
 */
export const PLUGIN_UI_DEFAULTS: Record<string, boolean> = {
    visible: true,
    open: false,
    showCloseButton: true,
};

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
        /*
         * The desktop ceiling. Core drops to a smaller one where memory
         * pressure is fatal rather than slow, so a reader on a phone is
         * starting this slider above what their own viewer chose.
         */
        byteBudget: 128 * 1024 * 1024,
        residencyMargin: 1.5,
        minPixelRatio: 0.5,
        pyramidThreshold: 320,
        boxThreshold: 24,
    },
    gallery: {
        open: false,
        expanded: false,
        dockPosition: 'bottom',
        size: 100,
    },
    annotations: { open: false, position: 'right', showCloseButton: true },
    information: {
        open: false,
        position: 'right',
        showButton: true,
        showCloseButton: true,
    },
    structures: { open: false, showCloseButton: true },
    collection: { open: false, showCloseButton: true },
    search: {
        open: false,
        position: 'right',
        showCloseButton: true,
        query: '',
    },
    locale: '',
    requests: { headers: {}, withCredentials: false },
    debug: false,
};
