/**
 * `definePlugin` — the framework-neutral plugin authoring entry.
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
    /**
     * Package-qualified plugin IDENTITY (e.g. `@triiiceratops/plugin-x`). It
     * keys the registry, namespaces the plugin's injected styles, and lands in
     * `data-plugin-name` — it is NOT display copy. Set {@link title} for the
     * label a user reads.
     */
    name: string;
    /**
     * Human-readable chrome label: the toolbar button's tooltip/aria-label and
     * the docked-panel header. Resolved against this plugin's {@link catalog} in
     * the viewer's active locale (English fallback); a string with no matching
     * catalog key renders verbatim, so `title: 'My Plugin'` works for a
     * monolingual plugin and `title: 'my_plugin_title'` picks up translations.
     *
     * Defaults to {@link name} — set this, or your package id becomes your UI
     * copy.
     */
    title?: string;
    /**
     * Stable, DOM-safe UI id — the key consumers use under
     * `ViewerConfig.plugins` to control this plugin's toolbar-button `visible`,
     * panel `open`, and render `target`. Keep it short and stable and matching
     * `[A-Za-z0-9_-]+` (e.g. `pdf-export`). When omitted, core derives one from
     * {@link name} (`@scope/plugin-foo` → `scope-plugin-foo`); set it for a
     * short, documented key.
     */
    uiId?: string;
    /** Plugin package version. */
    version: string;
    /**
     * Core versions this plugin supports, as an exact version (`1.2.3`), a caret
     * range (`^1.2.3`), or a `>=` lower bound (`>=1.2.3`). Those three are the
     * whole grammar the SDK implements; any other syntax fails activation with an
     * error naming the range, rather than being read as "incompatible".
     */
    coreRange: string;
    /** Plugin API versions this plugin supports; same grammar as {@link coreRange}. */
    pluginApiRange: string;
    /** Capability identifiers this plugin requires. Defaults to `[]`. */
    requiredCapabilities?: readonly string[];
    /** Toolbar icon descriptor — produce it with {@link svgIcon}. */
    icon: IconDescriptor;
    /** Where the plugin renders. Defaults to `panel`. */
    target?: PluginUiTarget;
    /**
     * This panel scrolls its own content, so core gives it the height left over
     * in its column instead of sizing it to its content. Set it only for a panel
     * whose body is a long list or document; a short panel would just stretch.
     * Ignored for `flyout` targets.
     */
    fills?: boolean;
    /**
     * Flyout dismiss behavior (SPEC.md — Dismiss). `light` (default) dismisses on
     * outside pointer-down / Escape; `explicit` closes only via the plugin's
     * toolbar button, so a live-editing surface is not dismissed by canvas
     * clicks. Ignored for `panel` targets.
     */
    dismiss?: 'light' | 'explicit';
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
        title: config.title,
        uiId: config.uiId,
        version: config.version,
        coreRange: config.coreRange,
        pluginApiRange: config.pluginApiRange,
        requiredCapabilities: config.requiredCapabilities ?? [],
        icon: config.icon,
        target: config.target ?? 'panel',
        fills: config.fills,
        dismiss: config.dismiss,
        catalog: config.catalog,
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
