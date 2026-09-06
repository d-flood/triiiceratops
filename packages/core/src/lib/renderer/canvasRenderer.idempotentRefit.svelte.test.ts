/**
 * **The world-refit is idempotent.**
 *
 * `refitForCurrentWorld` is the component's refit effect body, and a refit
 * overwrites the reader's centre and scale. The component effect's tracked reads
 * are its change signals, but nothing stops a future dependency — or a host
 * pattern nobody predicted — from running that effect when none of them moved.
 * When that happens the reader must keep their place: an unchanged world, an
 * unchanged refit signal and unchanged painted geometry are no reason to move
 * the image.
 *
 * Driven against the renderer directly rather than through a mounted viewer,
 * because the whole property is about the renderer's own memory of what it last
 * fitted, and because no viewer-state change reaches that effect without also
 * changing one of the three things the guard compares. Calling the entry point
 * twice is the only honest way to ask the question.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';

import { createCanvasRenderer } from './canvasRenderer.svelte';
import { m } from '../paraglide/messages.js';
import { ViewerState } from '../state/viewer.svelte';
import { installViewerSurface } from '../test/utils/mockViewerSurface';

const MANIFEST = JSON.parse(
    readFileSync(
        join(
            import.meta.dirname,
            '../test/fixtures/manifests/cookbook/0009-book-1.json',
        ),
        'utf8',
    ),
);
const MANIFEST_ID: string = MANIFEST.id;
const FIRST_CANVAS: string = MANIFEST.items[0].id;
const SECOND_CANVAS: string = MANIFEST.items[1].id;

async function settle(ms = 200) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

/** The number of consecutive identical reads that count as settled. */
const STABLE_READS = 3;

/**
 * Poll the reader's view until it stops moving, and answer with it.
 *
 * Every view this file compares is the end of an eased animation, so a fixed
 * wait either reads mid-easing or pads every case with the slowest plausible
 * one. Repeats are required rather than a single match because an easing curve
 * has plateaux, most obviously at the start.
 */
async function settledView(viewerState: ViewerState) {
    let previous = '';
    let unchanged = 0;

    for (let poll = 0; poll < 400 && unchanged < STABLE_READS; poll += 1) {
        await settle(20);
        const sample = JSON.stringify([
            viewerState.viewportScale,
            viewerState.viewportCentre,
        ]);
        if (sample === previous) unchanged += 1;
        else {
            unchanged = 0;
            previous = sample;
        }
    }

    return {
        scale: viewerState.viewportScale,
        centre: viewerState.viewportCentre!,
    };
}

