/**
 * The `window.Triiiceratops` browser runtime namespace (ticket 10).
 *
 * One namespace per page, bootstrapped order-independently: every core (and,
 * later, every plugin) IIFE creates it if absent via {@link ensureBrowserRuntime}
 * (`window.Triiiceratops ??= …`), so a plugin script may load and register before
 * core. Core fills in `coreVersion`/`pluginApiVersion`/`capabilities` when it
 * loads, and registers the `<triiiceratops-viewer>` custom element.
 *
 * "One core per page, first wins" (SPEC.md "Plugin SDK And Browser API"): a
 * second core with a different version leaves the namespace and the custom
 * element untouched and throws a structured {@link TriiiceratopsCoreConflictError}
 * — the same error path as duplicate custom-element registration (one rule, one
 * error). A same-version double-load is a harmless no-op, including idempotent
 * element registration.
 *
 * Registration never activates anything (CONTEXT.md **Registration**);
 * activation is explicit, per viewer, and negotiated later (CONTEXT.md
 * **Activation**).
 */
import type { SdkPlugin } from './types/plugin';
/** The custom-element tag both Web Component entries register. */
export declare const VIEWER_ELEMENT_TAG = "triiiceratops-viewer";
/** The property name of the namespace on the global object. */
export declare const BROWSER_RUNTIME_KEY = "Triiiceratops";
/**
 * Order-independent registry of plugin factories keyed by package name (with
 * version as the first-wins tiebreaker). Loading a plugin registers its factory
 * here; it never activates the plugin.
 */
export interface PluginFactoryRegistry {
    /**
     * Register a plugin factory. Keyed by package name + version:
     * - unseen name: registered;
     * - same name + same version: idempotent no-op;
     * - same name + different version: ignored (first wins) with a structured
     *   `console.warn`.
     */
    register(factory: SdkPlugin): void;
    /** The first-registered factory for a package name, if any. */
    get(name: string): SdkPlugin | undefined;
    /** Whether a factory is registered for a package name. */
    has(name: string): boolean;
    /** All registered factories, in registration order. */
    list(): readonly SdkPlugin[];
}
/**
 * The browser runtime descriptor (SPEC.md — normative shape). `coreVersion`,
 * `pluginApiVersion`, and `capabilities` are empty until core loads and fills
 * them; the `plugins` registry exists from first bootstrap so plugins can
 * register before core.
 */
export interface TriiiceratopsBrowserRuntime {
    readonly coreVersion: string;
    readonly pluginApiVersion: string;
    readonly capabilities: readonly string[];
    readonly plugins: PluginFactoryRegistry;
}
declare global {
    interface Window {
        Triiiceratops?: TriiiceratopsBrowserRuntime;
    }
}
/**
 * Structured, actionable error for the "one core per page" rule. Thrown when a
 * second core with a different version tries to load, and — because element
 * registration is routed through this runtime — it is the single error path for
 * duplicate custom-element registration too.
 */
export declare class TriiiceratopsCoreConflictError extends Error {
    readonly code: "CORE_VERSION_CONFLICT";
    readonly existingVersion: string;
    readonly attemptedVersion: string;
    constructor(existingVersion: string, attemptedVersion: string);
}
/**
 * Bootstrap the namespace if absent and return it. Idempotent and
 * order-independent (`window.Triiiceratops ??= …`): whoever runs first — core or
 * a plugin — creates the shared registry, and everyone else reuses it.
 */
export declare function ensureBrowserRuntime(target?: Window): TriiiceratopsBrowserRuntime;
/**
 * Idempotently define the viewer custom element. Returns `true` if it defined
 * the tag, `false` if the tag was already registered (a same-version double-load
 * or a foreign registration). Never throws on an already-defined tag.
 */
export declare function defineViewerElement(ctor: CustomElementConstructor, tag?: string, target?: Window): boolean;
/** Options for installing core into the browser runtime. */
export interface InstallCoreOptions {
    /** Core package version (drives the first-wins conflict rule). */
    coreVersion: string;
    /** Plugin API version core declares for activation-time negotiation. */
    pluginApiVersion: string;
    /** Capabilities core declares (e.g. `osd@5`). */
    capabilities: readonly string[];
    /** The custom-element constructor to register for {@link tag}. */
    elementCtor: CustomElementConstructor;
    /** Tag to register. Defaults to {@link VIEWER_ELEMENT_TAG}. */
    tag?: string;
    /** Global to install onto. Defaults to `window` (injectable for tests). */
    target?: Window;
}
/**
 * Install core into the (possibly plugin-bootstrapped) namespace and register
 * the custom element.
 *
 * - First core wins: fills `coreVersion`/`pluginApiVersion`/`capabilities` and
 *   defines the element.
 * - Same-version double-load: harmless no-op (element registration stays
 *   idempotent).
 * - Different version: throws {@link TriiiceratopsCoreConflictError} and leaves
 *   the namespace and the custom element untouched.
 */
export declare function installBrowserRuntime(options: InstallCoreOptions): TriiiceratopsBrowserRuntime;
