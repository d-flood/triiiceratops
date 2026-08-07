/**
 * Shared point-marker styling for the annotation editor. A point looks the same
 * whether it is rendered read-only (OSDViewer overlay), selected, or edited, so
 * the radius/fill/stroke live in one place consumed by both the viewer overlay
 * and the editor's Annotorious styling (spec §3.4).
 */
export interface PointStyle {
    /** Marker radius in screen (CSS) pixels. */
    radius?: number;
    /** Marker fill colour (any CSS colour the consumer renders). */
    fill?: string;
    /** Marker stroke colour. */
    stroke?: string;
    /** Marker stroke width in pixels. */
    strokeWidth?: number;
}
/**
 * Default marker radius in screen pixels. Chosen so the diameter (2 × radius)
 * equals the historical `POINT_MARKER_SIZE = 10` the read-only overlay used, so
 * existing viewers render unchanged when no `pointStyle` is configured.
 */
export declare const DEFAULT_POINT_RADIUS = 5;
/**
 * Resolve the effective marker radius (screen pixels) from a `pointStyle`
 * config, falling back to {@link DEFAULT_POINT_RADIUS} when unset or invalid.
 */
export declare function resolvePointRadius(pointStyle?: PointStyle | null): number;
