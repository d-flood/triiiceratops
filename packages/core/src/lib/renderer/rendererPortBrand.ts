/**
 * The brand that separates a port core built from an object that merely has the
 * right shape.
 *
 * Deliberately a module of its own rather than part of `rendererPort.ts`: that
 * module is reachable from core's public `.d.ts` graph (viewer state names
 * `RendererPort` in a signature), so anything exported from it lands in the API
 * report and reads as public. Nothing here is imported for its TYPE, so this
 * file stays out of that graph entirely — which is the same reason it can never
 * be imported by a consumer: the package's `exports` map has no wildcard, so
 * only the named entry points resolve.
 */

import type { RendererPort } from './rendererPort.js';

/**
 * The brand a core-owned port carries.
 *
 * `ViewerState.attachRenderer` is `@internal`, but the API report is a d.ts
 * snapshot of the whole published declaration graph rather than an
 * api-extractor run, so `@internal` is documentation and the method is
 * genuinely callable from a plugin with a hand-written object of the right
 * shape. Nothing here can be forged from outside the package: the symbol is
 * module-private, is not re-exported from any entry point, and is not a
 * registered (`Symbol.for`) symbol, so {@link markRendererPort} is reachable
 * only by code compiled into core.
 */
const RENDERER_PORT_BRAND = Symbol('triiiceratops.rendererPort');

/** Brand a port as core-owned. Called by the host that implements it. */
export function markRendererPort<T extends RendererPort>(port: T): T {
    Object.defineProperty(port, RENDERER_PORT_BRAND, {
        value: true,
        enumerable: false,
    });
    return port;
}

/** Whether `value` is a port core itself created. */
export function isRendererPort(value: unknown): boolean {
    return (
        !!value &&
        (typeof value === 'object' || typeof value === 'function') &&
        (value as Record<symbol, unknown>)[RENDERER_PORT_BRAND] === true
    );
}
