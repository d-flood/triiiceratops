/**
 * Core-owned plugin surface service.
 *
 * A plugin's own panel/flyout chrome, handed to it as `PluginContext.surface`.
 * This supplies the open/close awareness a Svelte component's mount/destroy
 * lifecycle used to give for free: core mounts an SDK plugin ONCE
 * into a content element it re-parents in and out of the open surface, so
 * `view.mount` is not re-run on open/close and the plugin needs an observable
 * instead of a lifecycle hook.
 *
 * Every member is a thin, live projection over the owning `ViewerState` — no
 * cached copy, no second source of truth (ADR 0007: `ViewerState` is the sole
 * plugin-facing state surface). Reads are getters, so they are always current;
 * writes go through the same commands the toolbar uses, so a plugin closing its
 * own flyout notifies exactly like a button press. Because the underlying
 * `pluginUiState` is an inventoried `command` member, `surface.isOpen` composes
 * with `context.selectors` like any other viewer state.
 *
 * The surface closes over the chrome id core registered for this plugin, so the
 * plugin never has to know or re-derive it. Nothing here is per-activation
 * mutable state, so there is nothing to release on deactivation.
 */
/**
 * Create a plugin's surface, bound to one viewer and one chrome id.
 *
 * Seeds the viewer's UI state for `chromeId` from `authoredTarget` plus any
 * `config.plugins[chromeId]` override. That seeding is why the surface is built
 * BEFORE the plugin mounts: core registers the plugin's chrome only after a
 * successful mount (to fail closed), and without a seeded entry `isOpen` would
 * read `false` and `target` would read `'panel'` inside `mount` even for a
 * plugin the consumer configured open, or authored as a flyout.
 * `ensurePluginUiState` is idempotent, so the later `registerSdkChrome` call is
 * a no-op re-apply.
 */
export function createPluginSurface(state, chromeId, authoredTarget) {
    state.ensurePluginUiState(chromeId, authoredTarget);
    return {
        get id() {
            return chromeId;
        },
        get isOpen() {
            return state.isPluginOpen(chromeId);
        },
        get target() {
            return state.getPluginTarget(chromeId);
        },
        open() {
            state.setPluginOpen(chromeId, true);
        },
        close() {
            state.setPluginOpen(chromeId, false);
        },
        toggle() {
            state.togglePluginOpen(chromeId);
        },
    };
}
