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
    PluginUiService,
    PluginIcon,
    PluginUiTarget,
    PluginHost,
    PluginActivation,
    SdkPlugin,
    SdkPluginMeta,
    ViewerState,
} from 'triiiceratops';
