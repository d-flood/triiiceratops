/**
 * `triiiceratops/testing` — the compiled headless viewer-state entry.
 *
 * Two audiences share it, and both get the same guarantee — CONTEXT.md **Test
 * viewer context**: "the harness is fake; the state is never fake."
 *
 * - **Plugin authors.** The SDK test kit (`@triiiceratops/plugin-sdk/testing`)
 *   builds a **test viewer context** on top of {@link createHeadlessViewerState}:
 *   a real, live `ViewerState` — real commands, real batched notifications —
 *   with recording service doubles.
 * - **Framework consumers.** {@link createTestViewerHandle} returns a real
 *   `ViewerHandle` over that same real state, so a React or Vue component that
 *   reads `useViewerSelector()` is unit-testable without mounting the custom
 *   element, loading OpenSeadragon, or fetching a manifest.
 *
 * Neither React, Vue, nor a DOM is required to import this module.
 *
 * `ViewerState` is authored as a Svelte runes module (`viewer.svelte.ts`), so a
 * React/Vue/Lit plugin author with no Svelte compiler cannot import it from the
 * source distribution. This entry is therefore VITE-BUILT with Svelte compiled
 * away and Svelte's runtime bundled in, so the published chunk imports and
 * operates from a plain vitest project that has installed only the tarball
 * (see `vite.config.testing.ts`).
 *
 * ── Flush timing rule (READ THIS) ─────────────────────────────────────────
 * Notifications are batched and delivered on the reactive flush, never
 * synchronously inside a command (ADR 0008 / SPEC.md ViewerState contract). A
 * test that mutates state and then asserts a subscriber ran MUST first settle
 * the flush with {@link flush}:
 *
 *   state.toggleToolbar();
 *   await flush();          // notifications land here, not before
 *   expect(seen).toBe(true);
 *
 * This is real production timing, not a test artifact — a passing test reflects
 * the batched semantics a plugin sees in a real viewer.
 */

import { flushSync } from 'svelte';

// Imported from the substrate's LEAF modules, not from `framework/index.js`.
// The barrel re-exports `registration.js`, whose `import('../triiiceratops-element.js')`
// points at a later build step's artifact that does not exist while
// `vite.config.testing.ts` bundles this entry — and pulling the element
// registrar in here would contradict this helper's promise to register nothing.
import { VIEWER_ELEMENT_TAG } from '../browser-runtime.js';
import { createViewerHandleSlot } from '../framework/handle.js';
import {
    attachSelectorRuntime,
    detachSelectorRuntime,
} from '../framework/runtimeRegistry.js';
import type { ViewerHandleSlot } from '../framework/handle.js';
import type {
    TriiiceratopsViewerElement,
    ViewerHandle,
} from '../framework/types.js';
import { createSelectorRuntime } from '../state/selectors/index.js';
import { ViewerState } from '../state/viewer.svelte.js';
import type { ViewerConfig } from '../types/config.js';
import { createPluginLocaleService } from '../plugin/localeService.js';
import type { ActiveLocaleSource } from '../plugin/localeService.js';

export { ViewerState } from '../state/viewer.svelte.js';
export type { ViewerStateSnapshot } from '../state/viewer.svelte.js';

// Core's declared plugin-compatibility surface, re-exported so the test kit can
// build a `PluginHost` without importing core's Svelte-authored main entry
// (which would need a Svelte compiler the kit deliberately does not require).
export { CORE_VERSION, pluginApiVersion, capabilities } from '../plugin/api.js';

// The real per-viewer active-locale resolution algorithm (English fallback,
// `{param}` interpolation), re-exported so the kit's recording locale double
// runs the REAL logic rather than a re-implementation.
export { createPluginLocaleService } from '../plugin/localeService.js';
export type { ActiveLocaleSource } from '../plugin/localeService.js';

// The real plugin surface factory (open/close awareness over a live state),
// re-exported so the kit's test context hands plugins the REAL surface — the
// state is never fake, and neither is its open/close channel.
export { createPluginSurface } from '../plugin/surface.js';

/**
 * Fixture data used to pre-load a headless {@link ViewerState}. All fields are
 * optional; the common case is `createHeadlessViewerState()` with none.
 */
export interface HeadlessViewerFixtures {
    /**
     * Seed the viewer's active locale (BCP-47). In a real viewer core mirrors
     * this from `config.locale ?? page default`; here the kit is the "core", so
     * it is written directly. Observable state — a later change notifies.
     */
    activeLocale?: string;
    /** Apply an initial `ViewerConfig` through the real `updateConfig` command. */
    config?: ViewerConfig;
    /**
     * Pre-load already-parsed IIIF manifest JSON through the real
     * `setManifestData` command (NO network). Loading is asynchronous
     * (manifesto parsing): `await flush()` — or await `state.isManifestReady(id)`
     * via a subscription — before asserting on manifest-derived state.
     */
    manifest?: { id: string; json: unknown; canvasId?: string };
}

