/**
 * Which annotations belong to the canvases on screen — the one enumeration every
 * annotation surface works from.
 *
 * ## Why this exists at all
 *
 * The shape overlay, the connector overlay, and the annotation panel each used to
 * ask `getAnnotations(manifestId, canvasId)` for themselves: **one** canvas, the
 * viewer's current one. That is wrong in two of the three viewing modes, and
 * wrong differently in each:
 *
 * - `paged` puts a SPREAD on screen. The facing page is laid out, painted, and
 *   annotated, and its annotations appeared nowhere — no shape, no panel row, so
 *   nothing to select and nothing to draw a connector to.
 * - `continuous` lays out the whole manifest and the reader scrolls through it.
 *   The "current" canvas there is the last one *navigated* to, which after a
 *   scroll from folio 1 to folio 400 is 399 folios behind what is on screen
 *   (`renderer/layoutQueries.navigationTargetBounds` documents the same trap for
 *   fit targets).
 *
 * Three callers asking the same question three times is also how the panel and
 * the image come to disagree — and a connector is a line between them, so a
 * disagreement there is a line to nowhere. They now all read one answer.
 *
 * ## The canvas id is carried, not inferred
 *
 * Every entry names the canvas it came from, because geometry is meaningless
 * without it: `canvasToScreen(point, canvasId)` maps through THAT canvas's own
 * laid-out rect, and on a spread the two pages have different rects. The id
 * comes from the canvas that was asked about rather than from the annotation's
 * own target, so a user annotation with no canvas context, a v2 annotation on an
 * external list, and a search hit are all placed the same way.
 */

/** One canvas's annotations, in the order the manifest gave them. */
export interface CanvasAnnotations {
    canvasId: string;
    /** Raw IIIF annotation JSON — manifest annotations, then search hits. */
    annotations: unknown[];
    /** The ids among {@link annotations} that are ephemeral search hits. */
    searchHitIds: Set<string>;
}

export interface CollectCanvasAnnotationsOptions {
    manifestId: string | null;
    /** The canvases on screen, in layout order — `ViewerState.annotatableCanvasIds`. */
    canvasIds: readonly string[];
    getAnnotations: (manifestId: string, canvasId: string) => unknown[];
    /**
     * Every search hit for the manifest, each carrying its own `canvasId`.
     *
     * Filtered per canvas here rather than by the caller, so a hit on the facing
     * page of a spread reaches that page's entry — and is then projected through
     * that page's rect. The previous overlay instead shifted such a hit's
     * coordinates by a hand-rolled `canvasWidth * 1.025` and drew it against the
     * CURRENT canvas, which put it a gap's width out of place and could only ever
     * work for two pages.
     */
    searchAnnotations: readonly unknown[];
}

function annotationId(annotation: unknown): string {
    if (!annotation || typeof annotation !== 'object') return '';
    const record = annotation as Record<string, unknown>;
    const id = record.id ?? record['@id'];
    return typeof id === 'string' ? id : '';
}

function searchHitCanvasId(hit: unknown): string | null {
    if (!hit || typeof hit !== 'object') return null;
    const canvasId = (hit as Record<string, unknown>).canvasId;
    return typeof canvasId === 'string' ? canvasId : null;
}

/**
 * The annotations of every canvas on screen, one entry per canvas, canvases in
 * layout order.
 *
 * A canvas with no annotations still gets no entry, so the common single-canvas
 * case allocates exactly what it did before. Duplicate ids across canvases are
 * left alone: an annotation targeting two canvases is two shapes and one panel
 * row, which is the existing `renderId` contract in `annotationAdapter`.
 */
export function collectCanvasAnnotations({
    manifestId,
    canvasIds,
    getAnnotations,
    searchAnnotations,
}: CollectCanvasAnnotationsOptions): CanvasAnnotations[] {
    if (!manifestId || canvasIds.length === 0) return [];

    const collected: CanvasAnnotations[] = [];

    for (const canvasId of canvasIds) {
        const annotations = [...getAnnotations(manifestId, canvasId)];
        const searchHitIds = new Set<string>();

        for (const hit of searchAnnotations) {
            if (searchHitCanvasId(hit) !== canvasId) continue;
            const id = annotationId(hit);
            if (id) searchHitIds.add(id);
            annotations.push(hit);
        }

        if (annotations.length === 0) continue;
        collected.push({ canvasId, annotations, searchHitIds });
    }

    return collected;
}
