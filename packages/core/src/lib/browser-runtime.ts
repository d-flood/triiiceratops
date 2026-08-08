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
export const VIEWER_ELEMENT_TAG = 'triiiceratops-viewer';

/** The property name of the namespace on the global object. */
export const BROWSER_RUNTIME_KEY = 'Triiiceratops';

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

/** Writable view of the runtime used only by core when it first loads. */
type MutableBrowserRuntime = {
    -readonly [K in keyof TriiiceratopsBrowserRuntime]: TriiiceratopsBrowserRuntime[K];
};

/**
 * Structured, actionable error for the "one core per page" rule. Thrown when a
 * second core with a different version tries to load, and — because element
 * registration is routed through this runtime — it is the single error path for
 * duplicate custom-element registration too.
 */
export class TriiiceratopsCoreConflictError extends Error {
    readonly code = 'CORE_VERSION_CONFLICT' as const;
    readonly existingVersion: string;
    readonly attemptedVersion: string;

    constructor(existingVersion: string, attemptedVersion: string) {
        super(
            `Triiiceratops core ${attemptedVersion} cannot load: core ` +
                `${existingVersion} is already active on this page. Only one ` +
                `core version may run per page — the same rule as the ` +
                `<${VIEWER_ELEMENT_TAG}> custom element, which can be defined ` +
                `only once. Remove the duplicate core script or align both ` +
                `scripts to the same version.`,
        );
        this.name = 'TriiiceratopsCoreConflictError';
        this.existingVersion = existingVersion;
        this.attemptedVersion = attemptedVersion;
    }
}

function createPluginRegistry(): PluginFactoryRegistry {
    // First-registered factory per package name. First version wins; a
    // different version of an already-registered plugin is ignored.
    const byName = new Map<string, SdkPlugin>();

    return {
        register(factory: SdkPlugin): void {
            const existing = byName.get(factory.name);
            if (!existing) {
                byName.set(factory.name, factory);
                return;
            }
            if (existing.version === factory.version) {
                // Idempotent: the same plugin script loaded twice.
                return;
            }
            // First wins; the different version is ignored, not activated.
            console.warn(
                `[triiiceratops] Ignoring plugin "${factory.name}" version ` +
                    `${factory.version}: version ${existing.version} is already ` +
                    `registered on this page and wins (first registration wins). ` +
                    `Load a single version of each plugin per page.`,
                {
                    name: factory.name,
                    registeredVersion: existing.version,
                    ignoredVersion: factory.version,
                },
            );
        },
        get(name: string): SdkPlugin | undefined {
            return byName.get(name);
        },
        has(name: string): boolean {
            return byName.has(name);
        },
        list(): readonly SdkPlugin[] {
            return [...byName.values()];
        },
    };
}

function createBrowserRuntime(): TriiiceratopsBrowserRuntime {
    return {
        coreVersion: '',
        pluginApiVersion: '',
        capabilities: [],
        plugins: createPluginRegistry(),
    };
}

/**
 * Bootstrap the namespace if absent and return it. Idempotent and
 * order-independent (`window.Triiiceratops ??= …`): whoever runs first — core or
 * a plugin — creates the shared registry, and everyone else reuses it.
 */
export function ensureBrowserRuntime(
    target: Window = window,
): TriiiceratopsBrowserRuntime {
    return (target.Triiiceratops ??= createBrowserRuntime());
}

/**
 * Idempotently define the viewer custom element. Returns `true` if it defined
 * the tag, `false` if the tag was already registered (a same-version double-load
 * or a foreign registration). Never throws on an already-defined tag.
 */
export function defineViewerElement(
    ctor: CustomElementConstructor,
    tag: string = VIEWER_ELEMENT_TAG,
    target: Window = window,
): boolean {
    const registry = target.customElements;
    if (registry.get(tag)) return false;
    registry.define(tag, ctor);
    return true;
}

/** Options for installing core into the browser runtime. */
export interface InstallCoreOptions {
    /** Core package version (drives the first-wins conflict rule). */
    coreVersion: string;
    /** Plugin API version core declares for activation-time negotiation. */
    pluginApiVersion: string;
    /**
     * Capabilities core declares. Empty in the 1.0 line — see `plugin/api.ts`
     * for why the renderer capability was retired with no successor.
     */
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
export function installBrowserRuntime(
    options: InstallCoreOptions,
): TriiiceratopsBrowserRuntime {
    const target = options.target ?? window;
    const tag = options.tag ?? VIEWER_ELEMENT_TAG;
    const runtime = ensureBrowserRuntime(target);

    if (runtime.coreVersion === '') {
        // First core on the page wins and fills the descriptor.
        const mutable = runtime as MutableBrowserRuntime;
        mutable.coreVersion = options.coreVersion;
        mutable.pluginApiVersion = options.pluginApiVersion;
        mutable.capabilities = [...options.capabilities];
        defineViewerElement(options.elementCtor, tag, target);
        return runtime;
    }

    if (runtime.coreVersion === options.coreVersion) {
        // Same-version double-load: harmless no-op. The element is already
        // defined; the guard inside defineViewerElement keeps this idempotent.
        defineViewerElement(options.elementCtor, tag, target);
        return runtime;
    }

    // A different core version already owns the page. Leave the namespace and
    // custom element untouched and report the conflict (the same structured
    // error path as duplicate custom-element registration).
    throw new TriiiceratopsCoreConflictError(
        runtime.coreVersion,
        options.coreVersion,
    );
}
