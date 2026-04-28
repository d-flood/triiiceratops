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
    extends ClosablePanelConfig,
        SidebarPanelConfig {
    /**
     * Whether the annotations panel/list is open.
     * @default false
     */
    open?: boolean;
}

export interface InformationConfig
    extends ClosablePanelConfig,
        SidebarPanelConfig {
    /**
     * Whether the information panel is currently open.
     * @default false
     */
    open?: boolean;
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
}
