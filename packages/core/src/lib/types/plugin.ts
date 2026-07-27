import type { Component } from 'svelte';
import type { ViewerState } from '../state/viewer.svelte';

declare global {
    interface Window {
        TriiiceratopsPlugins?: Record<string, unknown>;
    }
}

/**
 * Where a plugin renders its UI.
 * - `panel`: a docked side/bottom/overlay region (the default).
 * - `flyout`: a compact popover that grows out of the plugin's toolbar button.
 */
export type PluginUiTarget = 'panel' | 'flyout';

/**
 * Menu button configuration for plugin UI injection.
 */
export interface PluginMenuButton {
    /** Unique identifier (convention: `pluginId:buttonName`) */
    id: string;

    /** Owning plugin identifier */
    pluginId?: string;

    /** Phosphor icon component */
    icon: Component<any>;

    /** Tooltip text */
    tooltip: string;

    /** Click handler */
    onClick: () => void;

    /** Reactive getter for active/pressed state */
    isActive?: () => boolean;

    /** Reactive getter for visibility */
    isVisible?: () => boolean;

    /** CSS class when active (default: 'btn-primary') */
    activeClass?: string;

    /** Sort order - lower numbers appear first (default: 100) */
    order?: number;

    /**
     * When set, this button toggles a flyout popover rather than a panel. The
     * value is the DOM id of the flyout element (used as `popovertarget` and to
     * derive the CSS `anchor-name`). The toolbar renders the anchored flyout.
     */
    flyoutDomId?: string;
}

/**
 * Panel configuration for plugin UI injection.
 */
export interface PluginPanel {
    /** Unique identifier (convention: `pluginId:panelName`) */
    id: string;

    /** Owning plugin identifier */
    pluginId: string;

    /** Plugin display name */
    name: string;

    /** Plugin toolbar icon component */
    icon: Component<any>;

    /** Svelte component to render */
    component: Component<any>;

    /** Props passed to the component */
    props?: Record<string, unknown>;

    /** Panel position in the viewer */
    position: 'left' | 'right' | 'bottom' | 'overlay';

    /** Reactive getter for visibility */
    isVisible: () => boolean;
}

/**
 * Flyout configuration for plugin UI injection. A flyout is a compact popover
 * anchored to the plugin's toolbar button (see `PluginUiTarget`).
 */
export interface PluginFlyout {
    /** Unique identifier (convention: `pluginId:flyout`) */
    id: string;

    /** Stable DOM id used for `popovertarget` and the CSS `anchor-name` */
    domId: string;

    /** Owning plugin identifier */
    pluginId: string;

    /** Plugin display name */
    name: string;

    /** Plugin toolbar icon component */
    icon: Component<any>;

    /** Svelte component to render inside the flyout */
    component: Component<any>;

    /** Props passed to the component */
    props?: Record<string, unknown>;
}

/**
 * Simplified definition for a plugin.
 * This allows plugins to be defined as simple objects with a component and icon.
 */
export interface PluginDef {
    /** Unique ID (optional, will be auto-generated if missing) */
    id?: string;

    /** Name/Tooltip for the menu button */
    name: string;

    /** Icon component */
    icon: Component<any>;

    /** Where the plugin renders its UI (default: 'panel') */
    target?: PluginUiTarget;

    /** Panel component (rendered when `target` is 'panel') */
    panel?: Component<any>;

    /** Flyout component (rendered when `target` is 'flyout') */
    flyout?: Component<any>;

    /** Preferred panel position (default: 'left'; ignored for flyouts) */
    position?: 'left' | 'right' | 'bottom' | 'overlay';

    /** Props to pass to the panel/flyout component */
    props?: Record<string, unknown>;

    /**
     * Lifecycle hook called when the plugin is registered.
     * Use this to set up background logic, reactive effects, or event listeners
     * that should run regardless of whether the plugin's UI is open.
     */
    onInit?: (viewerState: ViewerState) => void;
}

export function definePlugin<T extends PluginDef>(plugin: T): T {
    return plugin;
}

