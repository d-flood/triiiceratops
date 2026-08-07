import type { Component } from 'svelte';
import type { IconDescriptor } from '../types/plugin';
export interface PanelStackItem {
    id: string;
    title: string;
    icon?: Component<any>;
    /**
     * Framework-neutral header icon descriptor (SDK core-owned chrome path,
     * ticket 02). Rendered by `PluginIcon` when set; takes precedence over
     * {@link icon}.
     */
    iconDescriptor?: IconDescriptor;
    component: Component<any>;
    props?: Record<string, unknown>;
    close?: () => void;
}
interface Props {
    panels: PanelStackItem[];
    /**
     * Which edge the section close button sits on. Defaults to 'end' (the
     * trailing edge). Set to 'start' for a right-docked column that hosts the
     * toolbar rail, so the close stays on the image-facing (inner) edge and
     * away from the rail's own controls.
     */
    closeAlign?: 'start' | 'end';
    /** Which column the stack lives in; drives panel slide-in direction. */
    side?: 'left' | 'right';
}
declare const PanelStack: Component<Props, {}, "">;
type PanelStack = ReturnType<typeof PanelStack>;
export default PanelStack;
