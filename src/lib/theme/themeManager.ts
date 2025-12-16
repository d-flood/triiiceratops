/**
 * Theme manager for applying DaisyUI themes and custom theme configurations.
 */

import type { ThemeConfig, DaisyUITheme } from './types';
import { DAISYUI_THEMES } from './types';
import { normalizeColor } from './colorUtils';

/**
 * Map friendly ThemeConfig property names to DaisyUI CSS variable names
 */
const CSS_VAR_MAP: Record<keyof ThemeConfig, string> = {
    // Semantic colors
    primary: '--color-primary',
    primaryContent: '--color-primary-content',
    secondary: '--color-secondary',
    secondaryContent: '--color-secondary-content',
    accent: '--color-accent',
    accentContent: '--color-accent-content',
    neutral: '--color-neutral',
    neutralContent: '--color-neutral-content',

    // Base colors
    base100: '--color-base-100',
    base200: '--color-base-200',
    base300: '--color-base-300',
    baseContent: '--color-base-content',

    // State colors
    info: '--color-info',
    infoContent: '--color-info-content',
    success: '--color-success',
    successContent: '--color-success-content',
    warning: '--color-warning',
    warningContent: '--color-warning-content',
    error: '--color-error',
    errorContent: '--color-error-content',

    // Border radius
    radiusBox: '--radius-box',
    radiusField: '--radius-field',
    radiusSelector: '--radius-selector',

    // Sizing
    sizeSelector: '--size-selector',
    sizeField: '--size-field',

    // Border
    border: '--border',

    // Effects
    depth: '--depth',
    noise: '--noise',

    // Color scheme (handled specially, not a CSS variable)
    colorScheme: 'color-scheme',
};

/**
 * Set of properties that are colors and need oklch conversion
 */
const COLOR_PROPS = new Set<keyof ThemeConfig>([
    'primary',
    'primaryContent',
    'secondary',
    'secondaryContent',
    'accent',
    'accentContent',
    'neutral',
    'neutralContent',
    'base100',
    'base200',
    'base300',
    'baseContent',
    'info',
    'infoContent',
    'success',
    'successContent',
    'warning',
    'warningContent',
    'error',
    'errorContent',
]);

/**
 * Check if a string is a valid built-in DaisyUI theme name
 */
export function isBuiltInTheme(theme: string): theme is DaisyUITheme {
    return DAISYUI_THEMES.includes(theme as DaisyUITheme);
}

/**
 * Apply a built-in theme to an element by setting data-theme attribute
 */
export function applyBuiltInTheme(
    element: HTMLElement,
    theme: DaisyUITheme,
): void {
    element.setAttribute('data-theme', theme);
}

/**
 * Apply custom theme configuration as CSS custom properties on an element.
 * These override the base theme's values.
 */
export function applyThemeConfig(
    element: HTMLElement,
    config: ThemeConfig,
): void {
    for (const [key, value] of Object.entries(config)) {
        if (value === undefined || value === null) continue;

        const propKey = key as keyof ThemeConfig;

        // Handle colorScheme specially - it's not a CSS variable
        if (propKey === 'colorScheme') {
            element.style.colorScheme = value as string;
            continue;
        }

        const cssVar = CSS_VAR_MAP[propKey];
        if (!cssVar) continue;

        let cssValue = String(value);

        // Convert colors to oklch format
        if (COLOR_PROPS.has(propKey)) {
            cssValue = normalizeColor(cssValue);
        }

        element.style.setProperty(cssVar, cssValue);
    }
}

/**
 * Clear all custom theme CSS variables from an element
 */
export function clearThemeConfig(element: HTMLElement): void {
    for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
        if (key === 'colorScheme') {
            element.style.colorScheme = '';
        } else {
            element.style.removeProperty(cssVar);
        }
    }
}

/**
 * Parse a theme config from a JSON string (for HTML attribute usage)
 */
export function parseThemeConfig(json: string): ThemeConfig | null {
    try {
        const parsed = JSON.parse(json);
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed as ThemeConfig;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Apply theme to an element.
 *
 * @param element - The HTML element to apply the theme to
 * @param theme - Built-in theme name (defaults to light/dark based on prefers-color-scheme)
 * @param config - Optional custom theme configuration to override the base theme
 * @param prefersDark - Whether the user prefers dark mode (from media query)
 */
export function applyTheme(
    element: HTMLElement,
    theme: DaisyUITheme | undefined,
    config: ThemeConfig | undefined,
): void {
    if (theme) {
        // Apply the requested theme
        applyBuiltInTheme(element, theme);
    } else {
        // If no theme specified, remove the attribute to allow inheritance
        element.removeAttribute('data-theme');
    }

    // Clear any previous custom config
    if (!config) {
        clearThemeConfig(element);
    } else {
        // Apply custom config overrides
        applyThemeConfig(element, config);
    }
}

/**
 * Get all CSS variable names that can be customized
 */
export function getThemeCssVariables(): string[] {
    return Object.values(CSS_VAR_MAP).filter((v) => v !== 'color-scheme');
}

/**
 * Get all customizable theme property names
 */
export function getThemePropertyNames(): (keyof ThemeConfig)[] {
    return Object.keys(CSS_VAR_MAP) as (keyof ThemeConfig)[];
}
