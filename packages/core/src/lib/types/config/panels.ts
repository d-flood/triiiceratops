import type { PluginUiTarget } from '../plugin';

export interface ClosablePanelConfig {
    /**
     * Whether to show the close button.
     * @default true
     */
    showCloseButton?: boolean;
}

export interface SidebarPanelConfig {
    /**
     * Where the panel should appear.
     * @default 'right'
     */
    position?: 'left' | 'right';
}

export interface SearchConfig extends ClosablePanelConfig, SidebarPanelConfig {
    /**
     * Whether the search panel is currently open.
     * @default false
     */
    open?: boolean;
    /**
     * Initial search query to execute.
     */
    query?: string;
}

export interface AnnotationsConfig
    extends ClosablePanelConfig, SidebarPanelConfig {
    /**
     * Whether the annotations panel/list is open.
     * @default false
     */
    open?: boolean;
}

export interface InformationConfig
    extends ClosablePanelConfig, SidebarPanelConfig {
    /**
     * Whether the information panel is currently open.
     * @default false
     */
    open?: boolean;
    /**
     * Whether the canvas info button is shown when the current canvas has
     * additional metadata (summary, metadata, or rendering links).
     * @default true
     */
    showButton?: boolean;
}

export interface StructuresConfig extends ClosablePanelConfig {
    /**
     * Whether the structures/TOC panel is currently open.
     * @default false
     */
    open?: boolean;
}

export interface CollectionConfig extends ClosablePanelConfig {
    /**
     * Whether the collection panel is currently open.
     * @default false
     */
    open?: boolean;
}

export interface PluginUiConfig {
    /**
     * Whether the plugin's toolbar button is visible.
     * @default true
     */
    visible?: boolean;

    /**
     * Whether the plugin panel is currently open.
     * @default false
     */
    open?: boolean;

    /**
     * Where the plugin renders its UI — overriding the target the plugin was
     * authored with (SDK `meta.target`). Set it here (or
     * imperatively via {@link ViewerState.setPluginTarget}) and, like `open` and
     * `visible`, it applies reactively after mount — e.g. a `matchMedia`
     * listener can flip a plugin to `'flyout'` on narrow viewports and back to
     * `'panel'` on wide ones without re-registering the plugin.
     *
     * Switching target remounts the plugin's UI in the new container (panels and
     * flyouts live in different DOM parents), so a plugin that must survive a
     * switch keeps its state in viewer state or its own store rather than in
     * local component state.
     *
     * @default the plugin's authored target (or `'panel'`)
     */
    target?: PluginUiTarget;

    /**
     * Where the plugin's panel is docked — overriding the plugin's default
     * position. Like `target`, it applies
     * reactively after mount (or imperatively via
     * {@link ViewerState.setPluginPosition}) without re-registering the
     * plugin.
     *
     * Ignored while the plugin's effective {@link target} is `'flyout'`: a
     * flyout is anchored to its toolbar button, not docked to a side, so it
     * has no position to set.
     *
     * @default the plugin's authored position (or `'left'`)
     */
    position?: 'left' | 'right' | 'bottom' | 'overlay';
}
