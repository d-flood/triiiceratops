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
 * looks like. `errorPlacements` answers "where, in surface-local CSS pixels" —
 * over the shared geometry in `canvasPlacements.ts`, which the unsupported
 * presentation uses too — and `viewerLevelErrorKind` answers "is there nothing
 * left to look at". `CanvasHost` owns the markup, because anything a user must
 * perceive lives in the DOM layer rather than in painted pixels, and painted
 * text has no accessible name.
 *
 * The auth/load distinction is carried through both, unreduced: a reader needs
 * to know whether logging in would help (user story 27).
 */

import { canvasPlacements, type CanvasPlacement } from './canvasPlacements';
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

/** One error placeholder — a {@link CanvasPlacement} whose kind is the failure. */
export type CanvasErrorPlacement = CanvasPlacement<CanvasErrorKind>;

/**
 * Where the failed canvases are on screen, this frame — the shared placement
 * geometry, keyed on the error record.
 */
export function errorPlacements(
    layout: readonly LayoutRect[],
    errors: CanvasErrors,
    viewport: Viewport,
): CanvasErrorPlacement[] {
    return canvasPlacements(layout, (canvasId) => errors[canvasId], viewport);
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

    // ONE pass for both questions. A separate `layout.some(...)` membership
    // test after this loop would be an extra walk over every rect in the
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
 * so the existing error chrome and its journey need no new chrome.
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
