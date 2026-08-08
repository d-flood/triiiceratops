/**
 * Per-canvas tile-source errors: where they are on screen, and when they add up
 * to a viewer-level condition.
 *
 * ## Why an error is a property of a canvas
 *
 * The previous renderer fetched every `info.json` before anything rendered, so
 * one `401` anywhere poisoned the viewer before the reader saw a page. That was
 * defensible only because it was **up front**. With lazy per-canvas metadata a
 * failure arrives for folio 400 while folios 1–399 are displaying fine, and a
 * viewer-wide error state would blank a working viewer mid-scroll — strictly
 * worse than failing fast. So per-canvas state is the source of truth, a failed
 * canvas is an error placeholder in its own layout rect, and the viewer-level
 * condition is *derived* (spec §Errors, user stories 26 and 27).
 *
 * ## Both halves are pure
 *
 * Neither function here touches the DOM, and neither knows what a placeholder
 * looks like. `errorPlacements` answers "where, in surface-local CSS pixels" and
 * `viewerLevelErrorKind` answers "is there nothing left to look at" — the two
 * questions that carry the reasoning. `CanvasHost` owns the markup, because per
 * ticket 14's rule anything a user must perceive lives in the DOM layer rather
 * than in painted pixels, and painted text has no accessible name.
 *
 * The auth/load distinction is carried through both, unreduced: a reader needs
 * to know whether logging in would help (user story 27).
 */

import type { LayoutRect, Viewport } from './types';

/**
 * Why a canvas has no pixels.
 *
 * The same two values `imageService.ImageServiceFailure` records, deliberately:
 * a static `<img>` that fails reports no status and can only be a `load`, and
 * an image service's `401`/`403` is the one failure a reader can act on. Widening
 * this set would mean inventing a distinction no source can actually report.
 */
export type CanvasErrorKind = 'auth' | 'load';

/**
 * canvasId → why that canvas failed, for the canvases that did.
 *
 * A plain record rather than a `Map`: it is read by the frame loop, and a record
 * keeps this module free of any question about which flavour of reactivity the
 * host wraps it in.
 */
export type CanvasErrors = Readonly<Record<string, CanvasErrorKind>>;

/**
 * One error placeholder, positioned in **surface-local CSS pixels**.
 *
 * TWO boxes, and the second one is what makes the placeholder perceptible rather
 * than merely present. `left`/`top`/`width`/`height` are the canvas's own layout
 * rect, which is what makes the placeholder read as "this page" — but a reader
 * may be zoomed a long way into a failed canvas (the zoom ceiling is 128x home),
 * and then the rect is far larger than the viewport: its border is off screen on
 * every side and a centred label is centred on a point nobody can see. A sighted
 * reader is left with a flat fill and no message, while the accessible name goes
 * on being correct — a failure only a sighted reader has.
 *
 * `labelLeft`/`labelTop`/`labelWidth`/`labelHeight` are therefore the rect's
 * **intersection with the viewport**: the part of this canvas that is actually on
 * screen, and so the box the message has to be centred in.
 */
export interface CanvasErrorPlacement {
    canvasId: string;
    kind: CanvasErrorKind;
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
     * A placeholder is as small as its canvas's projection, which for a
     * thumbnail-tier folio is a sliver: clipping the text there renders a
     * fragment of one glyph, which reads as a rendering bug rather than as an
     * error. Below {@link MIN_LABEL_WIDTH} x {@link MIN_LABEL_HEIGHT} the
     * placeholder is the fill and the border alone — still named for assistive
     * technology, and still visibly not a page.
     */
    labelled: boolean;
}

/**
 * The smallest label box worth putting words in, in CSS pixels.
 *
 * Roughly the width of the shorter message at the label's font size and the
 * height of two of its lines. Not a token: it is a fact about how much room a
 * sentence needs, which no theme changes.
 */
export const MIN_LABEL_WIDTH = 96;
export const MIN_LABEL_HEIGHT = 32;

/**
 * Where the failed canvases are on screen, this frame.
 *
 * **Culled to the viewport**, and that is the load-bearing part rather than an
 * optimisation: a manifest whose whole image service is behind a login fails on
 * every one of its 800 folios, and one DOM node per failure would put 800
 * absolutely-positioned elements — each with an accessible name — into the
 * accessibility tree of a viewer showing two. The placeholder exists so the
 * reader can perceive the failure of a canvas they are looking at.
 *
 * Returns the placements in layout order, so the DOM order of the placeholders
 * follows reading order rather than the iteration order of an error record. Each
 * carries TWO boxes — the canvas's rect and the on-screen part of it, which is
 * where the message goes; see {@link CanvasErrorPlacement}.
 */
