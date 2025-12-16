// Main Svelte component export
import '../app.css';
export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';

// Type exports for TypeScript users
export { ViewerState, VIEWER_STATE_KEY } from './state/viewer.svelte';
export { ManifestsState } from './state/manifests.svelte';

// Plugin system exports
export type {
    TriiiceratopsPlugin,
    PluginContext,
    PluginMenuButton,
    PluginPanel,
} from './types/plugin';
export { BasePlugin } from './types/plugin';

// Theme customization exports
export type { ThemeConfig, DaisyUITheme } from './theme/types';
export { DAISYUI_THEMES } from './theme/types';
export {
    applyTheme,
    applyBuiltInTheme,
    applyThemeConfig,
    clearThemeConfig,
    isBuiltInTheme,
    parseThemeConfig,
} from './theme/themeManager';
export { hexToOklch, normalizeColor } from './theme/colorUtils';
