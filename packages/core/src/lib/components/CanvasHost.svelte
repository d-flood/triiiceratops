<script lang="ts">
    /**
     * The first-party Canvas2D renderer's host: the DOM half of the
     * planner/painter split.
     *
     * It owns the canvas element, the viewport, and pointer input; it owns no
     * scene decisions. Every frame it asks `planScene` what the scene is and
     * hands the resulting **scene plan** to `paintScene`. Nothing here decides
     * what is resident or at which tier — including which tiles: the scheduler
     * is handed the planner's **required set** once per frame and does exactly
     * what it says.
     *
     * Mounted instead of `OSDViewer` when the development-only build flag
     * selects this renderer (see `renderer/rendererFlag.ts`). Ticket 18 deletes
     * the flag and the OpenSeadragon path together.
     *
     * ## SSR
     *
     * Nothing in this component's module graph touches `window`, `document`, or
     * `navigator` at module scope. Being first-party code there is no need for
     * the dynamic import the OpenSeadragon component uses: the canvas element
     * renders as inert markup on the server and the 2D context is acquired in
     * `onMount`.
     *
     * ## Scope
     *
     * One canvas — a static image or a tiled image service; the full pointer
     * input model (drag, flick momentum, pinch, wheel, double-tap). The
     * size-ladder source is ticket 06, multi-canvas layout ticket 07, keyboard
     * and focus ticket 11, annotation overlays ticket 14.
     */
    import { onMount } from 'svelte';

    import { toPlannerCanvases } from '../renderer/canvasDescriptors';
    import { GestureRecogniser } from '../renderer/gestureArbiter';
    import { reconcileImages } from '../renderer/imageRequests';
    import {
        imageServiceCache,
        type ImageServiceFailure,
    } from '../renderer/imageService';
    import { paintScene } from '../renderer/paintScene';
    import { planScene, planViewportLimits } from '../renderer/planScene';
    import { pointerSample } from '../renderer/pointerSamples';
    import { createTileScheduler } from '../renderer/tileScheduler';
    import {
        ANIMATION_TIME_CONSTANT,
        DEFAULT_BUDGETS,
        DOUBLE_TAP_MS,
        DOUBLE_TAP_SLOP,
        DOUBLE_TAP_ZOOM_FACTOR,
        MAX_DEVICE_PIXEL_RATIO,
        MAX_ZOOM_FACTOR,
        MIN_FLICK_SPEED,
        MIN_VELOCITY_SPAN_MS,
        MOMENTUM_MIN_SPEED,
        MOMENTUM_TIME_CONSTANT,
        TAP_SLOP,
        TILE_IN_FLIGHT_LIMIT,
        TILE_MAX_ATTEMPTS,
        VELOCITY_WINDOW_MS,
        VISIBILITY_RATIO,
        WHEEL_LINE_PIXELS,
        WHEEL_PAGE_PIXELS,
        WHEEL_TIME_CONSTANT,
        WHEEL_ZOOM_RATE,
    } from '../renderer/rendererDefaults';
    import type {
        ImageServiceFacts,
        LayoutRect,
        PlannerCanvas,
        Point,
        ScenePlan,
        Viewport,
    } from '../renderer/types';
    import {
        anchoredZoomCentre,
        approach,
        approachScale,
        clamp,
        constrainCentre,
        fitBounds,
        normalizeWheelDelta,
    } from '../renderer/viewportMath';
    import type { ViewerState } from '../state/viewer.svelte';

    let {
        tileSources,
        viewerState,
    }: { tileSources: unknown; viewerState: ViewerState } = $props();

    let root: HTMLDivElement | undefined = $state();
    let surface: HTMLCanvasElement | undefined = $state();

    // Deliberately NOT `$state`: these change every frame, and a frame is
    // driven by requestAnimationFrame rather than by the reactive graph. Making
    // them reactive would schedule an effect per pointer sample.
    let ctx: CanvasRenderingContext2D | null = null;
    let dpr = 1;
    let viewport: Viewport = {
        width: 0,
        height: 0,
        centre: { x: 0, y: 0 },
        scale: 1,
    };
    // Where an animated input is heading. Continuous input (drag, pinch)
    // writes `viewport` directly and keeps these in step; discrete and
    // programmatic input writes only these and lets the frame loop approach
    // them.
    let targetCentre: Point = { x: 0, y: 0 };
    let targetScale = 1;
    let animating = false;
    /**
     * The time constant the current animation is running at.
     *
     * Wheel and discrete input ease at different rates — wheel only just
     * enough to read as smoothing, a double-tap or a fit far enough to read as
     * travel — so the rate belongs to the animation, not to the loop.
     */
    let animationTimeConstant = WHEEL_TIME_CONSTANT;
    /**
     * Flick momentum, in **screen** px/s, or `null` when nothing is coasting.
     *
     * Screen rather than canvas space so a zoom mid-glide does not change how
     * fast the image appears to be moving.
     */
    let momentum: Point | null = null;
    let frameHandle: number | null = null;
    let lastFrameTime = 0;
    /** Resolved once the next painted frame has landed (e2e determinism). */
    let paintWaiters: Array<() => void> = [];

    // A plain record, deliberately not `$state` and deliberately not a
    // `SvelteMap`: it is read by the frame loop, never by the reactive graph.
    // `loadedGeneration` below is the one reactive signal that a decode landed.
    const images: Record<string, HTMLImageElement> = Object.create(null);
    /**
     * canvasId → the URL decoded **or in flight** for it.
     *
     * The residency key is the resolved URL, not the canvas id: switching a
     * Choice resolves the same canvas id to a different image, and an id-keyed
     * cache would paint the superseded one forever. It also stands in for a
     * request generation — an `onload` whose URL is no longer the one wanted is
     * simply discarded.
     */
    const imageUrls: Record<string, string> = Object.create(null);
    /** Bumped when a decoded image or tile arrives, to re-run the paint effect. */
    let loadedGeneration = $state(0);

    /**
     * The tile scheduler: everything about asking for, decoding, holding, and
     * releasing tiles. It is handed the **required set** once per frame, from
     * `paint()`, and makes no scene decisions of its own.
     *
     * Instance-scoped, unlike the metadata cache below — decoded pixels belong
     * to this renderer and die with it. Constructing it touches nothing, so it
     * is as safe on a server as the rest of the module graph.
     */
    const tiles = createTileScheduler({
        maxInFlight: TILE_IN_FLIGHT_LIMIT,
        maxAttempts: TILE_MAX_ATTEMPTS,
        onChange: () => {
            loadedGeneration += 1;
        },
    });

    /**
     * canvasId → the image-service facts the planner may use.
     *
     * A per-renderer view onto the page-shared `imageServiceCache`, which is
     * what keeps metadata and pixels on **two lifetimes**: this record is
     * rebuilt on remount, the cache behind it is not, so re-entering a canvas
     * costs no `info.json` request.
     */
    const knownMetadata: Record<string, ImageServiceFacts> =
        Object.create(null);

    /**
     * canvasId → why its image service has no facts, for the canvases where one
     * failed.
     *
     * The renderer's half of a canvas error state: the planner keeps asking for
     * metadata it will never get, and `ensure` keeps resolving `null`, so
     * without this the canvas is silently blank forever. Ticket 12 turns it into
     * something a user can see; here it is only surfaced.
     */
    const metadataFailures: Record<string, ImageServiceFailure> =
        Object.create(null);

    /**
     * The canvases this renderer is showing, in **canvas space**.
     *
     * Only the current canvas: multi-canvas worlds (paged, continuous) arrive
     * with ticket 07's shared layout.
     */
    const plannerCanvases: PlannerCanvas[] = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) return [];

        const current = viewerState
            .getCanvases(viewerState.manifestId)
            .find((entry: any) => {
                // Raw IIIF Canvas JSON: `id` in v3, `@id` in v2.
                const id = entry?.id || entry?.['@id'];
                return id === viewerState.canvasId;
            });

        if (!current) return [];

        return toPlannerCanvases([current], (canvasId) =>
            viewerState.getSelectedChoice(canvasId),
        );
    });

    /**
     * How many full scene plans this renderer has built.
     *
     * Exposed through the test handle because "planning is once per frame" is a
     * claim only a counter can hold: a plan enumerates the required tile set, so
     * a clamp that quietly asked for one would cost several enumerations per
     * pointer event and show up as nothing but heat.
     */
    let scenePlanCount = 0;

    function currentPlan(): ScenePlan {
        scenePlanCount += 1;
        return planScene({
            canvases: plannerCanvases,
            mode: viewerState.viewingMode,
            direction: viewerState.viewingDirection,
            preserveCanvasScale: viewerState.preserveCanvasScale,
            viewport,
            // Level selection is a question about pixels the display can
            // resolve, and the viewport is measured in CSS pixels: without this
            // a 2× screen never reaches full resolution.
            dpr,
            knownMetadata,
            budgets: DEFAULT_BUDGETS,
            residentTiles: tiles.residentKeys(),
        });
    }

    /**
     * Fetch the `info.json` of every canvas the planner says needs one.
     *
     * Called once per frame with the planner's list, which is safe because the
     * cache is the thing that dedupes: a hit costs nothing, a miss in flight
     * joins the existing request, and a permanent failure never touches the
     * network again. That is what makes opening a single-canvas manifest cost
     * exactly one `info.json` request rather than one per frame — and what
     * replaces the old renderer's `Promise.all` over every source.
     */
    function requestMetadata(canvasIds: string[]): void {
        for (const canvasId of canvasIds) {
            const canvas = plannerCanvases.find(
                (entry) => entry.id === canvasId,
            );
            if (canvas?.source.kind !== 'service') continue;

            const { serviceId } = canvas.source;
            void imageServiceCache.ensure(serviceId).then((facts) => {
                if (!facts) {
                    // A canvas that will never have pixels. Recorded rather
                    // than swallowed: painting nothing and saying nothing is
                    // indistinguishable from still loading (user stories 26 and
                    // 27). Ticket 12 owns the announcement; this is the seam it
                    // reads.
                    // No repaint is bumped for this: nothing about the scene
                    // changed, and a failure that provoked a frame would
                    // provoke the next metadata request too.
                    const kind = imageServiceCache.failure(serviceId);
                    if (kind) metadataFailures[canvasId] = kind;
                    return;
                }
                delete metadataFailures[canvasId];
                if (knownMetadata[canvasId] === facts) return;
                knownMetadata[canvasId] = facts;
                // Tiles can only be planned now that the pyramid is knowable.
                loadedGeneration += 1;
            });
        }
    }

    /**
     * The world's layout and derived zoom floor, WITHOUT planning the scene.
     *
     * Clamping runs on every pointer sample — a pan clamps its centre, a pinch
     * clamps its scale too, and momentum clamps once per frame on top of the
     * paint. A full `currentPlan()` builds the pyramid, enumerates the required
     * tile set, and allocates a fresh resident-key set for each one, which at a
     * 120 Hz pinch is hundreds of scene plans a second for two numbers that
     * depend on neither the viewport nor residency. Enumeration stays where
     * `paint()`'s comment says it belongs: once per frame, in the frame loop.
     */
    function viewportLimits() {
        return planViewportLimits(
            plannerCanvases,
            DEFAULT_BUDGETS.boxThreshold,
        );
    }

    function worldBounds(layout: LayoutRect[]) {
        if (layout.length === 0) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const rect of layout) {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.width);
            maxY = Math.max(maxY, rect.y + rect.height);
        }

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /** The scale at which the whole world fits — the zoom ceiling's reference. */
    function homeScale(layout: LayoutRect[]): number {
        const bounds = worldBounds(layout);
        if (!bounds || viewport.width === 0 || viewport.height === 0) return 1;
        return fitBounds(bounds, viewport).scale;
    }

    function clampScale(scale: number): number {
        const limits = viewportLimits();
        const max = homeScale(limits.layout) * MAX_ZOOM_FACTOR;
        // The floor is DERIVED (the zoom at which the median canvas reaches the
        // box threshold), not a tuned percentage of home zoom. Guard the
        // degenerate empty-world case, where it is 0.
        const min =
            limits.minZoom > 0 ? Math.min(limits.minZoom, max) : max / 1e6;
        return clamp(scale, min, max);
    }

    /**
     * The centre, moved as little as necessary to keep the world in view.
     *
     * Applied to every centre this component adopts — direct or animated —
     * because momentum in particular will otherwise carry the image off screen
     * after the finger has left, leaving a blank viewport with no affordance
     * for getting back.
     */
    function constrained(centre: Point, scale: number): Point {
        const bounds = worldBounds(viewportLimits().layout);
        if (!bounds) return centre;
        return constrainCentre(
            centre,
            scale,
            bounds,
            viewport,
            VISIBILITY_RATIO,
        );
    }

    /**
     * Adopt a view **now**, with no easing. The path continuous input takes.
     */
    function setViewDirect(centre: Point, scale: number) {
        const next = constrained(centre, scale);
        viewport = { ...viewport, centre: next, scale };
        targetCentre = { ...next };
        targetScale = scale;
        animating = false;
        requestFrame();
    }

    /**
     * Ease towards a view. The path discrete (double-tap, wheel) and
     * programmatic (fit, toolbar zoom) input takes — animation exists to fill
     * the gap between two states the user jumped between.
     */
    function setViewAnimated(
        centre: Point,
        scale: number,
        timeConstant: number,
    ) {
        targetScale = scale;
        targetCentre = constrained(centre, scale);
        animationTimeConstant = timeConstant;
        animating = true;
        // A new target supersedes a glide; they are two ways of moving the same
        // viewport and running both would fight.
        momentum = null;
        requestFrame();
    }

    /** The whole-world fit. `animated` is false only when the scene changed. */
    function fitWorld(animated = false) {
        const bounds = worldBounds(viewportLimits().layout);
        if (!bounds || viewport.width === 0 || viewport.height === 0) return;

        const fit = fitBounds(bounds, viewport);
        if (animated) {
            setViewAnimated(fit.centre, fit.scale, ANIMATION_TIME_CONSTANT);
            return;
        }

        viewport = { ...viewport, centre: fit.centre, scale: fit.scale };
        targetCentre = fit.centre;
        targetScale = fit.scale;
        animating = false;
        momentum = null;
    }

    /**
     * Ask for a frame from **outside** the frame loop (input, resize, a decode
     * landing, the test handle).
     *
     * This is where the animation clock starts, because `lastFrameTime` is
     * otherwise whatever the last painted frame left behind — possibly minutes
     * ago, which would make the first step's elapsed enormous and snap straight
     * onto the target.
     */
    function requestFrame() {
        if (frameHandle !== null) return;
        lastFrameTime = performance.now();
        scheduleFrame();
    }

    /**
     * Ask for the next frame from **inside** the frame loop.
     *
     * Deliberately does not touch `lastFrameTime`: the frame's own timestamp is
     * the start of the next interval, so the elapsed time a step is integrated
     * over includes that frame's paint cost. Restamping the clock after painting
     * would silently exclude it and make easing speed depend on how expensive
     * the scene is to draw — the exact frame-rate dependence the elapsed-time
     * approach exists to remove.
     */
    function scheduleFrame() {
        if (frameHandle !== null) return;
        frameHandle = requestAnimationFrame(runFrame);
    }

    function settlePaintWaiters() {
        const waiters = paintWaiters;
        paintWaiters = [];
        for (const resolve of waiters) resolve();
    }

    function runFrame(now: number) {
        frameHandle = null;

        // A rAF callback scheduled from an input handler is given the timestamp
        // of the frame that was already in flight, which can be EARLIER than the
        // `performance.now()` `requestFrame` just read — so this is routinely
        // negative on the first step. Clamped to zero it is a no-op step
        // (`approach` returns `current` unchanged) and the next frame integrates
        // a proper interval; the animation is a frame late, never skipped.
        const elapsed = Math.max(0, (now - lastFrameTime) / 1000);
        lastFrameTime = now;

        if (momentum) stepMomentum(elapsed);

        if (animating) {
            // Zoom interpolates in LOG space (`approachScale`), not linearly:
            // a step from 1× to 2× and one from 8× to 16× then take the same
            // time and cover the same perceived distance. Linear interpolation
            // makes the same gesture lurch at one end of the range and crawl at
            // the other.
            const scale = approachScale(
                viewport.scale,
                targetScale,
                animationTimeConstant,
                elapsed,
            );
            const centre = {
                x: approach(
                    viewport.centre.x,
                    targetCentre.x,
                    animationTimeConstant,
                    elapsed,
                ),
                y: approach(
                    viewport.centre.y,
                    targetCentre.y,
                    animationTimeConstant,
                    elapsed,
                ),
            };

            // Settle onto the target rather than approaching it forever: below
            // a thousandth of a log unit and a hundredth of a screen pixel the
            // difference is not representable on screen.
            const scaleSettled = Math.abs(Math.log(scale / targetScale)) < 1e-3;
            const centreSettled =
                Math.abs(centre.x - targetCentre.x) * scale < 0.01 &&
                Math.abs(centre.y - targetCentre.y) * scale < 0.01;

            if (scaleSettled && centreSettled) {
                viewport = {
                    ...viewport,
                    centre: { ...targetCentre },
                    scale: targetScale,
                };
                animating = false;
            } else {
                viewport = { ...viewport, centre, scale };
            }
        }

        paint();

        if (animating || momentum) {
            scheduleFrame();
        } else {
            settlePaintWaiters();
        }
    }

    /**
     * One frame of coasting after a flick.
     *
     * The velocity carries the viewport and is itself decayed by the same
     * exponential approach — towards zero instead of towards a target — so
     * friction is frame-rate independent for the same reason the easing is.
     *
     * Momentum that runs into the pan constraint stops on that axis rather than
     * grinding against the wall for the rest of its decay.
     */
    function stepMomentum(elapsed: number) {
        if (!momentum) return;

        const wanted = {
            x: viewport.centre.x - (momentum.x * elapsed) / viewport.scale,
            y: viewport.centre.y - (momentum.y * elapsed) / viewport.scale,
        };
        const centre = constrained(wanted, viewport.scale);

        // Compared against the UNconstrained centre: a component that was
        // clipped has hit the edge and has nowhere left to go.
        const next = {
            x: centre.x === wanted.x ? momentum.x : 0,
            y: centre.y === wanted.y ? momentum.y : 0,
        };

        viewport = { ...viewport, centre };
        targetCentre = { ...centre };

        const decayed = {
            x: approach(next.x, 0, MOMENTUM_TIME_CONSTANT, elapsed),
            y: approach(next.y, 0, MOMENTUM_TIME_CONSTANT, elapsed),
        };
        momentum =
            Math.hypot(decayed.x, decayed.y) < MOMENTUM_MIN_SPEED
                ? null
                : decayed;
    }

    function paint() {
        if (!ctx) return;

        const plan = currentPlan();

        // Reconciled ONCE PER FRAME, from the frame loop — never from a pointer
        // handler. Pointer events outpace frames during a drag, so per-event
        // reconciliation would generate (and abort) several required sets per
        // frame for no gain.
        tiles.update(plan.tileRequests);
        requestMetadata(plan.metadataRequests);

        paintScene(ctx, plan, viewport, { images, tiles: tiles.get }, dpr);
    }

    /**
     * Size the backing store and the viewport from the container.
     *
     * The backing store is capped at `min(devicePixelRatio, 2)`: above 2 the
     * extra pixels cost memory and fill rate out of all proportion to what
     * anyone can see.
     *
     * The VIEWPORT keeps the rect's fractional size while only the backing store
     * is rounded. A CSS box is very often fractional (a flex row, a percentage
     * width, a fractional `devicePixelRatio`), and rounding the viewport moves
     * its centre by up to half a pixel — a systematic error the geometric
     * assertions measure against a ±1 px gate.
     */
    function measure() {
        if (!root || !surface) return;

        const rect = root.getBoundingClientRect();
        const width = Math.max(0, rect.width);
        const height = Math.max(0, rect.height);

        dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);

        const backingWidth = Math.max(1, Math.round(width * dpr));
        const backingHeight = Math.max(1, Math.round(height * dpr));
        if (
            surface.width !== backingWidth ||
            surface.height !== backingHeight
        ) {
            surface.width = backingWidth;
            surface.height = backingHeight;
        }

        const hadSize = viewport.width > 0 && viewport.height > 0;
        viewport = { ...viewport, width, height };

        // The first time the container has a size there is no view to preserve,
        // so adopt the whole-world fit.
        if (!hadSize && width > 0 && height > 0) {
            fitWorld();
        } else if (width > 0 && height > 0) {
            // The constraint is a function of the VIEWPORT as well as the world,
            // so a resize can leave a legal centre illegal — widening the window
            // reveals emptiness beside an image that was flush against the edge.
            // Re-clamped here rather than left for the next input, which may
            // never come. The animation target is moved with it, so an animation
            // in flight lands somewhere legal too.
            const scale = clampScale(viewport.scale);
            viewport = {
                ...viewport,
                scale,
                centre: constrained(viewport.centre, scale),
            };
            targetScale = clampScale(targetScale);
            targetCentre = constrained(targetCentre, targetScale);
        }

        requestFrame();
    }

    /**
     * Re-measure when `devicePixelRatio` changes.
     *
     * A ResizeObserver is not enough: dragging the window from a 1× display to a
     * 2× one changes the device-pixel ratio without changing the CSS box at all,
     * so nothing would re-measure and the backing store would stay at the old
     * resolution — a visibly soft (or needlessly heavy) canvas until something
     * else resized it.
     *
     * `matchMedia` has no "tell me whenever it changes" form, so the query is a
     * one-shot: it matches the ratio in force now and fires exactly once, when
     * that stops being true. Re-armed against the new ratio each time.
     */
    let dprQuery: MediaQueryList | null = null;

    function handleDevicePixelRatioChange() {
        measure();
        watchDevicePixelRatio();
    }

    function watchDevicePixelRatio() {
        dprQuery?.removeEventListener?.('change', handleDevicePixelRatioChange);
        dprQuery = null;

        if (typeof window.matchMedia !== 'function') return;

        const query = window.matchMedia(
            `(resolution: ${window.devicePixelRatio || 1}dppx)`,
        );
        query.addEventListener?.('change', handleDevicePixelRatioChange);
        dprQuery = query;
    }

    function unwatchDevicePixelRatio() {
        dprQuery?.removeEventListener?.('change', handleDevicePixelRatioChange);
        dprQuery = null;
    }

    // ── Input ────────────────────────────────────────────────────────────
    //
    // Pointer Events only: one input path, no mouse/touch/legacy branches, and
    // no double-click event either — a double TAP and a double CLICK are the
    // same gesture here, recognised once from pointer samples.
    //
    // The governing rule (spec §Input and animation): **continuous input is
    // never animated; discrete and programmatic input always is.** Drag and
    // pinch land in `setViewDirect`; wheel, double-tap, and fit land in
    // `setViewAnimated`.
    //
    // Which gesture is running is decided in exactly one place — the
    // recogniser's `arbitrate` — and never re-derived here. That is the seam
    // the phase-2 input-claim API is granted at (`renderer/gestureArbiter.ts`).

    const gestures = new GestureRecogniser({
        tapSlop: TAP_SLOP,
        doubleTapMs: DOUBLE_TAP_MS,
        doubleTapSlop: DOUBLE_TAP_SLOP,
        velocityWindowMs: VELOCITY_WINDOW_MS,
        minVelocitySpanMs: MIN_VELOCITY_SPAN_MS,
        minFlickSpeed: MIN_FLICK_SPEED,
    });

    /** Client-space origin of the surface, refreshed when a gesture starts. */
    let surfaceOrigin: Point = { x: 0, y: 0 };

    function refreshSurfaceOrigin() {
        if (!surface) return;
        const rect = surface.getBoundingClientRect();
        surfaceOrigin = { x: rect.left, y: rect.top };
    }

    /**
     * A pointer sample in surface-local screen coordinates.
     *
     * The mapping — including which clock stamps the sample, which is what
     * decides flick velocity — lives in `renderer/pointerSamples.ts` so it can
     * be asserted without a browser.
     */
    function sampleOf(event: PointerEvent) {
        return pointerSample(event, surfaceOrigin);
    }

    /**
     * Capture is best-effort.
     *
     * `setPointerCapture` throws `NotFoundError` for a pointer the element is
     * not currently receiving — a pointer the browser already cancelled, or a
     * synthesized one. Capture is an optimisation (it keeps a drag alive when
     * the pointer leaves the element); losing it must not abort the gesture,
     * which the recogniser tracks independently.
     */
    function capturePointer(pointerId: number) {
        try {
            surface?.setPointerCapture(pointerId);
        } catch {
            /* not capturable — the gesture proceeds uncaptured */
        }
    }

    function releasePointer(pointerId: number) {
        try {
            surface?.releasePointerCapture?.(pointerId);
        } catch {
            /* already released, or never captured */
        }
    }

    function handlePointerDown(event: PointerEvent) {
        if (!surface) return;
        // Left button (or a touch/pen contact, which also reports 0) only. A
        // right-button press opens the context menu, and starting a pan under it
        // leaves the image sliding behind an open menu with no pointer-up to
        // end the drag.
        if (event.button !== 0) return;

        refreshSurfaceOrigin();
        capturePointer(event.pointerId);

        // Momentum stops **in this frame**, unconditionally. Doing it here,
        // synchronously, rather than on the next frame is the whole of "touching
        // down during momentum stops it in the same frame": a glide is the
        // continuation of the user's own last gesture, and a hand arriving on
        // the surface is unambiguously a request for it to stop.
        //
        // An ANIMATION is deliberately NOT truncated here. A wheel zoom or a
        // double-tap zoom is a discrete jump the user asked for, and a press
        // alone is not a viewport gesture: single click is unbound, reserved for
        // annotation selection (spec §Input and animation), so freezing the zoom
        // part-way would make a stray click a viewport change. The animation is
        // instead truncated by the first gesture that actually MOVES the
        // viewport — `setViewDirect` clears `animating` on the first pan or
        // pinch update — which is the same ownership decision the arbiter
        // already made, and which a held input claim therefore never triggers.
        momentum = null;

        gestures.down(sampleOf(event));
    }

    function handlePointerMove(event: PointerEvent) {
        // A mouse with no button held is not dragging. Without this a lost or
        // refused pointer capture — the button released over a native drag, a
        // window switch, a `pointerup` swallowed by another element — leaves the
        // recogniser holding a pointer that pans on every hover, and makes the
        // next real press read as a second finger, i.e. a pinch. `buttons` is
        // meaningless for touch and pen contacts, which report 1 while down and
        // are ended by `pointerup`/`pointercancel`.
        if (event.pointerType === 'mouse' && event.buttons === 0) {
            handlePointerCancel(event);
            return;
        }

        applyGesture(gestures.move(sampleOf(event)));
    }

    function handlePointerUp(event: PointerEvent) {
        applyGesture(gestures.up(sampleOf(event)));
        releasePointer(event.pointerId);
    }

    /**
     * Also bound to `lostpointercapture`.
     *
     * Losing capture is how the browser says the input is no longer ours, and
     * without ending the gesture there the pointer is stuck down forever. After
     * a normal `pointerup` this is a no-op: the recogniser no longer tracks the
     * pointer, so the implicit capture release that follows finds nothing.
     */
    function handlePointerCancel(event: PointerEvent) {
        applyGesture(gestures.cancel(sampleOf(event)));
        releasePointer(event.pointerId);
    }

    /**
     * Turn a recognised gesture into a viewport change.
     *
     * Drag and pinch are **direct**: the transform is updated here, 1:1, with
     * no smoothing and no spring. This is the single most important
     * behavioural difference from the OpenSeadragon path, which animates the
     * pan target through the same spring it uses for zoom and so trails the
     * pointer. Painting is still once per frame — the transform is what must be
     * direct, not the number of draw calls.
     */
    function applyGesture(update: ReturnType<GestureRecogniser['move']>) {
        switch (update.kind) {
            case 'pan':
                setViewDirect(
                    {
                        x: viewport.centre.x - update.dx / viewport.scale,
                        y: viewport.centre.y - update.dy / viewport.scale,
                    },
                    viewport.scale,
                );
                return;

            case 'pinch': {
                // Scale about the midpoint the fingers were at, then translate
                // by the midpoint's own movement. Composed, that is "the world
                // under the two fingers follows the two fingers".
                const scale = clampScale(viewport.scale * update.scaleBy);
                const anchored = anchoredZoomCentre(
                    viewport,
                    update.anchor,
                    scale,
                );
                setViewDirect(
                    {
                        x: anchored.x - update.dx / scale,
                        y: anchored.y - update.dy / scale,
                    },
                    scale,
                );
                return;
            }

            case 'flick':
                momentum = update.velocity;
                requestFrame();
                return;

            case 'doubleTap':
                zoomAnchored(update.point, DOUBLE_TAP_ZOOM_FACTOR);
                return;

            // A single tap reports `none` and therefore changes nothing: it is
            // reserved for annotation selection (spec §Input and animation).
            case 'none':
                return;
        }
    }

    /** Animated zoom by `factor`, holding the world point under `anchor`. */
    function zoomAnchored(anchor: Point, factor: number) {
        const scale = clampScale(viewport.scale * factor);
        setViewAnimated(
            anchoredZoomCentre(viewport, anchor, scale),
            scale,
            ANIMATION_TIME_CONSTANT,
        );
    }

    /**
     * Wheel zoom is animated with a short time constant and anchors at the
     * pointer: the world point under the cursor stays under the cursor.
     *
     * There is deliberately **no trackpad-versus-mouse branch** here or
     * anywhere else. All wheel input is animated by the same constant. The
     * usual heuristics — delta magnitude, `ctrlKey`, the platform — all have
     * counterexamples and would be wrong on someone's hardware. This is a
     * decision, not an omission; the "fix" is tempting and must not be applied.
     */
    function handleWheel(event: WheelEvent) {
        if (!surface) return;
        event.preventDefault();

        refreshSurfaceOrigin();
        const anchor = {
            x: event.clientX - surfaceOrigin.x,
            y: event.clientY - surfaceOrigin.y,
        };

        // `deltaY` is normalized to pixels first: the event declares its own
        // unit (`deltaMode`), and a line-mode notch is ~3 where a pixel-mode one
        // is ~100. Consuming it raw would zoom a fortieth as far per notch on a
        // Firefox mouse wheel. Nothing here looks at the hardware.
        const deltaY = normalizeWheelDelta(
            event.deltaY,
            event.deltaMode,
            WHEEL_LINE_PIXELS,
            WHEEL_PAGE_PIXELS,
        );

        // Accumulated against the TARGET, not against the scale the easing
        // happens to have reached. Notches arriving faster than the animation
        // settles would otherwise each build on a partly-applied predecessor, so
        // ten quick notches would land well short of ten slow ones — and that
        // asymmetry reads as "the trackpad zooms less than the mouse wheel",
        // which is exactly what tempts a device-detection branch. There is none,
        // and the cause is here.
        const nextScale = clampScale(
            targetScale * Math.exp(-deltaY * WHEEL_ZOOM_RATE),
        );

        // Anchored in the view the notch is heading for, for the same reason:
        // resolving the anchor in a half-eased view and applying it at the
        // target scale mixes two views, and the mismatch compounds across a
        // burst. Idle, the target IS the viewport and this is the plain
        // pointer-anchored zoom.
        setViewAnimated(
            anchoredZoomCentre(
                { ...viewport, centre: targetCentre, scale: targetScale },
                anchor,
                nextScale,
            ),
            nextScale,
            WHEEL_TIME_CONSTANT,
        );
    }

    // ── Source loading ───────────────────────────────────────────────────

    /**
     * Bring the decoded images in line with what the viewer is showing.
     *
     * What changed is decided by `reconcileImages`, which compares **resolved
     * URLs** rather than canvas ids — selecting a different Choice keeps the
     * canvas id and changes only the URL, and an id-keyed cache would go on
     * painting the superseded image. Load failures and per-canvas error
     * reporting are ticket 12.
     */
    function loadStaticImages(canvases: PlannerCanvas[]) {
        const { drop, load } = reconcileImages(imageUrls, canvases);

        for (const canvasId of drop) {
            // Drop the pixels too: a stale image must stop painting the moment
            // it is superseded, not when its replacement finishes decoding.
            delete images[canvasId];
            delete imageUrls[canvasId];
        }

        for (const { canvasId, url } of load) {
            const image = new Image();
            // Decode off the main thread where the browser can.
            image.decoding = 'async';
            // `crossOrigin` is deliberately NOT set: most IIIF image servers
            // send no CORS headers, and requesting anonymous CORS would turn a
            // working image into a load failure. The cost is a tainted canvas,
            // which only matters to pixel readback — and the geometric e2e
            // fixtures are same-origin.
            image.onload = () => {
                // Still the URL this canvas wants? A Choice switch, a canvas
                // change, or unmount may have superseded this request while it
                // was in flight.
                if (imageUrls[canvasId] !== url) return;
                images[canvasId] = image;
                loadedGeneration += 1;
            };
            // Recorded BEFORE the request starts, so a second reconciliation
            // for the same URL joins the in-flight request rather than
            // restarting it.
            imageUrls[canvasId] = url;
            image.src = url;
        }
    }

    onMount(() => {
        if (!root || !surface) return;

        /*
         * `{ alpha: true }` is DELIBERATE, not an oversight — do not "optimize"
         * it to `{ alpha: false }`.
         *
         * The canvas never paints a background. The viewer background is a CSS
         * `background-color` on the parent element, driven by theme tokens, and
         * the canvas composites over it. That keeps theming entirely in CSS
         * (switching theme needs no JS at all) and makes the existing
         * `transparentBackground` config work for free. An opaque context would
         * paint the UA's default backdrop behind every frame and break both.
         */
        ctx = surface.getContext('2d', { alpha: true });

        // The metadata cache outlives this renderer, the manifest, and SPA
        // navigation, so a failure it recorded may be older than the network
        // conditions that caused it. A mount is the natural moment to give a
        // transient one another chance; a deterministic one (auth, an
        // unparseable document) is left alone.
        imageServiceCache.retryTransientFailures();

        const observer = new ResizeObserver(() => measure());
        observer.observe(root);
        measure();
        watchDevicePixelRatio();

        /*
         * Internal test handle for the geometric e2e assertions, which need a
         * deterministic viewport rather than one arrived at by synthesizing
         * gestures. Ticket 13 replaces it with real viewport command state and
         * query-only state; it exists only on the development-only renderer and
         * is never part of the published surface.
         */
        (
            surface as HTMLCanvasElement & { __triiiceratopsRenderer?: unknown }
        ).__triiiceratopsRenderer = {
            getView: () => ({
                centre: { ...viewport.centre },
                scale: viewport.scale,
                width: viewport.width,
                height: viewport.height,
                dpr,
            }),
            setView: (view: { centre: Point; scale: number }) => {
                viewport = {
                    ...viewport,
                    centre: { ...view.centre },
                    scale: view.scale,
                };
                targetCentre = { ...view.centre };
                targetScale = view.scale;
                animating = false;
                momentum = null;
                return nextPaint();
            },
            /**
             * Fit-bounds is ANIMATED (spec §Input and animation: programmatic
             * input always is). `nextPaint` already resolves only once the
             * viewport has settled, so callers need no extra wait.
             */
            fit: () => {
                fitWorld(true);
                return nextPaint();
            },
            /** Animated zoom about a surface-local point — the toolbar's shape. */
            zoomAt: (anchor: Point, factor: number) => {
                zoomAnchored(anchor, factor);
                return nextPaint();
            },
            isMoving: () => animating || momentum !== null,
            /**
             * Residency and decoded-byte counters.
             *
             * A first-class renderer feature, not a test retrofit: browser heap
             * metrics cannot gate tile memory, because decoded images live
             * outside the JS heap and a heap ceiling reads near-flat while tiles
             * leak. Ticket 13 promotes these to real query-only state.
             */
            getStats: () => ({
                residentTileCount: tiles.residentTileCount,
                decodedBytes: tiles.decodedBytes,
                tileRequestCount: tiles.requestCount,
                /**
                 * Full scene plans built. Once per painted frame — never per
                 * pointer event, which is what the drag test asserts.
                 */
                scenePlanCount,
            }),
            /**
             * canvasId → why its image service failed, for the canvases whose
             * metadata never arrived. The seam ticket 12's error UI reads.
             */
            getMetadataFailures: () => ({ ...metadataFailures }),
            nextPaint,
        };

        return () => {
            observer.disconnect();
            unwatchDevicePixelRatio();
            if (frameHandle !== null) cancelAnimationFrame(frameHandle);
            frameHandle = null;
            animating = false;
            momentum = null;
            settlePaintWaiters();
            for (const id of Object.keys(images)) delete images[id];
            // Also clears the in-flight requests: an `onload` that lands after
            // unmount finds no wanted URL and discards itself.
            for (const id of Object.keys(imageUrls)) delete imageUrls[id];
            // Aborts every outstanding tile request and closes every decoded
            // tile. The METADATA cache is deliberately left alone: it is
            // page-shared and outlives the renderer, which is what makes
            // remounting free.
            tiles.dispose();
        };
    });

    function nextPaint(): Promise<void> {
        return new Promise<void>((resolve) => {
            paintWaiters.push(resolve);
            requestFrame();
        });
    }

    $effect(() => {
        // `tileSources` is read purely as the change signal the viewer already
        // computes: a new canvas, mode, or direction produces new sources, and
        // that is when the view must be refitted.
        void tileSources;
        const canvases = plannerCanvases;

        loadStaticImages(canvases);
        fitWorld();
        requestFrame();
    });

    $effect(() => {
        // Repaint when a decoded image, a decoded tile, or image-service
        // metadata lands.
        void loadedGeneration;
        requestFrame();
    });