export function errorPlacements(
    layout: readonly LayoutRect[],
    errors: CanvasErrors,
    viewport: Viewport,
): CanvasErrorPlacement[] {
    // Before the first `measure()` there is no surface to place anything on, and
    // a non-positive scale has no screen mapping at all.
    if (viewport.width <= 0 || viewport.height <= 0 || viewport.scale <= 0) {
        return [];
    }

    const placements: CanvasErrorPlacement[] = [];

    for (const rect of layout) {
        const kind = errors[rect.canvasId];
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

        // The on-screen part of this canvas — see `CanvasErrorPlacement`. The
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
 * reactive graph. A pan moves every placeholder, so most frames of a gesture DO
 * differ and this returns false — the frames it earns anything on are the still
 * ones, which is the overwhelming majority of a session.
 *
 * Ordered comparison, not set comparison: `errorPlacements` returns layout order,
 * so two lists with the same members in a different order really are a different
 * DOM order and the reader's tab and reading order would change.
 */
export function samePlacements(
    a: readonly CanvasErrorPlacement[],
    b: readonly CanvasErrorPlacement[],
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

/**
 * The viewer-level error condition, derived — or `null` while there is anything
 * left to look at.
 *
 * The existing chrome for `ViewerState.tileSourceError` is a **full cover** over
 * the renderer (`TriiiceratopsViewer`'s `overlay-cover`), which is why this is
 * not simply "the current canvas failed". In the single-canvas case — the common
 * one, and the one the existing error journey asserts — covering the surface
 * loses nothing, because the surface has nothing on it. In continuous mode it
 * would unmount a renderer that is displaying 799 working folios, which is the
 * exact regression the per-canvas model exists to prevent.
 *
 * So the condition is: **the canvas being viewed failed, and so did every other
 * canvas laid out.** Anything less is a placeholder's job. The kind returned is
 * the current canvas's own, because that is the canvas the reader asked for and
 * whose remedy (log in, or nothing) the message describes.
 *
 * In continuous mode that is effectively unreachable, and deliberately so. The
 * layout is the **whole manifest** while metadata is fetched lazily, so a canvas
 * nobody has scrolled to has no entry in `errors` and counts here as working —
 * the honest reading of the condition is therefore "every canvas we have asked
 * about has failed **and** there is nothing else laid out", which on an 800-folio
 * manifest there always is. What raises this in practice is the single-canvas
 * case, which is exactly the case the full cover is right for.
 *
 * An empty layout answers `null`: nothing is laid out yet, so nothing has been
 * established to have failed.
 */
export function viewerLevelErrorKind(
    layout: readonly LayoutRect[],
    errors: CanvasErrors,
    currentCanvasId: string | null | undefined,
): CanvasErrorKind | null {
    if (!currentCanvasId || layout.length === 0) return null;

    const current = errors[currentCanvasId];
    if (!current) return null;

    // ONE pass for both questions. The membership test used to be a second
    // `layout.some(...)` after this loop — an extra walk over every rect in the
    // manifest, every frame, on a code path the frame loop takes whenever
    // anything has failed at all.
    let currentIsLaidOut = false;
    for (const rect of layout) {
        if (!errors[rect.canvasId]) return null;
        if (rect.canvasId === currentCanvasId) currentIsLaidOut = true;
    }

    // The current canvas must actually be one of the laid-out ones; a stale id
    // that is not on screen is not what the reader is looking at.
    if (!currentIsLaidOut) return null;

    return current;
}

/**
 * What a {@link CanvasErrorKind} looks like as the viewer-level
 * `ViewerState.tileSourceError` — the shape the previous renderer wrote, kept
 * so the existing error chrome and its journey need no new chrome (ticket 12's
 * scope).
 */
export type TileSourceErrorValue =
    | { type: 'auth' }
    | { type: 'load'; message: string };

/**
 * A one-value mirror onto `tileSourceError` that writes only on change.
 *
 * The throttle is the whole of it, and it is not a micro-optimisation:
 * `tileSourceError` is an **observable** state member, so every assignment
 * notifies every plugin subscriber. Mirroring the derived condition
 * unconditionally would allocate a fresh error object and fan a notification out
 * to every plugin **once per frame** for a value that did not change — and it
 * fails silently, so nothing but a test of this seam would ever notice.
 *
 * Takes the write as a parameter rather than reaching for the state object: the
 * member has no mutator by definition (it is `observable`, so core writes it and
 * nothing else may), and the host's escape-hatch assignment is not something to
 * duplicate here.
 */
export function createTileSourceErrorMirror(options: {
    /** The localized message for a `load` failure, read at write time. */
    loadMessage: () => string;
    write: (value: TileSourceErrorValue | null) => void;
}): (kind: CanvasErrorKind | null) => void {
    let written: CanvasErrorKind | null = null;

    return (kind) => {
        if (kind === written) return;
        written = kind;

        options.write(
            kind === null
                ? null
                : kind === 'auth'
                  ? { type: 'auth' }
                  : { type: 'load', message: options.loadMessage() },
        );
    };
}
