/**
 * Single source of truth mapping friendly `ThemeConfig` property names to the CSS
 * custom properties the components consume. Imported by both `themeManager.ts`
 * (to apply configs) and `introspection.ts` (to enumerate tokens), so adding a token
 * here automatically flows to both.
 */
import type { ThemeConfig } from './types';

/**
 * Map friendly ThemeConfig property names to CSS variable names.
 * `cssVars` is handled separately (it's a raw escape hatch, not a single token).
 */
export const CSS_VAR_MAP: Record<
    Exclude<keyof ThemeConfig, 'cssVars'>,
    string
> = {
    // Palette
    primary: '--tri-color-primary',
    primaryContent: '--tri-color-primary-content',
    neutral: '--tri-color-neutral',
    neutralContent: '--tri-color-neutral-content',
    success: '--tri-color-success',
    successContent: '--tri-color-success-content',
    warning: '--tri-color-warning',
    warningContent: '--tri-color-warning-content',
    error: '--tri-color-error',
    errorContent: '--tri-color-error-content',

    // Surfaces (region-named; replace the old base-100/200/300 scale)
    viewerBg: '--tri-viewer-bg',
    toolbarBg: '--tri-toolbar-bg',
    panelBg: '--tri-panel-bg',
    galleryBg: '--tri-gallery-bg',
    inputBg: '--tri-input-bg',
    surfaceBorder: '--tri-surface-border',

    // Content/foreground (each inherits --tri-content by default)
    content: '--tri-content',
    panelContent: '--tri-panel-content',
    toolbarContent: '--tri-toolbar-content',
    viewerContent: '--tri-viewer-content',
    galleryContent: '--tri-gallery-content',

    // Per-panel overrides (built-in panels; each inherits --tri-panel-bg/--tri-panel-content)
    metadataPanelBg: '--tri-metadata-panel-bg',
    metadataPanelContent: '--tri-metadata-panel-content',
    annotationsPanelBg: '--tri-annotations-panel-bg',
    annotationsPanelContent: '--tri-annotations-panel-content',
    searchPanelBg: '--tri-search-panel-bg',
    searchPanelContent: '--tri-search-panel-content',
    structuresPanelBg: '--tri-structures-panel-bg',
    structuresPanelContent: '--tri-structures-panel-content',
    collectionPanelBg: '--tri-collection-panel-bg',
    collectionPanelContent: '--tri-collection-panel-content',

    // Border radius (top-level + per-region overrides)
    radiusBox: '--tri-radius-box',
    radiusButtons: '--tri-radius-buttons',
    radiusSelector: '--tri-radius-selector',
    radiusToolbar: '--tri-radius-toolbar',
    radiusPanels: '--tri-radius-panels',
    radiusControls: '--tri-radius-controls',
    radiusControlsButtons: '--tri-radius-controls-buttons',

    // Sizing
    sizeSelector: '--tri-size-selector',
    sizeField: '--tri-size-field',

    // Border + effects
    border: '--tri-border',
    depth: '--tri-depth',

    // Color scheme (handled specially, not a CSS variable)
    colorScheme: 'color-scheme',
};

/**
 * Properties whose values are colors and therefore get normalized to oklch.
 */
export const COLOR_PROPS = new Set<keyof ThemeConfig>([
    // Palette
    'primary',
    'primaryContent',
    'neutral',
    'neutralContent',
    'success',
    'successContent',
    'warning',
    'warningContent',
    'error',
    'errorContent',
    // Surfaces
    'viewerBg',
    'toolbarBg',
    'panelBg',
    'galleryBg',
    'inputBg',
    'surfaceBorder',
    // Content
    'content',
    'panelContent',
    'toolbarContent',
    'viewerContent',
    'galleryContent',
    // Per-panel overrides
    'metadataPanelBg',
    'metadataPanelContent',
    'annotationsPanelBg',
    'annotationsPanelContent',
    'searchPanelBg',
    'searchPanelContent',
    'structuresPanelBg',
    'structuresPanelContent',
    'collectionPanelBg',
    'collectionPanelContent',
]);
