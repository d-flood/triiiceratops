/**
 * Shared point-marker styling for the annotation editor. A point looks the same
 * whether it is rendered read-only (the viewer's shape overlay), selected, or edited, so
 * the radius lives in one place consumed by both the viewer overlay and the
 * editor's drawing layer (spec §3.4). The colour fields are not: no renderer
 * reads them, and the marker's colour is fixed on both sides instead.
 */
export interface PointStyle {
    /** Marker radius in screen (CSS) pixels. */
    radius?: number;
    /** Marker fill colour. Inert: no renderer reads it. */
    fill?: string;
    /** Marker stroke colour. Inert: no renderer reads it. */
    stroke?: string;
    /** Marker stroke width in pixels. Inert: no renderer reads it. */
    strokeWidth?: number;
}

/**
 * Default marker radius in screen pixels. Chosen so the diameter (2 × radius)
 * equals the historical `POINT_MARKER_SIZE = 10` the read-only overlay used, so
 * existing viewers render unchanged when no `pointStyle` is configured.
 */
export const DEFAULT_POINT_RADIUS = 5;

/**
 * Resolve the effective marker radius (screen pixels) from a `pointStyle`
 * config, falling back to {@link DEFAULT_POINT_RADIUS} when unset or invalid.
 */
export function resolvePointRadius(pointStyle?: PointStyle | null): number {
    const radius = pointStyle?.radius;
    return typeof radius === 'number' && Number.isFinite(radius) && radius > 0
        ? radius
        : DEFAULT_POINT_RADIUS;
}
