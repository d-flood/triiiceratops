/**
 * The builder's viewer-configuration controls, declared once as data.
 *
 * Every entry names a real leaf of the viewer's configuration interface, and
 * `tests/unit/builder-surface.test.ts` resolves each path against
 * `api-reports/core.api.md`, so a renamed or removed key fails the suite rather
 * than shipping a control that sets nothing.
 *
 * The surface is appearance and chrome only. Viewing mode and viewing direction
 * *values*, search providers and renderer tuning belong to the playground, and
 * the same gate refuses them here. Whether a control for one of them is shown
 * is chrome, which is why `toolbar.showViewingMode` is in and `viewingMode` is
 * not.
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
                    center: 'Centre',
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
                    center: 'Centred on its side',
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
        title: 'Chrome',
        note: 'Which parts of the viewer’s own furniture a reader is given.',
        controls: [
            toggle(['showToggle'], 'The toolbar’s open/close toggle'),
            toggle(['toolbarOpen'], 'Open the toolbar to begin with'),
            toggle(['showCanvasNav'], 'The canvas nav bar'),
            toggle(['showZoomControls'], 'Zoom controls in the nav bar'),
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
            toggle(['toolbar', 'showViewingMode'], 'Viewing mode'),
            toggle(['toolbar', 'showFullscreen'], 'Fullscreen'),
        ],
    },
    {
        title: 'Panels',
        note: 'Which panels are already open when a reader arrives, and which side the three that can move sit on.',
        controls: [
            toggle(['gallery', 'open'], 'Gallery open'),
            toggle(['search', 'open'], 'Search open'),
            toggle(['annotations', 'open'], 'Annotations open'),
            toggle(['information', 'open'], 'Information open'),
            toggle(['structures', 'open'], 'Contents open'),
            toggle(['collection', 'open'], 'Collection open'),
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
];

/**
 * The configuration the controls start from: each key's own documented default,
 * so a control the reader never touches contributes nothing to what is emitted.
 *
 * Stated rather than left absent because a `<select>` bound to `undefined`
 * shows no arrangement at all, and a slider bound to it has no position. Every
 * value here is the default `api-reports/core.api.md` declares for that key,
 * which is what makes materializing it harmless.
 */
export const BUILDER_DEFAULTS: ViewerConfig = {
    controls: 'split',
    nav: { style: 'docked', edge: 'bottom', align: 'center' },
    showCanvasNav: true,
    showZoomControls: true,
    showToggle: true,
    toolbarOpen: false,
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
    gallery: { open: false, dockPosition: 'bottom', size: 100 },
    search: { open: false, position: 'right' },
    annotations: { open: false, position: 'right' },
    information: { open: false, position: 'right' },
    structures: { open: false },
    collection: { open: false },
};
