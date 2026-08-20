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
import { companionPaintable } from './renderer/companionCanvases';
import { getPaintingAnnotations } from './utils/iiifParsing';
import { parseIiifTime } from './utils/iiifTime';
import {
    isImageBody,
    isUnsupportedCanvasFor,
    paintingBodyAlternatives,
} from './utils/paintingBodies';

/**
 * The curated set: exactly the utilities `@triiiceratops/plugin-av`'s IIFE
 * reads off the namespace instead of bundling. Most are re-exports of functions
 * core's own graph already retains, so they retain nothing new;
 * `companionPaintable` is an adapter over logic core already has, and costs
 * only the adapter. Read `SharedCoreUtils`'s three rules before adding to it —
 * rule 2 draws the line between those two cases and the one they exclude.
 */
export const SHARED_CORE_UTILS: SharedCoreUtils = {
    companionPaintable,
    getPaintingAnnotations,
    isImageBody,
    isUnsupportedCanvasFor,
    paintingBodyAlternatives,
    parseIiifTime,
};
