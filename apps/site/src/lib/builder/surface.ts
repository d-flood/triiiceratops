/** Builder controls, each naming a real config leaf (gated by builder-surface.test.ts). */

import type { ViewerConfig } from '../viewerConfig';

type Nav = NonNullable<ViewerConfig['nav']>;
type Toolbar = NonNullable<ViewerConfig['toolbar']>;
type Gallery = NonNullable<ViewerConfig['gallery']>;
type PluginUi = NonNullable<ViewerConfig['plugins']>[string];
type Information = NonNullable<ViewerConfig['information']>;

export type Choice = { readonly value: string; readonly label: string };

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
          readonly scale?: number;
          readonly unit?: string;
      };

export type ControlGroup = {
    readonly title: string;
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

export const PLUGIN_UI_DEFAULTS: Record<string, boolean> = {
    visible: true,
    open: false,
    showCloseButton: true,
};

/* Untouched controls emit nothing: every value here is the key's documented default. */
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
