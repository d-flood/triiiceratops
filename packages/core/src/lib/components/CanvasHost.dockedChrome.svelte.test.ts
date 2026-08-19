import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';

import type { IconDescriptor } from '../types/plugin';
import TriiiceratopsViewer from './TriiiceratopsViewer.svelte';
import { installViewerSurface } from '../test/utils/mockViewerSurface';

/**
 * Core taking part of the surface for its own chrome must not move the reader.
 *
 * Asserted in the terms the published viewer state already uses — the canvas
 * extent on screen, the scale, the centre — and never in terms of how the
 * measurement got there: how many times the surface was measured, and whether a
 * ratio or a fit was involved, are all free to change. Only a mounted viewer has
 * both halves of what is under test, which is the wiring between the
 * docked-chrome change signal and what the measurement does with it.
 *
 * `0001-mvm-image` is a 1200 × 1800 portrait canvas, which in the harness's
 * 800 × 600 surface is fitted by its HEIGHT — the case where the changed axis's
 * ratio and the fit scale move independently, and so the case that exercises both
 * the floor and the ceiling of `compensatedScale`.
 *
 * What this fixture cannot see is which fit the ceiling gates on. Height-
 * constrained at 800 px wide and at 500 px alike, it has `fitScale ===
 * previousFitScale`, so the two candidate gates are indistinguishable here: a
 * mutation reading `previousFitScale` after the viewport has adopted the new size
 * still passes every spec below. That gate is owned by ticket 03's property
 * tests, over widths where the fit does move; do not read these specs as covering
 * it. `0065-opera-multiple-canvases` supplies the second
 * canvas the continuous-mode case needs to scroll onto; its canvases carry no
 * image body, so core paints placeholders for them and nothing fetches pixels.
 */
const COOKBOOK = join(
    import.meta.dirname,
    '../test/fixtures/manifests/cookbook',
);

function fixture(name: string) {
    return JSON.parse(readFileSync(join(COOKBOOK, name), 'utf8'));
}

const IMAGE = fixture('0001-mvm-image.json');
const PAIR = JSON.parse(
    readFileSync(
        join(
            import.meta.dirname,
            '../test/fixtures/manifests/av/0065-opera-multiple-canvases.json',
        ),
        'utf8',
    ),
);

/** The surface, whole and with a metadata panel's column taken out of it. */
const FULL = { width: 800, height: 600 };
const PANEL = { width: 500, height: 600 };

async function settle(ms = 400) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await tick();
}

/**
 * Wait until the view stops moving, rather than for a duration.
 *
 * Every command here eases, the ease is exponential, and a long pan at a small
 * scale takes far longer to reach its settle threshold than a short one — so a
 * fixed wait reads a view that is still arriving and attributes the difference
 * to whatever the test just did. "Stopped" is a twentieth of a canvas unit
 * between polls — well below what any assertion here measures — rather than
 * bit-exact equality, which an exponential approach reaches only much later and
 * only when the renderer's own settle threshold snaps it.
 */
async function settleView(state: {
    viewportCentre: { x: number; y: number } | null;
    viewportScale: number;
}) {
    let previous: { x: number; y: number; scale: number } | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        await settle(100);
        const centre = state.viewportCentre;
        // A viewport with no scale yet has not settled, it has not started: two
        // reads of nothing are identical, and taking them for stillness would
        // let a test measure a viewer that has never been laid out.
        if (!centre || !(state.viewportScale > 0)) continue;
        const now = { x: centre.x, y: centre.y, scale: state.viewportScale };
        if (
            previous &&
            Math.abs(now.x - previous.x) < 0.05 &&
            Math.abs(now.y - previous.y) < 0.05 &&
            Math.abs(now.scale / previous.scale - 1) < 1e-6
        ) {
            return;
        }
        previous = now;
    }
    throw new Error('the view never settled');
}

/** Scales are compared as a fraction, since they span orders of magnitude. */
function expectScaleNear(actual: number, expected: number) {
    expect(Math.abs(actual / expected - 1)).toBeLessThan(0.01);
}

