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
     * The one renderer the viewer mounts: there is no renderer selection, no
     * build flag, and no alternative (ADR 0012).
     *
     * ## SSR
     *
     * Nothing in this component's module graph touches `window`, `document`, or
     * `navigator` at module scope. Being first-party code there is no need for
     * the dynamic library import the previous renderer's component needed: the
     * canvas element renders as inert markup on the server and the 2D context is
     * acquired in `onMount`.
     *
     * ## Scope
     *
     * The canvases on screen — one in individuals mode, a facing-page spread in
     * paged mode, and the **whole manifest** in continuous mode — from any of
     * the three source kinds; the full pointer input model (drag, flick
     * momentum, pinch, wheel, double-tap), keyboard operation, and reduced
     * motion.
     *
     * The **paint hook** is here too (ticket 14): registered layers are drawn
     * each frame after the tiles, under the transform `paintScene` left applied,
     * and core registers one of its own. The annotation overlays are NOT — they
     * are DOM layers mounted beside this component by `TriiiceratopsViewer`, on
     * the frame cadence and the public coordinate helpers, so they know nothing
     * about which renderer is mounted.
     *
     * ## Virtualization (ticket 08)
     *
     * A continuous manifest of any length is laid out in full, because layout
     * is pure arithmetic over manifest dimensions and costs no network. What is
     * bounded is what may HOLD anything: the planner's residency window keeps
     * everything but the canvases near the viewport in the box tier, so opening
     * an 800-folio manuscript costs O(1) requests, and the tile scheduler's
     * byte-budgeted **opportunistic cache** bounds the pixels. This component's
     * share of that is three things: feeding the planner the whole manifest,
     * loading a static canvas's image only while it is out of the box tier, and
     * telling the scheduler which byte ceiling this device gets.
     */
    import { onMount, untrack } from 'svelte';

    import { getMessages } from '../state/i18n.svelte';
    import { logger } from '../logging/logger';
    import { getCanvasId } from '../utils/iiifIds';
    import { getVisibleCanvasEntries } from './viewerControls';
    import { toPlannerCanvases } from '../renderer/canvasDescriptors';
    import { GestureRecogniser } from '../renderer/gestureArbiter';
    import { reconcileImages } from '../renderer/imageRequests';
    import { PAN_KEYS, keyPanVelocity } from '../renderer/keyboardPan';
    import {
        createTileSourceErrorMirror,
        errorPlacements,
        samePlacements,
        viewerLevelErrorKind,
        type CanvasErrorKind,
        type CanvasErrorPlacement,
    } from '../renderer/canvasErrors';
    import { imageServiceCache } from '../renderer/imageService';
    import { staticImageFailures } from '../renderer/staticImageFailures';
    import {
        boxContains,
        canvasBoxToWorld,
        canvasPointToWorld,
        canvasScaleFactor,
        fitTargetBounds,
        navigationTargetBounds,
        reflowShift,
        worldBoxToCanvas,
        worldPointToCanvas,
        type CanvasPlacement,
    } from '../renderer/layoutQueries';
    import type { RendererPort } from '../renderer/rendererPort';
    import { markRendererPort } from '../renderer/rendererPortBrand';
    import {
        imageAdjustmentsToCssFilter,
        type ContainerSize,
        type ImageAdjustments,
        type ViewportBox,
        type ViewportPoint,
    } from '../types/viewport';
    import { paintScene } from '../renderer/paintScene';
    import {
        drawPaintLayers,
        paintCanvasSpace,
        type PaintFrame,
        type RegisteredPaintLayer,
    } from '../renderer/paintLayers';
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
        MULTI_CANVAS_GAP_FRACTION,
        resolveByteBudget,
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
    import type { Box } from '../renderer/tilePyramid';
    import type {
        ImageServiceFacts,
        LayoutRect,
        PlannerBudgets,
        PlannerCanvas,
        Point,
        ResidencyTier,
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
        zoomRange,
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
     * The planner's policy inputs — thresholds, the residency margin, and the
     * decoded-byte ceiling.
     *
     * A `let` for exactly one member: `byteBudget` is the only budget that is
     * not knowable before mount, because which ceiling a device gets is a
     * question for `matchMedia` (`rendererDefaults.resolveByteBudget`) — and it
     * is a live one, so this is reassigned whenever that query changes (see
     * `applyByteBudget`). Nothing else in here varies at runtime.
     *
     * The consumer's `ViewerConfig.renderer` overrides land here too, through
     * {@link configuredBudgets} — a **closed** set of named knobs, not an open
     * options object. A configured `byteBudget` wins over the device ceiling,
     * because a consumer who states a number has more context than a media
     * query does.
     *
     * Deliberately not `$state`: read by the frame loop, never by the reactive
     * graph.
     */
    let budgets = configuredBudgets(DEFAULT_BUDGETS);

    /**
     * Apply `ViewerConfig.renderer` over a set of budgets.
     *
     * Every member is optional and each is checked for being a usable number,
     * so a config carrying `undefined`, `null`, or a stray `NaN` from a JSON
     * round-trip takes core's default rather than poisoning the planner with a
     * threshold nothing compares true against.
     */
    function configuredBudgets(base: PlannerBudgets): PlannerBudgets {
        const config = viewerState.config?.renderer;
        if (!config) return base;
        const usable = (value: number | undefined): value is number =>
            typeof value === 'number' && Number.isFinite(value) && value > 0;
        return {
            byteBudget: usable(config.byteBudget)
                ? config.byteBudget
                : base.byteBudget,
            marginFactor: usable(config.residencyMargin)
                ? config.residencyMargin
                : base.marginFactor,
            pyramidThreshold: usable(config.pyramidThreshold)
                ? config.pyramidThreshold
                : base.pyramidThreshold,
            boxThreshold: usable(config.boxThreshold)
                ? config.boxThreshold
                : base.boxThreshold,
            minPixelRatio: usable(config.minPixelRatio)
                ? config.minPixelRatio
                : base.minPixelRatio,
            maxDecodedPixels: base.maxDecodedPixels,
        };
    }

    /**
     * The time constant every programmatic and discrete animation runs at, from
     * `ViewerConfig.renderer.animationTimeConstant`.
     */
    function animationTime(): number {
        const configured = viewerState.config?.renderer?.animationTimeConstant;
        return typeof configured === 'number' &&
            Number.isFinite(configured) &&
            configured > 0
            ? configured
            : ANIMATION_TIME_CONSTANT;
    }

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
        // The desktop ceiling until `onMount` has a window to ask which one
        // this device actually gets. Constructing the scheduler lazily instead
        // would put a null check on every call site for one number.
        byteBudget: budgets.byteBudget,
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

    /** Bumped whenever {@link knownMetadata} gains an entry. */
    let metadataRevision = 0;

    /**
     * The last answer `viewportLimits()` gave, and the inputs it gave it for.
     *
     * Memoized because clamping runs on every pointer sample and layout is now
     * a function of the WHOLE manifest: at a 120 Hz pinch on an 800-folio
     * world, laying all 800 canvases out twice per sample is several percent of
     * a core spent re-deriving an answer that changes only when the manifest,
     * the mode, or a canvas's fetched dimensions do. The memo is keyed on
     * exactly those; `planViewportLimits` remains the pure function it was and
     * this holds nothing it decided.
     */
    let limitsMemo: {
        canvases: PlannerCanvas[];
        mode: ReturnType<typeof worldInput>['mode'];
        direction: ReturnType<typeof worldInput>['direction'];
        preserveCanvasScale: boolean;
        budgets: PlannerBudgets;
        metadataRevision: number;
        value: ReturnType<typeof planViewportLimits>;
    } | null = null;

    /**
     * canvasId → why that canvas has no pixels, for the canvases that failed.
     *
     * **The source of truth for error state** (spec §Errors). An `info.json` that
     * answered `401`, one that answered nothing usable, or a static image whose
     * decode failed all land here, against the canvas they belong to and nowhere
     * else — which is what lets folio 400 fail while 1–399 keep displaying.
     * `errorPlacements` turns it into placeholders and `viewerLevelErrorKind`
     * decides whether it adds up to a viewer-level condition; neither is decided
     * here.
     *
     * `$state`, unlike the other frame-loop records in this component, because it
     * is read by the MARKUP as well as by the frame loop: the placeholder is a DOM
     * element with an accessible name, per ticket 14's rule that anything a user
     * must perceive lives in the DOM layer rather than in painted pixels. It
     * changes at the rate canvases fail — a handful of times per session, never
     * per frame — so reactivity costs nothing here.
     */
    let canvasErrors: Record<string, CanvasErrorKind> = $state({});

    /**
     * The placeholders to draw, in surface-local CSS pixels — recomputed from the
     * frame loop, and empty in the overwhelmingly common case of nothing having
     * failed.
     *
     * Held separately from {@link canvasErrors} because a placeholder's POSITION
     * is a function of the viewport, which is deliberately not reactive: it moves
     * every frame of a pan, and driving the reactive graph from the viewport is
     * the cost the frame loop exists to avoid. So the frame loop pushes the
     * answer in, and only when it has changed.
     */
    let errorLayer: CanvasErrorPlacement[] = $state([]);

    function errorLabel(kind: CanvasErrorKind): string {
        // The auth/load distinction, all the way to the reader: knowing whether
        // logging in would help is the difference between a useful error and a
        // shrug (user story 27).
        return kind === 'auth' ? m.canvas_error_auth() : m.canvas_error_load();
    }

    /**
     * The canvases this renderer is showing, in **canvas space**.
     *
     * **Continuous mode is the whole manifest**, all 800 folios of it. That is
     * not the fetch storm this epic exists to remove, and the distinction is
     * the ticket: laying a canvas out is arithmetic over manifest dimensions
     * and costs nothing, while FETCHING for it is gated by the planner's
     * residency window, which keeps every canvas the viewport is nowhere near
     * in the box tier. The world has to be positioned in full either way —
     * scrolling to folio 400 is a coordinate, and its coordinate is the sum of
     * the 399 canvases before it.
     *
     * In every other mode which canvases those are is `getVisibleCanvasEntries`'
     * decision, not this component's — the same function the choice controls,
     * the search-result offsets, and the export path all ask, so the
     * renderer can never disagree with the rest of the viewer about what a
     * spread is. In paged mode that is the facing-page group; otherwise it is
     * the current canvas alone.
     */
    const plannerCanvases: PlannerCanvas[] = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) return [];

        if (viewerState.viewingMode === 'continuous') {
            const canvases = viewerState.canvases;
            // Track exactly TWO signals per canvas — its id, and the Choice
            // selected on it — and nothing else.
            //
            // `viewerState.canvases` is raw manifest JSON behind a deep
            // `$state` proxy, so every property this walk touches would
            // otherwise become a dependency of this derivation: on 800 folios
            // that is tens of thousands of signals to create and to invalidate,
            // and it costs seconds. What this derivation actually depends on is
            // which canvases there are and which Choice each has, so those are
            // read tracked and the walk itself is untracked. The manifest JSON
            // is immutable once cached, which is what makes that sound.
            // A plain Map, not a SvelteMap: it is built and consumed inside
            // this one derivation and is unreachable afterwards, so there is
            // nothing for reactivity to notify. A SvelteMap here would create a
            // signal per folio for no reader at all.
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            const choices = new Map<string, string | undefined>();
            for (const canvas of canvases) {
                const canvasId = getCanvasId(canvas);
                if (canvasId) {
                    choices.set(
                        canvasId,
                        viewerState.getSelectedChoice(canvasId),
                    );
                }
            }

            return untrack(() =>
                toPlannerCanvases(canvases, (canvasId) =>
                    choices.get(canvasId),
                ),
            );
        }

        const visible = getVisibleCanvasEntries({
            // `viewerState.canvases`, not `getCanvases(manifestId)`: the
            // former honours the selected sequence and the latter always reads
            // sequence 0, and `currentCanvasIndex` is an index into the former.
            // Mixing them would index a v2 multi-sequence manifest's second
            // sequence with a position from its first.
            canvases: viewerState.canvases,
            currentCanvasId: viewerState.canvasId,
            currentCanvasIndex: viewerState.currentCanvasIndex,
            viewingMode:
                viewerState.viewingMode === 'paged' ? 'paged' : 'individuals',
            pagedOffset: viewerState.pagedOffset,
        });

        return toPlannerCanvases(
            visible.map((entry) => entry.canvas),
            (canvasId) => viewerState.getSelectedChoice(canvasId),
        );
    });

    /**
     * The same canvases, by id.
     *
     * Built once per change rather than searched per lookup: on an 800-folio
     * manifest a linear `find` per metadata request is 2400 comparisons a
     * frame, for an answer that changes only when the manifest does.
     */
    const canvasesById: Map<string, PlannerCanvas> = $derived(
        new Map(plannerCanvases.map((canvas) => [canvas.id, canvas])),
    );

    /**
     * How many full scene plans this renderer has built.
     *
     * Exposed through the test handle because "planning is once per frame" is a
     * claim only a counter can hold: a plan enumerates the required tile set, so
     * a clamp that quietly asked for one would cost several enumerations per
     * pointer event and show up as nothing but heat.
     */
    let scenePlanCount = 0;

    /**
     * The tier map of the last plan built — a counter, not held scene state.
     *
     * A scene plan is a value produced and discarded each frame; this keeps the
     * one record the residency counters report from, at no cost, because it is
     * the very object the plan already allocated. "Only the canvases near the
     * viewport hold anything" is a claim about NAMES on a long manifest, and a
     * count cannot carry it. Ticket 13 promotes it to real query-only state.
     */
    let lastTiers: Record<string, ResidencyTier> = {};

    /**
     * Everything that decides where the canvases are — shared verbatim by the
     * full plan and by the cheap per-sample clamp, so the world the pan
     * constraint is measured against cannot diverge from the world that is
     * painted.
     */
    function worldInput() {
        return {
            canvases: plannerCanvases,
            mode: viewerState.viewingMode,
            direction: viewerState.viewingDirection,
            preserveCanvasScale: viewerState.preserveCanvasScale,
            gapFraction: MULTI_CANVAS_GAP_FRACTION,
            knownMetadata,
            budgets,
        };
    }

    /**
     * Whether the view has stopped moving — **the view-stable gate** (spec
     * §Tile scheduling).
     *
     * Four ways to be moving, and all four are the same thing to a reader: a
     * finger or button is down (the arbiter owns the gesture), a spring is
     * still settling, a flick is coasting, or an arrow key is held. Thumbnail
     * and `info.json` requests wait for all of them to be false; tiles do not,
     * because a pyramid-tier canvas is one the reader is looking at.
     *
     * A flick passes over hundreds of canvases that are never dwelt on, and
     * this alone removes most of what would otherwise be asked for on their
     * behalf.
     */
    function viewStable(): boolean {
        return (
            gestures.owner === 'none' &&
            !animating &&
            momentum === null &&
            keyPan === null
        );
    }

    function currentPlan(): ScenePlan {
        scenePlanCount += 1;
        return planScene({
            ...worldInput(),
            viewport,
            // Level selection is a question about pixels the display can
            // resolve, and the viewport is measured in CSS pixels: without this
            // a 2× screen never reaches full resolution.
            dpr,
            residentTiles: tiles.residentKeys(),
            viewStable: viewStable(),
        });
    }

    /**
     * canvasIds already announced as having no usable thumbnail.
     *
     * The planner's decision is a pure function of the manifest and the
     * service's facts, so it is the same answer on every frame this canvas is
     * in the tier — announcing it each time would be sixty lines a second per
     * canvas, which is the console equivalent of the retry loop the ladder
     * exists to refuse.
     *
     * A plain Set, deliberately not a `SvelteSet`: it is read from the frame
     * loop, never by the reactive graph.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const reportedThumbnailFailures = new Set<string>();

    /**
     * Say once, for developers, that a canvas has no usable thumbnail and is
     * therefore a plain box for good.
     *
     * The alternative is a canvas that is blank with no explanation anywhere,
     * which is indistinguishable from one that is still loading. Ticket 12 owns
     * what a *user* sees; this is the developer's version, and it goes through
     * the debug-gated `logger` rather than `console` — a published
     * distribution is quiet by default, and bad thumbnail metadata is common
     * enough that a bare warning would be noise in every consumer's console.
     */
    function reportUnresolvedThumbnails(canvasIds: string[]): void {
        for (const canvasId of canvasIds) {
            if (reportedThumbnailFailures.has(canvasId)) continue;
            reportedThumbnailFailures.add(canvasId);
            logger.warn(
                `no usable thumbnail for canvas ${canvasId}; it will render as a plain box`,
            );
        }
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
     *
     * It is also safe to hand it fifty ids at once, which at the derived zoom
     * floor it will be: `imageServiceCache` holds a bounded in-flight window
     * (`rendererDefaults.METADATA_IN_FLIGHT_LIMIT`) and queues the rest, so
     * metadata is under a concurrency cap as well as under the tier and the
     * view-stable gate — the three bounds the spec asks for, not two of them.
     * The list arrives centre-out from the planner and is re-emitted every
     * frame, so the queue drains nearest-first.
     */
    function requestMetadata(canvasIds: string[]): void {
        for (const canvasId of canvasIds) {
            const canvas = canvasesById.get(canvasId);
            if (canvas?.source.kind !== 'service') continue;

            const { serviceId } = canvas.source;
            void imageServiceCache.ensure(serviceId).then((facts) => {
                if (!facts) {
                    // A canvas that will never have pixels. Recorded against
                    // THIS canvas rather than swallowed or raised viewer-wide:
                    // painting nothing and saying nothing is indistinguishable
                    // from still loading (user stories 26 and 27), and blanking
                    // the viewer for it would take 799 working folios down with
                    // it.
                    //
                    // A repaint IS asked for, unlike before: the placeholder is
                    // positioned by the frame loop, so without a frame the
                    // failure would be invisible until something unrelated
                    // repainted. It cannot loop, because only a SPENT failure
                    // gets this far: a spent request is never reissued, so the
                    // next frame's identical ask resolves from the recorded
                    // failure with no network and no state change, and the write
                    // below is a no-op once the kind is unchanged.
                    //
                    // Spent rather than merely failed, and that gate is what
                    // keeps the placeholder from FLASHING. `failure()` reports a
                    // kind after the first attempt, including for a retryable
                    // one — a 503 under an allowance of two would record `load`,
                    // paint a placeholder, and have it taken away again by the
                    // retry the very next frame's `ensure` issues. Nothing is
                    // said about this canvas until the question is closed;
                    // until then it is still loading, which is the truth.
                    if (!imageServiceCache.spent(serviceId)) {
                        // A retryable failure with attempts left. The retry is
                        // issued by the next frame's identical ask, so a frame is
                        // what this needs — otherwise the attempt allowance is
                        // spent only if something unrelated happens to repaint,
                        // and a canvas that a single 503 could have recovered
                        // sits blank until the reader moves. Bounded by the
                        // cache's allowance, not by the frame rate: once the
                        // attempts are gone the branch below runs instead.
                        requestFrame();
                        return;
                    }

                    const kind = imageServiceCache.failure(serviceId);
                    if (kind && canvasErrors[canvasId] !== kind) {
                        canvasErrors[canvasId] = kind;
                        requestFrame();
                    }
                    return;
                }
                // Guarded rather than deleted unconditionally: this resolves once
                // per frame until the facts land in `knownMetadata`, and a
                // `delete` of an absent key still touches the reactive proxy.
                if (canvasErrors[canvasId]) delete canvasErrors[canvasId];
                if (knownMetadata[canvasId] === facts) return;
                // Captured BEFORE the write below, which is what re-lays the
                // world out. See `compensateForReflow`.
                const beforeReflow = viewportLimits().layout;
                // APPEND-ONLY, and load-bearing: LAYOUT reads this record. A
                // canvas the manifest never sized is laid out from a guess and
                // reflowed to the facts below, so evicting an entry would put
                // the guess back — resizing the canvas, changing its tier, and
                // provoking the very fetch whose answer was just dropped. The
                // planner asserts the fixed point (`planScene.test.ts` §the
                // reflow terminates); ticket 08's byte budget must evict
                // decoded pixels only, never these facts, which is also what
                // "metadata is cached separately from decoded pixels, with a
                // longer lifetime" means in the spec.
                knownMetadata[canvasId] = facts;
                // The one input to `viewportLimits`' memo that is mutated in
                // place rather than replaced, so the memo cannot see it by
                // identity and is told instead.
                metadataRevision += 1;
                compensateForReflow(beforeReflow);
                // Tiles can only be planned now that the pyramid is knowable.
                loadedGeneration += 1;
            });
        }
    }

    /**
     * Hold the page the reader is looking at still across a reflow.
     *
     * A canvas the manifest never sized is laid out from a guess and re-laid
     * out when its `info.json` lands (ticket 07). In continuous mode every
     * canvas is positioned by a cumulative offset, so re-sizing canvas N moves
     * canvases N+1..799 — and on a manifest with no declared dimensions that
     * happens on *every* folio, because every folio entering the residency
     * window fetches metadata. Uncompensated, the content jumps sideways under
     * the cursor each time a fetch lands. The planner's fixed-point test says
     * the reflow terminates; it says nothing about the viewport, which is this.
     *
     * The delta is measured on the canvas under the viewport centre — the one
     * the reader is on, and therefore the one that must not move. Everything
     * else is free to shift: the reflow really did change where it is.
     */
    function compensateForReflow(before: LayoutRect[]) {
        const limits = viewportLimits();
        const shift = reflowShift(before, limits.layout, viewport.centre);
        if (shift.x === 0 && shift.y === 0) return;

        // The rect the fit target was memoized from has been replaced.
        fitTargetMemo = null;

        const moved = (point: Point) =>
            constrained(
                { x: point.x + shift.x, y: point.y + shift.y },
                viewport.scale,
            );

        viewport = { ...viewport, centre: moved(viewport.centre) };
        // Moved too, or an animation in flight would drag the reader back to a
        // target expressed in the world's old coordinates.
        targetCentre = moved(targetCentre);
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
        const input = worldInput();
        if (
            limitsMemo &&
            limitsMemo.canvases === input.canvases &&
            limitsMemo.mode === input.mode &&
            limitsMemo.direction === input.direction &&
            limitsMemo.preserveCanvasScale === input.preserveCanvasScale &&
            limitsMemo.budgets === input.budgets &&
            limitsMemo.metadataRevision === metadataRevision
        ) {
            return limitsMemo.value;
        }

        const value = planViewportLimits(input);
        limitsMemo = {
            canvases: input.canvases,
            mode: input.mode,
            direction: input.direction,
            preserveCanvasScale: input.preserveCanvasScale,
            budgets: input.budgets,
            metadataRevision,
            value,
        };
        return value;
    }

    /**
     * The last fit target, and the layout it was found in.
     *
     * The scan itself is `layoutQueries.nearestRect`; this only avoids
     * repeating it. `clampScale` runs on every pointer sample, so an 800-rect
     * scan per sample is the same O(manifest)-per-sample cost `limitsMemo`
     * exists to remove — and the answer changes only when the viewport centre
     * leaves the canvas it is standing on, which a containment test answers
     * without touching another rect.
     */
    let fitTargetMemo: { layout: LayoutRect[]; rect: Box } | null = null;

    /**
     * The bounds a fit is measured against, and the zoom ceiling's reference:
     * in continuous mode the canvas **under the viewport centre**, and the
     * whole world in every other mode (where the world IS the spread on
     * screen, so paged and individuals behaviour is untouched).
     *
     * The reasoning lives in `layoutQueries.fitTargetBounds`, which is where it
     * is tested; this is the memo around it. Panning is deliberately not
     * measured from here — `constrained` stays on the whole world, because
     * scrolling the manifest is the point of the mode.
     */
    function fitBoundsTarget(limits: ReturnType<typeof viewportLimits>) {
        if (viewerState.viewingMode !== 'continuous') return limits.bounds;

        const centre = viewport.centre;
        if (
            fitTargetMemo &&
            fitTargetMemo.layout === limits.layout &&
            boxContains(fitTargetMemo.rect, centre)
        ) {
            return fitTargetMemo.rect;
        }

        const rect = fitTargetBounds(limits.layout, centre, true);
        if (rect) fitTargetMemo = { layout: limits.layout, rect };
        return rect;
    }

    /**
     * The bounds NAVIGATION lands on — the canvas the viewer says is current,
     * which in continuous mode is not the one the reader has scrolled to.
     *
     * Distinct from {@link fitBoundsTarget} for the reason spelled out in
     * `layoutQueries.navigationTargetBounds`: choosing a folio from the canvas
     * list is a request to travel there, and pressing `0` after scrolling is a
     * request not to travel at all.
     */
    function navigationBoundsTarget(limits: ReturnType<typeof viewportLimits>) {
        if (viewerState.viewingMode !== 'continuous') return limits.bounds;
        return navigationTargetBounds(
            limits.layout,
            viewerState.canvasId,
            viewport.centre,
            true,
        );
    }

    /** The scale at which a fit lands — the zoom ceiling's reference. */
    function homeScale(limits: ReturnType<typeof viewportLimits>): number {
        const bounds = fitBoundsTarget(limits);
        if (!bounds || viewport.width === 0 || viewport.height === 0) return 1;
        return fitBounds(bounds, viewport).scale;
    }

    function clampScale(scale: number): number {
        const limits = viewportLimits();
        // The floor is DERIVED (the zoom at which the median canvas reaches the
        // box threshold), not a tuned percentage of home zoom, so it can land
        // above the ceiling; `zoomRange` owns what happens then.
        const { min, max } = zoomRange(
            homeScale(limits),
            limits.minZoom,
            MAX_ZOOM_FACTOR,
        );
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
        const bounds = viewportLimits().bounds;
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

    /**
     * Fit — the whole world, or in continuous mode the canvas the reader is
     * looking at (see {@link fitBoundsTarget}). The `0`/`Home` path.
     */
    function fitWorld(animated = false) {
        applyFit(fitBoundsTarget(viewportLimits()), animated);
    }

    /**
     * Fit the canvas the VIEWER says is current — how **canvas navigation**
     * happens in continuous mode, and what the first measured frame adopts.
     *
     * The scene effect re-runs when the current canvas changes and refits onto
     * it, which is the same path paged and individuals mode already took when
     * their spread changed. Scrolling by hand never touches it, because a drag
     * does not change the current canvas — and, since ticket 08's review, does
     * not change what {@link fitWorld} fits either.
     */
    function fitCurrentCanvas(animated = false) {
        applyFit(navigationBoundsTarget(viewportLimits()), animated);
    }

    /**
     * Adopt the view that frames `bounds`.
     *
     * The fitted scale goes through `clampScale` like every other scale this
     * component adopts. It is a no-op for `fitWorld`/`fitCurrentCanvas`, whose
     * bounds are layout rects and whose fit therefore IS the home scale — but
     * the public `fitBounds` command hands in a box a CALLER chose, and a
     * two-unit box on a 4000-unit canvas fits at a scale hundreds of times the
     * ceiling. `zoomTo` documents its limits as inescapable; a sibling command
     * that skips them would make that false, and would bypass the tier and
     * zoom-floor invariants derived from the same range.
     */
    function applyFit(bounds: Box | null, animated: boolean) {
        if (!bounds || viewport.width === 0 || viewport.height === 0) return;

        const fit = fitBounds(bounds, viewport);
        const scale = clampScale(fit.scale);
        if (animated) {
            setViewAnimated(fit.centre, scale, animationTime());
            return;
        }

        viewport = { ...viewport, centre: fit.centre, scale };
        targetCentre = fit.centre;
        targetScale = scale;
        animating = false;
        momentum = null;
    }

    /*
     * ======================= RENDERER PORT (Canvas2D) ========================
     *
     * The public viewport API, implemented (`renderer/rendererPort.ts`).
     * `ViewerState` holds this and nothing else of the renderer: the commands
     * below are the same ones the chrome's own buttons and key bindings call,
     * which is the parity rule satisfied by construction rather than by two
     * parallel paths that have to be kept in step.
     *
     * Everything here is built on the animated primitives the input work
     * already established — `setViewAnimated`, `applyFit`, `zoomAnchored`,
     * `clampScale`, `constrained` — so a programmatic zoom eases exactly like a
     * double-tap, honours reduced motion at the same choke point, and cannot
     * escape the zoom range or pan constraint. There is deliberately no second
     * way to move this viewport.
     *
     * The public boundary speaks **canvas space**; the renderer's world places
     * canvases side by side and may normalize their sizes. `layoutQueries`
     * owns that conversion, and `placementOf` is where a canvas id becomes the
     * placement it needs.
     */

    /**
     * Where a canvas sits in the laid-out world, or `null` if it is not laid
     * out at all — in `individuals`/`paged` mode that is every canvas except
     * the current spread, and answering `null` is the honest response.
     *
     * Memoized on the layout's identity because a `frame`-cadence selector
     * reading `viewportCentre` calls this once per frame, and an 800-folio
     * manifest would otherwise be a linear scan per read.
     */
    let placementMemo: {
        layout: LayoutRect[];
        canvasId: string;
        value: CanvasPlacement | null;
    } | null = null;

    function placementOf(canvasId?: string): CanvasPlacement | null {
        const id = canvasId ?? viewerState.canvasId;
        if (!id) return null;

        const layout = viewportLimits().layout;
        if (
            placementMemo &&
            placementMemo.layout === layout &&
            placementMemo.canvasId === id
        ) {
            return placementMemo.value;
        }

        const rect = layout.find((entry) => entry.canvasId === id) ?? null;
        const value: CanvasPlacement | null = rect
            ? { rect, ...declaredCanvasSize(id) }
            : null;
        placementMemo = { layout, canvasId: id, value };
        return value;
    }

    /**
     * World units per canvas unit for the CURRENT canvas.
     *
     * The factor itself is `layoutQueries.canvasScaleFactor`, beside the point
     * and box conversions that apply the same one — shared rather than spelled
     * again here so `getScale`, `zoomTo`, and the coordinate helpers cannot
     * drift apart. `1` when the canvas is not laid out, which is the only
     * answer that leaves `zoomTo` an identity on `getScale`'s own reading.
     */
    function currentCanvasScaleFactor(): number {
        const placement = placementOf();
        return placement ? canvasScaleFactor(placement) : 1;
    }

    const canvasPort: RendererPort = markRendererPort({
        zoomBy(factor: number, anchor?: ViewportPoint): void {
            // With no anchor, zoom about the middle of the surface — which is
            // what `anchoredZoomCentre` reduces to, so the toolbar and a
            // double-tap take one code path rather than two.
            zoomAnchored(
                anchor ?? { x: viewport.width / 2, y: viewport.height / 2 },
                factor,
            );
        },

        zoomTo(scale: number): void {
            // Converted out of canvas space first — `getScale` reports screen
            // pixels per CANVAS unit, so `zoomTo(viewportScale)` has to be a
            // no-op, and it is not unless the same normalization factor is
            // undone here. It differs from 1 exactly when layout resized this
            // canvas's rect for a facing-page spread.
            setViewAnimated(
                viewport.centre,
                clampScale(scale / currentCanvasScaleFactor()),
                animationTime(),
            );
        },

        panTo(centre: ViewportPoint, canvasId?: string): void {
            const placement = placementOf(canvasId);
            if (!placement) return;
            setViewAnimated(
                canvasPointToWorld(centre, placement),
                viewport.scale,
                animationTime(),
            );
        },

        fitBounds(bounds: ViewportBox, canvasId?: string): void {
            const placement = placementOf(canvasId);
            if (!placement) return;
            // Programmatic input is always animated (spec §Input and animation).
            applyFit(canvasBoxToWorld(bounds, placement), true);
        },

        fitCanvas(canvasId?: string): void {
            const placement = placementOf(canvasId);
            if (!placement) return;
            applyFit(placement.rect, true);
        },

        getScale(): number {
            // Canvas space, not world space: layout may have normalized this
            // canvas's rect, and the number a caller uses to size an export
            // request has to be about the canvas it is exporting.
            return viewport.scale * currentCanvasScaleFactor();
        },

        getCentre(canvasId?: string): ViewportPoint | null {
            const placement = placementOf(canvasId);
            if (!placement) return null;
            return worldPointToCanvas(viewport.centre, placement);
        },

        getVisibleBounds(canvasId?: string): ViewportBox | null {
            const placement = placementOf(canvasId);
            if (!placement || viewport.scale <= 0) return null;
            const width = viewport.width / viewport.scale;
            const height = viewport.height / viewport.scale;
            return worldBoxToCanvas(
                {
                    x: viewport.centre.x - width / 2,
                    y: viewport.centre.y - height / 2,
                    width,
                    height,
                },
                placement,
            );
        },

        getContainerSize(): ContainerSize {
            return { width: viewport.width, height: viewport.height };
        },

        canvasToScreen(
            point: ViewportPoint,
            canvasId?: string,
        ): ViewportPoint | null {
            const placement = placementOf(canvasId);
            if (!placement) return null;
            const world = canvasPointToWorld(point, placement);
            return {
                x:
                    (world.x - viewport.centre.x) * viewport.scale +
                    viewport.width / 2,
                y:
                    (world.y - viewport.centre.y) * viewport.scale +
                    viewport.height / 2,
            };
        },

        screenToCanvas(
            point: ViewportPoint,
            canvasId?: string,
        ): ViewportPoint | null {
            const placement = placementOf(canvasId);
            if (!placement || viewport.scale <= 0) return null;
            return worldPointToCanvas(
                {
                    x:
                        (point.x - viewport.width / 2) / viewport.scale +
                        viewport.centre.x,
                    y:
                        (point.y - viewport.height / 2) / viewport.scale +
                        viewport.centre.y,
                },
                placement,
            );
        },

        applyImageAdjustments(adjustments: ImageAdjustments): void {
            appliedAdjustments = adjustments;
            paintImageAdjustments();
        },

        onFrame(listener: () => void): () => void {
            frameListeners.add(listener);
            return () => frameListeners.delete(listener);
        },
    });

    /**
     * Frame-cadence listeners. A plain `Set`, deliberately not reactive: it is
     * read once per painted frame, and waking the reactive graph per frame is
     * the cost the `frame` cadence exists to avoid in the first place.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const frameListeners = new Set<() => void>();

    /** Wake `frame`-cadence subscribers. Called once per painted frame. */
    function emitFrame() {
        for (const listener of [...frameListeners]) listener();
    }

    let appliedAdjustments: ImageAdjustments | null = null;

    /**
     * Write the adjustment set onto the surface as a CSS filter.
     *
     * A CSS filter rather than `ctx.filter` on purpose: it is composited on the
     * GPU and costs nothing per frame, where a context filter would be applied
     * per tile draw on every frame of a pan. It is applied to the surface
     * element, which core owns and never hands out.
     */
    function paintImageAdjustments() {
        if (!surface || !appliedAdjustments) return;
        surface.style.filter = imageAdjustmentsToCssFilter(appliedAdjustments);
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
        emitFrame();

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

    /**
     * The canvases allowed to hold a whole decoded image this frame.
     *
     * The static-image half of virtualization, and it needs saying because a
     * static source has no tile scheduler to bound it: fed the whole manifest,
     * the ticket-07 reconciliation would start 800 `<img>` loads on open — the
     * same fetch storm as 800 `info.json` requests, in a different costume. The
     * tier is the gate, and it is the planner's, so pixels are released by the
     * same distance rule the tiles are.
     */
    function imageBearingCanvases(plan: ScenePlan): PlannerCanvas[] {
        return plannerCanvases.filter(
            (canvas) =>
                plan.tiers[canvas.id] && plan.tiers[canvas.id] !== 'box',
        );
    }

    function paint() {
        if (!ctx) return;

        const plan = currentPlan();
        lastTiers = plan.tiers;

        // Reconciled ONCE PER FRAME, from the frame loop — never from a pointer
        // handler. Pointer events outpace frames during a drag, so per-event
        // reconciliation would generate (and abort) several required sets per
        // frame for no gain.
        //
        // ONE scheduler for tiles and thumbnails together, which is what makes
        // the concurrency cap genuinely global and the priority order genuinely
        // centre-out: a thumbnail two folios away and a tile in the middle of
        // the page compete on distance from the viewport centre rather than on
        // which list they arrived in. It is also what puts thumbnails under the
        // one decoded-byte ceiling instead of beside it.
        tiles.update([...plan.tileRequests, ...plan.thumbnailRequests]);
        requestMetadata(plan.metadataRequests);
        reportUnresolvedThumbnails(plan.unresolvedThumbnails);
        // Before painting, so a canvas that left the window stops painting in
        // the frame it left rather than the one after.
        loadStaticImages(imageBearingCanvases(plan));
        updateCanvasErrors(plan);

        paintScene(ctx, plan, viewport, { images, tiles: tiles.get }, dpr);
        // The **paint hook**, in the same frame and under the same matrix
        // `paintScene` left applied — which is the whole reason a layer drawn
        // here cannot desync from the image the way a DOM overlay repositioned
        // on an event can.
        drawPaintLayers(
            ctx,
            viewerState.paintLayers,
            paintFrame(plan),
            reportPaintLayerFailure,
        );
    }

    /**
     * What a paint layer is told about this frame.
     *
     * The transform is spelled out again rather than read back off the context
     * (`getTransform` allocates a `DOMMatrix` per frame) and is the same
     * arithmetic `paintScene.applyViewportTransform` performs — asserted by the
     * geometric e2e assertion, which locates a layer's own ink and compares it
     * with the coordinate model, exactly as it does for the tiles.
     *
     * The canvas half comes from `paintCanvasSpace`, which carries this frame's
     * rects AND the canvas-space → world conversion over them. The declared
     * dimensions it needs are the manifest's, read from the same
     * `canvasesById`/`placementOf` source the public coordinate helpers read, so
     * a layer and `ViewerState.canvasToScreen` cannot disagree about where a
     * canvas-space point is.
     */
    function paintFrame(plan: ScenePlan): PaintFrame {
        const scale = viewport.scale * dpr;
        return {
            transform: {
                scale,
                offsetX: (viewport.width / 2) * dpr - viewport.centre.x * scale,
                offsetY:
                    (viewport.height / 2) * dpr - viewport.centre.y * scale,
                dpr,
            },
            width: viewport.width,
            height: viewport.height,
            ...paintCanvasSpace(plan.layout, declaredCanvasSize),
        };
    }

    /** A canvas's declared dimensions, as the manifest gave them. */
    function declaredCanvasSize(canvasId: string): {
        width: number | null;
        height: number | null;
    } {
        const canvas = canvasesById.get(canvasId);
        return {
            width: canvas?.width ?? null,
            height: canvas?.height ?? null,
        };
    }

    /**
     * A paint layer threw. Said once per layer, for the same reason
     * `reportUnresolvedThumbnails` is: a layer that throws does it every frame,
     * and sixty identical console errors a second is indistinguishable from a
     * hang. Through the debug-gated `logger`, so a published distribution stays
     * quiet by default.
     *
     * A plain Set, deliberately not a `SvelteSet`: written from the frame loop,
     * read by nothing but this function.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const reportedPaintLayerFailures = new Set<string>();

    function reportPaintLayerFailure(
        layer: RegisteredPaintLayer,
        error: unknown,
    ): void {
        if (reportedPaintLayerFailures.has(layer.id)) return;
        reportedPaintLayerFailures.add(layer.id);
        logger.error(`paint layer "${layer.id}" failed`, error);
    }

    /**
     * Core's own paint layer: a page-shaped placeholder for every canvas in the
     * **box tier**.
     *
     * The hook is public in this phase *and used by core itself*, so it is
     * exercised on every frame of the mode it matters in rather than shipped
     * speculative — and this is the layer core needs anyway. A box-tier canvas
     * holds nothing: no network, no texture, no pixels. Until now it painted
     * nothing either, so scrolling an 800-folio manuscript at the zoom floor
     * showed blank space where 795 folios are — indistinguishable from the end
     * of the manifest, and exactly the "loading river" this epic exists to
     * remove. Its rect is the one thing that IS known for free (layout is pure
     * arithmetic over manifest dimensions), so the rect is what is drawn.
     *
     * **Decoration, and nothing but.** It carries no text and no information a
     * reader must perceive, which is what makes painted pixels the right home
     * for it: a message would need an accessible name and would belong in the
     * DOM layer beside the surface, where ticket 12's error placeholders are.
     *
     * The ink is a translucent mid-grey rather than a theme token, deliberately:
     * resolving a `--tri-*` token means `getComputedStyle` on the surface, which
     * is a layout read this loop must not do per frame, and caching it means
     * watching for theme changes to invalidate it. At this alpha a mid-grey
     * reads as a faint page against both a light and a dark ground, and being
     * decoration it has no contrast requirement to meet.
     */
    const PAGE_PLACEHOLDER_INK = 'rgba(128, 128, 128, 0.16)';

    function paintBoxTierPages(
        context: CanvasRenderingContext2D,
        frame: PaintFrame,
    ): void {
        context.fillStyle = PAGE_PLACEHOLDER_INK;
        for (const placement of frame.canvases) {
            if (lastTiers[placement.canvasId] !== 'box') continue;
            context.fillRect(
                placement.x,
                placement.y,
                placement.width,
                placement.height,
            );
        }
    }

    /**
     * Position this frame's error placeholders, and raise or drop the
     * viewer-level error condition derived from them.
     *
     * Both are decided in `renderer/canvasErrors.ts`, which is where the
     * reasoning is tested. What is decided HERE is which failed canvases are
     * PLACEHOLDER-WORTHY this frame, because that is the only part of the question
     * that needs to know what the host is holding:
     *
     * - **Not box tier.** A box-tier canvas's projection is below the point at
     *   which it carries information at all, so a labelled placeholder on it would
     *   be unreadable noise — and at the derived zoom floor of a manifest whose
     *   whole service is behind a login, 800 of them.
     * - **Nothing drawn for it this frame.** The placeholder is opaque, so it
     *   would cover working content. That is not hypothetical: a manifest very
     *   commonly advertises a PUBLIC `thumbnail` beside a login-gated image
     *   service, and a declared thumbnail resolves with no `info.json` at all
     *   (`thumbnailLadder`). So a reader who views such a folio full-page records
     *   an `auth` failure against it from the pyramid tier, zooms out, and its
     *   thumbnail then paints perfectly well — at which point an error box over it
     *   loses the only pixels the reader could have had. A failure recorded
     *   against a canvas means "the source we asked for has no pixels", and this
     *   is what keeps it from being read as "this canvas has none".
     */
    function updateCanvasErrors(plan: ScenePlan) {
        const failed = Object.keys(canvasErrors);

        // The overwhelmingly common case: nothing has failed, so nothing is
        // walked and nothing is written.
        if (failed.length === 0) {
            if (errorLayer.length > 0) errorLayer = [];
            setDerivedTileSourceError(null);
            return;
        }

        // Walked only on this path, and bounded by the residency window rather
        // than by the manifest: a draw list is what is on screen.
        //
        // A plain Set, deliberately not a `SvelteSet`: it lives for the length of
        // this call and is read by nothing but the filter below.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const painting = new Set<string>();
        for (const draw of plan.tileDraws) painting.add(draw.canvasId);

        const perceptible = plan.layout.filter(
            (rect) =>
                // Cheapest test first, and the one that excludes ~800 of 800
                // rects on the manifest this path exists for.
                canvasErrors[rect.canvasId] &&
                plan.tiers[rect.canvasId] !== 'box' &&
                !painting.has(rect.canvasId) &&
                !images[rect.canvasId],
        );
        const next = errorPlacements(perceptible, canvasErrors, viewport);
        // A pan moves every placeholder, so an update is genuinely needed most
        // frames; this only avoids waking the graph on the frames where it is not.
        if (!samePlacements(errorLayer, next)) errorLayer = next;

        setDerivedTileSourceError(
            viewerLevelErrorKind(
                plan.layout,
                canvasErrors,
                viewerState.canvasId,
            ),
        );
    }

    /**
     * Mirror the derived condition onto the viewer-level `tileSourceError`,
     * writing only when it changes.
     *
     * Deliberately the SAME observable the previous renderer wrote, in the same
     * shape, so the existing error chrome and its journey keep working with no new
     * chrome invented (ticket 12's scope). Its meaning is now derived rather than
     * primary: `canvasErrors` is the source of truth and this is a view of it for
     * the canvas being read.
     *
     * Raising it unmounts this component — the chrome replaces the renderer with
     * a full cover — which is exactly why `viewerLevelErrorKind` refuses to raise
     * it while any canvas on screen still works. `ViewerState.setCanvas` clears
     * it, so navigating away remounts the renderer, and the metadata cache
     * remembers the failure without refetching if the reader comes back.
     *
     * The change-only write lives in `canvasErrors.createTileSourceErrorMirror`,
     * where it has a unit test: it is the difference between one state
     * notification per failure and one per frame to every plugin subscriber, and
     * getting it wrong is silent.
     *
     * The escape-hatch assignment is the one the previous renderer used for the
     * same member: `tileSourceError` is an `observable` in the state inventory, so
     * it has no mutator by definition — core writes it, nothing else may.
     */
    const setDerivedTileSourceError = createTileSourceErrorMirror({
        loadMessage: () => m.canvas_error_load(),
        write: (value) => {
            (
                viewerState as unknown as { tileSourceError: unknown }
            ).tileSourceError = value;
        },
    });

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
        // so adopt the fit of whatever the viewer says is current — which on a
        // deep link into folio 400 is folio 400, not the folio the un-scrolled
        // viewport centre happens to sit on.
        if (!hadSize && width > 0 && height > 0) {
            fitCurrentCanvas();
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
     * The media queries the byte ceiling is resolved from, kept live.
     *
     * `(pointer: coarse) and (hover: none)` is a LIVE question, not a
     * device-identity one, and the two watchers either side of this one already
     * treat their queries that way. A tablet that gains a trackpad mid-session
     * stops being the device the mobile ceiling was chosen for; more to the
     * point, one that *loses* its keyboard is left holding a 128 MB decoded
     * cache on a machine the browser will kill a tab on for far less, which is
     * the case the two ceilings exist to separate.
     *
     * Keyed by the query text this component passed in rather than by
     * `MediaQueryList.media`, which the platform is free to re-serialize.
     *
     * A plain Map, deliberately not a `SvelteMap`: it is read by
     * `resolveByteBudget` and by the change listener, never by the reactive
     * graph.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const byteBudgetQueries = new Map<string, MediaQueryList>();

    function byteBudgetMatches(query: string): boolean {
        let held = byteBudgetQueries.get(query);
        if (!held) {
            held = window.matchMedia(query);
            held.addEventListener?.('change', applyByteBudget);
            byteBudgetQueries.set(query, held);
        }
        return held.matches;
    }

    function applyByteBudget() {
        // A consumer who named a ceiling knows more than the media query does,
        // so the device answer is only consulted when none was configured.
        const byteBudget = configuredBudgets({
            ...budgets,
            byteBudget: resolveByteBudget(byteBudgetMatches),
        }).byteBudget;
        if (byteBudget === budgets.byteBudget) return;

        budgets = { ...budgets, byteBudget };
        // Trims on the way down, so dropping to the mobile ceiling releases the
        // pixels over it in this call rather than at the next frame.
        tiles.setByteBudget(byteBudget);
    }

    function unwatchByteBudget() {
        for (const query of byteBudgetQueries.values()) {
            query.removeEventListener?.('change', applyByteBudget);
        }
        byteBudgetQueries.clear();
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
        // The view may have just become STABLE, and a gesture that moved
        // nothing (a tap, or a drag whose last sample already painted) leaves
        // nothing else to schedule a frame. Without this the thumbnails and
        // `info.json`s the gate held back wait for the next unrelated repaint.
        requestFrame();
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
        // See `handlePointerUp`: the gate may have just opened.
        requestFrame();
    }

    /**
     * Turn a recognised gesture into a viewport change.
     *
     * Drag and pinch are **direct**: the transform is updated here, 1:1, with
     * no smoothing and no spring. This is the single most important
     * behavioural difference from the previous renderer, which animated the
     * pan target through the same spring it used for zoom and so trailed the
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
            animationTime(),
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
        if (!last || reducedMotion) {
            // Stopped dead, so the view is stable now: ask for the frame that
            // notices (see `handlePointerUp`).
            requestFrame();
            return;
        }

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
            animationTime(),
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
     * painting the superseded image.
     *
     * A failed decode is recorded against the canvas (`canvasErrors`), never
     * viewer-wide. An `<img>` reports no status, so a static source's failure can
     * only ever be `load` — there is no 401 to distinguish, which is a fact about
     * the element rather than a simplification.
     *
     * The failure is ALSO recorded in `staticImageFailures`, keyed on the URL and
     * page-shared, which is what gives a static canvas the eviction lifetime the
     * spec asks for: `canvasErrors` is component state and is cleared when this
     * canvas leaves the residency window along with its pixels, so on its own it
     * would refetch a 404 every time the reader scrolled back. That module's
     * comment carries why the negative cache is keyed on the URL rather than
     * being a per-canvas record kept across eviction.
     */
    function loadStaticImages(canvases: PlannerCanvas[]) {
        const { drop, load } = reconcileImages(imageUrls, canvases);

        for (const canvasId of drop) {
            // Drop the pixels too: a stale image must stop painting the moment
            // it is superseded, not when its replacement finishes decoding.
            delete images[canvasId];
            delete imageUrls[canvasId];
            // And the error with them. The URL this canvas resolves to has
            // changed or been released, so the recorded failure is an answer
            // about a request that is no longer the one being made — keeping it
            // would leave a placeholder over a Choice that loads perfectly well.
            //
            // Safe for eviction as well as for a Choice switch only because
            // `staticImageFailures` remembers the URL: the canvas coming back
            // re-derives its error from that below, with no second request. Drop
            // this and the per-canvas record is the only memory of the failure,
            // which is the refetch-on-re-entry the spec forbids.
            if (canvasErrors[canvasId]) delete canvasErrors[canvasId];
        }

        for (const { canvasId, url } of load) {
            if (staticImageFailures.has(url)) {
                // Answered already, by a request this page made earlier. Recorded
                // BEFORE `imageUrls`, so the state the placeholder is derived
                // from is in place for `updateCanvasErrors` in this same frame.
                canvasErrors[canvasId] = 'load';
                // Held as if in flight: the reconciliation compares held URLs, so
                // this is what stops the next frame asking again.
                imageUrls[canvasId] = url;
                continue;
            }

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
                if (canvasErrors[canvasId]) delete canvasErrors[canvasId];
                loadedGeneration += 1;
            };
            image.onerror = () => {
                // Recorded whatever this canvas now wants, and before the guard:
                // the URL failed, and that is a fact about the URL rather than
                // about the canvas that happened to ask for it. A reader who
                // switches Choice away mid-request and back must not re-issue it.
                staticImageFailures.record(url);
                if (imageUrls[canvasId] !== url) return;
                // The URL is deliberately LEFT in `imageUrls`, which is what
                // stops the next frame's reconciliation from asking again: a
                // request that failed is answered, and a retry loop over a 404
                // is the behaviour the thumbnail ladder also refuses. Once this
                // canvas is evicted the URL goes with it, and `staticImageFailures`
                // is what refuses the request on the way back in.
                canvasErrors[canvasId] = 'load';
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

        // Which decoded-byte ceiling this device gets, and it stays subscribed:
        // asked here rather than at module scope because it is a `matchMedia`
        // question, and the renderer's module graph must load on a server with
        // none.
        if (typeof window.matchMedia === 'function') applyByteBudget();

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
        // The same bargain for static images, with the whole set treated as the
        // transient case: an `<img>` reports no status, so none of its failures
        // can be shown to be an answer about the resource rather than about the
        // network.
        staticImageFailures.retryAll();

        const observer = new ResizeObserver(() => measure());
        observer.observe(root);
        measure();
        watchDevicePixelRatio();

        // The only document/window-level listeners this component installs, and
        // they bind nothing: they end a hold, they never start one. The
        // bindings themselves stay on the surface element (spec §Keyboard).
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // The renderer has a sized surface and accepts commands. Attached after
        // the first `measure()` above for exactly that reason: `rendererReady`
        // means the viewport queries answer with real numbers, not zeroes.
        const detachRenderer = viewerState.attachRenderer(canvasPort);

        // Core's own layer, registered through the same public API a plugin
        // uses — not a private back door beside it, which is what makes "the
        // hook is exercised rather than speculative" true. Ordered below zero so
        // the default a plugin gets paints OVER core's page placeholders.
        const releasePageLayer = viewerState.registerPaintLayer({
            id: 'core:page-placeholders',
            order: -100,
            draw: paintBoxTierPages,
        });

        /*
         * Internal test handle for the geometric e2e assertions, which need a
         * deterministic viewport rather than one arrived at by synthesizing
         * gestures.
         *
         * NOT superseded by the public viewport API: what remains here is the
         * renderer's own instrumentation — residency by canvas name, decoded
         * bytes, plan counts, metadata failures — which is how the epic's
         * claims are asserted at all, and a `setView` that adopts an exact
         * viewport with no easing, which no public command offers because
         * programmatic input is always animated. `zoomAt` now routes through
         * the port, and `fit` deliberately does not: it fits what is ON SCREEN
         * (`fitWorld`), which is the `0`/`Home` binding, where the public
         * `fitCanvas` fits the canvas the viewer says is current — ticket 08's
         * split, and load-bearing in continuous mode. It exists only on the
         * development-only renderer and is never part of the published surface.
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
            /**
             * Animated zoom about a surface-local point — the toolbar's shape,
             * routed through the public port so the e2e assertions exercise the
             * command a plugin would issue rather than a parallel path.
             */
            zoomAt: (anchor: Point, factor: number) => {
                canvasPort.zoomBy(factor, anchor);
                return nextPaint();
            },
            /**
             * The public `fitBounds` command, on a caller-chosen canvas-space
             * box — routed through the port for the same reason `zoomAt` is.
             *
             * Distinct from `fit` above: that one fits what is ON SCREEN and is
             * the `0`/`Home` binding, where this is the command a plugin issues
             * with a box of its own choosing. It is the only path where the
             * fitted scale is not a layout rect's, which is what makes the zoom
             * clamp observable.
             */
            fitCanvasBounds: (
                bounds: { x: number; y: number; width: number; height: number },
                canvasId?: string,
            ) => {
                canvasPort.fitBounds(bounds, canvasId);
                return nextPaint();
            },
            isMoving: () => animating || momentum !== null || keyPan !== null,
            /**
             * Adopt a different decoded-byte ceiling.
             *
             * Budgets are planner inputs precisely so a test can state its own
             * rather than assert a shipped default (spec §Further Notes). The
             * shipped desktop figure is 128 MB, which the fixture manifests
             * could not approach if they tried, so a browser assertion about
             * the budget being honoured is only meaningful against a budget the
             * test chose.
             */
            setBudget: (bytes: number) => {
                budgets = { ...budgets, byteBudget: bytes };
                tiles.setByteBudget(bytes);
                return nextPaint();
            },
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
                /** Tiles held in the byte-budgeted opportunistic cache. */
                cachedTileCount: tiles.cachedTileCount,
                /** Required set plus opportunistic cache — the budgeted total. */
                decodedBytes: tiles.decodedBytes,
                /**
                 * The required set alone.
                 *
                 * The difference is what the budget can actually act on: the
                 * cache is the only thing `trim` evicts, so `requiredBytes`
                 * above the ceiling is the one state in which the ceiling is
                 * genuinely exceeded and no eviction can help. Reachable
                 * through the declared-thumbnail rung, which the spec requires
                 * to be used as-is whatever size it turns out to be.
                 */
                requiredBytes: tiles.requiredBytes,
                /** The ceiling that total is asserted against. */
                byteBudget: tiles.byteBudget,
                tileRequestCount: tiles.requestCount,
                /**
                 * Full scene plans built. Once per painted frame — never per
                 * pointer event, which is what the drag test asserts.
                 */
                scenePlanCount,
            }),
            /**
             * Which canvases held what, at the last plan.
             *
             * Names, not counts: "only the canvases near the viewport hold
             * anything" is the claim this epic exists for, and on an 800-folio
             * manifest a count would pass just as happily with the wrong three
             * canvases resident. `boxCount` is a count because the box tier is
             * everything else by construction.
             */
            getResidency: () => {
                const pyramid: string[] = [];
                const thumbnail: string[] = [];
                let boxCount = 0;
                for (const [canvasId, tier] of Object.entries(lastTiers)) {
                    if (tier === 'pyramid') pyramid.push(canvasId);
                    else if (tier === 'thumbnail') thumbnail.push(canvasId);
                    else boxCount += 1;
                }
                return { pyramid, thumbnail, boxCount };
            },
            /**
             * canvasId → why that canvas has no pixels, for the canvases that
             * failed — the per-canvas error state that is the source of truth.
             *
             * Names, not a count, for the same reason `getResidency` reports
             * names: "one folio failed and the other 799 did not" is a claim about
             * WHICH canvas, and a count passes just as happily with the wrong one.
             */
            getCanvasErrors: () => ({ ...canvasErrors }),
            /**
             * The PUBLIC paint-hook registration, reached from here.
             *
             * Not a second registration path: it calls
             * `ViewerState.registerPaintLayer` and returns what that returns, so
             * the assertion exercises the same surface a plugin does. It is here
             * because the demo page the e2e suite drives holds the viewer as a
             * component and puts its `ViewerState` on no global — and a claim
             * about which matrix a layer is handed can only be made against a
             * real frame with real tiles in it.
             */
            registerPaintLayer:
                viewerState.registerPaintLayer.bind(viewerState),
            nextPaint,
        };

        return () => {
            detachRenderer();
            releasePageLayer();
            frameListeners.clear();
            observer.disconnect();
            unwatchDevicePixelRatio();
            unwatchReducedMotion();
            unwatchByteBudget();
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
        // Read so the effect re-runs when the manifest or the mode changes and
        // the world has to be refitted; the images themselves are reconciled in
        // the frame loop, where the tier that gates them is known.
        void plannerCanvases;

        fitCurrentCanvas();
        requestFrame();
    });

    $effect(() => {
        // Repaint when a decoded image, a decoded tile, or image-service
        // metadata lands.
        void loadedGeneration;
        requestFrame();
    });

    $effect(() => {
        // A paint layer was registered or released. Without this a layer added
        // while the viewport is idle would first appear at whatever unrelated
        // repaint came next — and one that was released would go on being drawn
        // until then.
        void viewerState.paintLayerRevision;
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
    be skipped over. Ticket 12's per-canvas error layer IS such a child — it is
    the `.error-layer` below, and it carries `role="document"` for exactly this
    reason. Each such child must either carry `role="document"` (which restores
    browse mode for its own subtree) or be hoisted OUT of this element and
    rendered as a sibling. Recorded in lint-allowlist.md entry 7.

    Ticket 14's annotation shape overlay took the second option: it is a SIBLING
    of this element, mounted by `TriiiceratopsViewer` into the same stage box, so
    its labels are read normally and its focusable shapes are ordinary widgets.
    This element comes first in DOM order, so Tab goes surface → annotations: the
    picture before the things marked on it.

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

    <!--
        The per-canvas error layer: one placeholder over the layout rect of each
        canvas that failed, and nothing at all when none did.

        DOM rather than painted pixels, per ticket 14's rule — a message the reader
        must perceive needs an accessible name, and painted text has none.

        `role="document"` on the layer is the constraint the note above this markup
        records: `role="application"` suppresses browse mode for its whole subtree,
        so text inside it would be skipped by NVDA and JAWS. `document` restores
        browse mode for this subtree only, leaving the surface's arrow-key
        pass-through intact.

        `pointer-events: none` throughout (see the style block): a placeholder sits
        over the surface, and a reader must still be able to pan and zoom the page
        the failed folio is sitting next to.
    -->
    {#if errorLayer.length > 0}
        <div class="error-layer" role="document">
            {#each errorLayer as placement (placement.canvasId)}
                <div
                    class="canvas-error"
                    class:canvas-error-auth={placement.kind === 'auth'}
                    data-testid="canvas-error-placeholder"
                    data-canvas-id={placement.canvasId}
                    data-error-kind={placement.kind}
                    role="img"
                    aria-label={errorLabel(placement.kind)}
                    style:left="{placement.left}px"
                    style:top="{placement.top}px"
                    style:width="{placement.width}px"
                    style:height="{placement.height}px"
                >
                    <!--
                        The VISIBLE message, centred in the part of the failed
                        canvas that is actually on screen rather than in the
                        canvas rect — see `CanvasErrorPlacement`. Zoomed into a
                        failed folio (the ceiling is 128x home) the rect is many
                        times the viewport, and a label centred in it is centred
                        on a point nobody can see: a sighted reader gets a flat
                        fill and no message while the accessible name goes on
                        being correct. Positioned relative to the placeholder,
                        which is this element, hence the offsets.

                        Omitted entirely below a minimum box, because a clipped
                        fragment of one glyph reads as a rendering bug rather
                        than as an error. The named, bordered box remains.

                        The same string as the accessible name, and hidden from
                        the accessibility tree because `role="img"` above already
                        carries it — which also makes every descendant of that
                        element presentational anyway, so this attribute is
                        belt-and-braces rather than what makes it true.
                    -->
                    {#if placement.labelled}
                        <span
                            class="canvas-error-text"
                            data-testid="canvas-error-label"
                            aria-hidden="true"
                            style:left="{placement.labelLeft -
                                placement.left}px"
                            style:top="{placement.labelTop - placement.top}px"
                            style:width="{placement.labelWidth}px"
                            style:height="{placement.labelHeight}px"
                            >{errorLabel(placement.kind)}</span
                        >
                    {/if}
                </div>
            {/each}
        </div>
    {/if}
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
     * The error layer covers the surface and takes no input: the placeholders are
     * positioned in surface coordinates by the frame loop, and the reader must
     * still be able to pan and zoom from anywhere on the surface — including from
     * over a folio that failed.
     */
    .error-layer {
        position: absolute;
        inset: 0;
        pointer-events: none;
        /* The layer is a positioning context in its own right, so a placeholder's
           surface-local coordinates are not affected by anything the root's
           padding or borders might later become. */
        overflow: hidden;
    }

    /*
     * One placeholder, filling the failed canvas's layout rect exactly — which is
     * what makes it read as "this page", rather than as a message about the viewer.
     *
     * Theme tokens throughout, like the rest of the surface: the placeholder sits
     * among the working pages and has to belong to the same picture.
     */
    .canvas-error {
        position: absolute;
        box-sizing: border-box;
        background-color: var(--tri-panel-bg);
        border: 1px solid var(--tri-color-warning);
        color: var(--tri-panel-content);
    }

    /*
     * Auth is not load, and the distinction survives to the picture as well as to
     * the label: a reader scanning a long manifest can see which failures a login
     * would fix without reading every box.
     */
    .canvas-error-auth {
        /* The `-text` variant, not the raw primary, for the reason the focus
           ring's note spells out: the raw token is a fill colour and has no
           contrast guarantee against a panel surface. */
        border-color: var(--tri-color-primary-text);
    }

    /*
     * The message, in a box the frame loop sizes to the on-screen part of the
     * failed canvas (see the markup). Absolutely positioned inside the
     * placeholder, because "centred in the canvas rect" and "centred where the
     * reader is looking" stop being the same box the moment the rect is larger
     * than the viewport — which the zoom ceiling makes ordinary.
     */
    .canvas-error-text {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 0.5rem;
        font-size: 0.8125rem;
        line-height: 1.3;
        text-align: center;
        /* The box is never below `canvasErrors.MIN_LABEL_*`, so the message fits
           at the ordinary text size; this is the guard for the cases that
           bound cannot know about — a translation several times longer, or a
           reader's larger minimum font size. Clipped rather than allowed to
           spill over the pages either side of it. */
        overflow: hidden;
    }

    /*
     * The visible focus ring — a NEW visual affordance, and an accepted design
     * cost rather than an oversight. The previous renderer suppressed focus on
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
