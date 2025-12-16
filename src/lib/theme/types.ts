/**
 * Built-in DaisyUI theme names
 */
export type DaisyUITheme =
    | 'light'
    | 'dark'
    | 'cupcake'
    | 'bumblebee'
    | 'emerald'
    | 'corporate'
    | 'synthwave'
    | 'retro'
    | 'cyberpunk'
    | 'valentine'
    | 'halloween'
    | 'garden'
    | 'forest'
    | 'aqua'
    | 'lofi'
    | 'pastel'
    | 'fantasy'
    | 'wireframe'
    | 'black'
    | 'luxury'
    | 'dracula'
    | 'cmyk'
    | 'autumn'
    | 'business'
    | 'acid'
    | 'lemonade'
    | 'night'
    | 'coffee'
    | 'winter'
    | 'dim'
    | 'nord'
    | 'sunset'
    | 'caramellatte'
    | 'abyss'
    | 'silk';

/**
 * List of all built-in DaisyUI themes for runtime validation
 */
export const DAISYUI_THEMES: DaisyUITheme[] = [
    'light',
    'dark',
    'cupcake',
    'bumblebee',
    'emerald',
    'corporate',
    'synthwave',
    'retro',
    'cyberpunk',
    'valentine',
    'halloween',
    'garden',
    'forest',
    'aqua',
    'lofi',
    'pastel',
    'fantasy',
    'wireframe',
    'black',
    'luxury',
    'dracula',
    'cmyk',
    'autumn',
    'business',
    'acid',
    'lemonade',
    'night',
    'coffee',
    'winter',
    'dim',
    'nord',
    'sunset',
    'caramellatte',
    'abyss',
    'silk',
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
