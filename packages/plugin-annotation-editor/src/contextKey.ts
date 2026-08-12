/**
 * Svelte component-context keys the plugin's UI reads.
 *
 * `VIEWER_STATE_KEY` carries the owning viewer's state (the live `ViewerState`,
 * or the reactive mirror `view.mount` builds so the plugin's own Svelte runtime
 * tracks cross-realm state changes) to the controller, which reads it with
 * `getContext(VIEWER_STATE_KEY)`. Package-local so the plugin never imports
 * core internals.
 */
export const VIEWER_STATE_KEY = Symbol('triiiceratops:viewer-state');
