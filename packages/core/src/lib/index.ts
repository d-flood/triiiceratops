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

// Plugin chrome records — the panel, flyout, and toolbar-button entries core
// registers for a plugin and renders from.
export type {
    PluginMenuButton,
    PluginPanel,
    PluginFlyout,
    PluginUiTarget,
} from './types/plugin';

// SDK plugin seam (ticket 07) — the framework-neutral authoring contract that
// `@triiiceratops/plugin-sdk` implements against, and the ONE plugin path in
// 1.0. Core owns the types and mounts SDK plugins through this structural seam.
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

// The custom element's state bridge (framework-wrappers ticket 02): the
// getter-only `viewerState` property paired with the `viewerstateavailable`
// lifecycle event. This is how a Web Component host binds to the live
// `ViewerState` a given element owns.
export type { TriiiceratopsViewerElement } from './types/viewerElement';
export { VIEWER_STATE_AVAILABLE_EVENT } from './types/viewerElement';

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
