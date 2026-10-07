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
          readonly when?: {
              readonly path: readonly string[];
              readonly is: string;
          };
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

export type ControlBlock = {
    readonly title?: string;
    readonly controls: readonly BuilderControl[];
};

export type ControlGroup = {
    readonly title: string;
    readonly note?: string;
    readonly blocks: readonly ControlBlock[];
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
        title: 'Viewing',
        note: 'How canvases are laid out and read.',
        blocks: [
            {
                controls: [
                    {
                        kind: 'choice',
                        path: ['viewingMode'],
                        label: 'Viewing mode',
                        unset: 'Manifest default',
                        choices: choices<
                            NonNullable<ViewerConfig['viewingMode']>
                        >({
                            individuals: 'One canvas at a time',
                            paged: 'Two-page spread',
                            continuous: 'Continuous scroll',
                        }),
                    },
                    {
                        kind: 'choice',
                        path: ['viewingDirection'],
                        label: 'Viewing direction',
                        unset: 'Manifest default',
                        choices: choices<
                            NonNullable<ViewerConfig['viewingDirection']>
                        >({
                            'left-to-right': 'Left to right',
                            'right-to-left': 'Right to left',
                            'top-to-bottom': 'Top to bottom',
                            'bottom-to-top': 'Bottom to top',
                        }),
                    },
                    toggle(
                        ['pagedViewOffset'],
                        'Show first canvas alone in two-page spread',
                    ),
                    toggle(
                        ['preserveCanvasScale'],
                        'Preserve canvas scale in multi-canvas layouts',
                    ),
                    {
                        kind: 'text',
                        path: ['locale'],
                        label: 'Language',
                        placeholder: 'Browser default (e.g. en, fr)',
                    },
                    toggle(['transparentBackground'], 'Transparent background'),
                ],
            },
        ],
    },
    {
        title: 'Zoom',
        note: 'How zooming feels and how far it goes.',
        blocks: [
            {
                controls: [
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
                        label: 'Zoom per button click',
                        min: 1.05,
                        max: 3,
                        step: 0.05,
                    },
                    {
                        kind: 'count',
                        path: ['renderer', 'maxZoomFactor'],
                        label: 'Max zoom (multiple of fit)',
                        min: 2,
                        max: 32,
                        step: 1,
                    },
                    {
                        kind: 'count',
                        path: ['renderer', 'maxZoomPixelRatio'],
                        label: 'Max zoom (device pixels per image pixel)',
                        min: 0.5,
                        max: 8,
                        step: 0.5,
                    },
                    {
                        kind: 'count',
                        path: ['renderer', 'animationTimeConstant'],
                        label: 'Animation duration (s)',
                        min: 0.02,
                        max: 0.5,
                        step: 0.01,
                    },
                ],
            },
        ],
    },
    {
        title: 'Toolbar',
        note: 'Buttons that open the gallery, a panel or a plugin are set in that tab. Side and anchor apply only to a separate toolbar.',
        blocks: [
            {
                controls: [
                    {
                        kind: 'choice',
                        path: ['controls'],
                        label: 'Controls',
                        choices: choices<NonNullable<ViewerConfig['controls']>>(
                            {
                                split: 'Separate toolbar',
                                unified: 'Single control bar',
                            },
                        ),
                    },
                    {
                        kind: 'choice',
                        path: ['toolbar', 'side'],
                        label: 'Side',
                        when: { path: ['controls'], is: 'split' },
                        choices: choices<NonNullable<Toolbar['side']>>({
                            left: 'Left',
                            right: 'Right',
                        }),
                    },
                    {
                        kind: 'choice',
                        path: ['toolbar', 'anchor'],
                        label: 'Anchor',
                        when: { path: ['controls'], is: 'split' },
                        choices: choices<NonNullable<Toolbar['anchor']>>({
                            center: 'Center',
                            top: 'Top',
                        }),
                    },
                    toggle(['showToggle'], 'Toggle button'),
                    toggle(['toolbarOpen'], 'Open on load'),
                    {
                        kind: 'choice',
                        path: ['openMenu'],
                        label: 'Menu open on load',
                        unset: 'None',
                        choices: choices<NonNullable<ViewerConfig['openMenu']>>(
                            {
                                gallery: 'Gallery',
                                'viewing-mode': 'Viewing mode',
                                sequence: 'Sequence',
                                locale: 'Language',
                                captions: 'Captions',
                                canvases: 'Canvas list',
                            },
                        ),
                    },
                ],
            },
            {
                title: 'Buttons',
                controls: [
                    toggle(['toolbar', 'showViewingMode'], 'Viewing mode'),
                    toggle(['toolbar', 'showLocalePicker'], 'Language'),
                    toggle(['toolbar', 'showFullscreen'], 'Fullscreen'),
                ],
            },
        ],
    },
    {
        title: 'Nav bar',
        note: 'The bar with canvas navigation and zoom controls.',
        blocks: [
            {
                controls: [
                    toggle(['showCanvasNav'], 'Canvas navigation'),
                    toggle(['showZoomControls'], 'Zoom controls'),
                    {
                        kind: 'choice',
                        path: ['nav', 'style'],
                        label: 'Style',
                        choices: choices<NonNullable<Nav['style']>>({
                            docked: 'Docked',
                            floating: 'Floating',
                        }),
                    },
                    {
                        kind: 'choice',
                        path: ['nav', 'edge'],
                        label: 'Edge',
                        choices: choices<NonNullable<Nav['edge']>>({
                            top: 'Top',
                            bottom: 'Bottom',
                        }),
                    },
                    {
                        kind: 'choice',
                        path: ['nav', 'align'],
                        label: 'Alignment',
                        choices: choices<NonNullable<Nav['align']>>({
                            start: 'Start',
                            center: 'Center',
                            end: 'End',
                        }),
                    },
                ],
            },
        ],
    },
    {
        title: 'Gallery',
        note: 'The thumbnail strip.',
        blocks: [
            {
                controls: [
                    toggle(['toolbar', 'showGallery'], 'Toolbar button'),
                    toggle(['gallery', 'open'], 'Open on load'),
                    toggle(['gallery', 'expanded'], 'Expanded to grid'),
                    {
                        kind: 'choice',
                        path: ['gallery', 'dockPosition'],
                        label: 'Position',
                        choices: choices<NonNullable<Gallery['dockPosition']>>({
                            bottom: 'Bottom',
                            top: 'Top',
                            left: 'Left',
                            right: 'Right',
                        }),
                    },
                    {
                        kind: 'count',
                        path: ['gallery', 'size'],
                        label: 'Size',
                        min: 60,
                        max: 240,
                        step: 4,
                    },
                ],
            },
        ],
    },
    {
        title: 'Panels',
        note: 'Side panels: their toolbar buttons, which are open on load, which can be closed, and which side they appear on.',
        blocks: [
            {
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
                ],
            },
            {
                title: 'Search',
                controls: [
                    toggle(['toolbar', 'showSearch'], 'Toolbar button'),
                    toggle(['search', 'open'], 'Open on load'),
                    toggle(['search', 'showCloseButton'], 'Close button'),
                    {
                        kind: 'choice',
                        path: ['search', 'position'],
                        label: 'Side',
                        choices: sides,
                    },
                    {
                        kind: 'text',
                        path: ['search', 'query'],
                        label: 'Query on load',
                        placeholder: 'Search term',
                    },
                ],
            },
            {
                title: 'Annotations',
                controls: [
                    toggle(['toolbar', 'showAnnotations'], 'Toolbar button'),
                    toggle(['annotations', 'open'], 'Open on load'),
                    toggle(['annotations', 'showCloseButton'], 'Close button'),
                    {
                        kind: 'choice',
                        path: ['annotations', 'position'],
                        label: 'Side',
                        choices: sides,
                    },
                ],
            },
            {
                title: 'Information',
                controls: [
                    toggle(['toolbar', 'showInfo'], 'Toolbar button'),
                    toggle(['information', 'showButton'], 'Canvas info button'),
                    toggle(['information', 'open'], 'Open on load'),
                    toggle(['information', 'showCloseButton'], 'Close button'),
                    {
                        kind: 'choice',
                        path: ['information', 'position'],
                        label: 'Side',
                        choices: sides,
                    },
                ],
            },
            {
                title: 'Contents',
                controls: [
                    toggle(['toolbar', 'showStructures'], 'Toolbar button'),
                    toggle(['structures', 'open'], 'Open on load'),
                    toggle(['structures', 'showCloseButton'], 'Close button'),
                ],
            },
            {
                title: 'Collection',
                controls: [
                    toggle(['toolbar', 'showCollection'], 'Toolbar button'),
                    toggle(['collection', 'open'], 'Open on load'),
                    toggle(['collection', 'showCloseButton'], 'Close button'),
                ],
            },
        ],
    },
    {
        title: 'Advanced',
        blocks: [
            {
                title: 'Performance',
                controls: [
                    {
                        kind: 'count',
                        path: ['renderer', 'byteBudget'],
                        label: 'Tile cache limit',
                        min: 16,
                        max: 512,
                        step: 16,
                        scale: 1024 * 1024,
                        unit: ' MB',
                    },
                    {
                        kind: 'count',
                        path: ['renderer', 'residencyMargin'],
                        label: 'Tile preload margin (× viewport)',
                        min: 1,
                        max: 4,
                        step: 0.1,
                    },
                    {
                        kind: 'count',
                        path: ['renderer', 'minPixelRatio'],
                        label: 'Min device pixels per tile pixel',
                        min: 0.25,
                        max: 2,
                        step: 0.05,
                    },
                    {
                        kind: 'count',
                        path: ['renderer', 'pyramidThreshold'],
                        label: 'Full tile pyramid above (px on screen)',
                        min: 80,
                        max: 1200,
                        step: 20,
                    },
                    {
                        kind: 'count',
                        path: ['renderer', 'boxThreshold'],
                        label: 'Placeholder box below (px on screen)',
                        min: 4,
                        max: 200,
                        step: 4,
                    },
                ],
            },
            {
                title: 'Network',
                controls: [
                    {
                        kind: 'headers',
                        path: ['requests', 'headers'],
                        label: 'Manifest request headers',
                        placeholder: 'Authorization: Bearer …',
                    },
                    toggle(
                        ['requests', 'withCredentials'],
                        'Send cookies with manifest request',
                    ),
                ],
            },
            {
                title: 'Diagnostics',
                controls: [toggle(['debug'], 'Debug logging to console')],
            },
        ],
    },
];

export const PLUGIN_UI_CONTROLS: readonly BuilderControl[] = [
    toggle(['visible'], 'Toolbar button'),
    toggle(['open'], 'Open on load'),
    toggle(['showCloseButton'], 'Close button'),
    {
        kind: 'choice',
        path: ['target'],
        label: 'Display as',
        unset: 'Plugin default',
        choices: choices<NonNullable<PluginUi['target']>>({
            panel: 'Panel',
            flyout: 'Flyout',
        }),
    },
    {
        kind: 'choice',
        path: ['position'],
        label: 'Panel position',
        unset: 'Plugin default',
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