export function createPanelPlugin(plugin: PluginDef): PluginDef {
    return definePlugin({ ...plugin, target: plugin.target ?? 'panel' });
}

export function createFlyoutPlugin(plugin: PluginDef): PluginDef {
    return definePlugin({ ...plugin, target: 'flyout' });
}

export function registerIifePlugin(name: string, plugin: PluginDef): void {
    window.TriiiceratopsPlugins = window.TriiiceratopsPlugins || {};
    window.TriiiceratopsPlugins[name] = plugin;
}

// ============================================================================
// SDK plugin seam (ticket 07)
// ----------------------------------------------------------------------------
// The framework-neutral plugin authoring contract. `@triiiceratops/plugin-sdk`
// implements `definePlugin`, activation, selectors, and compatibility
// negotiation against these types; core owns the types (because `PluginContext`
// hands out the live `ViewerState`, a core API) and mounts SDK-style plugins
// beside the legacy `PluginDef` path above.
//
// Core deliberately does NOT import the SDK at runtime: an SDK plugin object
// carries its own `activate(host)` method (a closure over the SDK's activation
// machinery), so core mounts it purely through this structural seam. That keeps
// the packages decoupled — the SDK depends on core (types only), never the
// reverse — and avoids a build/dependency cycle.
// ============================================================================

/**
 * The SDK-owned memoized `{ get(), subscribe() }` view of viewer state
 * (CONTEXT.md **Selector**). Recomputes only when state has changed and
 * propagates only when the selected value fails the equality gate.
 */
export interface Selector<T> {
    /** Read the current selected value (memoized by state version). */
    get(): T;
    /**
     * Observe changes to the selected value. The callback fires only when the
     * value fails the equality gate. Returns an unsubscribe function.
     */
    subscribe(callback: (value: T) => void): () => void;
}

/** Factory for memoized selectors over the live `ViewerState`. */
export interface ViewerSelectors {
    /**
     * Create a memoized selector. `equals` defaults to `Object.is`. Built only
     * on `ViewerState.subscribe` — never on Svelte reactivity.
     */
    select<T>(
        fn: (state: ViewerState) => T,
        equals?: (a: T, b: T) => boolean,
    ): Selector<T>;
}

/**
 * Root-aware global stylesheet installer for plugin CSS.
 *
 * Minimal in ticket 07 (stubbed by the SDK when the host omits it); ticket 08
 * fills in dedup, reference counting, shadow-DOM/constructable-stylesheet, and
 * nonce-aware behavior. The shape is final enough that ticket 08's fill-in does
 * not break ticket 07 consumers.
 */
export interface PluginStyleService {
    /**
     * Install a package-qualified global stylesheet. Returns an uninstaller.
     * Installing the same `id` again is deduplicated/reference-counted (ticket
     * 08); in ticket 07 the stub returns a no-op uninstaller.
     */
    inject(id: string, css: string): () => void;
}

/**
 * The owning viewer's active-locale service (CONTEXT.md **Active locale**).
 *
 * Minimal in ticket 07; ticket 08 wires real per-viewer catalogs and locale
 * change propagation. Missing translations fall back to English.
 */
export interface PluginLocaleService {
    /** The owning viewer's active locale as a BCP-47 tag. */
    readonly current: string;
    /** Translate a key within the plugin's catalog, English fallback. */
    t(key: string, params?: Record<string, string | number>): string;
    /** Observe active-locale changes for this viewer. Returns unsubscribe. */
    subscribe(callback: (locale: string) => void): () => void;
}

/**
 * Framework-neutral toolbar icon descriptor. Placeholder in ticket 07: ticket
 * 08 introduces `svgIcon(fullSvgString)` which produces the sanitized, final
 * descriptor. Kept minimal and non-branded so callers keep compiling.
 */
export interface PluginIcon {
    readonly kind: 'svg';
    /** Raw SVG string; sanitized and rendered by core (ticket 08). */
    readonly svg: string;
}

/**
 * Core-owned rendering helpers a plugin may call. Minimal in ticket 07; ticket
 * 08 fills in icon rendering (dimensions, focusability, color, a11y) and any
 * further primitives.
 */
