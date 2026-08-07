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
/** The property whose presence on the tag owner's prototype is the handshake. */
export declare const VIEWER_STATE_BRIDGE_PROPERTY = "viewerState";
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
export declare function createViewerElementRegistrar(options: ViewerElementRegistrarOptions): () => Promise<void>;
/**
 * Confirm the constructor that owns `tag` carries the `viewerState` state
 * bridge. Synchronous, allocation-free, and the only check that catches
 * `defineViewerElement`'s silent `false`.
 *
 * Probe `viewerState` and nothing else: "one core per page, first wins" is a
 * settled rule, and this is not the place to invent a broader compatibility
 * policy.
 */
export declare function assertViewerElementCompatible(registry: CustomElementRegistry, tag?: string): void;
/**
 * Register `<triiiceratops-viewer>` if it is not already defined, then confirm
 * the tag's owner exposes the `viewerState` state bridge.
 *
 * Lazy, automatic, idempotent, and shared across every wrapper instance on the
 * page. Call it from a browser lifecycle callback; never at module scope.
 * Rejections are the wrapper's to surface framework-natively.
 */
export declare function ensureViewerElementRegistered(): Promise<void>;
export { VIEWER_ELEMENT_TAG };