/**
 * Construct a real, live `ViewerState` with no DOM viewer and no OpenSeadragon.
 * This is the headless core of the SDK test kit's test viewer context: commands,
 * `subscribe`, and the batched notification flush all behave exactly as they do
 * in a mounted viewer.
 *
 * The state is created with NO initial manifest id so the constructor performs
 * no network fetch; manifest data is supplied through {@link HeadlessViewerFixtures.manifest}
 * (registered from provided JSON, still no network).
 */
export function createHeadlessViewerState(
    fixtures: HeadlessViewerFixtures = {},
): ViewerState {
    const state = new ViewerState();

    if (fixtures.config) {
        state.updateConfig(fixtures.config);
    }
    if (fixtures.activeLocale !== undefined) {
        // Observable member core normally mirrors from config/page locale; the
        // kit stands in for core here.
        state.activeLocale = fixtures.activeLocale;
    }
    if (fixtures.manifest) {
        const { id, json, canvasId } = fixtures.manifest;
        void state
            .setManifestData(id, json, canvasId ? { canvasId } : undefined)
            .catch(() => {
                /* fixture JSON only — no network; swallow parse failures */
            });
    }

    return state;
}

/**
 * The owning viewer's active-locale source, built exactly as core's viewer root
 * builds it: `current` reads `ViewerState.activeLocale`, and `subscribe` wakes on
 * the framework-neutral notification only when the locale actually changes. The
 * kit composes this with {@link createPluginLocaleService} so its locale double
 * runs the real per-viewer active-locale logic.
 */
export function createActiveLocaleSource(
    state: ViewerState,
): ActiveLocaleSource {
    return {
        get current(): string {
            return state.activeLocale;
        },
        subscribe(callback: (locale: string) => void): () => void {
            let last = state.activeLocale;
            return state.subscribe(() => {
                const next = state.activeLocale;
                if (next !== last) {
                    last = next;
                    callback(next);
                }
            });
        },
    };
}

/** Build a real per-viewer locale service bound to a headless viewer state. */
export function createHeadlessLocaleService(
    state: ViewerState,
    catalog?: Parameters<typeof createPluginLocaleService>[1],
): ReturnType<typeof createPluginLocaleService> {
    return createPluginLocaleService(createActiveLocaleSource(state), catalog);
}

/**
 * Settle the reactive flush so batched, payload-free notifications are delivered
 * (the flush timing rule above). `await flush()` after any command (or
 * unsupported direct assignment) before asserting that a subscriber reacted.
 *
 * Wraps Svelte's synchronous `flushSync` and yields a microtask so a
 * `queueMicrotask`-scheduled follow-up also settles. Tolerates being called
 * while a flush is already in progress.
 */
export async function flush(): Promise<void> {
    try {
        flushSync();
    } catch {
        /* already flushing — the in-progress flush delivers */
    }
    await Promise.resolve();
}

// ---------------------------------------------------------------------------
// The consumer testing helper: a headless `ViewerHandle`.
// ---------------------------------------------------------------------------

// Re-exported so a consumer annotating their own test helpers never needs a
// deep import. These are the SAME types `triiiceratops/react` and
// `triiiceratops/vue` export.
export type { ViewerHandleSlot } from '../framework/handle.js';
export type {
    ReadonlyViewerState,
    TriiiceratopsViewerElement,
    ViewerHandle,
} from '../framework/types.js';

/** Options accepted by {@link createTestViewerHandle}. */
export interface TestViewerHandleOptions {
    /**
     * Pre-load the real state exactly as {@link createHeadlessViewerState} does
     * (locale, config, already-parsed manifest JSON — still no network).
     */
    fixtures?: HeadlessViewerFixtures;
}

/**
 * A real {@link ViewerHandle} over real viewer state, with no viewer mounted.
 *
 * It is deliberately BOTH shapes a framework helper accepts, so neither
 * framework needs an adapter:
 *
 * - It satisfies {@link ViewerHandleSlot}, so React's `useViewer()` and
 *   `useViewerSelector()` take it directly where a `useViewerHandle()` slot
 *   would go.
 * - It satisfies {@link ViewerHandle} (`element` + `state`), so Vue's
 *   composables take `shallowRef(handle)` where a template ref would go.
 */
