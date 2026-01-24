export interface RequestConfig {
    /**
     * Extra headers to send with the IIIF manifest request
     */
    headers?: Record<string, string>;
    /**
     * Whether to use credentials (cookies) for the request
     */
    withCredentials?: boolean;
}

export interface GalleryConfig {
    /**
     * Where the gallery should be docked by default if shown.
     * @default 'bottom'
     */
    dockPosition?: 'left' | 'right' | 'top' | 'bottom' | 'none';
    /**
     * Whether the gallery can be dragged/moved by the user.
     * @default true
     */
    draggable?: boolean;
    /**
     * Whether the gallery is currently open/visible.
     * @default false
     */
    open?: boolean;
    /**
     * Whether to show the close button on the gallery.
     * @default true
     */
    showCloseButton?: boolean;
}

export interface SearchConfig {
    /**
     * Where the search panel should appear.
     * @default 'right'
     */
    position?: 'left' | 'right';
    /**
     * Whether the search panel is currently open.
     * @default false
     */
    open?: boolean;
    /**
     * Whether to show the close button.
     * @default true
     */
    showCloseButton?: boolean;
    /**
     * Initial search query to execute.
     */
    query?: string;
    /**
     * Width of the search panel.
     * @default '320px'
     */
    width?: string;
}

export interface AnnotationsConfig {
    /**
     * Whether the annotations panel/list is open.
     * @default false
     */
    open?: boolean;
    /**
     * Whether annotations are currently visible on the canvas.
     * @default false
     */
    visible?: boolean;
}

export interface ToolbarConfig {
    /**
     * Whether the Search button is shown in this menu.
     * @default true
     */
    showSearch?: boolean;
    /**
     * Whether the Gallery toggle button is shown in this menu.
     * @default true
     */
    showGallery?: boolean;
    /**
     * Whether the Annotations toggle button is shown in this menu.
     * @default true
     */
    showAnnotations?: boolean;
    /**
     * Whether the Info/Metadata button is shown in this menu.
     * @default true
     */
    showInfo?: boolean;
    /**
     * Whether the Fullscreen button is shown in this menu.
     * @default true
     */
    showFullscreen?: boolean;
    /**
     * Whether the Viewing Mode button/menu is shown in this menu.
     * @default true
     */
    showViewingMode?: boolean;
}

export interface ViewerConfig {
    /**
     * Whether to show the canvas navigation arrows/controls.
     * @default true
     */
    showCanvasNav?: boolean;

    /**
     * The viewing mode for the viewer.
     * 'individuals' = Single canvas view
     * 'paged' = Dual canvas view (book view)
     * @default 'individuals'
     */
    viewingMode?: 'individuals' | 'paged';

    /**
     * Whether to show the zoom controls in the canvas navigation.
     * @default true
     */
    showZoomControls?: boolean;

    /**
     * Configuration for the thumbnail gallery pane.
     */
    gallery?: GalleryConfig;

    /**
     * Configuration for the search pane.
     */
    search?: SearchConfig;

    /**
     * Configuration for annotations.
     */
    annotations?: AnnotationsConfig;

    /**
     * Configuration for network requests (manifests, etc)
     */
    requests?: RequestConfig;

    /**
     * Whether the viewer background should be transparent.
     * @default false
     */
    transparentBackground?: boolean;

    /**
     * Whether the toolbar open/close toggle button is visible.
     * @default true
     */
    showToggle?: boolean;

    /**
     * Whether the toolbar is currently expanded/open.
     * @default false
     */
    toolbarOpen?: boolean;

    /**
     * Which side the toolbar should appear on.
     * @default 'left'
     */
    toolbarPosition?: 'left' | 'right' | 'top';

    /**
     * Configuration for the toolbar items.
     */
    toolbar?: ToolbarConfig;
}
