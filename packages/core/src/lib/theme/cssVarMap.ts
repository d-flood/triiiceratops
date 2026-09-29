/**
 * Single source of truth mapping friendly `ThemeConfig` property names to the CSS
 * custom properties the components consume. Imported by both `themeManager.ts`
 * (to apply configs) and `introspection.ts` (to enumerate tokens), so adding a token
 * here automatically flows to both.
 */
import type { ThemeConfig } from './types';

type ThemeKey = Exclude<keyof ThemeConfig, 'cssVars'>;

export interface ThemeToken {
    cssVar: string;
}

const PALETTE_KEYS: ThemeKey[] = [
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
];

const TOKEN_KEYS: ThemeKey[] = [
    'viewerBg',
    'toolbarBg',
    'panelBg',
    'galleryBg',
    'inputBg',
    'surfaceBorder',
    'content',
    'panelContent',
    'toolbarContent',
    'viewerContent',
    'galleryContent',
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
    'annotationColor',
    'annotationHitColor',
    'annotationBorderWidth',
    'annotationFillOpacity',
    'annotationPointSize',
    'radiusBox',
    'radiusButtons',
    'radiusSelector',
    'radiusToolbar',
    'radiusPanels',
    'radiusControls',
    'radiusControlsButtons',
    'sizeSelector',
    'sizeField',
    'border',
    'depth',
];

const kebab = (key: string) =>
    key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/**
 * Map friendly ThemeConfig property names to CSS variable names.
 * `cssVars` is handled separately (it's a raw escape hatch, not a single token).
 * `colorScheme` is not a CSS variable and is handled specially.
 */
export const CSS_VAR_MAP = Object.fromEntries([
    ...PALETTE_KEYS.map((key) => [
        key,
        { cssVar: `--tri-color-${kebab(key)}` },
    ]),
    ...TOKEN_KEYS.map((key) => [key, { cssVar: `--tri-${kebab(key)}` }]),
    ['colorScheme', { cssVar: 'color-scheme' }],
]) as Record<ThemeKey, ThemeToken>;
