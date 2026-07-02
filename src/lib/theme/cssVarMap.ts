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
    primary: '--color-primary',
    primaryContent: '--color-primary-content',
    neutral: '--color-neutral',
    neutralContent: '--color-neutral-content',
    success: '--color-success',
    successContent: '--color-success-content',
    warning: '--color-warning',
    warningContent: '--color-warning-content',
    error: '--color-error',
    errorContent: '--color-error-content',

    // Surfaces (region-named; replace the old base-100/200/300 scale)
    viewerBg: '--viewer-bg',
    toolbarBg: '--toolbar-bg',
    panelBg: '--panel-bg',
    galleryBg: '--gallery-bg',
    inputBg: '--input-bg',
    surfaceBorder: '--surface-border',

    // Content/foreground (each inherits --content by default)
    content: '--content',
    panelContent: '--panel-content',
    toolbarContent: '--toolbar-content',
    viewerContent: '--viewer-content',
    galleryContent: '--gallery-content',

    // Per-panel overrides (built-in panels; each inherits --panel-bg/--panel-content)
    metadataPanelBg: '--metadata-panel-bg',
    metadataPanelContent: '--metadata-panel-content',
    annotationsPanelBg: '--annotations-panel-bg',
    annotationsPanelContent: '--annotations-panel-content',
    searchPanelBg: '--search-panel-bg',
    searchPanelContent: '--search-panel-content',
    structuresPanelBg: '--structures-panel-bg',
    structuresPanelContent: '--structures-panel-content',
    collectionPanelBg: '--collection-panel-bg',
    collectionPanelContent: '--collection-panel-content',

    // Border radius (top-level + per-region overrides)
    radiusBox: '--radius-box',
    radiusButtons: '--radius-buttons',
    radiusSelector: '--radius-selector',
    radiusToolbar: '--radius-toolbar',
    radiusPanels: '--radius-panels',
    radiusControls: '--radius-controls',
    radiusControlsButtons: '--radius-controls-buttons',

    // Sizing
    sizeSelector: '--size-selector',
    sizeField: '--size-field',

    // Border + effects
    border: '--border',
    depth: '--depth',

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
