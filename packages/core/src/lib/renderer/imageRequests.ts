/**
 * Which decoded images the host should be holding, as a pure function.
 *
 * The host keeps one decoded image per canvas, but a canvas id is **not** a
 * stable name for a picture: selecting a different Choice on the same canvas
 * (`state.selectedChoices` → `resolveCanvasImage`) resolves the same canvas id
 * to a different URL. Keying residency on the id alone therefore paints the
 * previous choice forever. Residency is keyed on the **resolved URL**, and this
 * function is what compares the two.
 *
 * Kept out of `CanvasHost.svelte` deliberately: vitest runs under happy-dom,
 * which has no 2D canvas context, so anything decided inside the host is only
 * reachable by an end-to-end test. Decided here, it is an ordinary unit test.
 *
 * Eviction under budget pressure is ticket 08; this is only "what did the world
 * change to".
 */

import type { PlannerCanvas } from './types';

/** What the host wants loaded next, given what it already has or has asked for. */
export interface ImageReconciliation {
    /** Canvas ids whose held image is stale or no longer wanted. */
    drop: string[];
    /** Canvas ids to request, with the URL to request. */
    load: Array<{ canvasId: string; url: string }>;
}

/**
 * @param held canvasId → the URL currently decoded **or in flight** for it.
 * @param canvases the canvases the viewer is now showing.
 *
 * A canvas whose held URL still matches appears in neither list: an in-flight
 * request for the same URL is left alone rather than restarted.
 */
export function reconcileImages(
    held: Readonly<Record<string, string>>,
    canvases: readonly PlannerCanvas[],
): ImageReconciliation {
    // Tiled sources are ticket 05: a `service` canvas holds no static image, so
    // it is "wanted" by nothing here and anything held for it is dropped.
    const wanted = new Map<string, string>();
    for (const canvas of canvases) {
        if (canvas.source.kind !== 'static') continue;
        wanted.set(canvas.id, canvas.source.url);
    }

    const drop: string[] = [];
    for (const [canvasId, url] of Object.entries(held)) {
        if (wanted.get(canvasId) !== url) drop.push(canvasId);
    }

    const load: Array<{ canvasId: string; url: string }> = [];
    for (const [canvasId, url] of wanted) {
        if (held[canvasId] !== url) load.push({ canvasId, url });
    }

    return { drop, load };
}
