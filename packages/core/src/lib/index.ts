// Main Svelte component export

export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';

// Type exports for TypeScript users
export { ViewerState, VIEWER_STATE_KEY } from './state/viewer.svelte';
export type { ViewerStateSnapshot } from './state/viewer.svelte';
export { ManifestsState } from './state/manifests.svelte';
export { manifestsState } from './state/manifests.svelte';
export type {
    SearchHit,
    SearchProvider,
    SearchProviderContext,
    SearchResultGroup,
} from './types/config';

// Plugin system exports (legacy PluginDef path)
export type {
    PluginDef,
    PluginMenuButton,
    PluginPanel,
    PluginFlyout,
    PluginUiTarget,
} from './types/plugin';
export {
    definePlugin,
    createPanelPlugin,
    createFlyoutPlugin,
} from './types/plugin';

// SDK plugin seam (ticket 07) — the framework-neutral authoring contract that
// `@triiiceratops/plugin-sdk` implements against. Core owns the types and can
// mount SDK-style plugins beside the legacy path above.
export type {
    Selector,
    ViewerSelectors,
    PluginStyleService,
    PluginLocaleService,
    LocaleCatalog,
    IconDescriptor,
    PluginIcon,
    PluginUiService,
    PluginContext,
    PluginView,
    PluginHost,
    PluginActivation,
    SdkPluginMeta,
    SdkPlugin,
    PluginErrorPhase,
    PluginError,
    PluginErrorReport,
} from './types/plugin';
export {
    SDK_PLUGIN_KIND,
    isSdkPlugin,
    PLUGIN_ERROR_EVENT,
} from './types/plugin';

// Core's declared plugin-compatibility surface (ticket 07).
export {
    CORE_VERSION,
    pluginApiVersion,
    capabilities,
} from './plugin/api';

// Structures (TOC) exports
export type { StructureNode } from './utils/structures';

// Collections exports
export type { CollectionItem } from './utils/collections';

// Theme customization exports
export type { ThemeConfig, BuiltInTheme } from './theme/types';
export { BUILTIN_THEMES } from './theme/types';
export {
    applyTheme,
    applyBuiltInTheme,
    applyThemeConfig,
    clearThemeConfig,
    isBuiltInTheme,
    parseThemeConfig,
} from './theme/themeManager';
export { hexToOklch, normalizeColor } from './theme/colorUtils';
