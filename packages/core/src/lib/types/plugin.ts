import type { Component } from 'svelte';
import type { ViewerState } from '../state/viewer.svelte';

/**
 * Where a plugin renders its UI.
 * - `panel`: a docked side/bottom/overlay region (the default).
 * - `flyout`: a compact popover that grows out of the plugin's toolbar button.
 */
export type PluginUiTarget = 'panel' | 'flyout';

/**
 * A DOM-mount thunk (SPEC.md — content-only container). Core hands the plugin a
 * core-created, core-placed container; the thunk renders the plugin's content
 * into it and returns a cleanup. Used to generalize the flyout/panel chrome
 * entries so ONE rendering path carries either a Svelte `component` (legacy
 * `PluginDef`) or this thunk (SDK core-owned chrome) — see {@link PluginFlyout}
 * / {@link PluginPanel}.
 */
export type PluginMountThunk = (container: HTMLElement) => () => void;

/**
 * Menu button configuration for plugin UI injection.
 */
export interface PluginMenuButton {
    /** Unique identifier (convention: `pluginId:buttonName`) */
    id: string;

    /** Owning plugin identifier */
    pluginId?: string;

    /**
     * Phosphor icon component (legacy `PluginDef` path). SDK core-chrome buttons
     * carry an {@link IconDescriptor} in {@link iconDescriptor} instead; exactly
     * one of the two is set.
     */
    icon?: Component<any>;

    /**
     * Framework-neutral icon descriptor (SDK core-owned chrome path). Rendered by
     * core's `PluginIcon` with the same wrapper as built-in buttons.
     */
    iconDescriptor?: IconDescriptor;

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

    /** Plugin toolbar/header icon component (legacy `PluginDef` path). */
    icon?: Component<any>;

    /** Framework-neutral header icon descriptor (SDK core-owned chrome path). */
    iconDescriptor?: IconDescriptor;

    /**
     * Svelte component to render (legacy `PluginDef` path). Mutually exclusive
     * with {@link mount}.
     */
    component?: Component<any>;

    /**
     * DOM-mount thunk (SDK core-owned chrome path): core places the docked panel
     * container and this thunk renders the plugin content into it. Mutually
     * exclusive with {@link component}.
     */
    mount?: PluginMountThunk;

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

    /** Plugin toolbar icon component (legacy `PluginDef` path). */
    icon?: Component<any>;

    /** Framework-neutral toolbar icon descriptor (SDK core-owned chrome path). */
    iconDescriptor?: IconDescriptor;

    /**
     * Svelte component to render inside the flyout (legacy `PluginDef` path).
     * Mutually exclusive with {@link mount}.
     */
    component?: Component<any>;

    /**
     * DOM-mount thunk (SDK core-owned chrome path): core places the anchored
     * flyout container and this thunk renders the plugin content into it.
     * Mutually exclusive with {@link component}.
     */
    mount?: PluginMountThunk;

    /** Props passed to the component */
    props?: Record<string, unknown>;

