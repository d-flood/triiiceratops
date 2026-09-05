import type {
    SelectorSource,
    SourceSelectors,
} from '../state/selectors/runtime';
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
 * into it and returns a cleanup. It is the ONE rendering path for plugin chrome
 * — see {@link PluginFlyout} / {@link PluginPanel}.
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
     * Framework-neutral icon descriptor. Rendered by core's `PluginIcon` with
     * the same wrapper as built-in buttons.
     */
    iconDescriptor?: IconDescriptor;

    /**
     * Tooltip text. Carries the package-qualified plugin identity and is only
     * the FALLBACK — {@link label} wins when present.
     */
    tooltip: string;

    /**
     * A live, locale-resolved display label. When present it wins over
     * {@link tooltip}, which stays as identity and as the fallback. A thunk (not
     * a string) so it re-resolves when the viewer's active locale changes; call
     * it during render.
     */
    label?: () => string;

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

    /**
     * Plugin display name. Carries the package-qualified plugin identity and is
     * only the FALLBACK — {@link label} wins when present.
     */
    name: string;

    /**
     * A live, locale-resolved panel-header label. When present it wins over
     * {@link name}. A thunk (not a string) so it re-resolves when the viewer's
     * active locale changes.
     */
    label?: () => string;

    /** Framework-neutral header icon descriptor. */
    iconDescriptor?: IconDescriptor;

    /**
     * DOM-mount thunk: core places the docked panel container and this thunk
     * renders the plugin content into it.
     */
    mount?: PluginMountThunk;

    /** Props passed to the mounted content, if any. */
    props?: Record<string, unknown>;

    /** The panel scrolls its own content; see {@link SdkPluginMeta.fills}. */
    fills?: boolean;

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

    /**
     * Plugin display name: the package-qualified plugin identity. The flyout's
     * user-visible label comes from its toolbar BUTTON (the toolbar reuses the
     * button's tooltip as the dialog's `aria-label`); this field and
     * {@link label} keep the three chrome records uniform.
     */
    name: string;

    /**
     * A live, locale-resolved display label. When present it wins over
     * {@link name}.
     */
    label?: () => string;

    /** Framework-neutral toolbar icon descriptor. */
    iconDescriptor?: IconDescriptor;

    /**
     * DOM-mount thunk: core places the anchored flyout container and this thunk
     * renders the plugin content into it.
     */
    mount?: PluginMountThunk;

    /** Props passed to the mounted content, if any. */
    props?: Record<string, unknown>;

    /**
     * Flyout dismiss behavior:
     * - `light` (default): dismiss on outside pointer-down / Escape.
     * - `explicit`: closes only via its toolbar button (a live-editing surface is
     *   not dismissed by canvas clicks). Excluded from {@link
     *   ViewerState.closePluginFlyouts} light-dismiss.
     */
    dismiss?: 'light' | 'explicit';
}

// ============================================================================
// SDK plugin seam
// ----------------------------------------------------------------------------
// The framework-neutral plugin authoring contract. `@triiiceratops/plugin-sdk`
// implements `definePlugin`, activation, selectors, and compatibility
// negotiation against these types; core owns the types (because `PluginContext`
// hands out the live `ViewerState`, a core API) and mounts SDK-style plugins
// through this seam. It is the ONE plugin path in 1.0: the Svelte-only
// `PluginDef` path was removed so nothing reachable from `ViewerState` refers
// to a Svelte `Component`.
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

/**
 * Factory for memoized selectors over the live `ViewerState` — the shape a
 * `PluginContext` carries. Exactly `SourceSelectors<ViewerState>`: the selector
 * runtime generalized to any {@link SelectorSource} (ADR 0018), and the viewer
 * is one, so this is a name for that case rather than a second contract that
 * could drift from it.
 */
export type ViewerSelectors = SourceSelectors<ViewerState>;

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
 * back to a nonce-carrying `<style>` element under a strict CSP.
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
 * @deprecated Pre-1.0 alias retained for existing consumers; use
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
 * The plugin's OWN chrome — the panel or flyout core renders it into.
 *
 * Core mounts an SDK plugin exactly once, into a content element it re-parents
 * into and out of the open surface, so `view.mount` is NOT re-run on open/close
 * (deliberate: Activation state survives close→reopen). This is the replacement
 * for the open/close signal a Svelte component's mount/destroy lifecycle used
 * to provide: a plugin observes {@link isOpen} to start and pause work that
 * only matters while the user can see it.
 *
 * Every member reads through the live `ViewerState`, so `isOpen`/`target` are
 * plain getters that are always current — and because they project inventoried
 * `command` state, they compose with selectors like any other viewer state:
 *
 * ```ts
 * mount(container, context) {
 *     const open = context.selectors.select(() => context.surface.isOpen);
 *     if (open.get()) start();
 *     return open.subscribe((isOpen) => (isOpen ? start() : pause()));
 * }
 * ```
 *
 * The surface closes over the plugin's chrome id, so a plugin never has to know
 * or re-derive it (core derives the id from `uiId ?? name` — see
 * {@link SdkPluginMeta.uiId}). {@link id} is exposed for diagnostics and for
 * pointing a consumer at the right `config.plugins` key.
 */