function expectPointNear(
    actual: { x: number; y: number } | null,
    expected: { x: number; y: number },
) {
    expect(actual).not.toBeNull();
    expect(Math.abs(actual!.x - expected.x)).toBeLessThan(2);
    expect(Math.abs(actual!.y - expected.y)).toBeLessThan(2);
}

/** A plugin's toolbar icon: enough of one for the chrome to render. */
const ICON: IconDescriptor = {
    kind: 'svg',
    inner: '<path d="M0 0h1v1H0z" />',
    viewBox: '0 0 1 1',
};

/**
 * Turn `prefers-reduced-motion: reduce` on for the whole viewer.
 *
 * The preference is WATCHED rather than sampled, so it has to be in place before
 * the mount and answer through `matchMedia` — the one source both the chrome's
 * transitions and the renderer read. Every other query the viewer asks (the
 * mobile byte budget, the device-pixel-ratio watch) is answered "no", which is
 * what happy-dom already answers.
 */
function stubReducedMotion() {
    vi.stubGlobal('matchMedia', (query: string) => ({
        media: query,
        matches: query.includes('prefers-reduced-motion'),
        addEventListener: () => {},
        removeEventListener: () => {},
    }));
}

describe('a docked-chrome surface change in a mounted viewer', () => {
    const mockFetch = vi.fn();
    let manifest: Record<string, unknown> = IMAGE;
    let target: HTMLElement;
    const apps: Array<ReturnType<typeof mount>> = [];
    let surface: ReturnType<typeof installViewerSurface>;
    let originalAnimate: typeof Element.prototype.animate;

    beforeEach(() => {
        manifest = IMAGE;
        vi.stubGlobal('fetch', mockFetch);
        mockFetch.mockImplementation(async () => ({
            ok: true,
            json: async () => manifest,
        }));

        // A panel column arrives with Svelte transitions on it, and happy-dom
        // has no Web Animations API for them to drive. Inert, and never
        // reporting itself finished: an animation that claims to have ended
        // lets Svelte tear down the element it was playing on, and this suite's
        // whole subject is a viewer that stays mounted while chrome moves.
        originalAnimate = Element.prototype.animate;
        Element.prototype.animate = function () {
            const animation: Record<string | symbol, unknown> = {};
            const handle = new Proxy(animation, {
                get(store, property) {
                    if (property in store) return store[property];
                    return () => undefined;
                },
                set(store, property, value) {
                    store[property] = value;
                    return true;
                },
            });
            return handle as unknown as Animation;
        } as unknown as typeof Element.prototype.animate;

        surface = installViewerSurface(FULL);
        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(async () => {
        for (const app of apps.splice(0)) await unmount(app);
        target.remove();
        surface.restore();
        Element.prototype.animate = originalAnimate;
        vi.restoreAllMocks();
        // `restoreAllMocks` does not undo `stubGlobal`, and the reduced-motion
        // spec below stubs `matchMedia` for the whole window.
        vi.unstubAllGlobals();
    });

    /**
     * A viewer on a measurable surface, settled at the fit of its first canvas.
     * The surface handle is what a test uses to model the column's slide.
     */
    async function mountViewer(config: Record<string, unknown> = {}) {
        // One viewer at a time: two mounted against one stubbed box measure the
        // same surface and contend for it.
        for (const app of apps.splice(0)) await unmount(app);
        surface.setBox(FULL);

        const props = $state({
            manifestId: manifest.id as string,
            // A stiff programmatic ease, so that setting the reader's view up
            // costs a frame rather than seconds of exponential tail. The
            // compensation under test is not animated at all, so this is only
            // about how the arrangement gets made.
            config: {
                renderer: { animationTimeConstant: 0.005 },
                ...config,
            } as Record<string, unknown>,
            viewerState: undefined as any,
        });
        const app = mount(TriiiceratopsViewer, { target, props });
        apps.push(app);
        await settleView(props.viewerState);
        return { state: props.viewerState };
    }

    /**
     * A reader zoomed in and parked off-centre, with both eases fully settled.
     * `panTo` carries the scale it saw when it was called, so the two commands
     * cannot be issued in one tick — the pan would cancel the zoom.
     */
    async function readerZoomedIn(
        state: any,
        centre: { x: number; y: number },
        canvasId?: string,
    ) {
        const fit = state.viewportScale;
        state.zoomTo(fit * 3);
        await settleView(state);
        state.panTo(centre, canvasId);
        await settleView(state);
        expect(state.viewportScale).toBeGreaterThan(fit * 2);
    }

    it('preserves the canvas extent on the axis a panel column takes', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });

        const scale = state.viewportScale;
        const bounds = state.viewportBounds!;
        const centre = state.viewportCentre!;

        state.showMetadataPanel = true;
        await surface.stepBox([PANEL]);
        await settleView(state);

        // The same canvas rect on the changed axis, at the same point in the
        // canvas: the panel cost the reader width of surface, not width of
        // image (user stories 1, 2, 23).
        expect(
            Math.abs(state.viewportBounds!.width - bounds.width),
        ).toBeLessThan(2);
        expectPointNear(state.viewportCentre, centre);
        expectScaleNear(
            state.viewportScale,
            scale * (PANEL.width / FULL.width),
        );
    });

    it('lands a sliding column where a single step to its final width lands', async () => {
        async function open(widths: number[]) {
            const { state } = await mountViewer();
            await readerZoomedIn(state, { x: 700, y: 1000 });

            const before = state.viewportScale;
            state.showMetadataPanel = true;
            await surface.stepBox(
                widths.map((width) => ({ width, height: 600 })),
            );
            await settleView(state);
            return {
                before,
                scale: state.viewportScale,
                centre: state.viewportCentre!,
            };
        }

        // A slide's worth of `cubicOut` widths against one jump to the end: the
        // ratios compose, so the result does not depend on catching every frame
        // (user stories 3, 4).
        const slid = await open([
            780, 745, 700, 655, 615, 580, 550, 528, 512, 503, 500,
        ]);
        const jumped = await open([500]);

        // Where the composed ratios have to land, stated absolutely: an
        // agreement between the two runs is also had by any self-consistent
        // rule, identity included.
        expectScaleNear(slid.scale, slid.before * (500 / 800));
        expectScaleNear(slid.scale, jumped.scale);
        expectPointNear(slid.centre, jumped.centre);
    });

    it('returns the reader to where they were when the panel closes', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });

        const scale = state.viewportScale;
        const centre = state.viewportCentre!;

        state.showMetadataPanel = true;
        await surface.stepBox([{ width: 650, height: 600 }, PANEL]);
        await settleView(state);
        expect(state.viewportScale).toBeLessThan(scale);

        state.showMetadataPanel = false;
        await surface.stepBox([{ width: 650, height: 600 }, FULL]);
        await settleView(state);

        // Consulting a panel cost the reader nothing (user story 5).
        expectScaleNear(state.viewportScale, scale);
        expectPointNear(state.viewportCentre, centre);
    });

    it('keeps a reader at the fit looking at the whole canvas, at very nearly its size', async () => {
        const { state } = await mountViewer();

        const scale = state.viewportScale;
        expect(scale).toBeGreaterThan(0);

        state.showMetadataPanel = true;
        await surface.stepBox([PANEL]);
        await settleView(state);

        // The canvas is fitted by its height and the panel took width, so there
        // is no less image to show: the reader keeps their size and the whole
        // canvas stays on screen (user stories 6, 7, 19).
        expectScaleNear(state.viewportScale, scale);
        expect(state.viewportBounds!.width).toBeGreaterThan(1200);
        expect(state.viewportBounds!.height).toBeGreaterThan(1798);

        state.showMetadataPanel = false;
        await surface.stepBox([FULL]);
        await settleView(state);

        // Handing the width back does not zoom them past the fit into a canvas
        // that overhangs its own surface.
        expectScaleNear(state.viewportScale, scale);
        expect(state.viewportBounds!.height).toBeGreaterThan(1798);
    });

    it('compensates the vertical axis for a docked gallery band', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 600, y: 900 });

        const scale = state.viewportScale;
        const bounds = state.viewportBounds!;

        // A band takes HEIGHT, which is the axis a phone reader is reading down
        // (user story 9).
        state.showThumbnailGallery = true;
        await surface.stepBox([{ width: 800, height: 480 }]);
        await settleView(state);

        expect(
            Math.abs(state.viewportBounds!.height - bounds.height),
        ).toBeLessThan(2);
        expectScaleNear(state.viewportScale, scale * (480 / 600));
    });

    it('preserves the reader’s scale when the window resizes', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 600, y: 900 });
        const scale = state.viewportScale;

        // Nothing docked: the reader chose this view and nothing was taken from
        // them (user story 14).
        await surface.stepBox([PANEL]);
        await settleView(state);

        // The surface was re-measured, which is the antecedent the assertion
        // below needs: with no docked chrome in flight the renderer's own
        // per-frame sampler is not running, so the only thing that hears a
        // window resize is the ResizeObserver. Without one this spec passes over
        // a viewer that never saw the new box, and a window-resize branch that
        // halved the reader's scale would go unnoticed.
        expect(state.containerSize).toEqual(PANEL);
        expectScaleNear(state.viewportScale, scale);
    });

    it('lands a zoom still in flight at the compensated view', async () => {
        // Slack enough in the ease that the panel demonstrably opens mid-zoom.
        const { state } = await mountViewer({
            renderer: { animationTimeConstant: 0.4 },
        });

        const scale = state.viewportScale;
        state.zoomTo(scale * 4);

        // The panel opens while the ease is still running (user story 16).
        state.showMetadataPanel = true;
        await surface.stepBox([{ width: 650, height: 600 }, PANEL]);
        expect(state.viewportScale).toBeLessThan(scale * 4 * 0.9);
        await settleView(state);

        expectScaleNear(
            state.viewportScale,
            scale * 4 * (PANEL.width / FULL.width),
        );
    });

    it('does not move a continuous-mode reader to another canvas', async () => {
        manifest = PAIR;
        const { state } = await mountViewer({ viewingMode: 'continuous' });
        expect(state.viewingMode).toBe('continuous');

        // Scrolled onto the SECOND canvas while the viewer still calls the
        // first one current — the one an absolute fit would frame (story 20).
        const next: string = (manifest.items as Array<{ id: string }>)[1].id;
        await readerZoomedIn(state, { x: 900, y: 540 }, next);
        expect(state.canvasId).not.toBe(next);
        const centre = state.viewportCentre!;

        state.showMetadataPanel = true;
        await surface.stepBox([PANEL]);
        await settleView(state);

        expectPointNear(state.viewportCentre, centre);
    });

    it('leaves the view untouched when the gallery is expanded', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });

        const scale = state.viewportScale;
        const centre = state.viewportCentre!;

        // Expanded and never docked: the grid overlays the centre column rather
        // than standing beside it, so it takes no surface and contributes no
        // docked-chrome token (story 10).
        state.setGalleryExpanded(true);
        state.showThumbnailGallery = true;
        await settleView(state);

        expect(state.galleryExpanded).toBe(true);
        expectScaleNear(state.viewportScale, scale);
        expectPointNear(state.viewportCentre, centre);

        // Exempt rather than merely unmeasured, over a transition a reader can
        // produce: the real close command clears the expanded state on the way
        // out, so the gallery is re-opened straight into it, with the surface
        // narrowing in the SAME tick. That is the arrangement every compensating
        // spec above uses, so an expanded gallery contributing a docked-chrome
        // token would move the reader by the width ratio. It contributes none, so
        // the narrowing is heard as a plain window resize — the box demonstrably
        // moved, as `containerSize` shows, and the reader did not move with it.
        state.toggleThumbnailGallery();
        await settleView(state);
        expect(state.galleryExpanded).toBe(false);

        state.setGalleryExpanded(true);
        state.showThumbnailGallery = true;
        await surface.stepBox([PANEL]);
        await settleView(state);

        expect(state.galleryExpanded).toBe(true);
        expect(state.containerSize).toEqual(PANEL);
        expectScaleNear(state.viewportScale, scale);
    });

    it('gives the surface back when a docked band is expanded', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });

        const scale = state.viewportScale;
        const centre = state.viewportCentre!;
        const bounds = state.viewportBounds!;

        // The transition a reader can actually produce, driven through the real
        // command rather than by writing the flag. `toggleThumbnailGallery` also
        // clears `galleryExpanded` on the way closed, so "still expanded across a
        // close and re-open" is not a state any reader can reach; what they can
        // do is open the band so that it DOCKS, and then expand it.
        state.toggleThumbnailGallery();
        await surface.stepBox([{ width: 800, height: 480 }]);
        await settleView(state);

        expect(state.galleryExpanded).toBe(false);
        expectScaleNear(state.viewportScale, scale * (480 / 600));
        expect(
            Math.abs(state.viewportBounds!.height - bounds.height),
        ).toBeLessThan(2);

        // Expanding it hands the height back: the grid overlays the centre column
        // instead of standing under it, so the `gallery-bottom` token disappears
        // and a docked-chrome change fires on the surface returning to full
        // height. What story 10 asks for holds — the content on screen is
        // identical either side of the expand, so browsing thumbnails and
        // returning is not a navigation — but the MAGNIFICATION does move, back
        // to what it was before the band took the height. It has to: the surface
        // really did change size, and preserving the extent on the changed axis
        // is the rule.
        state.setGalleryExpanded(true);
        await surface.stepBox([FULL]);
        await settleView(state);

        expect(state.galleryExpanded).toBe(true);
        expectScaleNear(state.viewportScale, scale);
        expectPointNear(state.viewportCentre, centre);
        expect(
            Math.abs(state.viewportBounds!.height - bounds.height),
        ).toBeLessThan(2);
    });

    it('leaves the view untouched when a plugin flyout opens', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });

        const scale = state.viewportScale;
        const centre = state.viewportCentre!;

        // A flyout floats over the viewer and takes no width or height from it
        // (story 11).
        state.registerSdkChrome({
            id: 'fake',
            name: 'Fake plugin',
            icon: ICON,
            target: 'flyout',
            dismiss: 'light',
            mount: () => () => {},
        });
        state.setPluginOpen('fake', true);
        await settleView(state);

        expect(state.isPluginOpen('fake')).toBe(true);
        expectScaleNear(state.viewportScale, scale);
        expectPointNear(state.viewportCentre, centre);

        // Exempt rather than merely unmeasured: closing and re-opening it with
        // the surface narrowing in the same tick would compensate the reader by
        // the width ratio if a flyout contributed a docked-chrome token. None is
        // contributed, so the narrowing is heard as a plain window resize — the
        // surface is re-measured, as `containerSize` shows, and the reader's
        // scale is preserved through it.
        state.setPluginOpen('fake', false);
        await settleView(state);
        state.setPluginOpen('fake', true);
        await surface.stepBox([PANEL]);
        await settleView(state);

        expect(state.containerSize).toEqual(PANEL);
        expectScaleNear(state.viewportScale, scale);
    });

    it('arrives in one step under reduced motion, where a slide arrives', async () => {
        stubReducedMotion();
        // A SLACK ease, deliberately: at this time constant a zoom is visibly
        // still arriving 50ms later (the in-flight spec above relies on exactly
        // that), so a zoom that has already landed is proof the preference
        // reached the renderer rather than proof the ease was stiff.
        const { state } = await mountViewer({
            renderer: { animationTimeConstant: 0.4 },
        });

        const fit = state.viewportScale;
        state.zoomTo(fit * 3);
        await settle(50);
        expectScaleNear(state.viewportScale, fit * 3);
        state.panTo({ x: 700, y: 1000 });
        await settleView(state);

        const scale = state.viewportScale;
        const bounds = state.viewportBounds!;

        // One step, and the single `stepBox` below is what makes it one: this
        // harness moves the box only when a test moves it, so the number of
        // intermediate widths is the test's to choose and never `slideWidth`'s.
        // What the preference buys is that a real column would arrive at its
        // full width in one step too — `slideWidth`'s duration is 0 — so a
        // single step is the faithful model of it rather than a convenience.
        // It lands where the eleven-step slide above lands, both being stated
        // against the same absolute ratio (story 13).
        state.showMetadataPanel = true;
        await surface.stepBox([PANEL]);
        await settleView(state);

        expectScaleNear(
            state.viewportScale,
            scale * (PANEL.width / FULL.width),
        );
        expect(
            Math.abs(state.viewportBounds!.width - bounds.width),
        ).toBeLessThan(2);
    });

    it('leaves a reader parked at the zoom floor where they are', async () => {
        const { state } = await mountViewer();
        const fit = state.viewportScale;

        // All the way out. `zoomRange` puts the floor a fraction below the live
        // fit scale, so asking for less than that does not move them.
        state.zoomTo(fit / 1000);
        await settleView(state);
        const floor = state.viewportScale;
        expect(floor).toBeLessThan(fit);
        state.zoomTo(floor / 10);
        await settleView(state);
        expectScaleNear(state.viewportScale, floor);

        state.showMetadataPanel = true;
        await surface.stepBox([PANEL]);
        await settleView(state);

        // The canvas is height-constrained, so a panel taking width moves
        // neither the fit nor the floor derived from it, and the compensation's
        // own floor — `min(scale, fitScale)` — is the reader's own scale. The two
        // agree instead of fighting, and the reader does not move (story 18).
        //
        // What this leg pins is `clampScale` winning, NOT the compensation's
        // floor: `zoomRange`'s minimum is where the reader already sits, so
        // dropping `min(scale, fitScale)` from the rule entirely leaves this
        // green. Nobody should count it as coverage of that floor — the
        // viewport-math specs own it.
        expectScaleNear(state.viewportScale, floor);
        expect(state.viewportBounds!.width).toBeGreaterThan(1200);

        // Closing the panel from below the fit is the fifth accepted residual,
        // and no other spec here closes from below it. The floor pinned the
        // narrowing to a no-op, so the widening applies the whole 800/500 ratio
        // and the ceiling stops it at the fit: the reader is walked from half the
        // fit to 0.8 of it. Bounded, terminating at the fit, and inward — they
        // see more of the canvas and never overhang it — so it is a residual and
        // not a defect. Fixing it would mean a different rule.
        state.showMetadataPanel = false;
        await surface.stepBox([FULL]);
        await settleView(state);

        expectScaleNear(
            state.viewportScale,
            floor * (FULL.width / PANEL.width),
        );
        expect(state.viewportScale).toBeLessThan(fit);
    });

    it('ends a window resize that overlaps a slide with a legal view', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });
        const scale = state.viewportScale;

        // The column starts sliding and the reader drags the window edge while
        // it does. Accepted residual: the two are genuinely indistinguishable
        // while they overlap, so the compensation stays in flight until the
        // surface stops moving and the drag is compensated too (story 15).
        state.showMetadataPanel = true;
        await surface.stepBox([
            { width: 700, height: 600 },
            { width: 620, height: 560 },
            { width: 560, height: 520 },
            { width: 500, height: 500 },
        ]);
        await settleView(state);

        // It ends: the view stops moving — `settleView` returns rather than
        // giving up — on the surface the drag left, and it ends where the
        // composed ratios put it. Width shrank proportionally more than height at
        // every step above, so it bound the `min` every time and the product of
        // the per-step ratios is the total width ratio.
        expect(state.containerSize).toEqual({ width: 500, height: 500 });
        const landed = state.viewportScale;
        const centre = state.viewportCentre!;
        expectScaleNear(landed, scale * (500 / 800));

        // And where it ends is legal: asking for exactly this view back is a
        // no-op rather than a clamp, so nothing is sitting outside the zoom range
        // or beyond the pan constraint.
        state.zoomTo(landed);
        await settleView(state);
        state.panTo(centre);
        await settleView(state);
        expectScaleNear(state.viewportScale, landed);
        expectPointNear(state.viewportCentre, centre);

        // Legal enough to go on composing from, too: closing the panel gives the
        // width back on the axis it took and returns the reader's original scale,
        // even though the window kept the height it took in the meantime.
        state.showMetadataPanel = false;
        await surface.stepBox([{ width: 800, height: 500 }]);
        await settleView(state);

        expectScaleNear(state.viewportScale, scale);
    });

    it('agrees with the coordinate helpers on the frame it lands', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });
        const scale = state.viewportScale;

        state.showMetadataPanel = true;
        // Deliberately unsettled: the compensation is not animated, so the frame
        // the surface changed on IS the frame it lands (story 21).
        await surface.stepBox([PANEL]);

        expectScaleNear(
            state.viewportScale,
            scale * (PANEL.width / FULL.width),
        );

        expect(state.canvasToScreen({ x: 0, y: 0 })).not.toBeNull();
        const origin = state.canvasToScreen({ x: 0, y: 0 })!;
        const along = state.canvasToScreen({ x: 100, y: 0 })!;

        // The scale the helpers imply is the compensated one, not the one the
        // surface had a frame ago — which is what would put a plugin's ink behind
        // the image for the length of the slide.
        expect((along.x - origin.x) / 100).toBeCloseTo(state.viewportScale, 6);

        // …and they place the viewport centre at the middle of the surface the
        // viewer now has, not the one it had.
        const middle = state.canvasToScreen(state.viewportCentre!)!;
        expect(middle.x).toBeCloseTo(PANEL.width / 2, 4);
        expect(middle.y).toBeCloseTo(PANEL.height / 2, 4);

        // The inverse agrees with them, so a plugin reading a pointer position
        // back into canvas space lands on the same point.
        expect(state.screenToCanvas(along)!.x).toBeCloseTo(100, 4);
    });

    it('does not move the current view for a viewport inset, and does not consult one', async () => {
        const { state } = await mountViewer();
        await readerZoomedIn(state, { x: 700, y: 1000 });

        const scale = state.viewportScale;
        const centre = state.viewportCentre!;

        // The inset's contract is unchanged by this rule: fit targets only, and
        // the next fit rather than the current view (story 22).
        state.setViewportInset({ left: 200, bottom: 120 });
        await settleView(state);
        expectScaleNear(state.viewportScale, scale);
        expectPointNear(state.viewportCentre, centre);

        // And the compensation does not consult it. The ratio is the whole
        // surface's, so the reserved edges make no difference to where a panel
        // leaves the reader.
        state.showMetadataPanel = true;
        await surface.stepBox([PANEL]);
        await settleView(state);

        expectScaleNear(
            state.viewportScale,
            scale * (PANEL.width / FULL.width),
        );
        expectPointNear(state.viewportCentre, centre);

        // Nor do the compensation's own bounds consult it, which only a reader AT
        // the fit can see: an inset-aware fit is smaller than the surface's, so it
        // would pull a reader who had the whole canvas below the size they had.
        const fresh = await mountViewer();
        const fit = fresh.state.viewportScale;
        fresh.state.setViewportInset({ left: 200, bottom: 120 });
        await settleView(fresh.state);

        fresh.state.showMetadataPanel = true;
        await surface.stepBox([PANEL]);
        await settleView(fresh.state);

        expectScaleNear(fresh.state.viewportScale, fit);
    });
});
