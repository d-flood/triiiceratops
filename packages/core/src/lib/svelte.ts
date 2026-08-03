/**
 * `triiiceratops/svelte` — the Svelte 5 entry point.
 *
 * This is a SUPERSET of the framework-neutral `.` entry: everything the root
 * exports is re-exported here, plus the three groups that can only work with
 * Svelte installed. A Svelte consumer imports from this subpath and nothing
 * else; migrating from pre-1.0 is a single specifier change:
 *
 * ```diff
 * - import { TriiiceratopsViewer, ViewerState } from 'triiiceratops';
 * + import { TriiiceratopsViewer, ViewerState } from 'triiiceratops/svelte';
 * ```
 *
 * **Why these three groups live here and not on `.`.** Each reaches Svelte at
 * runtime, and the component additionally reaches it at type-check time:
 *
 * - `components/TriiiceratopsViewer.svelte` — a compiled component, whose
 *   declaration is `import("svelte").Component<…>`. This is the ONLY type-level
 *   Svelte reference in the published surface.
 * - `state/viewer.svelte` — a rune module; imports `svelte/reactivity` (and
 *   `svelte`) at runtime. Its DECLARATIONS are Svelte-free by construction (the
 *   reactive-collection members are typed as the plain built-ins that
 *   `SvelteSet`/`SvelteMap` extend), so `.` still re-exports `ViewerState` as a
 *   TYPE — only the constructible class moved here.
 * - `state/manifests.svelte` — likewise imports `svelte/reactivity`.
 *
 * Keeping them on `.` meant a React or Vue consumer who type-checked anything
 * reached from the root entry needed `svelte` installed. `svelte` is an OPTIONAL
 * peer dependency, so it generally is not — which made the root entry's name
 * ("the package") disagree with its audience ("Svelte users"). See
 * `SVELTE_CONSUMER_SUBPATHS` in `src/packaging/dtsSvelteImports.ts`, which now
 * holds `.` to the same strict no-Svelte rule as every other subpath and exempts
 * this one instead.
 *
 * A consumer who needs a constructible `ViewerState` WITHOUT Svelte installed
 * wants `triiiceratops/testing`, whose bundle inlines the reactivity runtime.
 */

// The framework-neutral surface, unchanged and complete.
export * from './index';

// The Svelte component itself — the reason this entry exists.
export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';

// The constructible rune-backed state classes. `.` exports `ViewerState` as a
// type; this shadows that with the runtime class (an explicit re-export takes
// precedence over the `export *` above).
export { ViewerState, VIEWER_STATE_KEY } from './state/viewer.svelte';
export { ManifestsState, manifestsState } from './state/manifests.svelte';
