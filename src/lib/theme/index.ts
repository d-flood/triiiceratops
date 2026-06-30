/**
 * Theme customization for Triiiceratops viewer.
 *
 * This module provides utilities for customizing the built-in themes.
 *
 * @example Setting a built-in theme
 * ```html
 * <triiiceratops-viewer manifest-id="..." theme="dark"></triiiceratops-viewer>
 * ```
 *
 * @example Custom theme configuration (web component)
 * ```html
 * <triiiceratops-viewer
 *   manifest-id="..."
 *   theme="light"
 *   theme-config='{"primary":"#3b82f6","radiusBox":"0.5rem"}'
 * ></triiiceratops-viewer>
 * ```
 *
 * @example Custom theme configuration (JavaScript)
 * ```javascript
 * const viewer = document.querySelector('triiiceratops-viewer');
 * viewer.theme = 'dark';
 * viewer.themeConfig = {
 *   primary: '#3b82f6',
 *   panelBg: '#1e1e2e',
 *   radiusBox: '0.75rem',
 *   border: '2px',
 * };
 * ```
 *
 * @example Svelte component
 * ```svelte
 * <script>
 *   import { TriiiceratopsViewer } from 'triiiceratops';
 *   import { MediaQuery } from 'svelte/reactivity';
 *
 *   const prefersDark = new MediaQuery('(prefers-color-scheme: dark)');
 * </script>
 *
 * <TriiiceratopsViewer
 *   manifestId="..."
 *   theme={prefersDark.current ? 'dark' : 'light'}
 *   themeConfig={{ primary: '#0ea5e9' }}
 * />
 * ```
 */

// Types
export type { ThemeConfig, BuiltInTheme } from './types';
export { BUILTIN_THEMES } from './types';

// Theme manager utilities
export {
    applyTheme,
    applyBuiltInTheme,
    applyThemeConfig,
    clearThemeConfig,
    isBuiltInTheme,
    parseThemeConfig,
} from './themeManager';
export { getThemeCssVariables, getThemePropertyNames } from './introspection';

// Color utilities
export {
    hexToOklch,
    normalizeColor,
    isOklch,
    isHex,
    isRgb,
} from './colorUtils';
