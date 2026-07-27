import type { Component } from 'svelte';
import type { ViewerState } from '../state/viewer.svelte';

declare global {
    interface Window {
        TriiiceratopsPlugins?: Record<string, unknown>;
    }
}

/**
 * Where a plugin renders its UI.
 * - `panel`: a docked side/bottom/overlay region (the default).
 * - `flyout`: a compact popover that grows out of the plugin's toolbar button.
 */
export type PluginUiTarget = 'panel' | 'flyout';

/**
 * Menu button configuration for plugin UI injection.
 */
export interface PluginMenuButton {
    /** Unique identifier (convention: `pluginId:buttonName`) */
    id: string;

    /** Owning plugin identifier */
    pluginId?: string;

    /** Phosphor icon component */
    icon: Component<any>;

    /** Tooltip text */
    tooltip: string;

    /** Click handler */
    onClick: () => void;

    /** Reactive getter for active/pressed state */
    isActive?: () => boolean;

    /** Reactive getter for visibility */
    isVisible?: () => boolean;

    /** CSS class when active (default: 'btn-primary') */
    activeClass?: string;

    /** Sort order - lower numbers appear first (default: 100) */
    order?: number;

    /**
     * When set, this button toggles a flyout popover rather than a panel. The
     * value is the DOM id of the flyout element (used as `popovertarget` and to
     * derive the CSS `anchor-name`). The toolbar renders the anchored flyout.
     */
    flyoutDomId?: string;
}

/**
 * Panel configuration for plugin UI injection.
 */
export interface PluginPanel {
    /** Unique identifier (convention: `pluginId:panelName`) */
    id: string;

    /** Owning plugin identifier */
    pluginId: string;

    /** Plugin display name */
    name: string;

    /** Plugin toolbar icon component */
    icon: Component<any>;

    /** Svelte component to render */
    component: Component<any>;

    /** Props passed to the component */
    props?: Record<string, unknown>;

    /** Panel position in the viewer */
    position: 'left' | 'right' | 'bottom' | 'overlay';

    /** Reactive getter for visibility */
    isVisible: () => boolean;
}

/**
 * Flyout configuration for plugin UI injection. A flyout is a compact popover
 * anchored to the plugin's toolbar button (see `PluginUiTarget`).
 */
export interface PluginFlyout {
    /** Unique identifier (convention: `pluginId:flyout`) */
    id: string;

    /** Stable DOM id used for `popovertarget` and the CSS `anchor-name` */
    domId: string;

    /** Owning plugin identifier */
    pluginId: string;

    /** Plugin display name */
    name: string;

    /** Plugin toolbar icon component */
    icon: Component<any>;

    /** Svelte component to render inside the flyout */
    component: Component<any>;

    /** Props passed to the component */
    props?: Record<string, unknown>;
}

/**
 * Simplified definition for a plugin.
 * This allows plugins to be defined as simple objects with a component and icon.
 */
export interface PluginDef {
    /** Unique ID (optional, will be auto-generated if missing) */
    id?: string;

    /** Name/Tooltip for the menu button */
    name: string;

    /** Icon component */
    icon: Component<any>;

    /** Where the plugin renders its UI (default: 'panel') */
    target?: PluginUiTarget;

    /** Panel component (rendered when `target` is 'panel') */
    panel?: Component<any>;

    /** Flyout component (rendered when `target` is 'flyout') */
    flyout?: Component<any>;

    /** Preferred panel position (default: 'left'; ignored for flyouts) */
    position?: 'left' | 'right' | 'bottom' | 'overlay';

    /** Props to pass to the panel/flyout component */
    props?: Record<string, unknown>;

    /**
     * Lifecycle hook called when the plugin is registered.
     * Use this to set up background logic, reactive effects, or event listeners
     * that should run regardless of whether the plugin's UI is open.
     */
    onInit?: (viewerState: ViewerState) => void;
}

export function definePlugin<T extends PluginDef>(plugin: T): T {
    return plugin;
}

export function createPanelPlugin(plugin: PluginDef): PluginDef {
    return definePlugin({ ...plugin, target: plugin.target ?? 'panel' });
}

export function createFlyoutPlugin(plugin: PluginDef): PluginDef {
    return definePlugin({ ...plugin, target: 'flyout' });
}

export function registerIifePlugin(name: string, plugin: PluginDef): void {
    window.TriiiceratopsPlugins = window.TriiiceratopsPlugins || {};
    window.TriiiceratopsPlugins[name] = plugin;
}
