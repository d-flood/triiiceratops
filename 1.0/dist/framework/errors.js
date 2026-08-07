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
export class TriiiceratopsElementRegistrationError extends Error {
    code = 'ELEMENT_REGISTRATION_UNAVAILABLE';
    constructor(message) {
        super(message);
        this.name = 'TriiiceratopsElementRegistrationError';
    }
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
export class TriiiceratopsElementVersionError extends Error {
    code = 'ELEMENT_VERSION_CONFLICT';
    tag;
    constructor(tag, detail) {
        super(`<${tag}> is already defined on this page by a constructor with no ` +
            `\`viewerState\` getter, so this framework wrapper cannot bind to ` +
            `its viewer state. ${detail} The most likely cause is a second, ` +
            `older Triiiceratops core (or another library) that registered ` +
            `<${tag}> first — custom-element registration is first-wins and ` +
            `cannot be replaced. Load exactly one Triiiceratops core per page, ` +
            `at a version whose custom element exposes \`viewerState\`.`);
        this.name = 'TriiiceratopsElementVersionError';
        this.tag = tag;
    }
}
/**
 * One viewer handle was passed to two viewers. Handles are bound to exactly
 * one element so per-viewer isolation is unambiguous; silently rebinding would
 * make a page with two viewers read from whichever mounted last.
 */
export class TriiiceratopsHandleConflictError extends Error {
    code = 'VIEWER_HANDLE_CONFLICT';
    constructor(held, claiming) {
        super(`This viewer handle is already bound to ${held} and cannot also be ` +
            `bound to ${claiming}. A handle identifies exactly one viewer: ` +
            `create one handle per <TriiiceratopsViewer> (React: a separate ` +
            `useViewerHandle() call; Vue: a separate template ref).`);
        this.name = 'TriiiceratopsHandleConflictError';
    }
}
/** A short, log-safe description of an element for a diagnostic message. */
export function describeViewerElement(element) {
    if (!element)
        return 'no element';
    const id = element.getAttribute('id');
    const className = element.getAttribute('class');
    return (`<${element.localName}` +
        (id ? ` id="${id}"` : '') +
        (className ? ` class="${className}"` : '') +
        '>');
}
