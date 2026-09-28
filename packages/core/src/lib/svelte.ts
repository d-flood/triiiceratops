/**
 * `triiiceratops/svelte` — the Svelte 5 entry point. A superset of the
 * framework-neutral `.` entry, plus the component and constructible state that
 * need Svelte installed. Without Svelte, use `triiiceratops/testing`.
 */

export * from './index';

export { default as TriiiceratopsViewer } from './components/TriiiceratopsViewer.svelte';

// The constructible rune-backed state classes. `.` exports `ViewerState` as a
// type; this shadows that with the runtime class (an explicit re-export takes
// precedence over the `export *` above).
export { ViewerState, VIEWER_STATE_KEY } from './state/viewer.svelte';
export { ManifestsState, manifestsState } from './state/manifests.svelte';