export interface TestViewerHandle extends ViewerHandle, ViewerHandleSlot {
    /**
     * The inert stand-in for the custom-element host. It is a detached element
     * (or, with no `document`, a plain inert object): it is never connected,
     * never upgraded, dispatches no viewer events, and owns no viewer. Its
     * `viewerState` getter returns {@link state}, matching the invariant a real
     * mounted wrapper holds.
     */
    readonly element: TriiiceratopsViewerElement;
    /**
     * The real, live `ViewerState` — real commands, real batched notifications.
     * Never a fake, never a `Proxy`. Typed as the full `ViewerState` rather
     * than `ReadonlyViewerState` because a test legitimately drives fixtures
     * (`setManifestData`) that application code would not.
     *
     * Commands are batched: `await flush()` before asserting a consumer
     * re-rendered.
     */
    readonly state: ViewerState;
    /**
     * Inject an OpenSeadragon stand-in and fire the real readiness path
     * (`ViewerState.notifyOSDReady`), which is what makes `cadence: 'frame'`
     * exercisable headlessly. `state.osdViewer` is `null` until this is called.
     *
     * No OSD fake ships here — the stub is the caller's, exactly as in the SDK
     * test kit. A `frame`-cadence projection attaches to it through
     * `addHandler`/`removeHandler`, so a stub needs at least those two and a way
     * for the test to fire `animation` / `viewport-change` / `animation-finish`.
     *
     * `osdViewer` is an inventoried observable member, so the selector runtime
     * only learns about the injection on the next flush: `await flush()` after
     * calling this.
     */
    setOsdViewer(stub: unknown): void;
    /**
     * Release everything this handle owns: publish `null` to subscribers, drop
     * the selector runtime's registration, and remove its single underlying
     * `ViewerState.subscribe`. Idempotent, so an `afterEach` that disposes a
     * handle a test already disposed is fine.
     */
    dispose(): void;
}

/**
 * Build a headless {@link TestViewerHandle} so a consumer can unit-test their
 * own components that read viewer state.
 *
 * Nothing is faked below the harness: the state is a real `ViewerState` with
 * real commands and real batched notifications, and the selector runtime is the
 * real one, registered in the very registry `useViewerSelector()` consults — so
 * the helper drives the production code path rather than a parallel one.
 *
 * Nothing is mounted either: no custom element is defined or rendered, no
 * OpenSeadragon is created, and no network request is made.
 *
 * @example
 * ```ts
 * const handle = createTestViewerHandle();
 * // React: pass it straight in.
 * const canvasId = useViewerSelector(handle, (state) => state.canvasId);
 * // Vue: wrap it in a ref.
 * const viewer = shallowRef(handle);
 * // Drive a real command, then settle the real batched notification.
 * handle.state.setCanvas('https://example.org/canvas/2');
 * await flush();
 * handle.dispose();
 * ```
 */
export function createTestViewerHandle(
    options: TestViewerHandleOptions = {},
): TestViewerHandle {
    const state = createHeadlessViewerState(options.fixtures);
    const element = createInertViewerHost(state);

    // The substrate's real slot, claimed by the inert host. Reusing it rather
    // than re-implementing `get`/`subscribe` means a consumer's React component
    // exercises the same publish-and-notify path a mounted viewer would, and a
    // test handle mistakenly passed to a real <TriiiceratopsViewer> raises the
    // real `TriiiceratopsHandleConflictError` instead of binding twice.
    const slot = createViewerHandleSlot();
    const claim = slot.claim(element);

    const runtime = createSelectorRuntime(state);
    attachSelectorRuntime(state, runtime);

    let disposed = false;

    const handle: TestViewerHandle = {
        element,
        state,
        get: slot.get,
        subscribe: slot.subscribe,
        armUnboundWarning: slot.armUnboundWarning,
        claim: slot.claim,
        setOsdViewer(stub: unknown): void {
            state.notifyOSDReady(
                stub as Parameters<ViewerState['notifyOSDReady']>[0],
            );
        },
        dispose(): void {
            if (disposed) return;
            disposed = true;
            claim.release();
            detachSelectorRuntime(state, runtime);
            runtime.dispose();
        },
    };

    // Publish the handle itself, so `handle.get()` and the object a consumer
    // holds are one object — and `get()` goes null on disposal.
    claim.publish(handle);

    return handle;
}

/**
 * The inert host {@link TestViewerHandle.element} stands in for.
 *
 * A detached element when a `document` exists (faithful enough that a consumer
 * can read attributes or measure it), and a plain inert object otherwise, so
 * this entry keeps its promise that a DOM is not a requirement. Either way it
 * is never inserted, never connected, and never upgraded, so no viewer, shadow
 * root, or event channel comes with it.
 */
function createInertViewerHost(state: ViewerState): TriiiceratopsViewerElement {
    const doc = (globalThis as { document?: Document }).document;
    const host =
        typeof doc?.createElement === 'function'
            ? (doc.createElement(
                  VIEWER_ELEMENT_TAG,
              ) as unknown as TriiiceratopsViewerElement)
            : createDomlessViewerHost();
    // Match the real element's invariant: `element.viewerState` is the very same
    // object as `handle.state`. An own accessor, so it also shadows the real
    // getter-only bridge if the tag happens to be registered in this test file.
    Object.defineProperty(host, 'viewerState', {
        configurable: true,
        enumerable: true,
        get: () => state,
    });
    return host;
}

/** The no-DOM stand-in: enough surface to be inspected and listened to, inert. */
function createDomlessViewerHost(): TriiiceratopsViewerElement {
    const tag = VIEWER_ELEMENT_TAG;
    return {
        tagName: tag.toUpperCase(),
        nodeName: tag.toUpperCase(),
        localName: tag,
        isConnected: false,
        getAttribute: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as TriiiceratopsViewerElement;
}