export interface PluginSurface {
    /**
     * This plugin's chrome id — the key a consumer uses under
     * `ViewerConfig.plugins` to control `visible` / `open` / `target` /
     * `position`. Equals {@link SdkPluginMeta.uiId} when the plugin declared
     * one, otherwise core's derivation from {@link SdkPluginMeta.name}.
     */
    readonly id: string;
    /**
     * Is this plugin's panel/flyout currently open? Reflects the toolbar button,
     * flyout light-dismiss, `config.plugins[id].open`, and
     * {@link ViewerState.setPluginOpen} alike.
     */
    readonly isOpen: boolean;
    /**
     * The chrome this plugin is currently rendering in. Starts at the plugin's
     * authored {@link SdkPluginMeta.target} and follows
     * `config.plugins[id].target` / {@link ViewerState.setPluginTarget}, so a
     * plugin can lay its content out differently in a compact flyout than in a
     * docked panel.
     */
    readonly target: PluginUiTarget;
    /** Open this plugin's surface. No-op if already open. */
    open(): void;
    /**
     * Close this plugin's surface. No-op if already closed. Use it for a
     * "done"/"apply" affordance inside the plugin's own UI.
     */
    close(): void;
    /** Toggle this plugin's surface open state. */
    toggle(): void;
    /**
     * Declare whether this plugin has anything to show on the current canvas.
     * `false` hides its toolbar button — the gating core's own annotations and
     * structures buttons have — so a plugin whose content is a fact about the
     * canvas never leaves a live button over an empty panel, and closes its
     * surface if it was open. Call it whenever that fact changes.
     */
    setAvailable(available: boolean): void;
}

/**
 * How one member of a published state behaves, transplanting the viewer-state
 * taxonomy one level down (CONTEXT.md **Published state**, **Query-only state**):
 * `command` maintains the plugin's invariants, `observable` notifies through
 * {@link PublishedState.subscribe}, `queryOnly` is a high-frequency value read
 * on demand and deliberately non-notifying.
 */
export type PublishedStateClassification =
    | 'command'
    | 'observable'
    | 'queryOnly';

/**
 * The state object one plugin activation publishes for hosts and framework
 * wrappers to command it through (ADR 0018). It is reached only via
 * {@link ViewerState.getPluginState} — never imported from the plugin package —
 * and lives exactly as long as its activation.
 *
 * It is a `SelectorSource`, so the ONE selector runtime that serves viewer state
 * serves this too; and it declares its own {@link stateInventory} so the SDK
 * conformance kit can check the classification the way core's capability-matrix
 * test checks the viewer's.
 */
export interface PublishedState extends SelectorSource {
    /**
     * Classification for every member this state exposes, keyed by member name.
     * The seam's own members (`subscribe`, `subscribeFrame`, `stateInventory`)
     * are not classified — they are the contract, not the state. A published
     * member missing from this table fails conformance.
     */
    readonly stateInventory: Readonly<
        Record<string, PublishedStateClassification>
    >;
}

/**
 * The isolated, per-activation context handed to a plugin's `mount`
 * (SPEC.md "Plugin SDK And Browser API" — normative shape).
 */
