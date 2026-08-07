/**
 * The framework wrappers' own structured failures.
 *
 * Each one names a wiring mistake a consumer can actually fix, and each is
 * thrown (or handed to the wrapper's `onRegistrationError` seam) so it reaches
 * the framework's native error handling — a React error boundary, Vue's
 * `app.config.errorHandler` — rather than the console.
 *
 * `TriiiceratopsCoreConflictError` (`../browser-runtime`) is deliberately NOT
 * wrapped by any of these: its message is already the right diagnostic, so the
 * registrar passes it through unmodified.
 */
/**
 * The environment cannot register a custom element at all — no
 * `customElements` registry exists. In practice this means a wrapper's mount
 * path ran outside a browser (a DOM-less test runner, or a server render that
 * incorrectly executed client effects).
 */
export declare class TriiiceratopsElementRegistrationError extends Error {
    readonly code: "ELEMENT_REGISTRATION_UNAVAILABLE";
    constructor(message: string);
}
/**
 * The tag is owned by a constructor that is not a compatible Triiiceratops
 * core — it has no `viewerState` getter on its prototype, so there is no state
 * bridge to bind to.
 *
 * This is the only diagnosis for `defineViewerElement`'s deliberately silent
 * `false`: the browser runtime's "one core per page, first wins" rule leaves a
 * foreign registration in place without complaint, and a wrapper that simply
 * waited would hang forever. Detection is synchronous and uses no timer.
 */
export declare class TriiiceratopsElementVersionError extends Error {
    readonly code: "ELEMENT_VERSION_CONFLICT";
    readonly tag: string;
    constructor(tag: string, detail: string);
}
/**
 * One viewer handle was passed to two viewers. Handles are bound to exactly
 * one element so per-viewer isolation is unambiguous; silently rebinding would
 * make a page with two viewers read from whichever mounted last.
 */
export declare class TriiiceratopsHandleConflictError extends Error {
    readonly code: "VIEWER_HANDLE_CONFLICT";
    constructor(held: string, claiming: string);
}
/** A short, log-safe description of an element for a diagnostic message. */
export declare function describeViewerElement(element: Element | null): string;
