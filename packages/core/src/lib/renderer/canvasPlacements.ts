/**
 * Where a DOM treatment over a canvas goes, in surface-local CSS pixels.
 *
 * Two treatments use it and they mean opposite things — the error placeholder
 * (`canvasErrors.ts`) says a source failed, the unsupported presentation says
 * core never asked because it cannot render this canvas's content at all — but
 * both are one box over a canvas's layout rect with a message centred in the
 * part of it the reader can see, and neither touches the DOM. The geometry is
 * here so the two cannot drift apart.
 */

import type { LayoutRect, Viewport } from './types';

/**
 * The smallest label box worth putting words in, in CSS pixels.
 *
 * Roughly the width of the shortest of the three messages at the label's font
 * size and the height of two of its lines. It is a floor, not a fit: below it
 * even that message renders as a clipped fragment of a word, while above it the
 * longer ones — the unsupported-content one most of all — wrap to more lines
 * rather than needing a wider box. Not a token: it is a fact about how much room
 * a sentence needs, which no theme changes.
 */
export const MIN_LABEL_WIDTH = 96;
export const MIN_LABEL_HEIGHT = 32;

/**
 * One treatment, positioned in **surface-local CSS pixels**.
 *
 * TWO boxes, and the second one is what makes it perceptible rather than merely
 * present. `left`/`top`/`width`/`height` are the canvas's own layout rect, which
 * is what makes the treatment read as "this page" — but a reader may be zoomed a
 * long way into that canvas (the zoom ceiling is 128x home), and then the rect is
 * far larger than the viewport: its border is off screen on every side and a
 * centred label is centred on a point nobody can see. A sighted reader is left
 * with a flat fill and no message, while the accessible name goes on being
 * correct — a failure only a sighted reader has.
 *
 * `labelLeft`/`labelTop`/`labelWidth`/`labelHeight` are therefore the rect's
 * **intersection with the viewport**: the part of this canvas that is actually on
 * screen, and so the box the message has to be centred in.
 */
export interface CanvasPlacement<Kind extends string = string> {
    canvasId: string;
    /** Which treatment this is — what the caller's `kindOf` answered. */
    kind: Kind;
    left: number;
    top: number;
    width: number;
    height: number;
    labelLeft: number;
    labelTop: number;
    labelWidth: number;
    labelHeight: number;
    /**
     * Whether the label box is big enough to carry the message at all.
     *
     * A treatment is as small as its canvas's projection, which for a
     * thumbnail-tier folio is a sliver: clipping the text there renders a
     * fragment of one glyph, which reads as a rendering bug rather than as a
     * message. Below {@link MIN_LABEL_WIDTH} x {@link MIN_LABEL_HEIGHT} it is
     * the fill and the border alone — still named for assistive technology, and
     * still visibly not a page.
     */
    labelled: boolean;
}

/**
 * Where the treated canvases are on screen, this frame.
 *
 * `kindOf` answers per canvas id and returns a falsy value for the canvases
 * this pass is not about — cheapest test first, and on the manifests these
 * paths exist for it excludes nearly every rect.
 *
 * **Culled to the viewport**, and that is the load-bearing part rather than an
 * optimisation: a manifest whose whole image service is behind a login fails on
 * every one of its 800 folios, and one DOM node per failure would put 800
 * absolutely-positioned elements — each with an accessible name — into the
 * accessibility tree of a viewer showing two. The treatment exists so the reader
 * can perceive the state of a canvas they are looking at.
 *
 * Returns the placements in layout order, so the DOM order follows reading order
 * rather than the iteration order of whatever record the caller keyed on.
 */
export function canvasPlacements<Kind extends string>(
    layout: readonly LayoutRect[],
    kindOf: (canvasId: string) => Kind | null | undefined | false,
    viewport: Viewport,
): CanvasPlacement<Kind>[] {
    // Before the first `measure()` there is no surface to place anything on, and
    // a non-positive scale has no screen mapping at all.
    if (viewport.width <= 0 || viewport.height <= 0 || viewport.scale <= 0) {
        return [];
    }

    const placements: CanvasPlacement<Kind>[] = [];

    for (const rect of layout) {
        const kind = kindOf(rect.canvasId);
        if (!kind) continue;

        const left =
            (rect.x - viewport.centre.x) * viewport.scale + viewport.width / 2;
        const top =
            (rect.y - viewport.centre.y) * viewport.scale + viewport.height / 2;
        const width = rect.width * viewport.scale;
        const height = rect.height * viewport.scale;

        // A rect with no area cannot be perceived, and an off-screen one is not
        // being looked at.
        if (width <= 0 || height <= 0) continue;
        if (
            left + width <= 0 ||
            top + height <= 0 ||
            left >= viewport.width ||
            top >= viewport.height
        ) {
            continue;
        }

        // The on-screen part of this canvas — see `CanvasPlacement`. The
        // intersection is non-empty by the culling above, so this cannot produce
        // a negative extent.
        const labelLeft = Math.max(left, 0);
        const labelTop = Math.max(top, 0);
        const labelWidth = Math.min(left + width, viewport.width) - labelLeft;
        const labelHeight = Math.min(top + height, viewport.height) - labelTop;

        placements.push({
            canvasId: rect.canvasId,
            kind,
            left,
            top,
            width,
            height,
            labelLeft,
            labelTop,
            labelWidth,
            labelHeight,
            labelled:
                labelWidth >= MIN_LABEL_WIDTH &&
                labelHeight >= MIN_LABEL_HEIGHT,
        });
    }

    return placements;
}

/**
 * Whether two frames' placements say the same thing.
 *
 * The frame loop recomputes placements every frame and hands them to the DOM
 * through reactive state; this is what stops an unchanged answer from waking the
 * reactive graph. A pan moves every placement, so most frames of a gesture DO
 * differ and this returns false — the frames it earns anything on are the still
 * ones, which is the overwhelming majority of a session.
 *
 * Ordered comparison, not set comparison: `canvasPlacements` returns layout
 * order, so two lists with the same members in a different order really are a
 * different DOM order and the reader's tab and reading order would change.
 */
export function samePlacements(
    a: readonly CanvasPlacement[],
    b: readonly CanvasPlacement[],
): boolean {
    if (a.length !== b.length) return false;
    return a.every((entry, index) => {
        const other = b[index];
        return (
            entry.canvasId === other.canvasId &&
            entry.kind === other.kind &&
            entry.left === other.left &&
            entry.top === other.top &&
            entry.width === other.width &&
            entry.height === other.height &&
            entry.labelLeft === other.labelLeft &&
            entry.labelTop === other.labelTop &&
            entry.labelWidth === other.labelWidth &&
            entry.labelHeight === other.labelHeight &&
            entry.labelled === other.labelled
        );
    });
}