export interface PluginContext {
    readonly viewerState: ViewerState;
    readonly selectors: ViewerSelectors;
    readonly surface: PluginSurface;
    readonly styles: PluginStyleService;
    readonly locale: PluginLocaleService;
    readonly ui: PluginUiService;
    /**
     * Publish this activation's {@link PublishedState}, so hosts and framework
     * wrappers can command the plugin through `viewerState.getPluginState(id)`
     * (ADR 0018). At most one per activation — publishing again replaces the
     * previous object — and the publication is retired automatically when the
     * activation ends, so a host never reaches a dead plugin's state.
     */
    publishState(state: PublishedState): void;
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
 * negotiate compatibility without importing core constants.
 *
 * Every member is required, services included. Core builds the real, per-viewer
 * ones for each activation; a test that activates without a viewer assembles the
 * host from `@triiiceratops/plugin-sdk/testing`, whose test viewer context
 * carries recording doubles and whose `createStub*` helpers cover the rest. The
 * SDK filling in stubs itself would put a service implementation no reader can
 * ever see into every shipped plugin bundle.
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
    /**
     * The host's declared capabilities. Empty in core's 1.0 line: capability
     * negotiation existed to version a third-party renderer, and core's own
     * surface is governed by `coreRange` instead (`plugin/api.ts`).
     */
    readonly capabilities: readonly string[];
    readonly styles: PluginStyleService;
    readonly locale: PluginLocaleService;
    readonly ui: PluginUiService;
    /**
     * The plugin's own panel/flyout chrome, owned by whoever registered the
     * chrome id. Its `id` is the only id the viewer knows the plugin by, so it is
     * also what published state and overlay layers are keyed to.
     */
    readonly surface: PluginSurface;
    /**
     * Report a plugin lifecycle failure to the host. The SDK routes every guarded
     * phase failure here rather than throwing, so the host can present a
     * plugin-local error state and offer retry.
     */
    readonly reportError: (report: PluginErrorReport) => void;
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
// Plugin failure isolation
// ----------------------------------------------------------------------------
// One structured channel for every plugin lifecycle failure. A failure in any
// phase for one plugin leaves the viewer and all other plugins operational
// (SPEC.md "Plugin SDK And Browser API" — failure isolation). The payload is
// delivered identically two ways: a bubbling, composed `pluginerror` DOM event
// from the viewer root AND a host callback (Svelte prop / element property).
//
// The type is defined ONCE here (core owns the plugin seam types) so it can be
// reused for the `viewererror` channel and snapshotted for the public API.
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
    /**
     * Package-qualified plugin IDENTITY (e.g. `@triiiceratops/plugin-x`). It
     * keys the registry, namespaces the plugin's injected styles, and lands in
     * `data-plugin-name` — it is NOT display copy. See {@link title}.
     */
    readonly name: string;
    /**
     * Human-readable chrome label: the toolbar button's tooltip/aria-label and
     * the docked-panel header. Core resolves it against this plugin's
     * {@link catalog} in the viewer's active locale (English fallback); a string
     * with no matching key renders verbatim, so it doubles as a literal label
     * for a monolingual plugin.
     *
     * Optional. When absent, core falls back to the pre-`title` behavior: it
     * looks {@link name} up in CORE's own message catalog and otherwise renders
     * `name` verbatim.
     */
    readonly title?: string;
    /**
     * Stable, DOM-safe UI id used as the key under `ViewerConfig.plugins` (for
     * `visible` / `open` / `target` control) and as the prefix for the plugin's
     * toolbar button, panel, and flyout. A consumer sets
     * `config.plugins[uiId] = {...}` to control the plugin. Keep it short and
     * stable (e.g. `pdf-export`) — it must
     * match `[A-Za-z0-9_-]+` because it seeds a DOM id and CSS `anchor-name`.
     *
     * Optional: when omitted, core derives a stable id from {@link name} by
     * replacing every run of unsafe characters with `-` (so
     * `@scope/plugin-foo` → `scope-plugin-foo`). Set it explicitly for a short,
     * documented key.
     */
    readonly uiId?: string;
    /** Plugin package version. */
    readonly version: string;
    /**
     * Core versions this plugin supports, as an exact version (`1.2.3`), a caret
     * range (`^1.2.3`), or a `>=` lower bound (`>=1.2.3`) — the whole grammar the
     * SDK negotiates. Any other syntax fails activation with an error naming the
     * range rather than being read as "incompatible".
     */
    readonly coreRange: string;
    /** Plugin API versions this plugin supports; same grammar as {@link coreRange}. */
    readonly pluginApiRange: string;
    /**
     * Capability identifiers this plugin requires. Normally empty: a plugin
     * states which CORE it works with through `coreRange`, and capabilities are
     * reserved for genuinely optional runtime features. A plugin declaring one
     * the host does not have fails activation.
     */
    readonly requiredCapabilities: readonly string[];
    /** Toolbar icon descriptor (from the SDK's `svgIcon`). */
    readonly icon: IconDescriptor;
    /** Where the plugin renders (`panel` or `flyout`). */
    readonly target: PluginUiTarget;
    /**
     * This panel scrolls its own content, so core gives it the height left over
     * in its column rather than sizing it to its content. For a panel whose body
     * is a long list or document; a short one would only stretch. Ignored for
     * `flyout` targets.
     */
    readonly fills?: boolean;
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

/** Structural type guard: is this value an SDK plugin? */
export function isSdkPlugin(value: unknown): value is SdkPlugin {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { kind?: unknown }).kind === SDK_PLUGIN_KIND &&
        typeof (value as { activate?: unknown }).activate === 'function' &&
        typeof (value as { view?: unknown }).view === 'object'
    );
}
