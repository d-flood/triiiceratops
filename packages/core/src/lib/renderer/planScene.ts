/**
 * The scene planner: the renderer's primary test seam (spec §Architecture:
 * planner and painter).
 *
 * A pure function. Given manifest-derived canvas descriptors, viewing mode and
 * direction, the current viewport, whatever image metadata has already been
 * fetched, and the budgets, it returns a **scene plan**. It touches no DOM,
 * performs no I/O, and is deterministic — so it can be imported and called in
 * plain Node with no DOM globals, which is where the large majority of the
 * renderer's decisions are tested.
 *
 * The **painter** (`paintScene.ts`) consumes the plan and a 2D context and does
 * nothing else. If planning and painting interleaved, this seam would not
 * exist and every later ticket would lose its unit tests.
 *
 * ## What this ticket implements
 *
 * One canvas, one static-image source, a trivially-populated plan. The *shape*
 * is what matters; capability arrives ticket by ticket:
 *
 * - tiles, pyramids, level residency — ticket 05;
 * - the size-ladder source kind — ticket 06;
 * - multi-canvas layout (paged, continuous, viewing direction,
 *   `preserveCanvasScale`, the inter-canvas gap) — ticket 07, which replaces
 *   `layoutCanvases` below with the shared layout function;
 * - the residency margin and distance-based eviction — ticket 08;
 * - thumbnail resolution and its quantized ladder — ticket 09.
 *
 * `mode`, `direction`, `preserveCanvasScale`, `knownMetadata`, and
 * `budgets.marginFactor`/`budgets.byteBudget` are therefore accepted and not
 * yet read. They are in the signature from the first version deliberately: the
 * contract is fixed, so later tickets add behaviour rather than re-cut the seam.
 */

import type {
    LayoutRect,
    PlannerCanvas,
    PlanSceneInput,
    ResidencyTier,
    ScenePlan,
} from './types';

/** True for a dimension that can be laid out. Guards against 0/NaN/negatives. */
function isUsableDimension(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isLayoutable(canvas: PlannerCanvas): boolean {
    return (
        isUsableDimension(canvas.width) &&
        isUsableDimension(canvas.height) &&
        typeof canvas.id === 'string' &&
        canvas.id.length > 0
    );
}

/**
 * The orientation-invariant measure of how big a canvas is on screen.
 *
 * The geometric mean of the projected width and height, deliberately *not* the
 * projected height alone: height would decide differently for a portrait page
 * in a left-to-right world and a landscape page in a top-to-bottom world at
 * identical visual size (spec §Virtualization: canvas tiers).
 */
export function effectiveSize(
    width: number,
    height: number,
    scale: number,
): number {
    return Math.sqrt(width * scale * height * scale);
}

/**
 * Single-canvas layout, in canvas space.
 *
 * Ticket 07 replaces this with the shared layout function that already handles
 * paged and continuous worlds, viewing direction, the median-height
 * normalization, and the inter-canvas gap. Until then the only supported world
 * is one canvas at the origin — which is exactly the geometry the manifest
 * declares, so nothing here can shift when metadata arrives later.
 */
function layoutCanvases(canvases: PlannerCanvas[]): LayoutRect[] {
    return canvases.map((canvas) => ({
        canvasId: canvas.id,
        x: 0,
        y: 0,
        width: canvas.width,
        height: canvas.height,
    }));
}

function assignTier(
    canvas: PlannerCanvas,
    scale: number,
    pyramidThreshold: number,
    boxThreshold: number,
): ResidencyTier {
    const size = effectiveSize(canvas.width, canvas.height, scale);
    if (size >= pyramidThreshold) return 'pyramid';
    if (size >= boxThreshold) return 'thumbnail';
    return 'box';
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

/**
 * The zoom floor, **derived** rather than fixed: the scale at which the median
 * canvas reaches the box threshold. Below it there is no information on screen.
 * This scales with the manifest instead of being a tuned percentage of home
 * zoom, which is what lets an 800-folio manifest and a one-page manifest both
 * stop somewhere meaningful.
 */
function deriveMinZoom(
    canvases: PlannerCanvas[],
    boxThreshold: number,
): number {
    if (canvases.length === 0) return 0;

    const sizes = canvases.map((canvas) =>
        Math.sqrt(canvas.width * canvas.height),
    );

    return boxThreshold / median(sizes);
}

export function planScene(input: PlanSceneInput): ScenePlan {
    const { canvases, viewport, budgets } = input;

    const layoutable = canvases.filter(isLayoutable);

    const tiers: Record<string, ResidencyTier> = {};
    const evictable: string[] = [];

    for (const canvas of layoutable) {
        const tier = assignTier(
            canvas,
            viewport.scale,
            budgets.pyramidThreshold,
            budgets.boxThreshold,
        );
        tiers[canvas.id] = tier;

        // A box-tier canvas holds no network resource and no texture, so
        // whatever it held is droppable. Residency is a pure function of the
        // viewport: the same viewport always yields the same set, regardless of
        // how the user arrived (spec — eviction is distance-based, not LRU).
        if (tier === 'box') {
            evictable.push(canvas.id);
        }
    }

    return {
        layout: layoutCanvases(layoutable),
        tiers,
        // A static-image source has exactly one known URL and no service, so it
        // has nothing to discover and nothing to tile. Tiled and size-ladder
        // sources fill these in tickets 05, 06, and 09.
        tileRequests: [],
        thumbnailRequests: [],
        metadataRequests: [],
        evictable,
        minZoom: deriveMinZoom(layoutable, budgets.boxThreshold),
    };
}
