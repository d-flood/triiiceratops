/**
 * The viewport's public vocabulary (SPEC.md §Public API).
 *
 * Every coordinate on this boundary is **canvas space** — the IIIF Canvas's own
 * `width`/`height`, which is already the persistence format for annotation
 * geometry — or **screen space**, the viewer surface's own CSS pixels with the
 * origin at its top-left corner. Image space (the pixel dimensions of the
 * underlying image, the space the tile pyramid is addressed in) is
 * core-internal and never appears here: no plugin has to know an image's pixel
 * dimensions to place a point on a canvas.
 *
 * These types are plain data. Nothing here is a renderer object, and nothing
 * here hands out a live DOM node — which is the whole point of replacing the
 * pass-through.
 */

/** A point, in whichever space the reading method names. */
export interface ViewportPoint {
    x: number;
    y: number;
}

/** An axis-aligned box, in whichever space the reading method names. */
export interface ViewportBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** The viewer surface's size in CSS pixels. */
export interface ContainerSize {
    width: number;
    height: number;
}

/**
 * Edges of the viewer surface reserved by plugin UI, in screen pixels.
 *
 * A **fit target**, not a box model: a fit frames its box into what is left of
 * the surface, so a plugin's floating panel no longer covers the thing the
 * reader was sent to look at. Nothing else changes — the surface is still the
 * full rectangle, and every coordinate on this boundary still means what it did.
 *
 * {@link ZERO_VIEWPORT_INSET} is the identity, and one inset is held per viewer:
 * a second setter wins.
 */
export interface ViewportInset {
    /** Screen pixels reserved at the top of the surface. */
    top: number;
    /** Screen pixels reserved at the right of the surface. */
    right: number;
    /** Screen pixels reserved at the bottom of the surface. */
    bottom: number;
    /** Screen pixels reserved at the left of the surface. */
    left: number;
}

/** The identity inset — a fit frames into the whole surface. */
export const ZERO_VIEWPORT_INSET: ViewportInset = Object.freeze({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
});

/**
 * Image adjustments applied to the rendered image, as a whole set.
 *
 * The percentage members are percentages with `100` as neutral, matching the
 * CSS filter functions they are named after, so `brightness: 120` is 20%
 * brighter. {@link NEUTRAL_IMAGE_ADJUSTMENTS} is the identity.
 *
 * A **command**, not a DOM reach: the adjustment set lives in viewer state, so
 * it is readable, testable without a renderer, survives a renderer change, and
 * is re-applied to a renderer that mounts after it was set.
 */
export interface ImageAdjustments {
    /** Brightness, 100 = unchanged. */
    brightness: number;
    /** Contrast, 100 = unchanged. */
    contrast: number;
    /** Colour saturation, 100 = unchanged. */
    saturation: number;
    /** Invert the image's colours. */
    invert: boolean;
    /** Render the image without colour. */
    grayscale: boolean;
}

/** The identity adjustment set — the image exactly as it was decoded. */
export const NEUTRAL_IMAGE_ADJUSTMENTS: ImageAdjustments = Object.freeze({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    invert: false,
    grayscale: false,
});

/**
 * Whether an adjustment set is the identity — nothing to apply.
 *
 * Exported because both renderers and the export paths ask the same question,
 * and "is 100 the neutral value for this member" is exactly the kind of detail
 * that drifts when three callers each answer it.
 */
export function isNeutralImageAdjustments(
    adjustments: ImageAdjustments,
): boolean {
    return (
        adjustments.brightness === NEUTRAL_IMAGE_ADJUSTMENTS.brightness &&
        adjustments.contrast === NEUTRAL_IMAGE_ADJUSTMENTS.contrast &&
        adjustments.saturation === NEUTRAL_IMAGE_ADJUSTMENTS.saturation &&
        adjustments.invert === NEUTRAL_IMAGE_ADJUSTMENTS.invert &&
        adjustments.grayscale === NEUTRAL_IMAGE_ADJUSTMENTS.grayscale
    );
}

/**
 * The adjustment set as a CSS `filter` value, or `'none'` when it is neutral.
 *
 * Both renderers paint into a canvas element and apply the set the same way;
 * keeping the string in one place is what stops the two from drifting apart
 * while they coexist behind the development-only flag.
 */
export function imageAdjustmentsToCssFilter(
    adjustments: ImageAdjustments,
): string {
    const parts: string[] = [];
    if (adjustments.brightness !== NEUTRAL_IMAGE_ADJUSTMENTS.brightness) {
        parts.push(`brightness(${adjustments.brightness / 100})`);
    }
    if (adjustments.contrast !== NEUTRAL_IMAGE_ADJUSTMENTS.contrast) {
        parts.push(`contrast(${adjustments.contrast / 100})`);
    }
    if (adjustments.saturation !== NEUTRAL_IMAGE_ADJUSTMENTS.saturation) {
        parts.push(`saturate(${adjustments.saturation / 100})`);
    }
    if (adjustments.invert) parts.push('invert(1)');
    if (adjustments.grayscale) parts.push('grayscale(1)');
    return parts.length > 0 ? parts.join(' ') : 'none';
}
