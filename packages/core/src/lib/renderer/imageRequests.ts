/**
 * Which decoded images the host should be holding, as a pure function.
 *
 * The host keeps one decoded image per **placed image** — per painting
 * annotation, not per canvas — and neither of those names is the picture. A
 * canvas can paint several (IIIF Cookbook 0036 paints a miniature over a
 * folio), so a canvas-keyed record would let the second evict the first every
 * frame; and the same placement resolves to a different URL when a different
 * Choice is selected (`state.selectedChoices` → `resolveCanvasImage`), so a
 * placement-keyed record alone would paint the previous choice forever.
 * Residency is therefore keyed on the placement and compared on the **resolved
 * URL**, and this function is what compares the two.
 *
 * Kept out of `CanvasHost.svelte` deliberately: vitest runs under happy-dom,
 * which has no 2D canvas context, so anything decided inside the host is only
 * reachable by an end-to-end test. Decided here, it is an ordinary unit test.
 *
 * Eviction under budget pressure is ticket 08; this is only "what did the world
 * change to".
 */

import type { StaticImageDraw } from './types';

/** What the host wants loaded next, given what it already has or has asked for. */
export interface ImageReconciliation {
    /** Image keys whose held image is stale or no longer wanted. */
    drop: string[];
    /** The placements to request, each carrying the URL to request. */
    load: StaticImageDraw[];
}

/**
 * @param held image key → the URL currently decoded **or in flight** for it.
 * @param wanted the plan's static-image placements — already gated by the tier,
 * so a canvas outside the residency window contributes none and anything held
 * for it is dropped.
 *
 * A placement whose held URL still matches appears in neither list: an in-flight
 * request for the same URL is left alone rather than restarted.
 */
export function reconcileImages(
    held: Readonly<Record<string, string>>,
    wanted: readonly StaticImageDraw[],
): ImageReconciliation {
    // A `service` source paints tiles, which the tile scheduler holds — it has
    // no whole image, so the planner emits none of these for it and anything
    // held against one is dropped.
    const urls = new Map(wanted.map((image) => [image.key, image.url]));

    const drop: string[] = [];
    for (const [key, url] of Object.entries(held)) {
        if (urls.get(key) !== url) drop.push(key);
    }

    const load: StaticImageDraw[] = [];
    for (const image of wanted) {
        if (held[image.key] !== image.url) load.push(image);
    }

    return { drop, load };
}
