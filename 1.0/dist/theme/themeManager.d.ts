/**
 * Theme manager for applying built-in themes and custom theme configurations.
 */
import type { ThemeConfig, BuiltInTheme } from './types';
/**
 * Check if a string is a valid built-in theme name
 */
export declare function isBuiltInTheme(theme: string): theme is BuiltInTheme;
/**
 * Apply a built-in theme to an element by setting data-theme attribute
 */
export declare function applyBuiltInTheme(element: HTMLElement, theme: BuiltInTheme): void;
/**
 * Apply custom theme configuration as CSS custom properties on an element.
 * These override the base theme's values.
 */
export declare function applyThemeConfig(element: HTMLElement, config: ThemeConfig): void;
/**
 * Clear all custom theme CSS variables from an element
 */
export declare function clearThemeConfig(element: HTMLElement): void;
/**
 * Parse a theme config from a JSON string (for HTML attribute usage)
 */
export declare function parseThemeConfig(json: string): ThemeConfig | null;
/**
 * Apply theme to an element.
 *
 * @param element - The HTML element to apply the theme to
 * @param theme - Built-in theme name (defaults to light/dark based on prefers-color-scheme)
 * @param config - Optional custom theme configuration to override the base theme
 * @param prefersDark - Whether the user prefers dark mode (from media query)
 */
export declare function applyTheme(element: HTMLElement, theme: BuiltInTheme | undefined, config: ThemeConfig | undefined): void;
