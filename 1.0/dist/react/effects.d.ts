/**
 * The one browser/server effect seam the React wrapper needs.
 *
 * Property-tier assignment and binding setup must happen in the SAME
 * synchronous commit that inserted the host element. Svelte's
 * `connectedCallback` awaits a microtask before mounting the inner viewer, and
 * React's layout phase runs inside the commit's own task — so a layout effect
 * always wins that race, while a passive effect (scheduled through the React
 * scheduler) does not, and would let the viewer mount with a manifest missing
 * and then reload it.
 *
 * `useLayoutEffect` does nothing during server rendering and React says so
 * loudly, so the export degrades to `useEffect` where there is no document.
 * Deciding once at module scope is a `typeof` guard, not a browser access:
 * nothing is read off `window`, `document`, or `customElements`, so importing
 * `triiiceratops/react` on a server stays safe.
 */
import { useEffect } from 'react';
/** `useLayoutEffect` in a browser, `useEffect` (an inert no-op) on a server. */
export declare const useBrowserLayoutEffect: typeof useEffect;
