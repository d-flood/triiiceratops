/**
 * The first-party Canvas2D renderer's host: the DOM half of the
 * planner/painter split.
 *
 * A `.svelte.ts` module rather than a plain one so the two planner inputs stay
 * `$derived` over `ViewerState` — the alternative was recomputing the canvas
 * descriptor list by hand on every change, which is the thing the reactive
 * graph is for. The component keeps its element refs, its markup, and three
 * effects that call in here.
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
 * The **paint hook** is here too: registered layers are drawn
 * each frame after the tiles, under the transform `paintScene` left applied,
 * and core registers one of its own. The annotation overlays are NOT — they
 * are DOM layers mounted beside this component by `TriiiceratopsViewer`, on
 * the frame cadence and the public coordinate helpers, so they know nothing
 * about which renderer is mounted.
 *
 * ## Virtualization
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

import { logger } from '../logging/logger';
import { getCanvasId } from '../utils/iiifIds';
import { untrack } from 'svelte';

import { installRendererDevtools } from './rendererDevtools';

import { getVisibleCanvasEntries } from '../components/viewerControls';
import {
    toPlannerCanvases,
    unsupportedPresentationIds,
} from './canvasDescriptors';
import {
    resolveCompanionCanvases,
    withCompanion,
    type CompanionCanvases,
} from './companionCanvases';
import { GestureRecogniser } from './gestureArbiter';
import { PAN_KEYS, keyPanVelocity } from './keyboardPan';
import {
    createTileSourceErrorMirror,
    errorPlacements,
    viewerLevelErrorKind,
    type CanvasErrorKind,
    type CanvasErrorPlacement,
} from './canvasErrors';
import {
    canvasPlacements,
    samePlacements,
    // Aliased: `layoutQueries` exports an unrelated `CanvasPlacement` (a canvas
    // rect plus its declared size, for coordinate conversion) that this module
    // also imports. This one is a treatment's on-screen box.
    type CanvasPlacement as TreatmentPlacement,
} from './canvasPlacements';
import { imageServiceCache } from './imageService';
import { createStaticImages } from './staticImages';
import { staticImageFailures } from './staticImageFailures';
import {
    boxContains,
    canvasBoxToWorld,
    canvasExtent,
    canvasPointToWorld,
    canvasScaleFactor,
    fitTargetBounds,
    navigationTargetBounds,
    nearestRect,
    reflowShift,
    worldBoxToCanvas,
    worldPointToCanvas,
    type CanvasPlacement,
} from './layoutQueries';
import type { RendererPort } from './rendererPort';
import { markRendererPort } from './rendererPortBrand';
import {
    imageAdjustmentsToCssFilter,
    type CanvasSize,
    type ContainerSize,
    type ImageAdjustments,
    type ViewportBox,
    type ViewportInset,
    type ViewportPoint,
} from '../types/viewport';
import { paintScene } from './paintScene';
import {
    drawPaintLayers,
    paintCanvasSpace,
    type PaintFrame,
    type RegisteredPaintLayer,
} from './paintLayers';
import { planScene, planViewportLimits } from './planScene';
import { pointerSample } from './pointerSamples';
import { createTileScheduler } from './tileScheduler';
import {
    ANIMATION_TIME_CONSTANT,
    DEFAULT_BUDGETS,
    DEFAULT_ZOOM_PER_WHEEL_NOTCH,
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
    MIN_ZOOM_FRACTION,
    MOBILE_BUDGET_QUERY,
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
    WHEEL_NOTCH_PIXELS,
    WHEEL_PAGE_PIXELS,
    WHEEL_TIME_CONSTANT,
} from './rendererDefaults';
import type { Box } from './tilePyramid';
import type {
    ImageServiceFacts,
    LayoutRect,
    PlannerBudgets,
    PlannerCanvas,
    Point,
    ResidencyTier,
    ScenePlan,
    StaticImageDraw,
    Viewport,
} from './types';
import {
    anchoredZoomCentre,
    approach,
    approachScale,
    canvasToScreen as canvasToScreenPoint,
    clamp,
    compensatedScale,
    constrainCentre,
    fitBounds,
    insetFitCentre,
    insetFitScale,
    normalizeWheelDelta,
    screenToCanvas as screenToCanvasPoint,
    viewportBox,
    viewportTransform,
    wheelZoomRate,
    zoomRange,
} from './viewportMath';
import { watchReducedMotion } from '../state/reducedMotion';
import type { CanvasRegion } from '../utils/contentState';
import type { ViewerState } from '../state/viewer.svelte';

export interface CanvasRendererOptions {
    viewerState: ViewerState;
    /** Localized messages, resolved by the component (they need its context). */
    messages: ReturnType<typeof import('../state/i18n.svelte').getMessages>;
    /** The viewer's tile sources, read as a change signal for refitting. */
    getTileSources: () => unknown;
}

