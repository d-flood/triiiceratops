/**
 * Svelte component-context keys the plugin's UI reads.
 *
 * `VIEWER_STATE_KEY` carries the owning viewer's state (the live `ViewerState`,
 * or the reactive mirror `view.mount` builds so the plugin's own Svelte runtime
 * tracks cross-realm state changes) to the controller. It replaces core's
 * internal `VIEWER_STATE_KEY` (the plugin no longer imports core internals); the
 * controller reads it with `getContext(VIEWER_STATE_KEY)` exactly as before.
 */
export const VIEWER_STATE_KEY = Symbol('triiiceratops:viewer-state');