describe('the renderer’s world-refit', () => {
    const mockFetch = vi.fn();
    let surface: ReturnType<typeof installViewerSurface>;
    let root: HTMLDivElement;
    let canvas: HTMLCanvasElement;
    let disposeRoot: (() => void) | null = null;
    let detach: (() => void) | undefined;

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => MANIFEST,
        }));

        surface = installViewerSurface({ width: 800, height: 600 });

        root = document.createElement('div');
        canvas = document.createElement('canvas');
        root.appendChild(canvas);
        document.body.appendChild(root);
    });

    afterEach(() => {
        detach?.();
        detach = undefined;
        disposeRoot?.();
        disposeRoot = null;
        root.remove();
        surface.restore();
        vi.restoreAllMocks();
    });

    /**
     * A renderer attached to a measurable surface, with the refit signal under
     * the test's control — the guard reads it through `getRefitSignal`, so this
     * is how a change of world is staged without a manifest swap.
     */
    async function attachRenderer() {
        const viewerState = new ViewerState(MANIFEST_ID, FIRST_CANVAS);
        let signal: string | null = `0|${FIRST_CANVAS}|0|`;
        await settle();

        let renderer!: ReturnType<typeof createCanvasRenderer>;
        disposeRoot = $effect.root(() => {
            renderer = createCanvasRenderer({
                viewerState,
                messages: m as unknown as Parameters<
                    typeof createCanvasRenderer
                >[0]['messages'],
                getRefitSignal: () => signal,
            });
            detach = renderer.mount(root, canvas);
        });

        await settle();
        // Stand in for the component's refit effect, whose first run is what
        // gives the renderer a record to compare against. A renderer with no
        // record has nothing to compare and must fit — which is why the reader
        // is looking at a framed canvas here.
        renderer.refitForCurrentWorld();
        await settledView(viewerState);
        expect(viewerState.viewportScale).toBeGreaterThan(0);

        return {
            viewerState,
            renderer,
            setSignal(next: string | null) {
                signal = next;
            },
        };
    }

    /** Put the reader somewhere they chose, well away from the fit. */
    async function zoomAndPan(viewerState: ViewerState) {
        const fitted = viewerState.viewportScale;
        viewerState.zoomTo(fitted * 3);
        // Settled between the two: a pan issued in the same tick as a zoom
        // re-targets the animation and the zoom is lost.
        await settledView(viewerState);
        viewerState.panTo({ x: 900, y: 1200 });
        return settledView(viewerState);
    }

    it('leaves the reader alone when the world, the signal and the geometry are all unchanged', async () => {
        const { viewerState, renderer } = await attachRenderer();
        const chosen = await zoomAndPan(viewerState);
        expect(chosen.scale).toBeGreaterThan(0);

        // The spurious run. Nothing about the framed world moved, so nothing
        // about the reader's view may either.
        renderer.refitForCurrentWorld();
        const after = await settledView(viewerState);

        expect(after.scale).toBeCloseTo(chosen.scale, 6);
        // A refit would put the centre at the canvas's own, (1602, 2306.5).
        expect(after.centre.x).toBeCloseTo(chosen.centre.x, 4);
        expect(after.centre.y).toBeCloseTo(chosen.centre.y, 4);

        // Idempotent, not merely once-only: a second and a third stray run cost
        // the reader nothing either.
        renderer.refitForCurrentWorld();
        renderer.refitForCurrentWorld();
        const later = await settledView(viewerState);

        expect(later.scale).toBeCloseTo(chosen.scale, 6);
    });

    it('still refits when the refit signal changes', async () => {
        const { viewerState, renderer, setSignal } = await attachRenderer();
        const fitted = viewerState.viewportScale;
        const chosen = await zoomAndPan(viewerState);
        expect(chosen.scale).toBeGreaterThan(fitted * 2);

        // What navigation looks like from the renderer's side: the viewer
        // re-derives its world signal, and a different value is the guard's
        // statement that the world under the reader has been replaced.
        setSignal(`1|${SECOND_CANVAS}|0|`);
        renderer.refitForCurrentWorld();
        const after = await settledView(viewerState);

        expect(after.scale).toBeCloseTo(fitted, 4);
    });

    it('leaves the reader alone when an equal signal is re-derived', async () => {
        const { viewerState, renderer, setSignal } = await attachRenderer();
        const chosen = await zoomAndPan(viewerState);

        // A host replacing its configuration object, or any other re-derivation
        // that lands on the same world, produces an EQUAL signal rather than the
        // same one. Keying the guard by VALUE rather than by identity is what
        // makes an equal replacement cost the reader nothing; a signal compared
        // by identity could not tell the two apart.
        setSignal(`0|${FIRST_CANVAS}|0|`);
        renderer.refitForCurrentWorld();
        const after = await settledView(viewerState);

        expect(after.scale).toBeCloseTo(chosen.scale, 6);
        expect(after.centre.x).toBeCloseTo(chosen.centre.x, 4);
        expect(after.centre.y).toBeCloseTo(chosen.centre.y, 4);
    });

    it('still refits when a Choice is selected on the canvas on screen', async () => {
        const { viewerState, renderer, setSignal } = await attachRenderer();
        const fitted = viewerState.viewportScale;
        const chosen = await zoomAndPan(viewerState);
        expect(chosen.scale).toBeGreaterThan(fitted * 2);

        // Same canvas, same rects, different picture in them. Geometry cannot
        // carry this, so the signal has to: the Choice is the last field of it.
        setSignal(`0|${FIRST_CANVAS}|0|${FIRST_CANVAS}=http://example.org/alt`);
        renderer.refitForCurrentWorld();
        const after = await settledView(viewerState);

        expect(after.scale).toBeCloseTo(fitted, 4);
    });

    it('still refits when the viewing mode changes', async () => {
        const { viewerState, renderer } = await attachRenderer();
        const fitted = viewerState.viewportScale;
        const chosen = await zoomAndPan(viewerState);
        expect(chosen.scale).toBeGreaterThan(fitted * 2);

        // A different mode is a different world even over the same sources and
        // the same rects, so the world key alone has to be enough.
        viewerState.viewingMode = 'paged';
        renderer.refitForCurrentWorld();
        const after = await settledView(viewerState);

        expect(after.scale).toBeLessThan(chosen.scale / 2);
    });
});
