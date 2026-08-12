/**
 * The structured `viewererror` channel.
 *
 * Mirrors the `pluginerror` channel ({@link PluginError} in `./plugin`) so
 * hosts handle viewer-level failures exactly as they handle
 * plugin failures: actionable configuration, content, and operation problems are
 * delivered as a typed payload on BOTH a bubbling, composed `viewererror`
 * CustomEvent from the viewer root AND an `onviewererror` host callback — the
 * SAME object both ways — instead of being scraped from the console (SPEC.md
 * "Core Distribution" — "Actionable configuration, version, plugin, and
 * operation failures use structured events or callbacks"; user stories 12–13).
 *
 * The payload type is defined ONCE here so it can be snapshotted for the
 * public API surface.
 *
 * Bundler-neutral and SSR-safe: pure types plus a string constant; no runtime,
 * no browser globals, no bundler-specific env replacement.
 */

/** Whether a viewer error is a recoverable warning or a hard failure. */
export type ViewerErrorSeverity = 'warning' | 'error';

/**
 * The area of the viewer a failure originated in. Coarse and stable — hosts
 * switch on {@link ViewerError.code} for specifics.
 * - `config`: an invalid or conflicting `ViewerConfig` value.
 * - `content-state`: content-state ingestion degraded or failed (ADR 0006).
 * - `manifest`: a manifest or linked resource failed to load or parse.
 * - `plugin`: a call a plugin made into `ViewerState` was refused — a plugin
 *   *author* error, reported to the host because the (silent-by-default) logger
 *   would otherwise swallow it in every viewer that has not enabled `debug`.
 *   Distinct from the `pluginerror` channel, which carries a failure *thrown by*
 *   an identified plugin along with its `retry()`; a refused call throws nothing
 *   and core cannot always attribute it to a plugin at all (a layer id naming no
 *   known plugin is exactly that case).
 * - `search`: a search operation failed or no search service was available.
 * - `viewport`: a viewport operation (e.g. fullscreen) failed.
 */
export type ViewerErrorScope =
    | 'config'
    | 'content-state'
    | 'manifest'
    | 'plugin'
    | 'search'
    | 'viewport';

/**
 * The normative `viewererror` payload. Delivered as the `detail` of the
 * bubbling, composed `viewererror` CustomEvent from the viewer root AND to the
 * `onviewererror` host callback — the SAME object both ways.
 */
export interface ViewerError {
    /** Whether this is a recoverable warning or a hard failure. */
    readonly severity: ViewerErrorSeverity;
    /** The area of the viewer the failure originated in. */
    readonly scope: ViewerErrorScope;
    /** Stable, machine-readable code (e.g. `nav-edge-conflict`, `search-failed`). */
    readonly code: string;
    /** Human-readable, developer-facing description. */
    readonly message: string;
    /** The underlying thrown value, if any, passed through unchanged. */
    readonly error?: unknown;
    /** Optional structured context for the failure. */
    readonly detail?: Readonly<Record<string, unknown>>;
}

/** The DOM event name for the structured viewer-failure channel. */
export const VIEWER_ERROR_EVENT = 'viewererror';

/** Host callback for the structured viewer-failure channel (Svelte prop / element property). */
export type ViewerErrorReporter = (error: ViewerError) => void;
