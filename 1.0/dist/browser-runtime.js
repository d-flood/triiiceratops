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
/** The custom-element tag both Web Component entries register. */
export const VIEWER_ELEMENT_TAG = 'triiiceratops-viewer';
/** The property name of the namespace on the global object. */
export const BROWSER_RUNTIME_KEY = 'Triiiceratops';
/**
 * Structured, actionable error for the "one core per page" rule. Thrown when a
 * second core with a different version tries to load, and — because element
 * registration is routed through this runtime — it is the single error path for
 * duplicate custom-element registration too.
 */
export class TriiiceratopsCoreConflictError extends Error {
    code = 'CORE_VERSION_CONFLICT';
    existingVersion;
    attemptedVersion;
    constructor(existingVersion, attemptedVersion) {
        super(`Triiiceratops core ${attemptedVersion} cannot load: core ` +
            `${existingVersion} is already active on this page. Only one ` +
            `core version may run per page — the same rule as the ` +
            `<${VIEWER_ELEMENT_TAG}> custom element, which can be defined ` +
            `only once. Remove the duplicate core script or align both ` +
            `scripts to the same version.`);
        this.name = 'TriiiceratopsCoreConflictError';
        this.existingVersion = existingVersion;
        this.attemptedVersion = attemptedVersion;
    }
}
function createPluginRegistry() {
    // First-registered factory per package name. First version wins; a
    // different version of an already-registered plugin is ignored.
    const byName = new Map();
    return {
        register(factory) {
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
            console.warn(`[triiiceratops] Ignoring plugin "${factory.name}" version ` +
                `${factory.version}: version ${existing.version} is already ` +
                `registered on this page and wins (first registration wins). ` +
                `Load a single version of each plugin per page.`, {
                name: factory.name,
                registeredVersion: existing.version,
                ignoredVersion: factory.version,
            });
        },
        get(name) {
            return byName.get(name);
        },
        has(name) {
            return byName.has(name);
        },
        list() {
            return [...byName.values()];
        },
    };
}
function createBrowserRuntime() {
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
export function ensureBrowserRuntime(target = window) {
    return (target.Triiiceratops ??= createBrowserRuntime());
}
/**
 * Idempotently define the viewer custom element. Returns `true` if it defined
 * the tag, `false` if the tag was already registered (a same-version double-load
 * or a foreign registration). Never throws on an already-defined tag.
 */
export function defineViewerElement(ctor, tag = VIEWER_ELEMENT_TAG, target = window) {
    const registry = target.customElements;
    if (registry.get(tag))
        return false;
    registry.define(tag, ctor);
    return true;
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
export function installBrowserRuntime(options) {
    const target = options.target ?? window;
    const tag = options.tag ?? VIEWER_ELEMENT_TAG;
    const runtime = ensureBrowserRuntime(target);
    if (runtime.coreVersion === '') {
        // First core on the page wins and fills the descriptor.
        const mutable = runtime;
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
    throw new TriiiceratopsCoreConflictError(runtime.coreVersion, options.coreVersion);
}
