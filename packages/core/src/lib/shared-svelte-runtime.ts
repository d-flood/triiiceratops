/**
 * The values behind the **shared Svelte runtime** — see `SharedSvelteRuntime` in
 * `browser-runtime.ts` for what it is, why it exists, and the three rules that
 * keep it cheap.
 *
 * **This file exists separately from `browser-runtime.ts` for one reason**: it is
 * the only module in core that imports Svelte at runtime *outside* the component
 * graph, and `browser-runtime.ts` is reached by the framework substrate, which
 * `triiiceratops/react` and `triiiceratops/vue` are built from. Those subpaths
 * promise a consumer needs no `svelte` package at all —
 * `scripts/check-framework-entries.mjs` fails the build if their graphs import
 * one. Keeping the imports here means only the Web Component entries
 * (`custom-element.ts`, `element.ts`), which are Svelte to their core anyway,
 * ever pull them in, and they hand the objects to `installBrowserRuntime`.
 */

import { getContext, mount, unmount } from 'svelte';
// The one deliberate `svelte/internal` import in the repo: this list IS the
// shared runtime, which exists precisely so that exactly ONE bundle imports
// these helpers instead of every first-party plugin shipping its own copy.
// Recorded in lint-allowlist.md.
// eslint-disable-next-line svelte/no-svelte-internal
import {
    append,
    bind_this,
    child,
    from_html,
    get,
    pop,
    proxy,
    push,
    reset,
    set,
    state,
} from 'svelte/internal/client';

import type { SharedSvelteRuntime } from './browser-runtime';

/**
 * The curated set, derived by compiling `@triiiceratops/plugin-av`'s real
 * components and reading the `$.<name>` references out of the output. Read
 * `SharedSvelteRuntime`'s three rules before adding to either list.
 *
 * It is curated, never `export *`: the whole namespace is ~200 exports and
 * costs core 8.8 KB gzip, because re-exporting everything defeats
 * tree-shaking. Adding a helper already reachable through core's shipped graph
 * — its own components, or the `@triiiceratops/ui` primitives
 * `packaging/inlineUi.ts` inlines into it — costs essentially nothing, because
 * nothing new is retained: the eleven the plugin's panel needs moved the element
 * IIFE by 11 bytes gzip. A helper that graph does NOT already reach is a
 * different thing entirely, and the size ratchet is what makes the difference
 * visible in review rather than silent.
 */
export const SHARED_SVELTE_RUNTIME: SharedSvelteRuntime = {
    svelte: { mount, unmount, getContext },
    svelteInternal: {
        append,
        bind_this,
        child,
        from_html,
        get,
        pop,
        proxy,
        push,
        reset,
        set,
        state,
    },
};
