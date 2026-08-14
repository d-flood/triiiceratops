/**
 * Ambient shim for `svelte/internal/client`, which Svelte ships without types
 * because it is private API.
 *
 * `src/lib/shared-svelte-runtime.ts` imports a curated handful of those helpers
 * to publish as core's **shared Svelte runtime**; nothing type-checks against
 * them (they are re-published as `Record<string, unknown>` and bound by a
 * plugin bundler's `output.globals`), so an untyped module is exactly right.
 *
 * Deliberately in `src/` rather than `src/lib/`: `svelte-package` publishes
 * `src/lib`, and a shipped ambient `declare module 'svelte/internal/client'`
 * would silently type that module as `any` in every consumer's project.
 */
declare module 'svelte/internal/client';
