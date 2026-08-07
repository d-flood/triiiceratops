/**
 * Core logging (ticket 18 — core distribution cleanup).
 *
 * This module is the ONE sanctioned place `console.*` is called inside
 * `src/lib`. Every other lib module logs through {@link logger}, whose output is
 * silent unless debug mode is enabled. Debug mode is opt-in through
 * `ViewerConfig.debug`, wired in `TriiiceratopsViewer.svelte` via
 * {@link configureLogging}. This keeps production distributions quiet by default
 * (SPEC.md "Core Distribution" — "Production distributions are quiet by default.
 * Debug logging is opt-in through a logger or debug mode."; user story 12) while
 * preserving opt-in developer diagnostics.
 *
 * The logger is for developer-facing diagnostics ONLY. Actionable failures do
 * not rely on it — they surface through the structured `viewererror` (ticket 18,
 * see `../types/viewerError`) and `pluginerror` (ticket 09) channels so hosts can
 * handle integration problems without scraping the console (user story 13).
 *
 * Bundler-neutral and SSR-safe: this module touches no browser globals at import
 * and needs no bundler-specific env replacement; `console` exists in Node too,
 * so a consumer bundler without Vite-style `define` can compile it unchanged.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * A destination for enabled log records. Injectable so hosts and tests can
 * capture diagnostics instead of writing to the console.
 */
export type LogSink = (level: LogLevel, args: readonly unknown[]) => void;
export interface Logger {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}
/** Prefix on every emitted record so hosts/tests can attribute viewer output. */
export declare const LOG_PREFIX = "[triiiceratops]";
/**
 * Configure logging. Called by the viewer from `ViewerConfig.debug` (default
 * silent). Debug mode is a page-level developer diagnostic: with multiple
 * viewers on one page the most recently applied `debug` value wins. An
 * injectable `sink` lets a host or test capture records; pass `null` to restore
 * the console sink.
 */
export declare function configureLogging(options: {
    debug?: boolean;
    sink?: LogSink | null;
}): void;
/** Whether debug logging is currently enabled. */
export declare function isDebugEnabled(): boolean;
/**
 * The shared viewer logger. All methods are no-ops unless debug mode is enabled.
 */
export declare const logger: Logger;
