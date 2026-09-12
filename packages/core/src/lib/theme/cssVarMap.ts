/**
 * Single source of truth mapping friendly `ThemeConfig` property names to the CSS
 * custom properties the components consume. Imported by both `themeManager.ts`
 * (to apply configs) and `introspection.ts` (to enumerate tokens), so adding a token
 * here automatically flows to both.
 */
import type { ThemeConfig } from './types';

/**
 * One friendly name's target. `color` marks the entries whose values are colors;
 * they are applied verbatim like every other token, in whatever syntax the author
 * wrote, because every rule consumes them through `color-mix(in oklab, …)`.
 */
export interface ThemeToken {
    cssVar: string;
    color?: true;
}

/**
 * Map friendly ThemeConfig property names to CSS variable names.
 * `cssVars` is handled separately (it's a raw escape hatch, not a single token).
 */
export const CSS_VAR_MAP: Record<
    Exclude<keyof ThemeConfig, 'cssVars'>,
    ThemeToken
> = {
    // Palette
    primary: { cssVar: '--tri-color-primary', color: true },
    primaryContent: { cssVar: '--tri-color-primary-content', color: true },
    neutral: { cssVar: '--tri-color-neutral', color: true },
    neutralContent: { cssVar: '--tri-color-neutral-content', color: true },
    success: { cssVar: '--tri-color-success', color: true },
    successContent: { cssVar: '--tri-color-success-content', color: true },
    warning: { cssVar: '--tri-color-warning', color: true },
    warningContent: { cssVar: '--tri-color-warning-content', color: true },
    error: { cssVar: '--tri-color-error', color: true },
    errorContent: { cssVar: '--tri-color-error-content', color: true },

    // Surfaces
    viewerBg: { cssVar: '--tri-viewer-bg', color: true },
    toolbarBg: { cssVar: '--tri-toolbar-bg', color: true },
    panelBg: { cssVar: '--tri-panel-bg', color: true },
    galleryBg: { cssVar: '--tri-gallery-bg', color: true },
    inputBg: { cssVar: '--tri-input-bg', color: true },
    surfaceBorder: { cssVar: '--tri-surface-border', color: true },

    // Content/foreground (each inherits --tri-content by default)
    content: { cssVar: '--tri-content', color: true },
    panelContent: { cssVar: '--tri-panel-content', color: true },
    toolbarContent: { cssVar: '--tri-toolbar-content', color: true },
    viewerContent: { cssVar: '--tri-viewer-content', color: true },
    galleryContent: { cssVar: '--tri-gallery-content', color: true },

    // Per-panel overrides (built-in panels; each inherits --tri-panel-bg/--tri-panel-content)
    metadataPanelBg: { cssVar: '--tri-metadata-panel-bg', color: true },
    metadataPanelContent: {
        cssVar: '--tri-metadata-panel-content',
        color: true,
    },
    annotationsPanelBg: { cssVar: '--tri-annotations-panel-bg', color: true },
    annotationsPanelContent: {
        cssVar: '--tri-annotations-panel-content',
        color: true,
    },
    searchPanelBg: { cssVar: '--tri-search-panel-bg', color: true },
    searchPanelContent: { cssVar: '--tri-search-panel-content', color: true },
    structuresPanelBg: { cssVar: '--tri-structures-panel-bg', color: true },
    structuresPanelContent: {
        cssVar: '--tri-structures-panel-content',
        color: true,
    },
    collectionPanelBg: { cssVar: '--tri-collection-panel-bg', color: true },
    collectionPanelContent: {
        cssVar: '--tri-collection-panel-content',
        color: true,
    },

    // Annotation shapes
    annotationColor: { cssVar: '--tri-annotation-color', color: true },
    annotationHitColor: { cssVar: '--tri-annotation-hit-color', color: true },
    annotationBorderWidth: { cssVar: '--tri-annotation-border-width' },
    annotationFillOpacity: { cssVar: '--tri-annotation-fill-opacity' },
    annotationPointSize: { cssVar: '--tri-annotation-point-size' },

    // Border radius (top-level + per-region overrides)
    radiusBox: { cssVar: '--tri-radius-box' },
    radiusButtons: { cssVar: '--tri-radius-buttons' },
    radiusSelector: { cssVar: '--tri-radius-selector' },
    radiusToolbar: { cssVar: '--tri-radius-toolbar' },
    radiusPanels: { cssVar: '--tri-radius-panels' },
    radiusControls: { cssVar: '--tri-radius-controls' },
    radiusControlsButtons: { cssVar: '--tri-radius-controls-buttons' },

    // Sizing
    sizeSelector: { cssVar: '--tri-size-selector' },
    sizeField: { cssVar: '--tri-size-field' },

    // Border + effects
    border: { cssVar: '--tri-border' },
    depth: { cssVar: '--tri-depth' },

    // Color scheme (handled specially, not a CSS variable)
    colorScheme: { cssVar: 'color-scheme' },
};
