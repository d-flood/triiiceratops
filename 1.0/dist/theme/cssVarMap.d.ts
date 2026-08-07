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
export declare const CSS_VAR_MAP: Record<Exclude<keyof ThemeConfig, 'cssVars'>, string>;
/**
 * Properties whose values are colors and therefore get normalized to oklch.
 */
export declare const COLOR_PROPS: Set<keyof ThemeConfig>;
