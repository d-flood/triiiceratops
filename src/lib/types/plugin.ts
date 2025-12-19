import type { Component } from 'svelte';
import type { ViewerState } from '../state/viewer.svelte';

/**
 * Menu button configuration for plugin UI injection.
 */
export interface PluginMenuButton {
    /** Unique identifier (convention: `pluginId:buttonName`) */
    id: string;

    /** Phosphor icon component */
    icon: Component<any>;

    /** Tooltip text */
    tooltip: string;

    /** Click handler */
    onClick: () => void;

    /** Reactive getter for active/pressed state */
    isActive?: () => boolean;

    /** CSS class when active (default: 'btn-primary') */
    activeClass?: string;

    /** Sort order - lower numbers appear first (default: 100) */
    order?: number;
}

/**
 * Panel configuration for plugin UI injection.
 */
export interface PluginPanel {
    /** Unique identifier (convention: `pluginId:panelName`) */
    id: string;

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

    /** Panel component */
    panel: Component<any>;

    /** Preferred position (default: 'left') */
    position?: 'left' | 'right' | 'bottom' | 'overlay';

    /** Props to pass to the panel component */
    props?: Record<string, unknown>;
}
