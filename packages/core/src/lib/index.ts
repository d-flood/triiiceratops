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
    PluginSurface,
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

// Structured viewer-failure channel (ticket 18) — mirrors the `pluginerror`
// shape (ticket 09) for viewer-level configuration, content, and operation
// failures. Delivered as a bubbling, composed `viewererror` CustomEvent from the
// viewer root and the `onviewererror` host callback.
export type {
    ViewerError,
    ViewerErrorScope,
    ViewerErrorSeverity,
    ViewerErrorReporter,
} from './types/viewerError';
export { VIEWER_ERROR_EVENT } from './types/viewerError';

// Opt-in developer diagnostics (ticket 18). Production is quiet by default;
// consumers enable logging through `ViewerConfig.debug`. `configureLogging`
// additionally allows a host to inject a custom log sink.
export type { Logger, LogLevel, LogSink } from './logging/logger';
export { logger, configureLogging, isDebugEnabled } from './logging/logger';

// Core's declared plugin-compatibility surface (ticket 07).
export { CORE_VERSION, pluginApiVersion, capabilities } from './plugin/api';

// The plugin's own panel/flyout chrome, handed to it as `PluginContext.surface`.
// Exported so the SDK test kit can build the REAL surface over a headless state
// rather than re-implement it.
export { createPluginSurface } from './plugin/surface';

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
