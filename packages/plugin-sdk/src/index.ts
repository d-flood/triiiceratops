export { definePlugin } from './definePlugin.js';
export type { DefinePluginConfig } from './definePlugin.js';

// Validated toolbar-icon helper (throws synchronously on unsafe markup).
export { svgIcon, SvgIconError } from './svgIcon.js';

export { definePluginStyles } from './pluginStyles.js';

export { whenRendererReady } from './renderer.js';
export type { WhenRendererReadyOptions } from './renderer.js';

// Report user-driven command failures through the structured host channel.
export {
    createCommandErrorReporter,
    dispatchPluginCommandError,
} from './reportError.js';

// Activation (per viewer, isolated context).
export { activatePlugin, runActivation } from './activate.js';

export { createSelectorRuntime } from './selectors.js';
export type { SelectorRuntime } from './selectors.js';

export {
    satisfies,
    negotiateCompatibility,
    PluginCompatibilityError,
} from './compatibility.js';

export type {
    PluginView,
    PluginContext,
    PublishedState,
    PublishedStateClassification,
    SelectorSource,
    SourceSelectors,
    ViewerSelectors,
    Selector,
    PluginStyleService,
    PluginLocaleService,
    LocaleCatalog,
    PluginUiService,
    PluginSurface,
    IconDescriptor,
    PluginIcon,
    PluginUiTarget,
    PluginHost,
    PluginActivation,
    SdkPlugin,
    SdkPluginMeta,
    PluginErrorPhase,
    PluginError,
    PluginErrorReport,
    ViewerState,
} from 'triiiceratops';