</script>

<!--
    NOTE: this wrapper must NOT be called `viewer-root`. That class is reserved
    for TriiiceratopsViewer's single root element: the published light-DOM
    stylesheet is scoped by src/packaging/scopeViewerRoot.ts, which rewrites
    `:where(:root, :host)` to `:where(.viewer-root)` — turning the base token
    block into a real DECLARATION of every `--tri-*`/`--ui-*` token on ANY
    element with the class. A declaration beats inheritance, so a nested
    `viewer-root` shadows the root's `[data-theme]` / `themeConfig` values for
    its whole subtree (this painted the canvas stock-light in every theme).
    Guarded by src/packaging/viewerRootUnique.test.ts.
-->
<div
    bind:this={root}
    class="renderer-root"
    class:has-bg={!viewerState.config.transparentBackground}
    data-testid="canvas-renderer-root"
>
    <canvas
        bind:this={surface}
        class="renderer-surface"
        data-testid="canvas-renderer-surface"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerCancel}
        onlostpointercapture={handlePointerCancel}
        onwheel={handleWheel}
    ></canvas>
</div>

<style>
    /* See the note on the markup: this is deliberately NOT `.viewer-root`. */
    .renderer-root {
        width: 100%;
        height: 100%;
        position: relative;
        /* Pan and zoom are ours; the browser must not also scroll or
           pinch-zoom the page from gestures on this surface. */
        touch-action: none;
    }

    /*
     * The viewer background lives HERE, in CSS, and never on the canvas. The
     * canvas has an alpha channel and composites over this, so switching theme
     * re-resolves the token with no JS involvement, and
     * `transparentBackground` is simply the absence of this class.
     */
    .renderer-root.has-bg {
        background-color: var(--tri-viewer-bg);
    }

    .renderer-surface {
        display: block;
        width: 100%;
        height: 100%;
        touch-action: none;
    }
</style>
