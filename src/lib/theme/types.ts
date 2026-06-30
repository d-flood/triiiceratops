/**
 * Built-in theme names shipped with the viewer (2 light, 2 dark).
 * Custom theming beyond these stays available via the `themeConfig` prop and by
 * setting CSS variables (e.g. --color-primary) on the host element.
 */
export type BuiltInTheme = 'light' | 'dark' | 'cupcake' | 'dracula';

/**
 * List of all built-in themes for runtime validation.
 */
export const BUILTIN_THEMES: BuiltInTheme[] = [
    'light',
    'dark',
    'cupcake',
    'dracula',
];

/**
 * Custom theme configuration with friendly property names.
 *
 * All color values accept hex (#rrggbb), rgb(r,g,b), or oklch() strings and are
 * normalized to oklch when applied. Every property here can also be set directly as
 * a CSS variable on the host element (the `cssVars` escape hatch covers anything not
 * listed, e.g. per-panel overrides for plugin panels).
 *
 * The inheritance model:
 *   - Surfaces: `--viewer-bg`, `--toolbar-bg`, `--panel-bg` are the top-level slots.
 *     `galleryBg`/`inputBg` default to the viewer surface; `*PanelBg` default to
 *     `panelBg`. Override the general slot to retint everything, or a specific one to
 *     retint just that region/panel.
 *   - Content: `panelContent`/`toolbarContent`/`viewerContent`/`galleryContent` and
 *     the per-panel `*Content` all default to the global `content` color.
 *   - Radius: `radiusToolbar`/`radiusPanels`/`radiusControls` default to `radiusBox`;
 *     `radiusControlsButtons` defaults to `radiusField`.
 */
export interface ThemeConfig {
    // ---- Palette ----
    /** Primary brand color (hex, rgb, or oklch) */
    primary?: string;
    /** Text color for content on a primary background */
    primaryContent?: string;
    /** Neutral color, used for tooltips and active menu items */
    neutral?: string;
    /** Text color for content on a neutral background */
    neutralContent?: string;
    /** Success state color */
    success?: string;
    /** Text color for content on a success background */
    successContent?: string;
    /** Warning state color */
    warning?: string;
    /** Text color for content on a warning background */
    warningContent?: string;
    /** Error state color */
    error?: string;
    /** Text color for content on an error background */
    errorContent?: string;

    // ---- Surfaces ----
    /** Main viewer/canvas background (behind the image) */
    viewerBg?: string;
    /** Toolbar and canvas-nav controls background */
    toolbarBg?: string;
    /** Default background for all side/plugin panels */
    panelBg?: string;
    /** Thumbnail gallery background (defaults to viewerBg) */
    galleryBg?: string;
    /** Form input/control surface (defaults to viewerBg) */
    inputBg?: string;
    /** Border and divider color */
    surfaceBorder?: string;

    // ---- Content / foreground ----
    /** Global default text/icon color */
    content?: string;
    /** Text color inside panels (defaults to content) */
    panelContent?: string;
    /** Text color inside the toolbar (defaults to content) */
    toolbarContent?: string;
    /** Text color over the viewer background (defaults to content) */
    viewerContent?: string;
    /** Text color inside the thumbnail gallery (defaults to content) */
    galleryContent?: string;

    // ---- Per-panel overrides (built-in panels; default to panelBg/panelContent) ----
    /** Metadata (information) panel background */
    metadataPanelBg?: string;
    /** Metadata (information) panel text color */
    metadataPanelContent?: string;
    /** Annotations panel background */
    annotationsPanelBg?: string;
    /** Annotations panel text color */
    annotationsPanelContent?: string;
    /** Search panel background */
    searchPanelBg?: string;
    /** Search panel text color */
    searchPanelContent?: string;
    /** Structures (table of contents) panel background */
    structuresPanelBg?: string;
    /** Structures (table of contents) panel text color */
    structuresPanelContent?: string;
    /** Collection panel background */
    collectionPanelBg?: string;
    /** Collection panel text color */
    collectionPanelContent?: string;

    // ---- Border radius ----
    /** Radius for large components like cards, modals, panels (e.g., '1rem') */
    radiusBox?: string;
    /** Radius for medium components like inputs and buttons (e.g., '0.5rem') */
    radiusField?: string;
    /** Radius for small components like checkboxes, toggles, badges (e.g., '0.25rem') */
    radiusSelector?: string;
    /** Toolbar corner radius (defaults to radiusBox) */
    radiusToolbar?: string;
    /** Panel corner radius (defaults to radiusBox) */
    radiusPanels?: string;
    /** Canvas-nav controls pill radius (defaults to radiusBox) */
    radiusControls?: string;
    /** Radius of the buttons inside the canvas-nav pill (defaults to radiusField) */
    radiusControlsButtons?: string;

    // ---- Sizing ----
    /** Base size for small components like checkboxes (e.g., '0.25rem') */
    sizeSelector?: string;
    /** Base size for form fields (e.g., '0.25rem') */
    sizeField?: string;

    // ---- Border ----
    /** Border width for components (e.g., '1px') */
    border?: string;

    // ---- Effects ----
    /** Enable depth effect for components (0 or 1) */
    depth?: 0 | 1;

    // ---- Color scheme for browser UI ----
    /** Color scheme hint for browser-provided UI elements */
    colorScheme?: 'light' | 'dark';

    /**
     * Raw CSS-variable overrides for anything not covered by a typed key — most
     * usefully per-panel overrides on plugin panels. Keys are CSS variable names
     * WITHOUT the leading `--`; values are used verbatim (NOT normalized to oklch).
     * @example { 'image-manipulation-panel-bg': '#eef', 'pdf-export-panel-bg': '#fff' }
     */
    cssVars?: Record<string, string>;
}
