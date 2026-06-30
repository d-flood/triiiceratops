/**
 * Built-in theme names shipped with the viewer (2 light, 2 dark).
 * Custom theming beyond these stays available via the `themeConfig` prop and by
 * setting CSS variables (e.g. --color-primary) on the host element.
 */
export type BuiltInTheme = 'light' | 'dark' | 'cupcake' | 'dracula';

/**
 * List of all built-in themes for runtime validation.
 */
export const BUILTIN_THEMES: BuiltInTheme[] = [
    'light',
    'dark',
    'cupcake',
    'dracula',
];

/**
 * Custom theme configuration with friendly property names.
 * All color values accept hex (#rrggbb), rgb(r,g,b), or oklch() strings.
 * This is used to override the base theme's values.
 */
export interface ThemeConfig {
    // Semantic colors
    /** Primary brand color (hex, rgb, or oklch) */
    primary?: string;
    /** Text color for content on primary background */
    primaryContent?: string;
    /** Secondary brand color (hex, rgb, or oklch) */
    secondary?: string;
    /** Text color for content on secondary background */
    secondaryContent?: string;
    /** Accent brand color (hex, rgb, or oklch) */
    accent?: string;
    /** Text color for content on accent background */
    accentContent?: string;
    /** Neutral dark color (hex, rgb, or oklch) */
    neutral?: string;
    /** Text color for content on neutral background */
    neutralContent?: string;

    // Base/background colors
    /** Main background color (base-100) */
    base100?: string;
    /** Slightly darker background (base-200) */
    base200?: string;
    /** Even darker background (base-300) */
    base300?: string;
    /** Default text color on base backgrounds */
    baseContent?: string;

    // State colors
    /** Info state color */
    info?: string;
    /** Text color for content on info background */
    infoContent?: string;
    /** Success state color */
    success?: string;
    /** Text color for content on success background */
    successContent?: string;
    /** Warning state color */
    warning?: string;
    /** Text color for content on warning background */
    warningContent?: string;
    /** Error state color */
    error?: string;
    /** Text color for content on error background */
    errorContent?: string;

    // Border radius
    /** Border radius for large components like cards, modals (e.g., '1rem') */
    radiusBox?: string;
    /** Border radius for medium components like inputs, buttons (e.g., '0.5rem') */
    radiusField?: string;
    /** Border radius for small components like checkboxes, toggles (e.g., '0.25rem') */
    radiusSelector?: string;

    // Sizing
    /** Base size for small components like checkboxes (e.g., '0.25rem') */
    sizeSelector?: string;
    /** Base size for form fields (e.g., '0.25rem') */
    sizeField?: string;

    // Border
    /** Border width for components (e.g., '1px') */
    border?: string;

    // Effects (binary: 0 or 1)
    /** Enable depth effect for components (0 or 1) */
    depth?: 0 | 1;
    /** Enable noise background effect for components (0 or 1) */
    noise?: 0 | 1;

    // Color scheme for browser UI
    /** Color scheme hint for browser-provided UI elements */
    colorScheme?: 'light' | 'dark';
}
