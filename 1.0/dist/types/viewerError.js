/**
 * The structured `viewererror` channel (ticket 18 — core distribution cleanup).
 *
 * Mirrors the `pluginerror` channel (ticket 09, {@link PluginError} in
 * `./plugin`) so hosts handle viewer-level failures exactly as they handle
 * plugin failures: actionable configuration, content, and operation problems are
 * delivered as a typed payload on BOTH a bubbling, composed `viewererror`
 * CustomEvent from the viewer root AND an `onviewererror` host callback — the
 * SAME object both ways — instead of being scraped from the console (SPEC.md
 * "Core Distribution" — "Actionable configuration, version, plugin, and
 * operation failures use structured events or callbacks"; user stories 12–13).
 *
 * The payload type is defined ONCE here so ticket 21 can snapshot it.
 *
 * Bundler-neutral and SSR-safe: pure types plus a string constant; no runtime,
 * no browser globals, no bundler-specific env replacement.
 */
/** The DOM event name for the structured viewer-failure channel. */
export const VIEWER_ERROR_EVENT = 'viewererror';
