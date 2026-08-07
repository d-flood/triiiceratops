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
export function resolvePointRadius(pointStyle) {
    const radius = pointStyle?.radius;
    return typeof radius === 'number' && Number.isFinite(radius) && radius > 0
        ? radius
        : DEFAULT_POINT_RADIUS;
}
