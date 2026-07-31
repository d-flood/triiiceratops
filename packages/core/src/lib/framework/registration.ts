/**
 * Lazy, shared, automatic registration of `<triiiceratops-viewer>` for the
 * framework wrappers, with deterministic version-conflict detection.
 *
 * Three properties make this module safe to import from a framework entry
 * point:
 *
 * 1. **Module evaluation touches no browser global.** The registrar closes over
 *    a loader and a registry accessor; neither is called until a wrapper's
 *    browser lifecycle callback asks for registration. Importing
 *    `triiiceratops/react` or `triiiceratops/vue` on a server evaluates this
 *    file and registers nothing.
 * 2. **One memoized operation serves every wrapper instance**, and BOTH
 *    outcomes are memoized. A second instance never re-imports the element
 *    bundle, and a failed registration fails the next caller immediately
 *    instead of retrying a broken import forever.
 * 3. **Detection is deterministic — there are no timers.** No timeout, no
 *    deadline, no retry loop, and `customElements.whenDefined` is never used as
 *    a readiness signal. After the load settles, the registrar probes the
 *    constructor that ACTUALLY owns the tag.
 *
 * That probe is the whole point. `defineViewerElement` returns `false`
 * *silently* when the tag is already taken (`../browser-runtime`), because the
 * browser runtime's "one core per page, first wins" rule is intentional and
 * unchanged here. A wrapper that trusted registration to have succeeded would
 * then wait forever for a `viewerstateavailable` event that a foreign element
 * will never dispatch. Probing `'viewerState' in ctor.prototype` — the state
 * bridge's getter, and by design the version handshake — turns that silent hang
 * into a prompt, framework-native {@link TriiiceratopsElementVersionError}.
 *
 * Incompatibility is diagnosed at the framework-wrapper boundary ONLY. Nothing
 * here changes the global first-wins rule, and a
 * {@link TriiiceratopsCoreConflictError} raised by the element bundle's own
 * install step is passed through unmodified: its message is already the right
 * diagnostic.
 */

import { VIEWER_ELEMENT_TAG } from '../browser-runtime.js';
import {
    TriiiceratopsElementRegistrationError,
    TriiiceratopsElementVersionError,
} from './errors.js';

/** The property whose presence on the tag owner's prototype is the handshake. */
export const VIEWER_STATE_BRIDGE_PROPERTY = 'viewerState';

/** Injectable seams. Defaults are the real browser registry and element bundle. */
export interface ViewerElementRegistrarOptions {
    /**
     * Side-effect import of the self-contained element bundle. It must define
     * the tag (or throw) by the time its promise settles.
     */
    load: () => Promise<unknown>;
    /** The tag to register and probe. Defaults to `triiiceratops-viewer`. */
    tag?: string;
    /**
     * Resolve the custom-element registry. Called lazily, never at module
     * scope, so importing this module is SSR-safe.
     */
    getRegistry?: () => CustomElementRegistry | undefined;
}

/**
 * Create a memoized registrar. Calling the returned function repeatedly — from
 * any number of wrapper instances, concurrently or not — performs at most one
 * load and at most one probe, and always returns the same promise.
 */
export function createViewerElementRegistrar(
    options: ViewerElementRegistrarOptions,
): () => Promise<void> {
    const tag = options.tag ?? VIEWER_ELEMENT_TAG;
    const getRegistry =
        options.getRegistry ??
        ((): CustomElementRegistry | undefined =>
            (globalThis as { customElements?: CustomElementRegistry })
                .customElements);

    // Memoizes BOTH outcomes: a rejected promise stays cached, so the second
    // caller is rejected immediately rather than re-importing a bundle that
    // already failed.
    let pending: Promise<void> | undefined;

    return function ensureRegistered(): Promise<void> {
        return (pending ??= register(tag, getRegistry, options.load));
    };
}

async function register(
    tag: string,
    getRegistry: () => CustomElementRegistry | undefined,
    load: () => Promise<unknown>,
): Promise<void> {
    const registry = getRegistry();
    if (!registry) {
        throw new TriiiceratopsElementRegistrationError(
            `Cannot register <${tag}>: this environment has no ` +
                `\`customElements\` registry. The Triiiceratops framework ` +
                `wrappers register the viewer element from a browser lifecycle ` +
                `callback; reaching this error means client-only wrapper setup ` +
                `ran outside a browser.`,
        );
    }

    // Skip the import when the tag is already taken — by our own element (a
    // consumer who imported `triiiceratops/element/register` themselves, or an
    // earlier wrapper instance) or by a foreign one. Either way the probe below
    // decides, and loading a bundle that could not define the tag anyway is
    // pure cost.
    if (!registry.get(tag)) {
        // A TriiiceratopsCoreConflictError thrown by the bundle's install step
        // propagates from here UNMODIFIED.
        await load();
    }

    assertViewerElementCompatible(registry, tag);
}

/**
 * Confirm the constructor that owns `tag` carries the `viewerState` state
 * bridge. Synchronous, allocation-free, and the only check that catches
 * `defineViewerElement`'s silent `false`.
 *
 * Probe `viewerState` and nothing else: "one core per page, first wins" is a
 * settled rule, and this is not the place to invent a broader compatibility
 * policy.
 */
export function assertViewerElementCompatible(
    registry: CustomElementRegistry,
    tag: string = VIEWER_ELEMENT_TAG,
): void {
    const ctor = registry.get(tag);
    if (!ctor) {
        throw new TriiiceratopsElementVersionError(
            tag,
            `Loading the element bundle left <${tag}> undefined.`,
        );
    }
    const prototype: unknown = ctor.prototype;
    const bridged =
        typeof prototype === 'object' &&
        prototype !== null &&
        VIEWER_STATE_BRIDGE_PROPERTY in prototype;
    if (!bridged) {
        throw new TriiiceratopsElementVersionError(
            tag,
            `Its constructor prototype has no \`${VIEWER_STATE_BRIDGE_PROPERTY}\` getter.`,
        );
    }
}

/**
 * The shared registrar every framework wrapper uses.
 *
 * The element bundle is imported by RELATIVE specifier so a consumer's bundler
 * resolves it inside the installed package with no self-reference and no export
 * condition to configure. `dist/triiiceratops-element.js` is produced by
 * `build:element`, a LATER build step than these modules, which is why
 * `scripts/check-element-artifact.mjs` asserts at build time that the artifact
 * this specifier points at actually exists.
 */
const ensureDefaultRegistration = createViewerElementRegistrar({
    load: () =>
        // @ts-expect-error - built by `build:element`, which runs after the
        // step that compiles this module, so the artifact is absent from src/.
        import('../triiiceratops-element.js'),
});

/**
 * Register `<triiiceratops-viewer>` if it is not already defined, then confirm
 * the tag's owner exposes the `viewerState` state bridge.
 *
 * Lazy, automatic, idempotent, and shared across every wrapper instance on the
 * page. Call it from a browser lifecycle callback; never at module scope.
 * Rejections are the wrapper's to surface framework-natively.
 */
export function ensureViewerElementRegistered(): Promise<void> {
    return ensureDefaultRegistration();
}

export { VIEWER_ELEMENT_TAG };
