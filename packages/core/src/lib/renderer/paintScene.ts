/**
 * The painter: consumes a **scene plan** and a 2D context, and does nothing
 * else.
 *
 * It sets the transform and issues draw calls. It makes no decisions — every
 * decision it could make (what is resident, at which tier, in which order) was
 * already made by `planScene`. That is the whole point of the split: the
 * planner is unit-tested exhaustively without a DOM, and the painter's
 * correctness is the geometric e2e assertions' job (spec §Testing Decisions,
 * "Deliberately not unit-tested in isolation").
 *
 * ## The canvas never paints a background
 *
 * Nothing here clears to a colour. The viewer background is a CSS
 * `background-color` on a parent element, driven by theme tokens — which is why
 * the context is created with an alpha channel (see `CanvasHost.svelte`). It
 * keeps theming entirely in CSS and honours the existing `transparentBackground`
 * config for free.
 */

import type { LayoutRect, ScenePlan, Viewport } from './types';

/**
 * What the host has decoded and can hand the painter, keyed by canvas id.
 *
 * A plain record rather than a `Map`: nothing here mutates it, and a record
 * keeps the painter free of any reactivity question about the container it is
 * handed.
 */
export type PaintSources = Readonly<Record<string, CanvasImageSource>>;

/**
 * Apply the viewport transform, so subsequent draw calls are in **canvas
 * space**.
 *
 * `dpr` is the backing-store ratio: the context is sized in device pixels while
 * the viewport is measured in CSS pixels, and folding the ratio into the
 * transform is what keeps every other coordinate in this file CSS-pixel-based.
 *
 * Exported because the **paint hook** (ticket 14) must receive exactly the
 * transform the tiles were drawn with — a plugin overlay can then never desync
 * from the image.
 */
export function applyViewportTransform(
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    dpr: number,
): void {
    const scale = viewport.scale * dpr;

    ctx.setTransform(
        scale,
        0,
        0,
        scale,
        (viewport.width / 2) * dpr - viewport.centre.x * scale,
        (viewport.height / 2) * dpr - viewport.centre.y * scale,
    );
}

function drawCanvasImage(
    ctx: CanvasRenderingContext2D,
    rect: LayoutRect,
    image: CanvasImageSource,
): void {
    // The image is fitted into its manifest-declared box: the source's own
    // pixel dimensions govern only sampling, never geometry, so layout cannot
    // shift when a differently-sized image arrives.
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
}

/**
 * Paint one frame.
 *
 * `ctx` is expected to be sized in device pixels (`width`/`height` on the
 * canvas element already multiplied by `dpr`).
 */
export function paintScene(
    ctx: CanvasRenderingContext2D,
    plan: ScenePlan,
    viewport: Viewport,
    sources: PaintSources,
    dpr: number,
): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Clear to transparent, never to a colour — the parent element's CSS
    // background shows through, which is what makes `transparentBackground` and
    // theme switching work with no JS involvement.
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    applyViewportTransform(ctx, viewport, dpr);

    for (const rect of plan.layout) {
        // A box-tier canvas is its layout rect only: no network, no texture.
        if (plan.tiers[rect.canvasId] === 'box') continue;

        const image = sources[rect.canvasId];
        if (!image) continue;

        drawCanvasImage(ctx, rect, image);
    }
}
