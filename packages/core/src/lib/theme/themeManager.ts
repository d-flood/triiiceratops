/**
 * Theme manager for applying built-in themes and custom theme configurations.
 */

import type { ThemeConfig, BuiltInTheme } from './types';
import { BUILTIN_THEMES } from './types';
import { CSS_VAR_MAP } from './cssVarMap';

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
 *
 * Values are applied exactly as the author wrote them: every rule consumes the
 * tokens through `color-mix(in oklab, …)`, which accepts any colour syntax, so
 * reading a token back gives the host its own string.
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

        const token = CSS_VAR_MAP[propKey];
        if (!token) continue;

        element.style.setProperty(token.cssVar, String(value));
    }

    // Apply raw CSS-variable overrides (e.g. per-panel overrides on plugin panels).
    // Record the names so a later clear can remove exactly these.
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
    for (const [key, token] of Object.entries(CSS_VAR_MAP)) {
        if (key === 'colorScheme') {
            element.style.colorScheme = '';
        } else {
            element.style.removeProperty(token.cssVar);
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
 * With no theme the attribute is removed, and the stylesheet's zero-specificity
 * defaults paint — which are `light`'s own values. Following the reader's
 * colour scheme is the host's call: `theme={prefersDark ? 'dark' : 'light'}`.
 *
 * @param element - The HTML element to apply the theme to
 * @param theme - Built-in theme name; omitted leaves the element on the defaults
 * @param config - Optional custom theme configuration to override the base theme
 */
export function applyTheme(
    element: HTMLElement,
    theme: BuiltInTheme | undefined,
    config: ThemeConfig | undefined,
): void {
    if (theme) {
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
