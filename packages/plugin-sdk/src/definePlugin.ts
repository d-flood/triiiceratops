/**
 * `definePlugin` — the framework-neutral plugin authoring entry (ticket 07).
 *
 * Accepts declarative metadata (package-qualified name, version, `coreRange`,
 * `pluginApiRange`, `requiredCapabilities`, icon, target) and a `PluginView`,
 * and returns the plugin factory object activation consumes. The returned
 * object carries its own `activate(host)` (a closure over the SDK's activation
 * machinery) so core can mount it through the structural seam alone, without
 * importing the SDK at runtime.
 */

import type {
    IconDescriptor,
    LocaleCatalog,
    PluginActivation,
    PluginHost,
    PluginUiTarget,
    PluginView,
    SdkPlugin,
} from 'triiiceratops';

import { runActivation } from './activate.js';

// The brand literal core's `isSdkPlugin` guard checks for. Defined locally (not
// value-imported from `triiiceratops`) so the SDK never pulls core — and its
// Svelte runtime — into a plugin bundle. It is the stable wire protocol string;
// its type is exactly core's `SdkPlugin['kind']`.
const SDK_PLUGIN_KIND = 'triiiceratops-plugin';

/** Declarative configuration accepted by {@link definePlugin}. */
export interface DefinePluginConfig {
    /** Package-qualified plugin name (e.g. `@triiiceratops/plugin-x`). */
    name: string;
    /** Plugin package version. */
    version: string;
    /** Semver range of core versions this plugin supports. */
    coreRange: string;
    /** Semver range of plugin API versions this plugin supports. */
    pluginApiRange: string;
    /** Capability identifiers this plugin requires. Defaults to `[]`. */
    requiredCapabilities?: readonly string[];
    /** Toolbar icon descriptor — produce it with {@link svgIcon}. */
    icon: IconDescriptor;
    /** Where the plugin renders. Defaults to `panel`. */
    target?: PluginUiTarget;
    /**
     * Flyout dismiss behavior (SPEC.md — Dismiss). `light` (default) dismisses on
     * outside pointer-down / Escape; `explicit` closes only via the plugin's
     * toolbar button, so a live-editing surface is not dismissed by canvas
     * clicks. Ignored for `panel` targets.
     */
    dismiss?: 'light' | 'explicit';
    /**
     * TRANSITIONAL routing marker (epic restore-plugin-toolbar-chrome). When
     * `true`, core activates this plugin on the core-owned-chrome path (core
     * renders the toolbar button and places the flyout/panel container). Set by
     * first-party plugins as they migrate; removed once core-chrome is the only
     * path. Not a stable public field.
     */
    __coreChrome?: boolean;
    /**
     * The plugin's package-owned localization catalog: `locale → (key →
     * template)`. Core builds the per-viewer `PluginLocaleService` from it and
     * the viewer's active locale; `context.locale.t(key, params?)` resolves
     * against it with English fallback. Optional for plugins with no UI strings.
     */
    catalog?: LocaleCatalog;
    /** The framework-neutral view to mount. */
    view: PluginView;
}

/**
 * Define a plugin. Registration is side-effect-free and does not activate
 * anything (CONTEXT.md **Registration**); compatibility is negotiated later, at
 * activation, per viewer.
 */
export function definePlugin(config: DefinePluginConfig): SdkPlugin {
    const meta = {
        name: config.name,
        version: config.version,
        coreRange: config.coreRange,
        pluginApiRange: config.pluginApiRange,
        requiredCapabilities: config.requiredCapabilities ?? [],
        icon: config.icon,
        target: config.target ?? 'panel',
        dismiss: config.dismiss,
        catalog: config.catalog,
        view: config.view,
        __coreChrome: config.__coreChrome,
    } as const;

    return {
        kind: SDK_PLUGIN_KIND,
        ...meta,
        activate(host: PluginHost): PluginActivation {
            return runActivation(meta, host);
        },
    };
}