    /**
     * Flyout dismiss behavior (SDK core-owned chrome, ticket 02):
     * - `light` (default): dismiss on outside pointer-down / Escape.
     * - `explicit`: closes only via its toolbar button (a live-editing surface is
     *   not dismissed by canvas clicks). Excluded from {@link
     *   ViewerState.closePluginFlyouts} light-dismiss.
     */
    dismiss?: 'light' | 'explicit';
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
 * Root-aware global stylesheet installer for plugin CSS (SPEC.md "Plugin SDK And
 * Browser API" — root-aware style installation).
 *
 * A fresh instance is created per activation, bound to the owning viewer's style
 * root (the document for a light-DOM viewer, the shadow root for the Web
 * Component) and the plugin's package name. Installs are keyed
 * `<pluginName>:<id>`, deduplicated and reference-counted across every
 * activation and viewer that shares a root, and removed when the last reference
 * releases. Core prefers a constructable `adoptedStyleSheets` sheet and falls
 * back to a nonce-carrying `<style>` element under a strict CSP (ticket 08).
 */
export interface PluginStyleService {
    /**
     * Install a global stylesheet under this plugin's package-qualified key
     * (`<pluginName>:<id>`). Deduplicated and reference-counted: installing the
     * same `id` again (here or from another viewer sharing the root) reuses the
     * one sheet and bumps its count. Returns an idempotent uninstaller that
     * releases one reference; the sheet is removed when the count reaches zero.
     * Activation cleanup releases every still-held reference automatically.
     */
    install(css: string, id: string): () => void;
}

/**
 * A plugin's package-owned localization catalog (CONTEXT.md **Active locale**),
 * passed to `definePlugin` and resolved by {@link PluginLocaleService.t}.
 *
 * Shape: a plain, framework-neutral, serializable map of locale (BCP-47 tag) →
 * (message key → template string). Templates may contain `{name}` placeholders
 * filled from the `params` argument of `t`. The `en` catalog is the required
 * fallback: a key missing from the active locale resolves against `en`, and a
 * key missing there too resolves to the key itself. A plain-string map (rather
 * than a message-function map) is deliberate — catalogs stay data, so they need
 * no bundler or runtime from core and can evolve without a core release.
 */
export type LocaleCatalog = Record<string, Record<string, string>>;

/**
 * The owning viewer's active-locale service (CONTEXT.md **Active locale**). A
 * fresh instance is created per activation, bound to the owning viewer's
 * {@link ViewerState.activeLocale} and the plugin's own {@link LocaleCatalog}.
 * `subscribe` registrations are released automatically on activation cleanup.
 */
export interface PluginLocaleService {
    /** The owning viewer's active locale as a BCP-47 tag. */
    readonly current: string;
    /**
     * Translate a key against the plugin's catalog in the viewer's active
     * locale, falling back to the plugin's `en` catalog and then to the key
     * itself. `{name}` placeholders are filled from `params`.
     */
    t(key: string, params?: Record<string, string | number>): string;
    /**
     * Observe active-locale changes for this viewer; the callback receives the
     * new BCP-47 tag. Returns an idempotent unsubscribe.
     */
    subscribe(callback: (locale: string) => void): () => void;
}

/**
 * Framework-neutral toolbar icon descriptor produced by the SDK's `svgIcon`
 * (SPEC.md "Plugin SDK And Browser API"). It carries only sanitized inner SVG
 * markup and the source `viewBox`; core owns the rendered `<svg>` wrapper —
 * dimensions, `currentColor` fill, focusability, and accessibility attributes —
 * so plugin icons stay visually and semantically consistent. `svgIcon` rejects
 * `<script>`, `on*` handlers, external `href`/`xlink:href` URLs, and
 * `<foreignObject>` synchronously, so a descriptor is always safe to render.
 */
export interface IconDescriptor {
    /** Discriminant for future icon kinds; always `'svg'` in 1.0. */
    readonly kind: 'svg';
    /**
     * Sanitized inner SVG markup — the children of the source `<svg>` root, with
     * no wrapper element. Core injects it inside its own `<svg>`.
     */
    readonly inner: string;
    /** The source `<svg>`'s `viewBox` (or a `0 0 W H` default), so core scales it. */
    readonly viewBox: string;
}

/**
 * @deprecated Pre-1.0 alias retained for ticket 07 consumers; use
 * {@link IconDescriptor}. Both name the same finalized descriptor shape.
 */
export type PluginIcon = IconDescriptor;

/**
 * Core-owned rendering helpers a plugin may call. `renderIcon` renders an
 * {@link IconDescriptor} into a plugin-owned container using core's `<svg>`
 * wrapper (dimensions, `currentColor`, focusability, `aria-hidden`).
 */
export interface PluginUiService {
    /** Render a core-owned icon descriptor into a container. Returns cleanup. */
    renderIcon(icon: IconDescriptor, container: HTMLElement): () => void;
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
    /**
     * Report a plugin lifecycle failure to the host (ticket 09). When present,
     * the SDK routes every guarded phase failure here instead of throwing, so
     * the host can present a plugin-local error state and offer retry. When
     * absent (direct SDK / test-kit use with no host), setup and mount failures
     * throw as before and subscription/command/cleanup failures fall back to a
     * console error.
     */
    readonly reportError?: (report: PluginErrorReport) => void;
}

/** Handle returned by a successful activation. */
export interface PluginActivation {
    /**
     * Run the plugin's mount cleanup and drop its subscriptions. Idempotent;
     * after deactivation no further subscription callbacks fire.
     */
    deactivate(): void;
}

// ============================================================================
// Plugin failure isolation (ticket 09)
// ----------------------------------------------------------------------------
// One structured channel for every plugin lifecycle failure. A failure in any
// phase for one plugin leaves the viewer and all other plugins operational
// (SPEC.md "Plugin SDK And Browser API" — failure isolation). The payload is
// delivered identically two ways: a bubbling, composed `pluginerror` DOM event
// from the viewer root AND a host callback (Svelte prop / element property).
//
// The type is defined ONCE here (core owns the plugin seam types) so ticket 18
// can reuse the shape for a `viewererror` channel and ticket 21 can snapshot it.
// ============================================================================

/**
 * The plugin lifecycle phase a failure occurred in (CONTEXT.md **Retry** /
 * SPEC.md failure isolation). Each value maps to a guarded call site:
 * - `setup`: activation setup before mount — compatibility negotiation and
 *   context/selector-runtime/service construction.
 * - `mount`: the plugin's `PluginView.mount`.
 * - `command`: a selector projection threw while recomputing the plugin's
 *   selected state in reaction to a viewer command (a state-change flush).
 * - `subscription`: a selector subscribe listener threw during notification
 *   delivery (attributed via the `ViewerState.subscribe` listener guard).
 * - `cleanup`: a teardown cleanup threw; the remaining cleanups still run.
 */
export type PluginErrorPhase =
    | 'setup'
    | 'mount'
    | 'command'
    | 'subscription'
    | 'cleanup';

/**
 * The normative `pluginerror` payload. Delivered as the `detail` of the
 * bubbling, composed `pluginerror` CustomEvent from the viewer root AND to the
 * host callback — the SAME object both ways.
 */
export interface PluginError {
    /** Package-qualified name of the failing plugin. */
    readonly pluginName: string;
    /** Version of the failing plugin. */
    readonly pluginVersion: string;
    /** The lifecycle phase the failure occurred in. */
    readonly phase: PluginErrorPhase;
    /** The thrown value (usually an `Error`), passed through unchanged. */
    readonly error: unknown;
    /**
     * Manually re-activate the plugin (CONTEXT.md **Retry**): run the failed
     * instance's cleanups, drop its subscriptions, release its styles, then
     * activate fresh. No automatic retries or backoff. Safe to call from the
     * user's error-state affordance or directly from the host.
     */
    retry(): void;
}

/**
 * What the SDK reports to the host when a phase fails. Core enriches it with the
 * plugin identity and `retry()` to build the {@link PluginError} delivered on
 * both channels, so the SDK stays free of DOM-event and retry concerns.
 */
export interface PluginErrorReport {
    /** The lifecycle phase the failure occurred in. */
    readonly phase: PluginErrorPhase;
    /** The thrown value, passed through unchanged. */
    readonly error: unknown;
}

/** The DOM event name for the structured plugin-failure channel. */
export const PLUGIN_ERROR_EVENT = 'pluginerror';

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
    /** Toolbar icon descriptor (from the SDK's `svgIcon`). */
    readonly icon: IconDescriptor;
    /** Where the plugin renders (`panel` or `flyout`). */
    readonly target: PluginUiTarget;
    /**
     * Flyout dismiss behavior (SPEC.md — Dismiss). `light` (the default)
     * dismisses on outside pointer-down / Escape; `explicit` closes only via the
     * plugin's toolbar button, so a live-editing surface is not dismissed by
     * canvas clicks. Ignored for `panel` targets. No consumer-facing override is
     * offered (adding one later is backward-compatible).
     */
    readonly dismiss?: 'light' | 'explicit';
    /**
     * The plugin's package-owned localization catalog. Core builds the
     * per-viewer {@link PluginLocaleService} from it plus the viewer's active
     * locale. Optional: a plugin with no UI strings omits it (and `t` then just
     * returns the key with any `{param}` substitutions).
     */
    readonly catalog?: LocaleCatalog;
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
