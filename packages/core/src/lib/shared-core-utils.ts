/**
 * The values behind the **shared core utilities** — see `SharedCoreUtils` in
 * `browser-runtime.ts` for what they are, why they exist, and the three rules
 * that keep them cheap.
 *
 * Kept out of `browser-runtime.ts` for the reason `shared-svelte-runtime.ts`
 * is: that module is reached by the framework substrate behind
 * `triiiceratops/react` and `triiiceratops/vue`, and those subpaths are thin
 * wrappers that have no business retaining core's IIIF parsing helpers. The Web
 * Component entries import this module and hand the object to
 * `installBrowserRuntime`.
 */

import type { SharedCoreUtils } from './browser-runtime';
import { getPaintingAnnotations } from './utils/iiifParsing';
import {
    isImageBody,
    isUnsupportedCanvasFor,
    paintingBodyAlternatives,
} from './utils/paintingBodies';

/**
 * The curated set: exactly the utilities `@triiiceratops/plugin-av`'s IIFE
 * reads off the namespace instead of bundling. Every one is already retained by
 * core's own shipped graph, so exposing them retains nothing new. Read
 * `SharedCoreUtils`'s three rules before adding to it.
 */
export const SHARED_CORE_UTILS: SharedCoreUtils = {
    getPaintingAnnotations,
    isImageBody,
    isUnsupportedCanvasFor,
    paintingBodyAlternatives,
};