export function createCanvasRenderer(options: CanvasRendererOptions) {
    const { viewerState } = options;
    const m = options.messages;

    let root: HTMLDivElement | undefined;
    let surface: HTMLCanvasElement | undefined;

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

    /**
     * The decoded whole images this renderer holds, and their request
     * lifecycle. See `renderer/staticImages.ts` — the placement keying, the
     * failure memory and the four ordering invariants live there, with the
     * browser injected, so they are unit-tested rather than reachable only
     * through an end-to-end run.
     */
    const staticImages = createStaticImages({
        onCanvasError: (canvasId) => {
            canvasErrors[canvasId] = 'load';
        },
        onCanvasErrorCleared: (canvasId) => {
            if (canvasErrors[canvasId]) delete canvasErrors[canvasId];
        },
        onChanged: () => {
            loadedGeneration += 1;
        },
    });

    /** Bumped when a decoded image or tile arrives, to re-run the paint effect. */
    let loadedGeneration = $state(0);

    /**
     * `ViewerConfig.renderer`'s numeric knobs, validated once per config change.
     *
     * Every member is optional, and a config carrying `undefined`, `null`, or a
     * stray `NaN` from a JSON round-trip must take core's default rather than
     * poison the planner with a threshold nothing compares true against. The
     * check belongs at this edge and nowhere else: the frame loop, the input
     * handlers and `applyByteBudget` all read numbers that are already known
     * good, instead of each re-deciding whether the same value is usable.
     */
    const knobs = $derived.by(() => {
        const config = viewerState.config?.renderer;
        const usable = (value: number | undefined): value is number =>
            typeof value === 'number' && Number.isFinite(value) && value > 0;
        // Overrides only, so a knob nobody set leaves core's default — and so
        // `maxDecodedPixels`, which is not a knob, can never be reached at all.
        const budgets: Partial<PlannerBudgets> = {};
        const carry = (member: keyof PlannerBudgets, value?: number) => {
            if (usable(value)) budgets[member] = value;
        };
        carry('byteBudget', config?.byteBudget);
        carry('marginFactor', config?.residencyMargin);
        carry('pyramidThreshold', config?.pyramidThreshold);
        carry('boxThreshold', config?.boxThreshold);
        carry('minPixelRatio', config?.minPixelRatio);
        const animation = config?.animationTimeConstant;
        const maxZoom = config?.maxZoomFactor;
        return {
            budgets,
            /**
             * The time constant every programmatic and discrete animation runs
             * at.
             */
            animationTime: usable(animation)
                ? animation
                : ANIMATION_TIME_CONSTANT,
            /**
             * How far past the fit the reader may zoom. A factor of 1 or less
             * is rejected rather than honoured, the same way `zoomPerClick`
             * refuses one: it would put the ceiling at or below the fit and
             * leave a viewer that cannot zoom in at all.
             */
            maxZoomFactor:
                usable(maxZoom) && maxZoom > 1 ? maxZoom : MAX_ZOOM_FACTOR,
        };
    });

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
     * {@link knobs} — a **closed** set of named knobs, not an open options
     * object. A configured `byteBudget` wins over the device ceiling, because a
     * consumer who states a number has more context than a media query does.
     *
     * Deliberately not `$state`: read by the frame loop, never by the reactive
     * graph.
     */
    let budgets: PlannerBudgets = { ...DEFAULT_BUDGETS, ...knobs.budgets };

    /**
     * The log-scale zoom per pixel of wheel travel, from
     * `ViewerConfig.renderer.zoomPerWheelNotch`.
     *
     * Read per event rather than resolved with the other knobs: this one has a
     * floor of its own (below) and a `Math.log` to convert, and a wheel handler
     * is nowhere near hot enough for either to matter.
     *
     * A factor of 1 or less is rejected rather than honoured — it would freeze
     * the wheel or invert its direction, neither of which is a thing to
     * configure — and takes the default, the same way `zoomPerClick` refuses
     * one.
     */
    function wheelRate(): number {
        const configured = viewerState.config?.renderer?.zoomPerWheelNotch;
        const zoomPerNotch =
            typeof configured === 'number' &&
            Number.isFinite(configured) &&
            configured > 1
                ? configured
                : DEFAULT_ZOOM_PER_WHEEL_NOTCH;
        return wheelZoomRate(zoomPerNotch, WHEEL_NOTCH_PIXELS);
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
     * serviceId → the image-service facts the planner may use.
     *
     * A per-renderer view onto the page-shared `imageServiceCache`, which is
     * what keeps metadata and pixels on **two lifetimes**: this record is
     * rebuilt on remount, the cache behind it is not, so re-entering a canvas
     * costs no `info.json` request.
     *
     * Keyed by SERVICE, like the cache it views — a canvas id is not a stable
     * name for a picture, and keying it that way made a Choice switch answer
     * with the previous alternative's facts forever (`planScene.factsFor`).
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
     * element with an accessible name: anything a user
     * must perceive lives in the DOM layer rather than in painted pixels. It
     * changes at the rate canvases fail — a handful of times per session, never
     * per frame — so reactivity costs nothing here.
     */
    const canvasErrors: Record<string, CanvasErrorKind> = $state({});

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
     * The **unsupported presentation**'s placements, in surface-local CSS
     * pixels — the canvases whose painting bodies core cannot render at all
     * (CONTEXT.md; ADR 0017).
     *
     * Beside {@link errorLayer} rather than folded into it, because the two say
     * opposite things about the manifest. An error means a source the viewer
     * asked for came back with nothing, and carries a retry, a negative-cache
     * entry and an error-channel event with it. This means the viewer never
     * asked: the canvas holds a sound recording or a film, which is not a
     * failure and has nothing to retry.
     */
    let unsupportedLayer: TreatmentPlacement<'unsupported'>[] = $state([]);

    /**
     * The canvases this renderer is showing, in **canvas space**.
     *
     * **Continuous mode is the whole manifest**, all 800 folios of it. That is
     * not a fetch storm: laying a canvas out is arithmetic over manifest
     * dimensions and costs nothing, while FETCHING for it is gated by the planner's
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
     * canvasId → its resolved companions, for the **claimed** canvases that
     * have any.
     *
     * Beside {@link plannerCanvases} rather than inside it, and that separation
     * is the point: the descriptor derivation above stays claim-free and
     * phase-free, so a claim arriving does not re-plan every canvas in an
     * 800-folio manifest (user story 28). This one reads the claim set and
     * **not** the phase, so pressing play selects between values already in hand
     * instead of rebuilding them (user story 29).
     *
     * Empty for every manifest with no claimed canvas, which is all of them
     * until an AV plugin is registered.
     */
    // Plain `Map`s throughout, like `canvasesById` below and for its reason.
    const companionsByCanvasId: Map<string, CompanionCanvases> = $derived.by(
        () => {
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            const companions = new Map<string, CompanionCanvases>();
            if (plannerCanvases.length === 0) return companions;
            // The claim COUNT next, and it is the whole cost on an image
            // manifest: asking `isCanvasClaimed` per canvas would subscribe to
            // a signal per folio for an answer that is `false` 800 times.
            if (viewerState.claimedCanvases.size === 0) return companions;

            const claimed = plannerCanvases.filter((canvas) =>
                viewerState.isCanvasClaimed(canvas.id),
            );
            if (claimed.length === 0) return companions;

            // Untracked for `plannerCanvases`' reason: `viewerState.canvases` is
            // raw manifest JSON behind a deep `$state` proxy, and walking a
            // companion Canvas tracked would make every property of it a
            // dependency of this derivation.
            return untrack(() => {
                // eslint-disable-next-line svelte/prefer-svelte-reactivity
                const rawById = new Map<string, unknown>();
                for (const canvas of viewerState.canvases) {
                    const canvasId = getCanvasId(canvas);
                    if (canvasId) rawById.set(canvasId, canvas);
                }

                for (const canvas of claimed) {
                    const resolved = resolveCompanionCanvases(
                        rawById.get(canvas.id),
                        canvas,
                        (canvasId) => viewerState.getSelectedChoice(canvasId),
                    );
                    if (resolved) companions.set(canvas.id, resolved);
                }
                return companions;
            });
        },
    );

    /**
     * The canvases as they are painted — {@link plannerCanvases} with each
     * claimed canvas's companion selected by its **companion phase**.
     *
     * A canvas whose claimant has set no phase at all is passed through
     * untouched, so the claim on its own still changes nothing about what core
     * renders (user story 27).
     */
    const paintedCanvases: PlannerCanvas[] = $derived(
        companionsByCanvasId.size === 0
            ? plannerCanvases
            : plannerCanvases.map((canvas) => {
                  const companions = companionsByCanvasId.get(canvas.id);
                  if (!companions) return canvas;
                  const phase = viewerState.companionPhaseFor(canvas.id);
                  return phase === undefined
                      ? canvas
                      : withCompanion(canvas, companions, phase);
              }),
    );

    /**
     * The change signal the host's refit effect watches: every painted canvas's
     * id and rect, joined.
     *
     * Deliberately a key over the geometry rather than the painted list itself.
     * A refit overwrites the reader's centre and scale, and `paintedCanvases`
     * reallocates whenever a claim or a companion phase arrives — while the rect
     * is identical across every phase of the same canvas by construction. Keying
     * on the array would throw the page back to a fit on every play and pause
     * (user story 14) and would move a canvas the moment a plugin claimed it
     * (user story 27).
     */
    const paintedGeometry: string = $derived(
        paintedCanvases
            .map((canvas) => `${canvas.id}:${canvas.width}×${canvas.height}`)
            .join('|'),
    );

    /**
     * The same canvases, by id.
     *
     * Built once per change rather than searched per lookup: on an 800-folio
     * manifest a linear `find` per metadata request is 2400 comparisons a
     * frame, for an answer that changes only when the manifest does.
     */
    // A plain `Map`, not a `SvelteMap`: this is a `$derived` value, rebuilt
    // whole whenever `plannerCanvases` changes and never mutated in place, so a
    // reactive collection would add per-entry signals nothing reads.
    const canvasesById: Map<string, PlannerCanvas> = $derived(
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        new Map(paintedCanvases.map((canvas) => [canvas.id, canvas])),
    );

    /**
     * The canvases getting the **unsupported presentation**, by id — the ones
     * with no image on them and no plugin claiming them.
     *
     * A manifest fact plus a claim, not a frame one: it is settled when the
     * descriptors are built or a claim comes and goes, so the frame loop only
     * has to ask where those canvases are this frame. Empty for every image
     * manifest, which is what keeps the check on the frame path free.
     */
    const unsupportedCanvasIds: Set<string> = $derived(
        unsupportedPresentationIds(plannerCanvases, (canvasId) =>
            viewerState.isCanvasClaimed(canvasId),
        ),
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
     * count cannot carry it.
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
            canvases: paintedCanvases,
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
     * which is indistinguishable from one that is still loading. What a *user*
     * sees is handled elsewhere; this is the developer's version, and it goes through
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
     * Companion warnings already announced, keyed on the canvas they belong to.
     *
     * A plain Set, deliberately not a `SvelteSet`: read from the frame loop,
     * never by the reactive graph.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const reportedCompanionWarnings = new Set<string>();

    /**
     * Say once, for developers, that a claimed canvas's companion could not be
     * painted.
     *
     * Never a user-facing error and never the unsupported presentation: the
     * canvas is one a plugin is rendering into, so the reader is being told
     * about the recording by its claimant either way, and a broken companion
     * costs a picture rather than the canvas (user story 23). Debug-gated
     * `logger` for {@link reportUnresolvedThumbnails}' reason — a published
     * distribution is quiet by default.
     */
    function reportCompanionWarnings(): void {
        for (const [canvasId, companions] of companionsByCanvasId) {
            if (companions.warnings.length === 0) continue;
            if (reportedCompanionWarnings.has(canvasId)) continue;
            reportedCompanionWarnings.add(canvasId);
            for (const warning of companions.warnings) logger.warn(warning);
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
     *
     * **Every service on the canvas**, not one: a composite canvas paints from
     * as many image services as it has painting annotations, and the planner
     * names a CANVAS rather than a service because a failure is recorded against
     * a canvas. Asking for all of them is exact rather than approximate — the
     * planner asks only when at least one is missing, and the cache answers an
     * already-known service with no request at all.
     */
    function requestMetadata(canvasIds: string[]): void {
        for (const canvasId of canvasIds) {
            const canvas = canvasesById.get(canvasId);
            if (!canvas) continue;

            for (const image of canvas.images) {
                if (image.source.kind !== 'service') continue;
                ensureImageService(canvasId, image.source.serviceId);
            }

            // Warmed companions too: a picture with no facts has no ladder and
            // no pyramid, so the handover they exist for would never be ready.
            // Asked for as WARM, because this canvas does not paint from them.
            for (const image of canvas.warmImages ?? []) {
                if (image.source.kind !== 'service') continue;
                ensureImageService(canvasId, image.source.serviceId, true);
            }
        }
    }

    /**
     * Fetch one service's `info.json` and record what it says about the canvas
     * that asked.
     *
     * Split out of {@link requestMetadata} only because a canvas can now ask for
     * several; the body is unchanged and its reasoning is per-request.
     *
     * `warm` marks a service this canvas does NOT paint from — a warmed
     * companion, fetched so the handover has something in hand. Such a service
     * may neither raise nor clear `canvasErrors`, which is a statement about
     * what the reader can SEE on this canvas: a score behind auth beside a
     * public placeholder would otherwise raise viewer-wide error chrome over a
     * canvas that is painting perfectly (`canvasErrors.viewerLevelErrorKind` is
     * not painting-gated), and a successful warm would clear the message a
     * genuinely broken painting service had earned. Warming is best-effort and
     * invisible: it costs the reader nothing and says nothing.
     */
    function ensureImageService(
        canvasId: string,
        serviceId: string,
        warm = false,
    ): void {
        void imageServiceCache.ensure(serviceId).then((facts) => {
            if (!facts) {
                if (warm) return;
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
            if (!warm && canvasErrors[canvasId]) delete canvasErrors[canvasId];
            if (knownMetadata[serviceId] === facts) return;
            // Captured BEFORE the write below, which is what re-lays the
            // world out. See `compensateForReflow`.
            const beforeReflow = viewportLimits().layout;
            // APPEND-ONLY, and load-bearing: LAYOUT reads this record. A
            // canvas the manifest never sized is laid out from a guess and
            // reflowed to the facts below, so evicting an entry would put
            // the guess back — resizing the canvas, changing its tier, and
            // provoking the very fetch whose answer was just dropped. The
            // planner asserts the fixed point (`planScene.test.ts` §the
            // reflow terminates); the byte budget must evict
            // decoded pixels only, never these facts, which is also what
            // "metadata is cached separately from decoded pixels, with a
            // longer lifetime" means in the spec.
            knownMetadata[serviceId] = facts;
            // The one input to `viewportLimits`' memo that is mutated in
            // place rather than replaced, so the memo cannot see it by
            // identity and is told instead.
            metadataRevision += 1;
            compensateForReflow(beforeReflow);
            // Tiles can only be planned now that the pyramid is knowable.
            loadedGeneration += 1;
        });
    }

    /**
     * Hold the page the reader is looking at still across a reflow.
     *
     * A canvas the manifest never sized is laid out from a guess and re-laid
     * out when its `info.json` lands. In continuous mode every
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
     * Everything the last refit was justified by, and the renderer's only
     * record of it. `null` until the first refit, so a fresh mount is a change
     * of world too.
     *
     * - `world` — manifest, mode, reading direction, and scale policy. What
     *   tells canvas navigation (a move within one laid-out world, which eases)
     *   apart from a change of world (which does not); see the scene effect.
     *   Deliberately not the layout's identity, which would look like the
     *   obvious key and is useless here: `plannerCanvases` re-derives on every
     *   canvas change, so a new layout object is exactly what navigation
     *   produces.
     * - `sources` — the viewer's tile sources by IDENTITY. This is how
     *   navigation reaches the refit: another canvas re-derives them.
     * - `geometry` — the painted canvases' ids and their INTRINSIC sizes, not
     *   their laid-out rects: a canvas resolving its real dimensions refits,
     *   while a phase change under unchanged dimensions does not. The
     *   arrangement of those canvases reaches this record through `world` and
     *   `sources` instead, which is why the rects themselves are absent here.
     *
     * One record rather than two on purpose: the eased-travel decision and the
     * guard are asking about the same fact, and two memories of it could drift.
     */
    let lastFit: {
        world: string;
        sources: unknown;
        geometry: string;
    } | null = null;

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

    /**
     * The identity of the laid-out WORLD: the four viewer members that decide
     * what is arranged where, joined.
     *
     * Read tracked, and `refitForCurrentWorld` depends on that — see its own
     * doc comment for why those four are change signals while everything else a
     * fit reads is not.
     */
    function worldKey(): string {
        return [
            viewerState.manifestId,
            viewerState.viewingMode,
            viewerState.viewingDirection,
            viewerState.preserveCanvasScale,
        ].join('|');
    }

    /**
     * The inset the next fit frames into — the edges a plugin has reserved for
     * its own floating UI (`ViewerState.setViewportInset`).
     *
     * Read **untracked**, and that is the whole no-reactivity rule in one line:
     * the scene effect below calls `fitCurrentCanvas`, so a tracked read would
     * make setting an inset re-run that effect and re-fit the viewport — core
     * animating the image because a plugin panel opened, which is exactly what
     * the inset is specified not to do. The renderer consults the inset when it
     * fits, and only then.
     */
    function currentInset(): ViewportInset {
        return untrack(() => viewerState.viewportInset);
    }

    /**
     * The scale at which a fit lands on the WHOLE surface — the zoom range's
     * reference.
     *
     * **Deliberately un-inset**, and this is the one place where that costs
     * something. `homeScale` exists only as `clampScale`'s `fitScale`, so an
     * inset threaded in here is an inset threaded into `zoomRange`, and from
     * there into pinch, the wheel, double-tap, keyboard zoom, `zoomTo`,
     * `zoomBy`, and the re-clamp after every resize — every one of which the
     * inset is specified not to touch. A plugin panel opening would lower the
     * zoom ceiling under the reader's fingers and snap a reader already at it
     * back out on the next nudge, making "setting an inset never changes the
     * current scale" false. Pinned by `tests/canvas-renderer.spec.ts`, "an inset
     * leaves the zoom range exactly where it was".
     *
     * **The residual tension, stated rather than resolved.** An inset reserving
     * more than half of the binding axis wants a fit scale below the reader's
     * own zoom floor (`MIN_ZOOM_FRACTION` of this un-inset fit), so `clampScale`
     * raises it and the box is framed larger than the rectangle left visible —
     * the inset is honoured in direction but not in full. At exactly the same
     * threshold {@link constrained} starts clamping the centre shift back
     * towards the world, for the same arithmetic reason; in continuous mode,
     * where the world is the whole strip, that bites on the first and last
     * canvas. Both are the standing guarantees — a reader can always zoom out
     * far enough to see a whole canvas, and the world never leaves the viewport
     * — winning over a plugin's request, which is the right way round: the
     * alternative is a viewer whose zoom range a plugin can collapse. Reserving
     * more than half an axis is documented as unsupported rather than fixed
     * (`/docs/plugin-authoring/`).
     */
    function homeScale(limits: ReturnType<typeof viewportLimits>): number {
        const bounds = fitBoundsTarget(limits);
        if (!bounds || viewport.width === 0 || viewport.height === 0) return 1;
        return fitBounds(bounds, viewport).scale;
    }

    function clampScale(scale: number): number {
        const limits = viewportLimits();
        // TWO floors, and `zoomRange` owns both: the reader's — half the scale at
        // which the canvas fits, so zooming out stops with the canvas covering
        // half the viewport — and the renderer's derived one beneath it, capped at
        // the fit so that seeing a whole canvas is reachable at any window size.
        // `homeScale` is measured from the LIVE viewport on every call, which is
        // what makes that hold across a resize and on a phone.
        const { min, max } = zoomRange(
            homeScale(limits),
            limits.minZoom,
            knobs.maxZoomFactor,
            MIN_ZOOM_FRACTION,
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
     * does not change the current canvas, and does not change what
     * {@link fitWorld} fits either.
     *
     * Whether it eases is the CALLER's to say, and the scene effect is what
     * decides: navigation inside a world already on screen is travel and eases
     * (ADR 0015 lists canvas navigation among the animated cases); the first
     * measured frame, and a change of world, have no view to travel from.
     *
     * An unspent {@link openingRegion} outranks the canvas's own bounds, which
     * is the whole of how a content state's `#xywh=` reaches the viewport: both
     * of the paths that adopt an initial view — the first measured frame and
     * every world refit — come through here, so neither has to know the region
     * exists.
     *
     * `'settled'` is the third answer, and it fits NOTHING. A region already
     * applied under the geometry in force is neither re-applied nor overridden:
     * the reader stays exactly where they are, whether that is the region the
     * viewer opened at or somewhere they have since panned to. This is
     * `refitForCurrentWorld`'s own rule — a refit that can justify no change
     * makes none — reaching one step further, and it is load-bearing rather than
     * an optimisation: a refit on a churned source list lands immediately after
     * the fit that applies the region, so a fall-through to the whole canvas
     * here would undo every opening frame.
     */
    function fitCurrentCanvas(animated = false) {
        const opening = openingRegionTarget();
        if (opening === 'settled') return;
        applyFit(opening ?? navigationBoundsTarget(viewportLimits()), animated);
    }

    /**
     * The world whose OPENING fit has already been performed — the first fit in
     * that world with a measured surface and a laid-out canvas.
     *
     * This is what separates opening from navigation. Every fit reaches
     * {@link openingRegionTarget}, and a fit is indistinguishable from any other
     * by its arguments alone: a page turn and a first frame both arrive with a
     * canvas and a geometry. Without this memory an initial region sitting in
     * viewer state would be claimed by whichever fit next happened to be able to
     * honour it, which on a page turn means framing the canvas the reader
     * navigated TO on the region the content state named for the one they came
     * from.
     */
    let openedWorld: string | null = null;

    /**
     * The region this renderer has taken over — the one the viewer OPENED at
     * (`ViewerState.initialCanvasRegion`) or the one a navigation carried
     * (`ViewerState.navigationRegion`), scoped to the world and the canvas it
     * was honoured for, and carrying the geometry it was last measured against.
     *
     * Taken over rather than read in place because either member is an input to
     * one fit, not a standing override: leaving one set would re-frame every
     * later canvas the reader navigated to. See {@link openingRegionTarget} for
     * when the handover happens and why it is not at mount.
     */
    let openingRegion: {
        world: string;
        canvasId: string;
        region: CanvasRegion;
        /**
         * `paintedGeometry` as it stood when the region was last framed, or
         * `null` while it has never been framed. A fit under this same geometry
         * has no new reading of the region to offer, so it changes nothing.
         */
        geometry: string | null;
    } | null = null;

    /**
     * What this fit should frame on account of a claimed region: the world box
     * the region names, `'settled'` for a fit that must leave the view alone (see
     * {@link fitCurrentCanvas}), or `null` when the region has no say in it.
     *
     * Three rules, all of them about sequencing rather than about geometry:
     *
     * **Claimed at an opening, or by the navigation that carried it.** An
     * initial region is taken over at the first fit of a world that can actually
     * honour it — a measured surface and a laid-out canvas — and never at a
     * later fit of that same world. A manifest resolves asynchronously, so at
     * mount there is no canvas to frame and no geometry to frame it in; every fit
     * before then leaves the region where the viewer put it, and the fit that
     * finally has both consumes it. That is why the handover cannot live in a
     * component effect: mount order is not canvas arrival. The flip side is that
     * an initial region arriving after its world has opened is stranded —
     * deliberately, because `initialCanvasRegion` names where the viewer OPENS,
     * and a page turn is navigation inside a world already open. It is left in
     * viewer state rather than discarded, so a change of manifest, mode or
     * direction — a new world, which opens afresh — still claims it for the
     * canvas that arrives.
     *
     * A navigation region is the other half of that rule rather than an
     * exception to it: `ViewerState.navigationRegion` names the canvas it was
     * carried to (a newspaper article's `xywh`, chosen from the table of
     * contents), so the fit of THAT canvas claims it whether or not the world is
     * opening. It cannot be stranded because the navigation that supplied it is
     * the navigation being fitted.
     *
     * **Re-framed only under a changed geometry.** The one reason a claimed
     * region outlives its first fit is a canvas resolving its real intrinsic size
     * — a thumbnail giving way to a pyramid. Canvas space is the region's own
     * coordinate system, so that fit is a more accurate reading of the same
     * region, not a repeat of it. A world also refits on a change of tile sources
     * alone, and that carries no new reading of the region: such a fit answers
     * `'settled'`, and the memory survives it so a genuinely later dimension
     * correction still re-frames.
     *
     * **Spent by a change of canvas or of world.** The reader has navigated, and
     * navigation fits normally.
     *
     * Read untracked for the reason {@link currentInset} is: this runs inside
     * the refit effect, and a tracked read here would make the effect follow
     * viewer state it only consults when it fits.
     */
    function openingRegionTarget(): Box | 'settled' | null {
        return untrack(() => {
            if (viewport.width === 0 || viewport.height === 0) return null;

            const canvasId = viewerState.canvasId;
            if (!canvasId) return null;
            const placement = placementOf(canvasId);
            if (!placement) return null;

            const world = worldKey();
            const opening = openedWorld !== world;
            openedWorld = world;

            const navigated = viewerState.takeNavigationRegion(canvasId);
            if (navigated) {
                claimRegion(world, canvasId, navigated);
            } else if (opening && viewerState.initialCanvasRegion) {
                claimRegion(world, canvasId, viewerState.initialCanvasRegion);
                viewerState.setInitialCanvasRegion(null);
            }

            if (!openingRegion) return null;
            if (
                openingRegion.canvasId !== canvasId ||
                openingRegion.world !== world
            ) {
                openingRegion = null;
                return null;
            }

            const geometry = paintedGeometry;
            if (openingRegion.geometry === geometry) return 'settled';

            const box = regionWithinCanvas(openingRegion.region, placement);
            if (!box) return null;

            openingRegion.geometry = geometry;
            return canvasBoxToWorld(box, placement);
        });
    }

    /** Adopt `region` as this world's claim, to be framed for `canvasId`. */
    function claimRegion(
        world: string,
        canvasId: string,
        region: CanvasRegion,
    ) {
        openingRegion = { world, canvasId, region, geometry: null };
    }

    /**
     * A region clipped to the canvas it names, or `null` if nothing of it is on
     * the canvas at all.
     *
     * Ingestion never throws and never blanks the viewer (ADR 0006): a region
     * running off the edge is honoured for the part that exists, and one wholly
     * outside the canvas — or non-finite, or degenerate — answers `null` so the
     * caller fits the whole canvas. Clipping rather than translating, because a
     * region is a claim about WHERE on this canvas the reader is being sent.
     */
    function regionWithinCanvas(
        region: CanvasRegion,
        placement: CanvasPlacement,
    ): Box | null {
        const extent = canvasExtent(placement);
        const left = Math.max(0, region.x);
        const top = Math.max(0, region.y);
        const right = Math.min(extent.width, region.x + region.width);
        const bottom = Math.min(extent.height, region.y + region.height);
        const width = right - left;
        const height = bottom - top;

        // Stated as `>` rather than `<=` so a `NaN` extent — a region carrying
        // one, or a canvas with no usable size — fails the test instead of
        // passing every comparison against it.
        if (!(width > 0) || !(height > 0)) return null;
        return { x: left, y: top, width, height };
    }

    /**
     * Adopt the view that frames `bounds`.
     *
     * The fitted scale goes through `clampScale` like every other scale this
     * component adopts. It is a no-op only when the bounds are a layout rect,
     * whose fit IS the home scale — `fitWorld`, and `fitCurrentCanvas` on the
     * canvas's own bounds. Clamping is live for every box chosen rather than
     * measured: the public `fitBounds` command, and the opening region
     * `fitCurrentCanvas` prefers when a content state named one. A two-unit box
     * on a 4000-unit canvas fits at a scale hundreds of times the ceiling.
     * `zoomTo` documents its limits as inescapable; a sibling command that
     * skips them would make that false, and would bypass the tier and
     * zoom-floor invariants derived from the same range.
     *
     * **The single choke point every fit goes through**, which is why the
     * viewport inset is consulted here and nowhere else: pan, zoom, the
     * coordinate helpers and the viewport queries all stay about the whole
     * surface.
     */
    function applyFit(bounds: Box | null, animated: boolean) {
        if (!bounds || viewport.width === 0 || viewport.height === 0) return;

        const inset = currentInset();
        const scale = clampScale(insetFitScale(bounds, viewport, inset));
        // The centre is composed at the scale actually ADOPTED, not the one the
        // fit asked for: the inset shift is a screen distance, so a clamped fit
        // whose shift was divided by the un-clamped scale lands off-centre by
        // `adopted / wanted` — see `insetFitCentre`.
        const centre = insetFitCentre(bounds, viewport, inset, scale);
        if (animated) {
            setViewAnimated(centre, scale, knobs.animationTime);
            return;
        }

        viewport = { ...viewport, centre, scale };
        targetCentre = centre;
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

    /**
     * The canvases the reader is looking at — the port's `getVisibleCanvasIds`.
     *
     * Two different questions behind one answer, and the mode decides which:
     *
     * - `individuals` / `paged`: the laid-out world, unfiltered. There the world
     *   IS the current canvas or the current spread, and a spread stays open
     *   however far into one of its pages the reader has zoomed — an annotation
     *   on the facing page must not vanish from the panel because the page's rect
     *   left the viewport.
     * - `continuous`: the world is the whole manifest, so the question becomes
     *   geometric and this filters by the viewport box. Deliberately not the
     *   viewer's `canvasId`: a scroll moves the viewport and leaves that behind
     *   (see `layoutQueries.navigationTargetBounds`).
     *
     * The nearest rect to the centre is always included, so the answer is never
     * empty for a viewport sitting in the gap between two folios.
     */
    function visibleCanvasIds(): string[] {
        const { layout } = viewportLimits();
        if (layout.length === 0) return [];

        if (viewerState.viewingMode !== 'continuous') {
            return layout.map((rect) => rect.canvasId);
        }

        if (viewport.scale <= 0) return [];

        const view = viewportBox(viewport);
        const nearest = nearestRect(layout, viewport.centre);

        return layout
            .filter(
                (rect) =>
                    rect.canvasId === nearest?.canvasId ||
                    (rect.x < view.x + view.width &&
                        rect.x + rect.width > view.x &&
                        rect.y < view.y + view.height &&
                        rect.y + rect.height > view.y),
            )
            .map((rect) => rect.canvasId);
    }

    /**
     * Publish the visible set on `ViewerState`, but only when it CHANGES.
     *
     * The annotation panel is not a `frame`-cadence reader — it is ordinary
     * chrome — so it needs a notifying value, and writing one per painted frame
     * would wake every plugin's batched subscription sixty times a second. The
     * set changes only when a folio enters or leaves the viewport, which is
     * exactly the cadence a panel following the scroll should update at, so the
     * comparison below is the debounce.
     */
    function publishVisibleCanvasIds() {
        const ids = visibleCanvasIds();
        const current = viewerState.visibleCanvasIds;
        if (
            ids.length === current.length &&
            ids.every((id, index) => id === current[index])
        ) {
            return;
        }

        viewerState.visibleCanvasIds = ids;
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
                knobs.animationTime,
            );
        },

        panTo(centre: ViewportPoint, canvasId?: string): void {
            const placement = placementOf(canvasId);
            if (!placement) return;
            setViewAnimated(
                canvasPointToWorld(centre, placement),
                viewport.scale,
                knobs.animationTime,
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

        getVisibleCanvasIds(): string[] {
            return visibleCanvasIds();
        },

        getVisibleBounds(canvasId?: string): ViewportBox | null {
            const placement = placementOf(canvasId);
            if (!placement || viewport.scale <= 0) return null;
            return worldBoxToCanvas(viewportBox(viewport), placement);
        },

        getCanvasSize(canvasId?: string): CanvasSize | null {
            const placement = placementOf(canvasId);
            return placement ? canvasExtent(placement) : null;
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
            return canvasToScreenPoint(
                canvasPointToWorld(point, placement),
                viewport,
            );
        },

        screenToCanvas(
            point: ViewportPoint,
            canvasId?: string,
        ): ViewportPoint | null {
            const placement = placementOf(canvasId);
            if (!placement || viewport.scale <= 0) return null;
            return worldPointToCanvas(
                screenToCanvasPoint(point, viewport),
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

        onTap(listener: (point: ViewportPoint) => void): () => void {
            tapListeners.add(listener);
            return () => tapListeners.delete(listener);
        },
    });

    /**
     * Frame-cadence listeners. A plain `Set`, deliberately not reactive: it is
     * read once per painted frame, and waking the reactive graph per frame is
     * the cost the `frame` cadence exists to avoid in the first place.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const frameListeners = new Set<() => void>();
    // Allocated only if devtools registers a waiter, so production pays nothing.
    let detachWaiters: (() => void)[] | null = null;

    /**
     * Surface-tap listeners. A plain `Set` for the same reason the frame ones
     * are, though the pressure is the opposite: a tap is a human-rate event, and
     * this set is read once per tap.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const tapListeners = new Set<(point: ViewportPoint) => void>();

    /** Wake `frame`-cadence subscribers. Called once per painted frame. */
    function emitFrame() {
        for (const listener of [...frameListeners]) listener();
    }

    /** Announce a single tap, in surface-local CSS pixels. */
    function emitTap(point: ViewportPoint) {
        for (const listener of [...tapListeners]) listener(point);
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
        // After the paint, so the set published is the one just drawn, and only
        // on a change (see `publishVisibleCanvasIds`).
        publishVisibleCanvasIds();

        if (animating || momentum || keyPan) scheduleFrame();
    }

    /**
     * One frame of held-key panning.
     *
     * Deliberately **undecayed**, unlike `stepMomentum`: the key is still down,
     * so the user is still asking to move, and applying friction to a held key
     * would make it crawl to a halt while held. The rate is a constant, which
     * gives "steady rate, no acceleration, no judder" — and it holds however
     * often the OS repeats the key-down, because
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
        reportCompanionWarnings();
        // Before painting, so a canvas that left the window stops painting in
        // the frame it left rather than the one after.
        //
        // The list is already tier-gated by the planner, which is the
        // static-image half of virtualization and needs saying because a static
        // source has no tile scheduler to bound it: fed the whole manifest, this
        // would start 800 `<img>` loads on open — the same fetch storm as 800
        // `info.json` requests, in a different costume. Pixels are therefore
        // released by the same distance rule the tiles are.
        loadStaticImages(plan.staticImages);
        updateCanvasErrors(plan);
        updateUnsupportedCanvases(plan);

        // The view-stable gate again, this time as the painter's edge rule:
        // whole device pixels at rest, a one-pixel overlap while moving. Read
        // fresh rather than taken off the plan, because `stepMomentum` can end
        // the glide in this very frame.
        paintScene(
            ctx,
            plan,
            viewport,
            { images: staticImages.images, tiles: tiles.get },
            dpr,
            viewStable(),
        );
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
     * The transform is built rather than read back off the context
     * (`getTransform` allocates a `DOMMatrix` per frame), from the same
     * `viewportMath.viewportTransform` the painter sets on it — so a layer's ink
     * and the tiles are on one matrix by construction, not by two spellings
     * agreeing. The geometric e2e assertion locates a layer's own ink and
     * compares it with the coordinate model, exactly as it does for the tiles.
     *
     * The canvas half comes from `paintCanvasSpace`, which carries this frame's
     * rects AND the canvas-space → world conversion over them. The declared
     * dimensions it needs are the manifest's, read from the same
     * `canvasesById`/`placementOf` source the public coordinate helpers read, so
     * a layer and `ViewerState.canvasToScreen` cannot disagree about where a
     * canvas-space point is.
     */
    function paintFrame(plan: ScenePlan): PaintFrame {
        return {
            transform: viewportTransform(viewport, dpr),
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
     * holds nothing: no network, no texture, no pixels. Painting nothing for it
     * would show blank space where 795 folios of an 800-folio manuscript are at
     * the zoom floor — indistinguishable from the end of the manifest, a
     * "loading river" the placeholder rect exists to prevent. Its rect is the
     * one thing that IS known for free (layout is pure arithmetic over
     * manifest dimensions), so the rect is what is drawn.
     *
     * **Decoration, and nothing but.** It carries no text and no information a
     * reader must perceive, which is what makes painted pixels the right home
     * for it: a message would need an accessible name and would belong in the
     * DOM layer beside the surface, where the error placeholders are.
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
        // A static image counts as painting exactly as a tile does, and it is
        // asked per PLACEMENT: one half of a composite canvas being decoded is
        // enough for an opaque placeholder over the whole canvas to be wrong.
        for (const placement of plan.staticImages) {
            if (staticImages.has(placement.key))
                painting.add(placement.canvasId);
        }

        const perceptible = plan.layout.filter(
            (rect) =>
                // Cheapest test first, and the one that excludes ~800 of 800
                // rects on the manifest this path exists for.
                canvasErrors[rect.canvasId] &&
                plan.tiers[rect.canvasId] !== 'box' &&
                !painting.has(rect.canvasId),
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
     * Position this frame's unsupported presentations.
     *
     * Which canvases those are is a property of the manifest and of the claim
     * set, decided once per descriptor build or claim change
     * (`canvasDescriptors.unsupportedPresentationIds`) and not per frame; what
     * this recomputes is only where they are on screen.
     *
     * Gated on the tier alone, and deliberately not on what is painting: an
     * unsupported canvas has nothing that could paint — the planner issues no
     * tile, thumbnail, or metadata request for it — so the "would this cover
     * working pixels?" test the error layer needs has no work to do here. Box
     * tier is excluded for the reason it is there: below that projection a
     * labelled box is unreadable noise rather than information.
     */
    function updateUnsupportedCanvases(plan: ScenePlan) {
        const next = unsupportedCanvasIds.size
            ? canvasPlacements(
                  plan.layout,
                  (canvasId) =>
                      unsupportedCanvasIds.has(canvasId) &&
                      plan.tiers[canvasId] !== 'box'
                          ? ('unsupported' as const)
                          : null,
                  viewport,
              )
            : [];

        if (!samePlacements(unsupportedLayer, next)) unsupportedLayer = next;
    }

    /**
     * Mirror the derived condition onto the viewer-level `tileSourceError`,
     * writing only when it changes.
     *
     * Deliberately the SAME observable the previous renderer wrote, in the same
     * shape, so the existing error chrome and its journey keep working with no new
     * chrome invented. Its meaning is now derived rather than
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
     * `tileSourceError` is an `observable` in the state inventory: it has no
     * mutator by definition — core writes it, nothing else may.
     */
    const setDerivedTileSourceError = createTileSourceErrorMirror({
        loadMessage: () => m.canvas_error_load(),
        write: (value) => {
            viewerState.tileSourceError = value;
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
        // Assigning either dimension CLEARS the canvas, so this is the moment
        // the surface goes empty; `resized` carries that to the repaint at the
        // end of this function.
        const resized =
            surface.width !== backingWidth || surface.height !== backingHeight;
        if (resized) {
            surface.width = backingWidth;
            surface.height = backingHeight;
        }

        const hadSize = viewport.width > 0 && viewport.height > 0;
        // Both surfaces, captured before `viewport` takes the new size: the
        // docked-chrome branch is a function of the one leaving as well as the
        // one arriving — the ratio of their extents, and the fit measured in
        // each. The fit is only measured when that branch will run, because it
        // scans for the fit target.
        const previousSize = { width: viewport.width, height: viewport.height };
        const previousFitScale =
            hadSize && chromeCompensationInFlight
                ? homeScale(viewportLimits())
                : 0;
        viewport = { ...viewport, width, height };

        // The first time the container has a size there is no view to preserve,
        // so adopt the fit of whatever the viewer says is current — which on a
        // deep link into folio 400 is folio 400, not the folio the un-scrolled
        // viewport centre happens to sit on.
        if (!hadSize && width > 0 && height > 0) {
            fitCurrentCanvas();
        } else if (width > 0 && height > 0 && chromeCompensationInFlight) {
            // Core itself took part of the surface away, or gave it back. The
            // reader asked for none of it, so they are not moved: the part of
            // the canvas they were looking at stays the part they are looking
            // at, shifted and scaled by exactly as much as the surface changed.
            // `compensatedScale` is the rule and carries its own proof; the
            // centre is a canvas-space point, so it needs no adjustment beyond
            // the constraint every centre goes through.
            //
            // The fit scale is measured, because it is the compensation's floor
            // and its ceiling, but no fit is ever *applied* and no canvas is
            // travelled to. That is why continuous mode needs no answer to
            // which canvas would be framed: docking a panel is not navigation,
            // so moving the reader to another folio was never right.
            const fitScale = homeScale(viewportLimits());
            const scale = clampScale(
                compensatedScale(
                    viewport.scale,
                    previousSize,
                    { width, height },
                    fitScale,
                    previousFitScale,
                ),
            );
            viewport = {
                ...viewport,
                scale,
                centre: constrained(viewport.centre, scale),
            };
            // The target through the same rule, so a wheel zoom or a fit still
            // easing lands at the compensated view rather than dragging the
            // reader back to the one the surface had before.
            targetScale = clampScale(
                compensatedScale(
                    targetScale,
                    previousSize,
                    { width, height },
                    fitScale,
                    previousFitScale,
                ),
            );
            targetCentre = constrained(targetCentre, targetScale);
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

        // Repainted SYNCHRONOUSLY when the backing store was resized, rather
        // than only scheduled. Resizing cleared the canvas, and this runs from
        // a ResizeObserver — after the frame's animation-frame callbacks, so
        // after the frame loop has already painted, but before the browser
        // composites. Leaving the repaint to the next frame therefore composites
        // the cleared canvas: the image vanishes for that frame, and for every
        // frame of a chrome slide, which is a resize per frame.
        if (resized) paint();
        requestFrame();
    }

    /**
     * Whether the surface change now in flight is attributable to docked
     * chrome. True from the moment core reports a docked-chrome change until
     * the surface stops changing size — see {@link watchChromeSettle}.
     */
    let chromeCompensationInFlight = false;
    let chromeSettleFrame: number | null = null;
    let chromeSettleWidth = -1;
    let chromeSettleHeight = -1;
    let chromeStableFrames = 0;

    /**
     * Consecutive frames of an unchanged box that count as "the surface has
     * stopped resizing".
     *
     * More than one, because a single repeat is not evidence of anything at the
     * START of a transition: measured on a panel open, the box reads the same
     * for about two frames before `slideWidth` begins moving it, so a one-frame
     * test declares the slide over before it has begun and hands every
     * intermediate width to the preserve-scale branch, which is the wrong rule
     * for a change core caused. Three frames clears that plateau while still
     * closing ~50ms after motion actually stops.
     *
     * Note what this is NOT: a duration. It measures stillness, so it cannot
     * expire while the surface is still moving, and it cannot go on standing
     * once the surface is still. A fixed window did both.
     */
    const CHROME_SETTLE_FRAMES = 3;

    /**
     * Hold the compensation open until the surface has actually STOPPED
     * resizing, and not one frame longer.
     *
     * The column does not arrive at its final width: `TriiiceratopsViewer`'s
     * `slideWidth` animates it, so the surface passes through a run of
     * intermediate widths. Two things need this, and neither is correctness of
     * the endpoint — `compensatedScale`'s ratios compose exactly, so catching
     * only the last width would land the reader in the same place. What is
     * needed is that the flag stay up for every measurement the slide causes, so
     * none of them is mistaken for a reader resizing the window, and that the
     * intermediate widths be measured at all, so the image moves WITH the column
     * instead of jumping when it arrives.
     *
     * Ending it on a CLOCK instead was wrong, and provably so: for as long as
     * the window stood, a plain host resize arriving inside it was compensated
     * too, collapsing the two cases the contract requires be held apart
     * (dragging a window edge, or a phone rotating, while a panel animates).
     * So the terminator is the geometry itself — {@link CHROME_SETTLE_FRAMES}
     * consecutive frames of an unchanged box — which is also why this samples
     * per frame rather than leaning on the ResizeObserver: an observer fires
     * only when the size CHANGES, so "the size stopped changing" is precisely
     * the event it never delivers. Ending the window is ALL this does — the
     * observer compensates the intermediate widths, and duplicating that here
     * bought nothing but a second fit measurement per frame. That matters most in the case with no
     * animation at all: under `prefers-reduced-motion` `slideWidth` has
     * duration 0, the column snaps in one step, and the observer's last
     * callback is indistinguishable from a mid-slide one.
     *
     * Residual, accepted: a reader dragging the window edge continuously while
     * a panel animates keeps the surface changing, so the compensation persists
     * until the drag stops. The two cases are genuinely indistinguishable while they
     * overlap; what matters is that this ends a few frames after the overlap
     * does rather than on a fixed timeout.
     */
    function watchChromeSettle() {
        if (chromeSettleFrame !== null) return;
        const step = () => {
            chromeSettleFrame = null;
            if (!chromeCompensationInFlight || !root) return;
            const rect = root.getBoundingClientRect();
            if (
                rect.width === chromeSettleWidth &&
                rect.height === chromeSettleHeight
            ) {
                chromeStableFrames += 1;
                if (chromeStableFrames >= CHROME_SETTLE_FRAMES) {
                    chromeCompensationInFlight = false;
                    return;
                }
            } else {
                chromeStableFrames = 0;
                chromeSettleWidth = rect.width;
                chromeSettleHeight = rect.height;
            }
            chromeSettleFrame = requestAnimationFrame(step);
        };
        chromeSettleFrame = requestAnimationFrame(step);
    }

    /**
     * Core has docked or undocked chrome, so the viewer area is about to change
     * size: compensate the reader's view for it rather than preserving their
     * scale.
     *
     * The distinction this draws is *why* the surface changed, not that it did.
     * A window resize preserves scale, because the reader chose that view and
     * nothing was taken from them. A panel column is core removing ~320px of the
     * surface the reader's view was composed in, and the honest answer to that
     * is to keep the content of the view rather than either of its numbers:
     * `compensatedScale` holds the canvas-space extent visible on the axis that
     * changed, so the passage they were reading is still the passage on screen,
     * and the centre needs no adjustment because it is a canvas-space point.
     *
     * Nothing new can overhang the narrowed surface, which is the guarantee
     * worth having: a projection larger than the fit hangs off the edges and the
     * overhanging part is clipped away, taking canvas-anchored chrome out of
     * both the picture and the hit test. `compensatedScale`'s floor and ceiling
     * are what bound it — a reader who had the whole canvas still has it, at
     * very nearly the size they had — and they do so without discarding a
     * zoomed-in reader's view, which an absolute fit cannot.
     *
     * It stays open across several measurements rather than acting once, because
     * the column slides and the image is to move with it; {@link
     * watchChromeSettle} is what closes it, and why it is closed on a signal
     * rather than a timeout. The first measurement is deliberately left to that
     * watcher's first frame rather than taken here: at the moment this is
     * called the column has been laid out at its FINAL width and the slide's
     * from-state has not been applied yet, so a measurement taken now
     * compensates the whole delta in one step and the next frame — reading the
     * box back at its full width — undoes it. That is a visible flash of the
     * end-state view before the slide begins. A `requestAnimationFrame`
     * callback runs before paint, so deferring costs no stale frame even when
     * the column arrives in a single step under `prefers-reduced-motion`.
     *
     * Deliberately not the viewport INSET: an inset states which edges are
     * reserved and, by contract, never moves the current view — only the next
     * fit. That is right for a plugin's floating UI and wrong here, where the
     * surface the current view lives on is itself changing size.
     */
    function compensateForDockedChrome() {
        chromeCompensationInFlight = true;
        // Below any real box, so the first sampled frame always counts as a
        // change and the watch cannot mistake the pre-animation box for a
        // settled one.
        chromeSettleWidth = -1;
        chromeSettleHeight = -1;
        chromeStableFrames = 0;
        watchChromeSettle();
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
     * The media query the byte ceiling is resolved from, kept live.
     *
     * `(pointer: coarse) and (hover: none)` is a LIVE question, not a
     * device-identity one, and the two watchers either side of this one already
     * treat their queries that way. A tablet that gains a trackpad mid-session
     * stops being the device the mobile ceiling was chosen for; more to the
     * point, one that *loses* its keyboard is left holding a 128 MB decoded
     * cache on a machine the browser will kill a tab on for far less, which is
     * the case the two ceilings exist to separate.
     *
     * One held query rather than a map of them, because `resolveByteBudget`
     * asks exactly one: it takes the matcher rather than reaching for
     * `matchMedia`, so that the choice between the two ceilings is a pure
     * function with an ordinary unit test.
     */
    let byteBudgetQuery: MediaQueryList | null = null;

    function byteBudgetMatches(): boolean {
        if (!byteBudgetQuery) {
            byteBudgetQuery = window.matchMedia(MOBILE_BUDGET_QUERY);
            byteBudgetQuery.addEventListener?.('change', applyByteBudget);
        }
        return byteBudgetQuery.matches;
    }

    function applyByteBudget() {
        // A consumer who named a ceiling knows more than the media query does,
        // so the device answer is only consulted when none was configured.
        const byteBudget =
            knobs.budgets.byteBudget ?? resolveByteBudget(byteBudgetMatches);
        if (byteBudget === budgets.byteBudget) return;

        budgets = { ...budgets, byteBudget };
        // Trims on the way down, so dropping to the mobile ceiling releases the
        // pixels over it in this call rather than at the next frame.
        tiles.setByteBudget(byteBudget);
    }

    function unwatchByteBudget() {
        byteBudgetQuery?.removeEventListener?.('change', applyByteBudget);
        byteBudgetQuery = null;
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

            // A single tap moves NOTHING here — `clickToZoom` stays false (spec
            // §Input and animation). It is announced to the tap subscribers,
            // which is how annotation selection hears the one gesture reserved
            // for it without recognising a tap of its own.
            case 'tap':
                emitTap(update.point);
                return;

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
            knobs.animationTime,
        );
    }

    /**
     * Wheel zoom is animated with a short time constant and anchors at the
     * pointer: the world point under the cursor stays under the cursor.
     *
     * There is deliberately **no trackpad-versus-mouse branch** here or
     * anywhere else. All wheel input is animated by the same constant and
     * scaled by the same rate. The usual heuristics — delta magnitude,
     * `ctrlKey`, the platform — all have counterexamples and would be wrong on
     * someone's hardware. This is a decision, not an omission; the "fix" is
     * tempting and must not be applied.
     *
     * `zoomPerWheelNotch` tunes how far a notch travels, and moves both devices
     * together precisely because the rate underneath it is per pixel. It is the
     * knob to reach for when the wheel feels too fast — not a device branch.
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
            targetScale * Math.exp(-deltaY * wheelRate()),
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

    // ── The stage ────────────────────────────────────────────────────────
    //
    // A plugin's overlay layer is a SIBLING of this renderer's root, not a
    // descendant (see `TriiiceratopsViewer.svelte`, which mounts both into the
    // same `.viewer-area` box). Nothing a claimant renders can therefore reach
    // the surface by bubbling, which is why the wheel is bound on the box the
    // two share rather than on the `<canvas>`: one binding serves every
    // claimant, present and future, and a claimant hands down nothing.
    //
    // The coordinate space is unaffected — `handleWheel` resolves its anchor
    // from `clientX`/`clientY` against the surface's own bounding rect, never
    // from the event's `offsetX`/`offsetY`, which is what would have made the
    // binding element part of the answer.

    /** Anything focus or the wheel must be left to, inside a claimant's layer. */
    const CLAIMANT_CONTROL =
        'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable],audio[controls],video[controls]';

    /**
     * The two subtrees of the stage that ARE the image: this renderer's own
     * root, and any plugin overlay layer.
     *
     * An allowlist rather than a denylist, because the stage also holds chrome
     * that owns its own wheel — the floating toolbar, the control bar, a
     * float-mode thumbnail gallery, an `overlay`-positioned plugin panel — and
     * a rule that named those instead would silently start zooming the next
     * one somebody adds.
     */
    function overStage(from: Element): boolean {
        return (
            root?.contains(from) === true ||
            from.closest('.plugin-overlay-layer') !== null
        );
    }

    /**
     * The wheel, as heard on the stage.
     *
     * A claimant that wants the wheel for itself — a transcript, a track list —
     * opts out by CONSUMING the event (`preventDefault()`), which costs it
     * nothing it would not already be doing to stop the page scrolling. No
     * layer that exists today needs it: the only overlay layer the AV plugin
     * registers holds the stage lanes, and they scroll nothing.
     */
    function handleStageWheel(event: WheelEvent) {
        if (event.defaultPrevented) return;
        const from = event.target as Element | null;
        if (!from || !overStage(from)) return;
        handleWheel(event);
    }

    /**
     * Keep the zoom keys reachable after a tap on a claimant's layer.
     *
     * The keys are bound on the renderer root, and a claimant's layer has no
     * focusable ancestor — so a press on a bare stage would otherwise move
     * focus to the body and fire the root's `onblur`, leaving a reader who
     * tapped a score to start it playing with no way to magnify it.
     *
     * The default is CANCELLED as well as replaced: the browser resolves focus
     * from the compatibility `mousedown`, which is dispatched after this, so
     * focusing here without cancelling would simply be overwritten.
     *
     * Only for a target that offers no control of its own. A claimant's own
     * button, its track list, its transcript controls all keep the focus the
     * reader deliberately moved to them.
     */
    function handleStagePointerDown(event: PointerEvent) {
        if (event.defaultPrevented || event.button !== 0 || !root) return;
        const from = event.target as Element | null;
        if (!from?.closest('.plugin-overlay-layer')) return;
        if (from.closest(CLAIMANT_CONTROL)) return;
        event.preventDefault();
        root.focus({ preventScroll: true });
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
            knobs.animationTime,
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
    // A plain `Set`: a module-level constant, never mutated and never read by
    // the reactive graph.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const DISCRETE_KEYS = new Set(['+', '=', '-', '_', '0', 'Home']);

    /**
     * A hold cannot survive the Meta key.
     *
     * While Meta (Cmd) is down, macOS delivers no `keyup` for other keys. Hold
     * an arrow, press Cmd, release the arrow, release Cmd, and `handleKeyUp`
     * never sees the arrow at all: it stays in `heldPanKeys`, the surface pans
     * forever, the frame loop never settles, and every awaited `nextPaint`
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
     * stays true, and no awaited `nextPaint` ever resolves.
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
    function loadStaticImages(wanted: StaticImageDraw[]) {
        staticImages.reconcile(wanted);
    }

    function attach() {
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
        // bindings themselves stay on the surface element, or at the widest on
        // the stage box below (spec §Keyboard).
        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // The stage: the box this renderer's root and every plugin overlay
        // layer are laid into as siblings, and so the nearest element an event
        // from either can be heard on. It is `.viewer-area`, the same box whose
        // origin `ViewerState.canvasToScreen` reports — the renderer root is
        // mounted straight into it, so its parent IS the stage.
        //
        // `passive: false` because the wheel handler cancels the event; a
        // passive listener may not, and the page would scroll as well as zoom.
        const stage = root.parentElement;
        stage?.addEventListener('wheel', handleStageWheel, { passive: false });
        stage?.addEventListener('pointerdown', handleStagePointerDown);

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
         * Development-only instrumentation. `src/devtools/` registers an
         * installer through `rendererDevtools`; with none registered — every
         * production build — the thunk below is never called and the handle's
         * shaping code is not in the bundle graph at all. See
         * `rendererDevtools.ts` for why this is a registry rather than a
         * build-time DEV conditional, and why the internals are raw handles:
         * everything that can be shaped from them is shaped in `src/devtools/`.
         */
        installRendererDevtools(surface, () => ({
            getViewport: () => viewport,
            setView: (view) => {
                viewport = {
                    ...viewport,
                    centre: { ...view.centre },
                    scale: view.scale,
                };
                targetCentre = { ...view.centre };
                targetScale = view.scale;
                animating = false;
                momentum = null;
            },
            getDpr: () => dpr,
            isMoving: () => animating || momentum !== null || keyPan !== null,
            fitWorld,
            port: canvasPort,
            requestFrame,
            onDetach: (fn) => {
                (detachWaiters ??= []).push(fn);
                return () => {
                    detachWaiters =
                        detachWaiters?.filter((f) => f !== fn) ?? null;
                };
            },
            setByteBudget: (bytes) => {
                budgets = { ...budgets, byteBudget: bytes };
                tiles.setByteBudget(bytes);
            },
            tiles,
            getScenePlanCount: () => scenePlanCount,
            getTiers: () => lastTiers,
            canvasErrors,
            registerPaintLayer:
                viewerState.registerPaintLayer.bind(viewerState),
        }));
        return () => {
            // Before frameListeners.clear(): a settled-paint promise resolves
            // out of a frame listener, and no frame follows detach.
            if (detachWaiters) {
                const waiters = detachWaiters;
                detachWaiters = null;
                for (const fn of waiters) fn();
            }
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
            stage?.removeEventListener('wheel', handleStageWheel);
            stage?.removeEventListener('pointerdown', handleStagePointerDown);
            if (frameHandle !== null) cancelAnimationFrame(frameHandle);
            frameHandle = null;
            if (chromeSettleFrame !== null)
                cancelAnimationFrame(chromeSettleFrame);
            chromeSettleFrame = null;
            chromeCompensationInFlight = false;
            animating = false;
            momentum = null;
            clearHeldKeys();
            keyPan = null;
            staticImages.clear();
            // Aborts every outstanding tile request and closes every decoded
            // tile. The METADATA cache is deliberately left alone: it is
            // page-shared and outlives the renderer, which is what makes
            // remounting free.
            tiles.dispose();
        };
    }

    /**
     * The body of the component's refit effect. It lives here because
     * `lastFit` does: whether a refit is a TRAVEL within a laid-out world
     * or a jump into a new one is the renderer's own memory, not the
     * component's. The component supplies only the change signals.
     *
     * The world key below is read TRACKED — those four are change signals in
     * their own right — while the fit itself is untracked. A fit reads the whole
     * laid-out world, and every one of those reads would otherwise become a
     * dependency of the effect, so a refit would follow anything that produced a
     * fresh descriptor list: a companion phase, a claim, a Choice. A refit
     * overwrites the reader's centre and scale, so it fires on the signals the
     * component names and on nothing else. `currentInset`'s own `untrack` is the
     * same rule applied one read at a time, and stays for its browser spec.
     *
     * Idempotent, which is the point of `lastFit`: a run that can justify
     * nothing fits nothing. The effect above is free to re-run for a reason
     * that turns out not to be one — a host replacing its configuration object,
     * a dependency someone adds later — and the reader keeps their place
     * through it. The tile sources and the geometry are read UNTRACKED because
     * they are a memo check rather than a subscription; the four world members
     * stay tracked because they are how a mode or direction change arrives here
     * at all.
     */
    function refitForCurrentWorld() {
        const world = worldKey();
        const sources = untrack(() => options.getTileSources());
        const geometry = untrack(() => paintedGeometry);

        if (
            lastFit !== null &&
            lastFit.world === world &&
            lastFit.sources === sources &&
            lastFit.geometry === geometry
        ) {
            // Before `requestFrame`, not after: a run that fits nothing needs
            // no frame, and that saving is the other half of this guard.
            return;
        }

        const travelling =
            viewerState.viewingMode === 'continuous' &&
            lastFit?.world === world;
        lastFit = { world, sources, geometry };

        untrack(() => fitCurrentCanvas(travelling));
        requestFrame();
    }

    return {
        /** Attach to the DOM. Returns the teardown. */
        mount(rootEl: HTMLDivElement, surfaceEl: HTMLCanvasElement) {
            root = rootEl;
            surface = surfaceEl;
            return attach();
        },
        /**
         * The surface's DOM event handlers, wired by the component's markup.
         * The wheel is not among them: it is bound on the stage instead, so
         * that a claimant's overlay layer — a sibling of the surface — zooms
         * too. See `handleStageWheel`.
         */
        handlers: {
            keydown: handleKeyDown,
            keyup: handleKeyUp,
            blur: handleBlur,
            pointerdown: handlePointerDown,
            pointermove: handlePointerMove,
            pointerup: handlePointerUp,
            pointercancel: handlePointerCancel,
        },
        /** Per-canvas error placeholders for the DOM error layer. */
        get errorLayer() {
            return errorLayer;
        },
        errorLabel,
        /**
         * Per-canvas unsupported presentations for the DOM layer beside the
         * error one — a canvas core cannot render, not a canvas that failed.
         */
        get unsupportedLayer() {
            return unsupportedLayer;
        },
        unsupportedLabel: () => m.canvas_unsupported(),
        /**
         * Read by the component's refit effect purely as a change signal — the
         * painted canvases' ids and rects, so a companion arriving with a rect
         * of its own refits like any other change of geometry while a phase
         * changing under an unchanged rect does not.
         */
        get paintedGeometry() {
            return paintedGeometry;
        },
        requestFrame,
        refitForCurrentWorld,
        compensateForDockedChrome,
        /** Bumped when a decoded image, tile, or `info.json` lands. */
        get loadedGeneration() {
            return loadedGeneration;
        },
    };
}
