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
     * One canvas — a static image or a tiled image service — with drag and
     * wheel zoom. The size-ladder source is ticket 06, multi-canvas layout
     * ticket 07, momentum/pinch/double-click ticket 10, keyboard and focus
     * ticket 11, annotation overlays ticket 14.
     */
    import { onMount } from 'svelte';

    import { toPlannerCanvases } from '../renderer/canvasDescriptors';
    import { reconcileImages } from '../renderer/imageRequests';
    import { imageServiceCache } from '../renderer/imageService';
    import { paintScene } from '../renderer/paintScene';
    import { planScene } from '../renderer/planScene';
    import { createTileScheduler } from '../renderer/tileScheduler';
    import {
        DEFAULT_BUDGETS,
        MAX_DEVICE_PIXEL_RATIO,
        MAX_ZOOM_FACTOR,
        TILE_IN_FLIGHT_LIMIT,
        TILE_MAX_ATTEMPTS,
        WHEEL_LINE_PIXELS,
        WHEEL_PAGE_PIXELS,
        WHEEL_TIME_CONSTANT,
        WHEEL_ZOOM_RATE,
    } from '../renderer/rendererDefaults';
    import type {
        ImageServiceFacts,
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
    // Where an animated input is heading. Drag writes `viewport` directly and
    // keeps these in step; wheel writes only these and lets the frame loop
    // approach them.
    let targetCentre: Point = { x: 0, y: 0 };
    let targetScale = 1;
    let animating = false;
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

    function currentPlan(): ScenePlan {
        return planScene({
            canvases: plannerCanvases,
            mode: viewerState.viewingMode,
            direction: viewerState.viewingDirection,
            preserveCanvasScale: viewerState.preserveCanvasScale,
            viewport,
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
                if (!facts || knownMetadata[canvasId] === facts) return;
                knownMetadata[canvasId] = facts;
                // Tiles can only be planned now that the pyramid is knowable.
                loadedGeneration += 1;
            });
        }
    }

    function worldBounds(plan: ScenePlan) {
        if (plan.layout.length === 0) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const rect of plan.layout) {
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.width);
            maxY = Math.max(maxY, rect.y + rect.height);
        }

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /** The scale at which the whole world fits — the zoom ceiling's reference. */
    function homeScale(): number {
        const bounds = worldBounds(currentPlan());
        if (!bounds || viewport.width === 0 || viewport.height === 0) return 1;
        return fitBounds(bounds, viewport).scale;
    }

    function clampScale(scale: number): number {
        const plan = currentPlan();
        const max = homeScale() * MAX_ZOOM_FACTOR;
        // The floor is DERIVED (the zoom at which the median canvas reaches the
        // box threshold), not a tuned percentage of home zoom. Guard the
        // degenerate empty-world case, where it is 0.
        const min = plan.minZoom > 0 ? Math.min(plan.minZoom, max) : max / 1e6;
        return clamp(scale, min, max);
    }

    function fitWorld() {
        const bounds = worldBounds(currentPlan());
        if (!bounds || viewport.width === 0 || viewport.height === 0) return;

        const fit = fitBounds(bounds, viewport);
        viewport = { ...viewport, centre: fit.centre, scale: fit.scale };
        targetCentre = fit.centre;
        targetScale = fit.scale;
        animating = false;
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

        if (animating) {
            const scale = approachScale(
                viewport.scale,
                targetScale,
                WHEEL_TIME_CONSTANT,
                elapsed,
            );
            const centre = {
                x: approach(
                    viewport.centre.x,
                    targetCentre.x,
                    WHEEL_TIME_CONSTANT,
                    elapsed,
                ),
                y: approach(
                    viewport.centre.y,
                    targetCentre.y,
                    WHEEL_TIME_CONSTANT,
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

        if (animating) {
            scheduleFrame();
        } else {
            settlePaintWaiters();
        }
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
    // Pointer Events only: one input path, no mouse/touch/legacy branches.

    let dragPointerId: number | null = null;
    let lastPointer: Point = { x: 0, y: 0 };

    function handlePointerDown(event: PointerEvent) {
        if (!surface || dragPointerId !== null || !event.isPrimary) return;
        // Left button (or a touch/pen contact, which also reports 0) only. A
        // right-button press opens the context menu, and starting a pan under it
        // leaves the image sliding behind an open menu with no pointer-up to
        // end the drag.
        if (event.button !== 0) return;

        dragPointerId = event.pointerId;
        lastPointer = { x: event.clientX, y: event.clientY };
        surface.setPointerCapture(event.pointerId);

        // A pointer-down takes control: any in-flight wheel animation stops
        // where it is rather than continuing to glide under the finger.
        targetCentre = { ...viewport.centre };
        targetScale = viewport.scale;
        animating = false;
    }

    /**
     * Drag is **direct**: the transform is updated here, 1:1, with no smoothing
     * and no spring. This is the single most important behavioural difference
     * from the OpenSeadragon path, which animates the pan target through the
     * same spring it uses for zoom and so trails the pointer.
     */
    function handlePointerMove(event: PointerEvent) {
        if (event.pointerId !== dragPointerId) return;

        const dx = event.clientX - lastPointer.x;
        const dy = event.clientY - lastPointer.y;
        lastPointer = { x: event.clientX, y: event.clientY };

        const centre = {
            x: viewport.centre.x - dx / viewport.scale,
            y: viewport.centre.y - dy / viewport.scale,
        };
        viewport = { ...viewport, centre };
        targetCentre = { ...centre };

        // Painting is still once per frame — the transform is what must be
        // direct, not the number of draw calls.
        requestFrame();
    }

    function endDrag(event: PointerEvent) {
        if (event.pointerId !== dragPointerId) return;
        // Momentum on release is ticket 10.
        dragPointerId = null;
        surface?.releasePointerCapture?.(event.pointerId);
    }

    /**
     * Wheel zoom is animated with a short time constant and anchors at the
     * pointer: the world point under the cursor stays under the cursor.
     */
    function handleWheel(event: WheelEvent) {
        if (!surface) return;
        event.preventDefault();

        const rect = surface.getBoundingClientRect();
        const anchor = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
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

        const nextScale = clampScale(
            viewport.scale * Math.exp(-deltaY * WHEEL_ZOOM_RATE),
        );

        targetScale = nextScale;
        targetCentre = anchoredZoomCentre(viewport, anchor, nextScale);
        animating = true;
        requestFrame();
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
                return nextPaint();
            },
            fit: () => {
                fitWorld();
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
                decodedBytes: tiles.decodedBytes,
                tileRequestCount: tiles.requestCount,
            }),
            nextPaint,
        };

        return () => {
            observer.disconnect();
            unwatchDevicePixelRatio();
            if (frameHandle !== null) cancelAnimationFrame(frameHandle);
            frameHandle = null;
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
        onpointerup={endDrag}
        onpointercancel={endDrag}
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
