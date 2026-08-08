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
     * input model (drag, flick momentum, pinch, wheel, double-tap), keyboard
     * operation, and reduced motion. The size-ladder source is ticket 06,
     * multi-canvas layout ticket 07, annotation overlays ticket 14.
     */
    import { onMount } from 'svelte';

    import { getMessages } from '../state/i18n.svelte';
    import { toPlannerCanvases } from '../renderer/canvasDescriptors';
    import { GestureRecogniser } from '../renderer/gestureArbiter';
    import { reconcileImages } from '../renderer/imageRequests';
    import { PAN_KEYS, keyPanVelocity } from '../renderer/keyboardPan';
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
        KEY_PAN_SHIFT_FACTOR,
        KEY_PAN_SPEED,
        KEY_PAN_STEP,
        KEY_ZOOM_FACTOR,
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
    import { watchReducedMotion } from '../state/reducedMotion';
    import type { ViewerState } from '../state/viewer.svelte';

    let {
        tileSources,
        viewerState,
    }: { tileSources: unknown; viewerState: ViewerState } = $props();

    const m = getMessages();

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
    /**
     * Held-key pan velocity, in **screen** px/s, or `null` when no arrow is
     * down.
     *
     * Distinct from `momentum` because it does not decay: a held key travels at
     * a steady rate for as long as it is held, and only becomes momentum — with
     * the same friction as a flick — when the key comes up.
     */
    let keyPan: Point | null = null;
    /**
     * Which bound pan keys are currently down. See `renderer/keyboardPan.ts`.
     *
     * A plain record for the same reason `images` below is one, and not a
     * `SvelteSet`: it is read by the frame loop and by the key handlers, never
     * by the reactive graph, so reactivity would only schedule an effect per
     * key-repeat event.
     */
    const heldPanKeys: Record<string, true> = Object.create(null);
    /** Whether Shift is held, tracked separately so it can be pressed second. */
    let panShift = false;
    /**
     * Whether the user has asked for reduced motion.
     *
     * Read from `matchMedia` rather than from CSS because **this viewport's
     * easing is JS-driven**: the global CSS guard in `styles/base.css` zeroes
     * transition and animation durations, and not one frame of a wheel zoom, a
     * fit, or a flick passes through either. Honoring the preference here is
     * the behaviour change the spec calls for (§Reduced motion) — snap-to
     * instead of glide.
     *
     * Deliberately not `$state`: it is read by the frame loop and by input
     * handlers, never by the reactive graph.
     */
    let reducedMotion = false;
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
     *
     * Under reduced motion the gap is simply not filled: the view is adopted in
     * this frame. This is the single choke point for **every** animated
     * viewport change, which is what makes "all viewport animation becomes
     * instant" a property of the component rather than of each caller
     * remembering to check.
     */
    function setViewAnimated(
        centre: Point,
        scale: number,
        timeConstant: number,
    ) {
        if (reducedMotion) {
            momentum = null;
            setViewDirect(centre, scale);
            return;
        }

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

        if (keyPan) stepKeyPan(elapsed);
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

        if (animating || momentum || keyPan) {
            scheduleFrame();
        } else {
            settlePaintWaiters();
        }
    }

    /**
     * One frame of held-key panning.
     *
     * Deliberately **undecayed**, unlike `stepMomentum`: the key is still down,
     * so the user is still asking to move, and applying friction to a held key
     * would make it crawl to a halt while held. The rate is a constant, which
     * is exactly the "steady rate, no acceleration, no judder" the ticket asks
     * for — and it holds however often the OS repeats the key-down, because
     * repeats never touch the velocity (`keyboardPan.keyPanVelocity` is a
     * function of which keys are down).
     */
    function stepKeyPan(elapsed: number) {
        if (!keyPan) return;

        const centre = constrained(
            {
                x: viewport.centre.x + (keyPan.x * elapsed) / viewport.scale,
                y: viewport.centre.y + (keyPan.y * elapsed) / viewport.scale,
            },
            viewport.scale,
        );

        viewport = { ...viewport, centre };
        targetCentre = { ...centre };
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

    /**
     * Track `prefers-reduced-motion`, through the viewer-wide watcher in
     * `state/reducedMotion.ts` — the same one the chrome's transitions consult,
     * so a mid-session toggle reaches the viewport and the drawer at the same
     * instant. Subscribed in `onMount`, so nothing here touches `window` at
     * module scope.
     */
    let unwatchMotion: (() => void) | null = null;

    function handleMotionPreferenceChange(reduced: boolean) {
        reducedMotion = reduced;
        if (!reduced) return;

        // Turning the preference ON is a request for the motion to stop NOW,
        // and the two continuous velocities are motion the user is no longer
        // asking for frame by frame. Without this the surface goes on coasting
        // at `KEY_PAN_SPEED` from a still-live `keyPan` while the reduced-motion
        // branch of `handleKeyDown` also steps it instantly on top — faster
        // than the animated path the user just opted out of.
        //
        // Same teardown as `handleBlur`: a hold whose key-up may now be
        // delivered under different rules is a hold with no author.
        handleBlur();
        momentum = null;

        // An animation already in flight is left to land: cutting it mid-glide
        // is itself a jump. What matters is that the next one does not start.
    }

    function startWatchingReducedMotion() {
        unwatchMotion = watchReducedMotion(handleMotionPreferenceChange);
    }

    function unwatchReducedMotion() {
        unwatchMotion?.();
        unwatchMotion = null;
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
        //
        // A held ARROW ends here for the momentum reason, not the animation
        // one: it is a continuous velocity, and the hand arriving asks for it
        // to stop just as unambiguously. Left running, each frame would add
        // `KEY_PAN_SPEED` on top of every `setViewDirect` the drag performs and
        // the image would slide out from under the cursor, breaking the one
        // invariant a drag has. (Symmetrically, an arrow released mid-drag would
        // hand its velocity to `momentum` with the pointer still down.) The
        // key-up still arrives and finds nothing held, which is a no-op.
        momentum = null;
        handleBlur();

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
                // Momentum is motion the user did not ask for frame by frame —
                // the viewport keeps going after the hand has left. Under
                // reduced motion the release simply stops (spec §Reduced
                // motion); the pan itself, being direct, is untouched.
                if (reducedMotion) return;
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

    // ── Keyboard ─────────────────────────────────────────────────────────
    //
    // Every binding here is on the SURFACE ELEMENT, never on the document.
    // Arrow keys already rove focus inside the viewer's menus, listboxes, and
    // panels, and a document-level listener would pan the image from all of
    // them (spec §Keyboard). The surface being focusable is what scopes these:
    // no focus, no keydown, no binding.
    //
    // Page Up/Down are deliberately unbound — see `renderer/keyboardPan.ts`.

    function heldKeyCount(): number {
        return Object.keys(heldPanKeys).length;
    }

    function clearHeldKeys() {
        for (const key of Object.keys(heldPanKeys)) delete heldPanKeys[key];
    }

    /**
     * Recompute the held-key velocity and start (or keep) the frame loop.
     *
     * Called on every key-down for a bound key, INCLUDING OS repeats. That is
     * safe precisely because `keyPanVelocity` is a function of which keys are
     * down: a repeat recomputes the same velocity rather than adding to it.
     */
    function startKeyPan() {
        const velocity = keyPanVelocity(Object.keys(heldPanKeys), panShift, {
            panSpeed: KEY_PAN_SPEED,
            shiftFactor: KEY_PAN_SHIFT_FACTOR,
        });
        if (!velocity) {
            stopKeyPan();
            return;
        }

        // A key press is a viewport gesture, so it truncates whatever the
        // viewport was doing — the same ownership decision `setViewDirect`
        // makes for a drag.
        animating = false;
        momentum = null;
        keyPan = velocity;
        requestFrame();
    }

    /** Stop dead, carrying nothing over. Used when focus leaves mid-hold. */
    function stopKeyPan() {
        keyPan = null;
    }

    /**
     * A bound key came up.
     *
     * With other arrows still down the velocity is simply recomputed. With the
     * last one released the travel becomes momentum and decays under the same
     * friction as a flick (spec §Keyboard) — under reduced motion it just
     * stops.
     *
     * `momentum` is the negation of `keyPan`: momentum is the *pointer's*
     * velocity (`stepMomentum` subtracts it from the centre), where `keyPan` is
     * the centre's own.
     */
    function releaseKeyPan() {
        if (heldKeyCount() > 0) {
            startKeyPan();
            return;
        }

        const last = keyPan;
        keyPan = null;
        if (!last || reducedMotion) return;

        momentum = { x: -last.x, y: -last.y };
        requestFrame();
    }

    /**
     * One instant pan step — the reduced-motion form of held-key panning.
     *
     * One step per **deliberate press**: `handleKeyDown` drops OS key repeats
     * before calling this. A step per repeat event would travel
     * `KEY_PAN_STEP` × ~30 per second — several times faster, and far less
     * controllable, than the `KEY_PAN_SPEED` glide the reduced-motion user
     * opted out of, which is precisely the inversion WCAG 2.3.3 exists to
     * prevent. Rate must never be a function of how many repeats the OS chose
     * to send; the animated path gets that from the velocity model, and this
     * path gets it by counting only presses.
     */
    function stepPanInstant(direction: Point, shift: boolean) {
        const step = KEY_PAN_STEP * (shift ? KEY_PAN_SHIFT_FACTOR : 1);
        setViewDirect(
            {
                x: viewport.centre.x + (direction.x * step) / viewport.scale,
                y: viewport.centre.y + (direction.y * step) / viewport.scale,
            },
            viewport.scale,
        );
    }

    /**
     * Animated zoom about the viewport centre — the `+`/`-` binding.
     *
     * Accumulated against the TARGET rather than the current scale, for the
     * same reason `handleWheel` is: a held key repeats far faster than the
     * animation settles, and building each step on a partly-eased predecessor
     * would make a held key cover less ground than the same number of
     * deliberate presses.
     */
    function zoomByKey(factor: number) {
        setViewAnimated(
            { ...targetCentre },
            clampScale(targetScale * factor),
            ANIMATION_TIME_CONSTANT,
        );
    }

    /**
     * The discrete bindings: **one press, one step.**
     *
     * Unlike an arrow — which drives a velocity, so the thirtieth repeat
     * recomputes the same rate the first one did — these ACCUMULATE against
     * the animation target. An OS repeat at ~30 Hz would compound
     * `KEY_ZOOM_FACTOR` thirty times a second (1.5¹² ≈ 130× in under half a
     * second, straight into `clampScale`'s ceiling) and re-arm the fit
     * animation on every repeat. A repeat is not a second deliberate press.
     */
    const DISCRETE_KEYS = new Set(['+', '=', '-', '_', '0', 'Home']);

    /**
     * A hold cannot survive the Meta key.
     *
     * While Meta (Cmd) is down, macOS delivers no `keyup` for other keys. Hold
     * an arrow, press Cmd, release the arrow, release Cmd, and `handleKeyUp`
     * never sees the arrow at all: it stays in `heldPanKeys`, the surface pans
     * forever, the frame loop never settles, and every `nextPaint` waiter
     * hangs with it. Treat the modifier arriving — on either a key-down or a
     * key-up — as the end of any hold, which is the same thing losing focus
     * means.
     */
    function endHoldUnderMeta(event: KeyboardEvent): boolean {
        if (!event.metaKey) return false;
        handleBlur();
        return true;
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (endHoldUnderMeta(event)) return;

        // A modified key belongs to the browser or the OS (Ctrl+Minus is the
        // page zoom, Cmd+Left is history). Shift is ours — it is the "pan
        // further" modifier.
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        if (event.key === 'Shift') {
            panShift = true;
            if (heldKeyCount() > 0) startKeyPan();
            return;
        }

        const direction = PAN_KEYS[event.key];
        if (direction) {
            event.preventDefault();
            panShift = event.shiftKey;

            if (reducedMotion) {
                // Repeats dropped: see `stepPanInstant`. The held-key velocity
                // is deliberately not started either — under the preference a
                // held arrow simply does nothing more than its first press.
                if (!event.repeat) stepPanInstant(direction, event.shiftKey);
                return;
            }

            heldPanKeys[event.key] = true;
            startKeyPan();
            return;
        }

        // Claimed and de-repeated in one place, so no binding below can forget
        // either.
        if (!DISCRETE_KEYS.has(event.key)) return;
        event.preventDefault();
        if (event.repeat) return;

        switch (event.key) {
            // `=` and `_` are the unshifted keys `+` and `-` share, so a
            // keyboard that needs Shift for `+` works without it too.
            case '+':
            case '=':
                zoomByKey(KEY_ZOOM_FACTOR);
                return;
            case '-':
            case '_':
                zoomByKey(1 / KEY_ZOOM_FACTOR);
                return;
            case '0':
            case 'Home':
                fitWorld(true);
                return;
        }
    }

    function handleKeyUp(event: KeyboardEvent) {
        if (endHoldUnderMeta(event)) return;

        if (event.key === 'Shift') {
            panShift = false;
            if (heldKeyCount() > 0) startKeyPan();
            return;
        }

        if (!PAN_KEYS[event.key]) return;
        event.preventDefault();
        delete heldPanKeys[event.key];
        releaseKeyPan();
    }

    /**
     * Focus left the surface mid-hold — and the general "this hold is over,
     * and its key-up is not coming" teardown.
     *
     * The key-up will be delivered somewhere else, so without this the view
     * pans forever. Stops dead rather than handing over to momentum: a glide
     * that outlives the focus it was driven from has no author.
     *
     * Also reached from the Meta guard, from the reduced-motion watcher, and
     * from the window-level listeners below. Every one of those is the same
     * failure — a key-up that will never arrive — and a stranded `keyPan` is
     * not merely a visual bug: the frame loop never settles, `isMoving()`
     * stays true, and `nextPaint` waiters never resolve.
     */
    function handleBlur() {
        clearHeldKeys();
        panShift = false;
        stopKeyPan();
    }

    /**
     * The window itself lost the keyboard (alt-tab, a native menu, a devtools
     * window), or the tab went to the background.
     *
     * The element's own `blur` does not always fire for these — and when the
     * OS takes the keyboard mid-hold the key-up lands in whatever took it.
     * This is the safety net that makes "the surface can never be left panning
     * forever" true rather than merely usual.
     */
    function handleWindowBlur() {
        handleBlur();
    }

    function handleVisibilityChange() {
        if (document.hidden) handleBlur();
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

        // Before anything can animate: the first fit and every input path
        // downstream of it consult this.
        startWatchingReducedMotion();

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

        // The only document/window-level listeners this component installs, and
        // they bind nothing: they end a hold, they never start one. The
        // bindings themselves stay on the surface element (spec §Keyboard).
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);

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
            isMoving: () => animating || momentum !== null || keyPan !== null,
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
            unwatchReducedMotion();
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
            if (frameHandle !== null) cancelAnimationFrame(frameHandle);
            frameHandle = null;
            animating = false;
            momentum = null;
            clearHeldKeys();
            keyPan = null;
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
<!--
    The image surface is a real tab stop with a role and an accessible name
    (spec §Keyboard).

    The focus target is this WRAPPER rather than the `<canvas>` inside it, and
    that is the same division of labour the spec draws for overlays: the canvas
    paints pixels, a DOM layer carries the focusable, labelled targets. A canvas
    element is interactive content in its own right, so giving it a widget role
    is a contradiction assistive technology has no good answer to; the box
    around it has no implicit role to contradict. Clicking the canvas still
    focuses this, because the browser focuses the nearest focusable ancestor.

    `role="application"` because arrow keys mean something HERE that they do not
    mean anywhere else in the viewer: a screen reader must pass them through
    rather than use them to browse its own way around. This is the narrowest
    scope that claim can be made in — one element, whose only child paints.

    CONSTRAINT ON THIS SUBTREE, for whoever adds the next child: `application`
    suppresses browse mode for the WHOLE subtree, not just this element, and it
    is the only role NVDA and JAWS pass arrows through — so it stays. The price
    is that any non-canvas descendant becomes unreadable in browse mode:
    ordinary text, a heading, an error message, a list of annotations would all
    be skipped over. Ticket 12's error UI and ticket 14's annotation overlay are
    both slated to land inside here. Each such child must either carry
    `role="document"` (which restores browse mode for its own subtree) or be
    hoisted OUT of this element and rendered as a sibling. Recorded in
    lint-allowlist.md entry 7.

    It sits ahead of the annotation overlay's focusable shapes in DOM order, so
    Tab goes surface → annotations: the picture before the things marked on it.

    The two suppressions below are recorded in lint-allowlist.md. Svelte's
    heuristic classifies every ARIA role outside the widget set as
    non-interactive, and `application` — whose entire purpose is to declare that
    this element handles its own keys — is one of them. There is no role that
    both describes a pan/zoom surface honestly and satisfies the heuristic, and
    the accessible name, focus ring, and key bindings the rules exist to demand
    are all present.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    bind:this={root}
    class="renderer-root"
    class:has-bg={!viewerState.config.transparentBackground}
    data-testid="canvas-renderer-root"
    tabindex="0"
    role="application"
    aria-label={m.canvas_surface_label()}
    onkeydown={handleKeyDown}
    onkeyup={handleKeyUp}
    onblur={handleBlur}
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

    /*
     * The visible focus ring — a NEW visual affordance, and an accepted design
     * cost rather than an oversight. The OpenSeadragon path suppressed focus on
     * this surface outright (`tabIndex: ''`, "This prevents the focus outline
     * from appearing"); a surface that is operable by keyboard must show where
     * the keyboard is (WCAG 2.4.7).
     *
     * Drawn INSIDE the element (`outline-offset` is negative, where the global
     * rule in styles/base.css offsets outward). The surface fills the viewer to
     * its edges, so an outward ring would be drawn over the chrome that abuts
     * it, or clipped away entirely by an overflow boundary. Thicker than the
     * global 2px for the same reason: there is no gap between ring and content
     * to separate them.
     *
     * `:focus-visible`, not `:focus`, so clicking the image to pan does not
     * ring it.
     *
     * **TWO-TONE, and that is what makes it visible at all.** Drawn inside, the
     * ring's neighbour is not the viewer background but the CANVAS — arbitrary
     * image pixels, which whenever the image fills the viewport is the common
     * case, not the exception. With `transparentBackground` set there is not
     * even a known colour behind it. A single-colour indicator over content
     * nobody chose has no contrast guarantee at all, so the ring carries its own
     * contrast: an outer band in `--tri-color-primary-text` and an inner band in
     * `--tri-viewer-bg`, which clear 3:1 AGAINST EACH OTHER in all four themes
     * (the standard technique for an indicator over unknown content, and the
     * adjacent-contrast allowance in WCAG 2.4.11/1.4.11). Whatever the image is
     * doing underneath, one of the two bands stands off it. Gated by
     * `pnpm test:contrast`, which carries the pairing.
     *
     * `--tri-color-primary-TEXT`, not `--tri-color-primary`, for the outer band:
     * the raw primary is a fill colour and reaches only 2.03:1 (light) and
     * 1.40:1 (teal) against `--tri-viewer-bg`. The `-text` variant is the
     * palette's legible-on-a-surface form.
     *
     * The inner band is a PSEUDO-ELEMENT rather than a second `box-shadow` on
     * the root: an inset shadow paints above the element's background but below
     * its content, so the canvas would cover it. An absolutely-positioned
     * pseudo-element is positioned content and paints above the in-flow canvas
     * — the same place the outline itself lands.
     */
    .renderer-root:focus-visible {
        outline: 3px solid var(--tri-color-primary-text);
        outline-offset: -3px;
    }

    .renderer-root:focus-visible::after {
        content: '';
        position: absolute;
        /* Immediately inside the outline's 3px band, so the two are adjacent
           with no image pixels between them. */
        inset: 3px;
        pointer-events: none;
        box-shadow: inset 0 0 0 2px var(--tri-viewer-bg);
    }
</style>
