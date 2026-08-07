/**
 * The renderer's vocabulary as types (CONTEXT.md §Renderer domain).
 *
 * Everything here is plain data. Nothing in this module — or anywhere else in
 * the renderer's module graph — touches `window`, `document`, or `navigator` at
 * module scope, which is what keeps the viewer server-renderable and the
 * planner runnable in plain Node.
 */

import type { ViewingDirection, ViewingMode } from '../components/osdLayout';

export type { ViewingDirection, ViewingMode };

/**
 * Where a canvas's pixels come from.
 *
 * The three source kinds of the spec arrive over several tickets; this ticket
 * implements `static` only. `service` is carried in the type from the first
 * version so canvases backed by an image service are described rather than
 * discarded, but nothing acts on it yet: the planner emits no metadata request
 * for one and the host paints nothing for it. Ticket 05 makes a `service`
 * canvas fetch its `info.json` and tile; ticket 06 adds the size ladder.
 */
export type SourceDescriptor =
    | { kind: 'static'; url: string }
    | { kind: 'service'; serviceId: string; profile: string | null };

/**
 * One canvas as the planner sees it: an identity, its geometry in **canvas
 * space** (manifest Canvas `width`/`height`), and where its pixels come from.
 *
 * Geometry is manifest geometry, never image-service geometry: layout must not
 * depend on any fetch (spec §Coordinate model and layout).
 */
export interface PlannerCanvas {
    id: string;
    width: number;
    height: number;
    source: SourceDescriptor;
}

/** A point in canvas space. */
export interface Point {
    x: number;
    y: number;
}

/**
 * The viewport, in canvas space plus screen size.
 *
 * `scale` is screen pixels per canvas-space unit — the single number that
 * relates the two spaces. `centre` is the canvas-space point at the middle of
 * the viewport.
 */
export interface Viewport {
    /** Viewport width in CSS pixels. */
    width: number;
    /** Viewport height in CSS pixels. */
    height: number;
    centre: Point;
    scale: number;
}

/** Image-service facts already fetched for a canvas. */
export interface ImageServiceFacts {
    width: number;
    height: number;
    /** Advertised whole-image sizes, if the service declares any. */
    sizes?: Array<{ width: number; height: number }>;
    tileSize?: number | null;
    scaleFactors?: number[];
}

/**
 * Planner inputs that are policy rather than fact.
 *
 * Every value here is provisional (spec §Further Notes) and supplied by the
 * caller precisely so tests never assert against shipped defaults.
 */
export interface PlannerBudgets {
    /** Decoded-pixel byte ceiling for the opportunistic cache. */
    byteBudget: number;
    /** Residency margin as a factor the viewport rect is inflated by. */
    marginFactor: number;
    /** `effectiveSize` at or above which a canvas is in the pyramid tier. */
    pyramidThreshold: number;
    /** `effectiveSize` below which a canvas is in the box tier. */
    boxThreshold: number;
}

/** Which of the three treatments a canvas receives this frame. */
export type ResidencyTier = 'pyramid' | 'thumbnail' | 'box';

/** Where layout placed one canvas, in canvas space. */
export interface LayoutRect {
    canvasId: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A tile the painter wants but does not have. Populated from ticket 05. */
export interface TileRequest {
    canvasId: string;
    level: number;
    url: string;
    /** Distance from the viewport centre; the queue is ordered by this. */
    priority: number;
}

/** A whole-image request sized to a canvas's projection, quantized to a rung. */
export interface ThumbnailRequest {
    canvasId: string;
    url: string;
    rung: number;
}

export interface PlanSceneInput {
    canvases: PlannerCanvas[];
    mode: ViewingMode;
    direction: ViewingDirection;
    preserveCanvasScale: boolean;
    viewport: Viewport;
    /** canvasId → image-service facts already fetched. */
    knownMetadata: Record<string, ImageServiceFacts>;
    budgets: PlannerBudgets;
}

/**
 * The planner's pure output for one frame. A value produced and discarded each
 * frame — not state anything holds.
 */
export interface ScenePlan {
    layout: LayoutRect[];
    /** canvasId → tier. */
    tiers: Record<string, ResidencyTier>;
    /** Ordered by priority, nearest the viewport centre first. */
    tileRequests: TileRequest[];
    thumbnailRequests: ThumbnailRequest[];
    /** Canvas ids needing an `info.json` fetch now. Populated from ticket 05. */
    metadataRequests: string[];
    /** Canvas ids droppable under budget pressure. */
    evictable: string[];
    /** The derived zoom floor, in the same units as `Viewport.scale`. */
    minZoom: number;
}
