/**
 * Theme manager for applying built-in themes and custom theme configurations.
 */

import type { ThemeConfig, BuiltInTheme } from './types';
import { BUILTIN_THEMES } from './types';
import { normalizeColor } from './colorUtils';
import { CSS_VAR_MAP, COLOR_PROPS } from './cssVarMap';

/**
 * Attribute used to record the raw CSS variables a `cssVars` config applied, so a
 * later `clearThemeConfig` can remove exactly those (they aren't in CSS_VAR_MAP).
 */
const CSS_VARS_ATTR = 'data-ttz-css-vars';

/**
 * Check if a string is a valid built-in theme name
 */
export function isBuiltInTheme(theme: string): theme is BuiltInTheme {
    return BUILTIN_THEMES.includes(theme as BuiltInTheme);
}

/**
 * Apply a built-in theme to an element by setting data-theme attribute
 */
export function applyBuiltInTheme(
    element: HTMLElement,
    theme: BuiltInTheme,
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

        // Handle the raw escape hatch separately
        if (propKey === 'cssVars') continue;

        const cssVar = CSS_VAR_MAP[propKey];
        if (!cssVar) continue;

        let cssValue = String(value);

        // Convert colors to oklch format
        if (COLOR_PROPS.has(propKey)) {
            cssValue = normalizeColor(cssValue);
        }

        element.style.setProperty(cssVar, cssValue);
    }

    // Apply raw CSS-variable overrides (e.g. per-panel overrides on plugin panels).
    // Values are used verbatim (no oklch normalization). Record the names so a later
    // clear can remove exactly these.
    if (config.cssVars) {
        const applied: string[] = [];
        for (const [name, value] of Object.entries(config.cssVars)) {
            if (value === undefined || value === null) continue;
            const cssVar = name.startsWith('--') ? name : `--${name}`;
            element.style.setProperty(cssVar, String(value));
            applied.push(cssVar);
        }
        if (applied.length) {
            element.setAttribute(CSS_VARS_ATTR, applied.join(' '));
        }
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

    // Remove any raw cssVars a previous config applied.
    const recorded = element.getAttribute(CSS_VARS_ATTR);
    if (recorded) {
        for (const cssVar of recorded.split(' ')) {
            if (cssVar) element.style.removeProperty(cssVar);
        }
        element.removeAttribute(CSS_VARS_ATTR);
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
    theme: BuiltInTheme | undefined,
    config: ThemeConfig | undefined,
): void {
    if (theme) {
        // Apply the requested theme
        applyBuiltInTheme(element, theme);
    } else {
        // If no theme specified, remove the attribute to allow inheritance
        element.removeAttribute('data-theme');
    }

    // Clear any previously-applied config first so keys dropped between updates
    // (including raw cssVars) don't linger, then apply the current overrides.
    clearThemeConfig(element);
    if (config) {
        applyThemeConfig(element, config);
    }
}
