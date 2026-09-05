/**
 * The `<triiiceratops-viewer>` custom element's state bridge.
 *
 * The element exposes the owning viewer's live per-instance {@link ViewerState}
 * — the sole integration-facing state surface (ADR 0007) — as a getter-only
 * `viewerState` property, paired with the {@link VIEWER_STATE_AVAILABLE_EVENT}
 * lifecycle event. Together they are how a host (and, later, a framework
 * wrapper) binds to the state a given element owns, without a second
 * framework-specific state surface and without a page-global.
 *
 * This module is deliberately free of any Svelte runtime import so it can be
 * consumed from plain TypeScript.
 */

import type { ViewerState } from '../state/viewer.svelte';
import type { SearchProvider } from './config';

/**
 * Fired by `<triiiceratops-viewer>` once for each mounted `ViewerState`
 * instance, bubbling and composed like the other viewer channels so it escapes
 * the shadow root. `detail` is the exact same object the element's
 * `viewerState` property returns.
 *
 * It means only that state can be bound. It does not mean a manifest has
 * loaded, the renderer is ready, or a requested canvas is visible — read
 * `viewerState` (or the `statechange` family) for that.
 *
 * Ordinary state changes do not repeat it. A disconnection that destroys the
 * inner viewer and a later reconnection produce a new `ViewerState` and its own
 * event.
 *
 * Hosts bind race-free by listening then checking: attach the listener, then
 * read `viewerState`. The property is populated before the event is dispatched,
 * so state that became available before, during, or after the host initialized
 * is caught exactly one of the two ways.
 */
export const VIEWER_STATE_AVAILABLE_EVENT = 'viewerstateavailable';

/**
 * The supported bridge surface of the `<triiiceratops-viewer>` element.
 *
 * `viewerState` is getter-only on the element prototype: the Svelte compiler
 * emits it from an instance export, so a host physically cannot replace the
 * owning viewer's state. Its presence on the registered constructor's prototype
 * is also the version handshake a framework wrapper probes to confirm it is
 * talking to a compatible core.
 *
 * `searchProvider` is a property-only input forwarded to the viewer's existing
 * native search behavior. There is no reflected attribute; Svelte derives an
 * inert `searchprovider` observed attribute from the prop declaration, and a
 * non-function value is ignored with a debug-gated warning.
 */
export interface TriiiceratopsViewerElement extends HTMLElement {
    /**
     * The live `ViewerState` this element's viewer owns — `undefined` before
     * the inner viewer mounts and again after disconnection.
     */
    readonly viewerState: ViewerState | undefined;
    /** Host-supplied custom search backend, or `null` for the built-in path. */
    searchProvider?: SearchProvider | null;
}
