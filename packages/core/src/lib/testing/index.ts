/**
 * `triiiceratops/testing` — the compiled headless viewer-state entry (ticket 14).
 *
 * The SDK test kit (`@triiiceratops/plugin-sdk/testing`) builds a **test viewer
 * context** on top of this: a real, live `ViewerState` — real commands, real
 * batched notifications — running under vitest/jsdom with NO Svelte tooling
 * (CONTEXT.md **Test viewer context**: "the harness is fake; the state is never
 * fake").
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