export interface PluginUiService {
    /** Render a core-owned icon descriptor into a container. Returns cleanup. */
    renderIcon(icon: PluginIcon, container: HTMLElement): () => void;
}

/**
 * The isolated, per-activation context handed to a plugin's `mount`
 * (SPEC.md "Plugin SDK And Browser API" — normative shape).
 */
export interface PluginContext {
    readonly viewerState: ViewerState;
    readonly selectors: ViewerSelectors;
    readonly styles: PluginStyleService;
    readonly locale: PluginLocaleService;
    readonly ui: PluginUiService;
}

/**
 * The framework-neutral mount contract (SPEC.md — normative shape). Core owns
 * the container; the plugin owns rendering and returns a cleanup function.
 */
export interface PluginView {
    mount(container: HTMLElement, context: PluginContext): () => void;
}

/**
 * What the host (core, or the SDK test kit) supplies at activation. Core passes
 * its declared `coreVersion`/`pluginApiVersion`/`capabilities` so the SDK can
 * negotiate compatibility without importing core constants. Services are
 * optional in ticket 07 — the SDK fills stubs when the host omits them; ticket
 * 08 makes the host supply real, per-viewer services.
 */
export interface PluginHost {
    /** Core-owned DOM container the plugin renders into. */
    readonly container: HTMLElement;
    /** The owning viewer's live state (the sole plugin-facing state surface). */
    readonly viewerState: ViewerState;
    /** The host core package version, for `coreRange` negotiation. */
    readonly coreVersion: string;
    /** The host plugin API version, for `pluginApiRange` negotiation. */
    readonly pluginApiVersion: string;
    /** The host's declared capabilities (e.g. `osd@5`). */
    readonly capabilities: readonly string[];
    readonly styles?: PluginStyleService;
    readonly locale?: PluginLocaleService;
    readonly ui?: PluginUiService;
}

/** Handle returned by a successful activation. */
export interface PluginActivation {
    /**
     * Run the plugin's mount cleanup and drop its subscriptions. Idempotent;
     * after deactivation no further subscription callbacks fire.
     */
    deactivate(): void;
}

/** Declarative metadata + view an SDK plugin is defined with. */
export interface SdkPluginMeta {
    /** Package-qualified plugin name (e.g. `@triiiceratops/plugin-x`). */
    readonly name: string;
    /** Plugin package version. */
    readonly version: string;
    /** Semver range of core versions this plugin supports. */
    readonly coreRange: string;
    /** Semver range of plugin API versions this plugin supports. */
    readonly pluginApiRange: string;
    /** Capability identifiers this plugin requires (e.g. `osd@5`). */
    readonly requiredCapabilities: readonly string[];
    /** Toolbar icon descriptor. */
    readonly icon: PluginIcon;
    /** Where the plugin renders (`panel` or `flyout`). */
    readonly target: PluginUiTarget;
    /** The framework-neutral view to mount. */
    readonly view: PluginView;
}

/**
 * The brand string every SDK plugin object carries under `kind`. Defined as a
 * plain literal (not a shared runtime import) so core detects SDK plugins
 * without importing the SDK at runtime, and the SDK brands plugins without
 * importing core at runtime.
 */
export const SDK_PLUGIN_KIND = 'triiiceratops-plugin';

/**
 * The plugin factory object `definePlugin` returns and activation consumes. It
 * carries its own `activate(host)` so core mounts it through the structural
 * seam alone (see the section header above).
 */
export interface SdkPlugin extends SdkPluginMeta {
    readonly kind: typeof SDK_PLUGIN_KIND;
    /** Explicitly attach this plugin to one viewer instance (per-viewer). */
    activate(host: PluginHost): PluginActivation;
}

/** Structural type guard: is this an SDK plugin (vs a legacy `PluginDef`)? */
export function isSdkPlugin(value: unknown): value is SdkPlugin {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { kind?: unknown }).kind === SDK_PLUGIN_KIND &&
        typeof (value as { activate?: unknown }).activate === 'function' &&
        typeof (value as { view?: unknown }).view === 'object'
    );
}
