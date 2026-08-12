/**
 * `@triiiceratops/plugin-sdk` — framework-neutral plugin authoring SDK.
 *
 * The base entry has zero runtime framework dependencies: everything imported
 * from `triiiceratops` here is type-only (erased at build), and the runtime code
 * (`definePlugin`, activation, selectors, compatibility) is self-contained.
 * Framework adapters (Svelte/React/Vue/Lit), the test kit, and real style/
 * locale/icon services arrive as separate subpaths in later tickets (08, 13,
 * 14).
 */

// Authoring entry.
export { definePlugin } from './definePlugin.js';
export type { DefinePluginConfig } from './definePlugin.js';

// Validated toolbar-icon helper (throws synchronously on unsafe markup).
export { svgIcon, SvgIconError } from './svgIcon.js';

// Shape a plugin's global stylesheet + install id for the SDK style service.
export { definePluginStyles } from './pluginStyles.js';

// Await renderer readiness before asking the viewport for coordinates.
export { whenRendererReady } from './renderer.js';
export type { WhenRendererReadyOptions } from './renderer.js';

// Report user-driven command failures through the structured host channel.
export {
    createCommandErrorReporter,
    dispatchPluginCommandError,
} from './reportError.js';

// Activation (per viewer, isolated context).
export { activatePlugin, runActivation } from './activate.js';

// Selectors (memoized, built only on ViewerState.subscribe).
export { createSelectorRuntime } from './selectors.js';
export type { SelectorRuntime } from './selectors.js';

// Compatibility negotiation.
export {
    satisfies,
    collectIncompatibilities,
    negotiateCompatibility,
    PluginCompatibilityError,
} from './compatibility.js';
export type { PluginCompatibilityReason } from './compatibility.js';

// Stub services (ticket 08 supplies real, host-owned implementations).
export {
    createStubStyleService,
    createStubLocaleService,
    createStubUiService,
    createStubSurfaceService,
} from './services.js';

// Re-export the core-owned seam types so plugin authors import them from one
// place. `export type` is erased at build, so this adds no runtime coupling.
export type {
    PluginView,
    PluginContext,
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
