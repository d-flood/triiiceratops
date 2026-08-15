/**
 * The `window.Triiiceratops` browser runtime namespace.
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
 *
 * The namespace also carries core's **shared Svelte runtime** — see
 * {@link SharedSvelteRuntime} — and its **shared core utilities** — see
 * {@link SharedCoreUtils}.
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
 * Core's **shared Svelte runtime**: the compiler helpers a first-party plugin
 * IIFE reads off this namespace instead of bundling a second copy of Svelte.
 *
 * ## Why it exists
 *
 * The published bundle-size comparison measures `triiiceratops-element.iife.js`
 * against viewers that already do audio and video, and the headroom is small. A
 * Svelte plugin that ships its own runtime spends roughly half of it on bytes no
 * reader can see: a representative transport component measured 13.24 KB gzip
 * bundled against 1.51 KB sharing core's. Core pays essentially nothing to share,
 * because it already uses every helper listed here — exposing them retains
 * nothing that was not already retained.
 *
 * ## Three rules, none optional
 *
 * 1. **The list is curated and small; never `export *`.** Re-exporting the whole
 *    `svelte/internal/client` namespace was measured at **+8,837 gzip on core**:
 *    it defeats tree-shaking and retains all ~200 exports. Curation IS the
 *    mechanism, not a tidiness preference. Derive additions by compiling the
 *    plugin's real components and reading the `$.<name>` references out of the
 *    output — never by guessing, and never by adding "while we are here".
 * 2. **Growth is gated by the size ratchet.** A plugin reaching for a Svelte
 *    feature core does not already use adds a helper here, and `pnpm size:check`
 *    fails against the recorded element baseline. That is the intended alarm: a
 *    core-size increase on a plugin ticket means plugin bytes are moving into
 *    core, and it must be read that way rather than re-baselined.
 * 3. **Version skew fails closed**, and in two places, because one is not
 *    enough. A consuming plugin declares the `shared-svelte-runtime` capability
 *    and an EXACT `coreRange`, so activation refuses a core that shares no
 *    runtime or is not the one the plugin was built against — `svelte/internal`
 *    is private API with no semver guarantee, so the contract is "same repo,
 *    same release, same Svelte version". But activation is far too late on its
 *    own: a compiled component dereferences these helpers at MODULE scope, so a
 *    plugin IIFE loaded against an absent or skewed core throws before it can
 *    register, let alone negotiate. The consuming bundle therefore also carries
 *    a gate ahead of its own body that checks this namespace and reports what is
 *    missing (see `sharedRuntimeGate.ts` in `@triiiceratops/plugin-av`).
 *    This is a FIRST-PARTY-ONLY privilege: a third-party plugin is released
 *    independently of core and must keep bundling its own runtime, which is what
 *    `docs/plugin-authoring.md` goes on telling external authors to do.
 *
 * A plugin consuming this reads it before it can do anything else, so its script
 * must load AFTER core's — the one ordering constraint in an otherwise
 * order-independent namespace.
 */
export interface SharedSvelteRuntime {
    /**
     * The public `svelte` entry points a plugin's own code calls: `mount`,
     * `unmount`, `getContext`.
     */
    readonly svelte: Readonly<Record<string, unknown>>;
    /**
     * The `svelte/internal/client` helpers the plugin's COMPILED components
     * reference.
     */
    readonly svelteInternal: Readonly<Record<string, unknown>>;
}

// Both members are typed structurally, and deliberately so: naming Svelte's own
// types here would put a `svelte` type import in `browser-runtime.d.ts`, which
// `./react` and `./vue` reach through the framework substrate — and those
// subpaths promise a consumer needs no `svelte` package to type-check them
// (`src/packaging/dtsSvelteImports.ts` fails the build over it). Nothing type-checks
// against these anyway: the consuming plugin binds them through its bundler's
// `output.globals`, not through TypeScript.

/**
 * Core's **shared core utilities**: a curated handful of core's own functions a
 * first-party plugin IIFE reads off this namespace instead of bundling a second
 * copy of the modules behind them.
 *
 * Same privilege as {@link SharedSvelteRuntime}, granted the same way and fenced
 * by the same three rules:
 *
 * 1. **The list is curated and small; never `export *`.** A name goes on it
 *    because a first-party plugin reads it now, and the initial set is exactly
 *    the four `@triiiceratops/plugin-av` reads. `export *` would defeat
 *    tree-shaking and retain core's whole utility surface, which is the thing
 *    this mechanism exists to avoid.
 * 2. **Growth is gated by the size ratchet.** Every function here is already
 *    retained by core's shipped graph, so exposing it costs core essentially
 *    nothing. A utility core does NOT already retain moves the element baseline,
 *    and that alarm reads as "plugin bytes are moving into core" — never as
 *    something to re-baseline away.
 * 3. **Version skew fails closed, twice.** The `shared-core-utils` capability
 *    refuses activation on a core that publishes no such member; and the
 *    consuming bundle's own skew gate checks the namespace ahead of its first
 *    module statement, because a compiled module dereferences these at load,
 *    long before activation could refuse anything.
 *
 * This is a FIRST-PARTY-ONLY privilege, as the Svelte runtime is, and for the
 * same reason: it holds only because core and plugin are built and released from
 * one repository at one version. `docs/plugin-authoring.md` goes on telling
 * third-party authors to bundle their own copies.
 */
export type SharedCoreUtils = Readonly<Record<string, unknown>>;

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
    /** See {@link SharedSvelteRuntime}. Filled only by core. */
    readonly svelte: SharedSvelteRuntime['svelte'];
    /** See {@link SharedSvelteRuntime}. Filled only by core. */
    readonly svelteInternal: SharedSvelteRuntime['svelteInternal'];
    /** See {@link SharedCoreUtils}. Filled only by core. */
    readonly core: SharedCoreUtils;
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
        // Empty until core installs the real objects — the same "filled when
        // core loads" rule the version fields follow, and for the same reason:
        // this factory also stands in for the SDK's plugin-side bootstrap,
        // which has no Svelte to share.
        svelte: {},
        svelteInternal: {},
        core: {},
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
    /** Capabilities core declares — see `plugin/api.ts` for the list and why. */
    capabilities: readonly string[];
    /** The custom-element constructor to register for {@link tag}. */
    elementCtor: CustomElementConstructor;
    /**
     * The {@link SharedSvelteRuntime} to publish on the namespace. Supplied by
     * the Web Component entries from `shared-svelte-runtime.ts`; omitted by
     * callers that have no business shipping a Svelte runtime.
     */
    svelteRuntime?: SharedSvelteRuntime;
    /**
     * The {@link SharedCoreUtils} to publish on the namespace. Supplied by the
     * Web Component entries from `shared-core-utils.ts`, and passed in rather
     * than imported here for the same reason the Svelte runtime is: this module
     * is reached by the framework substrate behind `./react` and `./vue`.
     */
    coreUtils?: SharedCoreUtils;
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
        // The namespace may have been bootstrapped by a plugin IIFE, whose copy
        // of the bootstrap has no Svelte to share. Core owns the shared runtime,
        // so it installs it wherever it finds the namespace. Passed in rather
        // than imported here because importing Svelte in THIS module would put
        // it in the `./react` and `./vue` graphs (see shared-svelte-runtime.ts).
        if (options.svelteRuntime) {
            mutable.svelte = options.svelteRuntime.svelte;
            mutable.svelteInternal = options.svelteRuntime.svelteInternal;
        }
        if (options.coreUtils) {
            mutable.core = options.coreUtils;
        }
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
