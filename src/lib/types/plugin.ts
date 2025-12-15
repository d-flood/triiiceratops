import type { Component } from 'svelte';
import type OpenSeadragon from 'openseadragon';
import type { ViewerState } from '../state/viewer.svelte';

/**
 * Context object passed to plugins during registration.
 * This is the stable public API that plugins depend on.
 */
export interface PluginContext {
    /** The ViewerState instance for accessing/modifying viewer state */
    viewerState: ViewerState;

    /** Get the OpenSeadragon viewer instance (null until ready) */
    getOSDViewer(): OpenSeadragon.Viewer | null;

    /** Register a menu button in the FloatingMenu */
    registerMenuButton(button: PluginMenuButton): void;

    /** Unregister a menu button by ID */
    unregisterMenuButton(buttonId: string): void;

    /** Register a panel component */
    registerPanel(panel: PluginPanel): void;

    /** Unregister a panel by ID */
    unregisterPanel(panelId: string): void;

    /** Emit a custom event that other plugins can listen to */
    emit(eventName: string, data?: unknown): void;

    /** Subscribe to custom events from other plugins */
    on(eventName: string, handler: (data: unknown) => void): () => void;
}

/**
 * Menu button configuration for plugin UI injection.
 */
export interface PluginMenuButton {
    /** Unique identifier (convention: `pluginId:buttonName`) */
    id: string;

    /** Phosphor icon component */
    icon: Component;

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
    component: Component;

    /** Props passed to the component */
    props?: Record<string, unknown>;

    /** Panel position in the viewer */
    position: 'left' | 'right' | 'bottom' | 'overlay';

    /** Reactive getter for visibility */
    isVisible: () => boolean;
}

/**
 * Main plugin interface. All plugins must implement this.
 */
export interface TriiiceratopsPlugin {
    /** Unique plugin identifier (e.g., 'image-manipulation') */
    readonly id: string;

    /** Human-readable name */
    readonly name: string;

    /** Plugin version (semver) */
    readonly version: string;

    /**
     * Called when plugin is registered with the viewer.
     * Store the context and register UI elements here.
     */
    onRegister(context: PluginContext): void;

    /**
     * Called when OpenSeadragon viewer is ready.
     * Attach OSD event handlers here.
     */
    onViewerReady?(viewer: OpenSeadragon.Viewer): void;

    /**
     * Called when the plugin is being destroyed.
     * Clean up all handlers and state.
     */
    onDestroy?(): void;
}

/**
 * Optional base class providing common plugin functionality.
 */
export abstract class BasePlugin implements TriiiceratopsPlugin {
    abstract readonly id: string;
    abstract readonly name: string;
    abstract readonly version: string;

    protected context: PluginContext | null = null;

    onRegister(context: PluginContext): void {
        this.context = context;
    }

    onViewerReady?(viewer: OpenSeadragon.Viewer): void;

    onDestroy(): void {
        this.context = null;
    }

    /** Convenience getter for ViewerState */
    protected get viewerState(): ViewerState {
        if (!this.context) {
            throw new Error(
                `Plugin ${this.id} accessed viewerState before registration`,
            );
        }
        return this.context.viewerState;
    }

    /** Convenience getter for OSD viewer */
    protected get osdViewer(): OpenSeadragon.Viewer | null {
        return this.context?.getOSDViewer() ?? null;
    }
}
