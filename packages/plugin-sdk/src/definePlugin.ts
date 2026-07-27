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
    PluginActivation,
    PluginHost,
    PluginIcon,
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
    /** Toolbar icon descriptor (placeholder type until ticket 08's svgIcon). */
    icon: PluginIcon;
    /** Where the plugin renders. Defaults to `panel`. */
    target?: PluginUiTarget;
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
        view: config.view,
    } as const;

    return {
        kind: SDK_PLUGIN_KIND,
        ...meta,
        activate(host: PluginHost): PluginActivation {
            return runActivation(meta, host);
        },
    };
}
