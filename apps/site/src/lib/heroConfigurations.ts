/**
 * The chrome arrangements the hero cycles through.
 *
 * One viewer, one manifest, one canvas — only the configuration changes. That is
 * the point the hero exists to make and a still cannot: the chrome moves while
 * the reader's zoom survives, because nothing is being remounted.
 *
 * Every key here is a real key of the viewer's configuration interface. The
 * design record's mock-up named layout presets that do not exist; those names
 * are invented for layout and are deliberately not used.
 */

import type { ViewerConfig } from './viewerConfig';

export type HeroConfiguration = {
    /** The control's label, and what a reader is told they are looking at. */
    readonly label: string;
    readonly config: ViewerConfig;
};

export const HERO_CONFIGURATIONS: readonly HeroConfiguration[] = [
    {
        label: 'Docked toolbar',
        config: {
            controls: 'split',
            toolbar: { side: 'left', anchor: 'center' },
            nav: { style: 'docked', edge: 'bottom', align: 'center' },
        },
    },
    {
        label: 'One control bar',
        config: {
            controls: 'unified',
            nav: { style: 'docked', edge: 'top', align: 'center' },
        },
    },
    {
        label: 'Floating controls',
        config: {
            controls: 'split',
            toolbar: { side: 'right', anchor: 'top' },
            nav: { style: 'floating', edge: 'bottom', align: 'end' },
        },
    },
    {
        label: 'Gallery open',
        config: {
            controls: 'split',
            toolbar: { side: 'left', anchor: 'center' },
            nav: { style: 'docked', edge: 'bottom', align: 'center' },
            gallery: { open: true, dockPosition: 'left' },
        },
    },
];

/** How long each arrangement holds before the cycle moves on, in milliseconds. */
export const HERO_DWELL = 4500;
