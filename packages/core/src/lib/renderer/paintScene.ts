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
 * With one carve-out, in `paintScene.test.ts`: device-pixel snapping is a
 * sub-pixel relationship between adjacent draw calls, and blur-up paints the
 * coarse level underneath, so a seam is a one-pixel line of the coarse tile's
 * colour rather than a hole. Nothing that reads the finished canvas back can
 * tell that from the picture — which makes it the one property here that a
 * geometric assertion cannot reach.
 *
 * ## The canvas never paints a background
 *
 * Nothing here clears to a colour. The viewer background is a CSS
 * `background-color` on a parent element, driven by theme tokens — which is why
 * the context is created with an alpha channel (see `CanvasHost.svelte`). It
 * keeps theming entirely in CSS and honours the existing `transparentBackground`
 * config for free.
 */

import type { LayoutRect, ScenePlan, TileKey, Viewport } from './types';

/** What the host has decoded and can hand the painter. */
export interface PaintSources {
    /**
     * canvasId → the whole-canvas image of a static source.
     *
     * A plain record rather than a `Map`: nothing here mutates it, and a record
     * keeps the painter free of any reactivity question about the container it
     * is handed.
     */
    images: Readonly<Record<string, CanvasImageSource>>;
    /**
     * Tile key → decoded tile. A lookup rather than a record because the
     * scheduler owns the tiles and hands out no copy of its map.
     */
    tiles: (key: TileKey) => CanvasImageSource | undefined;
}

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
 * Draw one tile in **device pixels** — snapped to whole ones at rest, and
 * overlapped by one at any scale or position the view is still moving through.
 *
 * ## At rest: snap
 *
 * Snapping removes hairline seams between adjacent tiles at fractional scale.
 * Two tiles sharing an edge compute the same coordinate for it, so rounding
 * sends both to the same device pixel: no gap, no double-drawn column. Left to
 * fractional coordinates, Gecko and WebKit blend each edge against transparent
 * black and a one-pixel line appears down every tile boundary. It is also what
 * keeps a tile that happens to land at 1:1 a pixel-perfect blit rather than a
 * resampled one.
 *
 * ## Moving: don't
 *
 * The cost of snapping is at most half a device pixel of placement error — which
 * is inside the geometric assertions' one-CSS-pixel gate, but is *not* inside
 * one frame's worth of motion at the tail of an animation. The last ~0.6 s of a
 * zoom or a flick moves the image by under a device pixel per frame, so each
 * edge crosses its own rounding boundary on its own frame: neighbouring tiles
 * shift by a whole pixel at different moments and the picture ripples. Measured
 * on a real 2x zoom, the rounding error exceeded the frame's actual motion in
 * roughly half of those frames — the visible motion was mostly quantization.
 *
 * So while anything is moving, every edge is left exactly where the transform
 * puts it and sub-pixel motion stays sub-pixel.
 *
 * **The destination rectangle keeps the transform's exact size**, and that is
 * load-bearing rather than incidental. Growing it to close the seam — by even
 * one device pixel — rescales the tile's content by `(w + 1) / w`, which shears
 * every pixel inside the tile progressively toward its right edge and snaps back
 * at the neighbour: a one-pixel tear down every boundary, which is far more
 * visible than the seam it was meant to fix. The source bitmap is exactly one
 * tile, so there is no way to cover more destination without stretching it.
 *
 * What closes the seam instead is **blur-up, which is already there**:
 * `planScene.planPyramid` requires and draws every level from `0` up to the
 * current one, and `planScene` sorts the draws coarsest-first, so a finer tile
 * always has a coarser one painted underneath it. An unsnapped edge that leaves
 * a translucent hairline on Gecko and WebKit therefore blends against the coarse
 * level rather than against the background — the one-pixel line of the coarse
 * tile's colour this module's header describes, on a picture that is in motion.
 */
function drawTile(
    ctx: CanvasRenderingContext2D,
    box: { x: number; y: number; width: number; height: number },
    viewport: Viewport,
    dpr: number,
    image: CanvasImageSource,
    snap: boolean,
): void {
    const scale = viewport.scale * dpr;
    const originX = (viewport.width / 2) * dpr - viewport.centre.x * scale;
    const originY = (viewport.height / 2) * dpr - viewport.centre.y * scale;

    const left = box.x * scale + originX;
    const top = box.y * scale + originY;
    const right = (box.x + box.width) * scale + originX;
    const bottom = (box.y + box.height) * scale + originY;

    if (snap) {
        const l = Math.round(left);
        const t = Math.round(top);
        const r = Math.round(right);
        const b = Math.round(bottom);
        if (r <= l || b <= t) return;
        ctx.drawImage(image, l, t, r - l, b - t);
        return;
    }

    if (right <= left || bottom <= top) return;

    ctx.drawImage(image, left, top, right - left, bottom - top);
}

/**
 * Paint one frame.
 *
 * `ctx` is expected to be sized in device pixels (`width`/`height` on the
 * canvas element already multiplied by `dpr`).
 *
 * `viewStable` is the host's own **view-stable gate** — the same one the planner
 * is given — and it selects which of {@link drawTile}'s two edge rules applies.
 * Defaulted to `true` so a caller that has no motion to report gets the resting
 * behaviour rather than the moving one.
 */
export function paintScene(
    ctx: CanvasRenderingContext2D,
    plan: ScenePlan,
    viewport: Viewport,
    sources: PaintSources,
    dpr: number,
    viewStable = true,
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

        const image = sources.images[rect.canvasId];
        if (!image) continue;

        drawCanvasImage(ctx, rect, image);
    }

    if (plan.tileDraws.length > 0) {
        // Tiles are drawn in device space so their edges can be snapped; the
        // plan already has them ordered coarsest first, so blur-up is simply
        // paint order.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const draw of plan.tileDraws) {
            const tile = sources.tiles(draw.key);
            if (!tile) continue;
            drawTile(ctx, draw, viewport, dpr, tile, viewStable);
        }
    }

    // Left in the viewport transform whatever was painted: the **paint hook**
    // (ticket 14) must receive exactly the transform the tiles were drawn with.
    applyViewportTransform(ctx, viewport, dpr);
}
