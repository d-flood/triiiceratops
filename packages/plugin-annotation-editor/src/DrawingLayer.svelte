<script lang="ts">
    /*
     * The drawing surface: the DOM the plugin owns inside core's overlay-layer
     * container.
     *
     * Arming is modal and this is the whole suppression mechanism. While a tool
     * is armed the root takes `pointer-events: auto` across the full surface, so
     * a drag draws; while it is not, the root is `pointer-events: none` and the
     * same drag reaches the renderer underneath and pans. The layer is a SIBLING
     * of the renderer root, so a gesture it takes never traverses the renderer's
     * canvas at all — no input claim, and none of the momentum-cancel, pointer
     * capture and false-stability side effects an arbiter claim would carry
     * (ADR 0020).
     *
     * Modal does not mean trapped. The wheel and the arrow keys reach the
     * renderer on their own — the wheel is bound on the stage, which explicitly
     * accepts events raised inside an overlay layer, and the pan keys are bound
     * on the renderer root, which core refocuses after a press on a layer — so
     * neither is implemented here and neither may be broken here. The one
     * escape hatch this layer owns is holding Space, which simply drops the
     * surface back to click-through for the duration.
     *
     * Each tool answers to exactly ONE gesture, so nothing here discriminates
     * tap from drag: rectangle and ellipse are always a drag, polygon is a
     * click per vertex, a point is a single click, and whole canvas has no
     * gesture at all. Core reads the gesture arbiter's one tap decision, and a
     * second recogniser in a plugin would reintroduce the two thresholds that
     * decision exists to avoid. The only threshold is the minimum-size guard on
     * a COMMITTED region — a point has no size to judge.
     */
    import { tick, untrack } from 'svelte';
    import {
        DEFAULT_POINT_DIAMETER,
        observePointDiameter,
    } from 'triiiceratops/image-export';

    import type { AnnotationStore } from './AnnotationStore.svelte';
    import type { W3CAnnotation, W3CSelector } from './adapters/types';
    import type { DrawingSession } from './drawingSession.svelte';
    import {
        editableShape,
        isCommittableGeometry,
        selectorForGeometry,
        withEditedGeometry,
        type EditableGeometry,
    } from './editableShape';
    import {
        canvasPixelPoint,
        canvasRectToScreenRect,
        centredRect,
        DEFAULT_SHAPE_VIEW_FRACTION,
        ellipseVertices,
        geometriesEqual,
        HANDLE_HIT_RADIUS,
        handleAtPoint,
        inflateRect,
        insertVertex,
        insertVertexAfter,
        isDrawableRect,
        isHandleId,
        MIN_POLYGON_VERTICES,
        moveRect,
        movePolygon,
        moveVertex,
        nearestEdgeInsertIndex,
        normaliseRect,
        nudgeDelta,
        POINT_HANDLE_ID,
        pointHandles,
        polygonBounds,
        polygonContainsPoint,
        polygonHandles,
        rectContainsPoint,
        rectHandles,
        removeVertex,
        resizeRect,
        screenDragToCanvasRect,
        screenPointToCanvasPixel,
        translatePoint,
        triangleVertices,
        type Handle,
        type HandleId,
        type Point,
        type PointHandleId,
        type Rect,
    } from './geometry';
    import { defaultT, type TFn } from './i18n.svelte';
    import type { DrawingTool } from './types';
    import type { MirroredViewerState } from './viewerMirror.svelte';

    let {
        session,
        store,
        viewerState,
        t = defaultT,
    }: {
        session: DrawingSession;
        store: AnnotationStore;
        viewerState: MirroredViewerState;
        /**
         * The viewer's active-locale resolver. The layer is mounted outside the
         * panel's component tree, so it takes `t` as a prop rather than from
         * context; the English fallback keeps it mountable in a unit test.
         */
        t?: TFn;
    } = $props();

    let root: HTMLDivElement;

    /**
     * The box being dragged, in the target canvas's own coordinates. It carries
     * the tool that started it because the two box tools commit differently: a
     * rectangle becomes a fragment, an ellipse becomes an inscribed polygon.
     */
    let draft = $state<{
        canvasId: string;
        tool: DrawingTool;
        rect: Rect;
    } | null>(null);

    // Drag bookkeeping. Plain locals: nothing renders from them directly, and
    // the projected preview is derived from `draft` instead.
    let dragOrigin: Point | null = null;
    let dragCanvasId: string | null = null;
    let dragTool: DrawingTool | null = null;
    let dragPointerId: number | null = null;

    /**
     * The polygon being clicked out, in the target canvas's own coordinates,
     * and where the pointer last was so the edge it would close along is shown.
     */
    let polygonDraft = $state<{ canvasId: string; points: Point[] } | null>(
        null,
    );
    let polygonCursor = $state<Point | null>(null);

    /**
     * Bumped on every rendered frame so the preview reprojects as the image
     * moves. The projection reads the renderer through non-reactive queries, so
     * this is what a `$derived` over them can depend on.
     */
    let frame = $state(0);
    $effect(() => viewerState.subscribeFrame(() => frame++));

    /**
     * The tools this layer takes the surface for. Whole canvas is deliberately
     * absent: it has no gesture, so it creates on activation and leaves the
     * surface click-through, and the reader can still pan while it is armed.
     */
    const DRAWING_TOOLS: DrawingTool[] = [
        'rectangle',
        'ellipse',
        'polygon',
        'point',
    ];

    /**
     * The point marker's diameter in SCREEN pixels.
     *
     * Core's `--tri-annotation-point-size` is the one source, measured through
     * core's own helper on this layer — which inherits the token from the same
     * viewer the read-only overlay measures. The plugin declares no size of its
     * own and could not write core's: a second source would be a second answer
     * the moment the two disagreed, and a point would change size on being
     * opened for editing.
     */
    let pointMarkerSize = $state(DEFAULT_POINT_DIAMETER);

    /** Attached to the layer, which inherits core's tokens from the viewer. */
    const measureMarker = (node: HTMLElement) =>
        observePointDiameter(node, (diameter) => {
            pointMarkerSize = diameter;
        });

    let armed = $derived(
        session.armedTool !== null && DRAWING_TOOLS.includes(session.armedTool),
    );

    /** Space is down: the reader wants the renderer's pan back for a moment. */
    let spaceHeld = $state(false);

    /**
     * Whether a drag on the surface draws. Holding Space subtracts from being
     * armed rather than disarming: the tool stays lit in the panel and the
     * surface returns to drawing the instant the key comes up.
     */
    let drawing = $derived(armed && !spaceHeld);

    let previewRect = $derived.by(() => {
        void frame;
        if (!draft) return null;
        return canvasRectToScreenRect(draft.rect, (point) =>
            viewerState.canvasToScreen(point, draft!.canvasId),
        );
    });

    /**
     * The in-progress outline on screen: the vertices clicked so far, plus the
     * edge running to wherever the pointer is. `null` while nothing is being
     * clicked out, or when the canvas has left the screen entirely.
     */
    let polygonPreview = $derived.by(() => {
        void frame;
        const drafted = polygonDraft;
        if (!drafted) return null;
        const points: Point[] = [];
        for (const point of drafted.points) {
            const screen = viewerState.canvasToScreen(point, drafted.canvasId);
            if (!screen) return null;
            points.push(screen);
        }
        const cursor = polygonCursor
            ? viewerState.canvasToScreen(polygonCursor, drafted.canvasId)
            : null;
        return { points, cursor };
    });

    /**
     * A pointer event in the stage's coordinates — the space
     * `canvasToScreen` answers in. The root fills core's overlay-layer wrapper,
     * which is `inset: 0` in the stage, so the root's own box IS the stage's.
     */
    function stagePoint(event: MouseEvent): Point {
        const box = root.getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    /** Where a canvas currently sits on screen, from core's own projection. */
    function canvasScreenRect(canvasId: string): Rect | null {
        const size = viewerState.canvasSize(canvasId);
        if (!size) return null;
        const topLeft = viewerState.canvasToScreen({ x: 0, y: 0 }, canvasId);
        const bottomRight = viewerState.canvasToScreen(
            { x: size.width, y: size.height },
            canvasId,
        );
        if (!topLeft || !bottomRight) return null;
        return normaliseRect(topLeft, bottomRight);
    }

    /**
     * The canvas a drag beginning here belongs to. Several canvases are on
     * screen in `paged` and `continuous` modes, and a drag over the letterbox
     * between them belongs to none.
     *
     * Only `annotatableCanvasIds` are eligible: a **canvas claim** takes an AV
     * canvas out of that list, and a claimed canvas must stay un-annotatable.
     */
    function canvasUnder(point: Point): string | null {
        for (const canvasId of viewerState.annotatableCanvasIds) {
            const rect = canvasScreenRect(canvasId);
            if (rect && rectContainsPoint(rect, point)) return canvasId;
        }
        return null;
    }

    function updateDraft(to: Point): void {
        if (!dragOrigin || !dragCanvasId || !dragTool) return;
        const canvasId = dragCanvasId;
        const tool = dragTool;
        const rect = screenDragToCanvasRect(dragOrigin, to, (point) =>
            viewerState.screenToCanvas(point, canvasId),
        );
        if (rect) draft = { canvasId, tool, rect };
    }

    function endDrag(): void {
        if (dragPointerId !== null && root.hasPointerCapture(dragPointerId)) {
            root.releasePointerCapture(dragPointerId);
        }
        dragOrigin = null;
        dragCanvasId = null;
        dragTool = null;
        dragPointerId = null;
    }

    /** Abandon the box drag in progress; a half-clicked polygon is untouched. */
    function cancelDraft(): void {
        endDrag();
        draft = null;
    }

    /**
     * Abandon EVERYTHING in progress — Escape discards the whole in-progress
     * polygon, not merely the vertex last placed.
     */
    function abandonDrawing(): void {
        cancelDraft();
        polygonDraft = null;
        polygonCursor = null;
    }

    /**
     * Add a vertex where the reader clicked.
     *
     * The first vertex fixes the canvas; every later one projects through that
     * same canvas, so a long outline can be finished with the image panned to a
     * part of it that started off screen (story 10).
     */
    function addPolygonVertex(point: Point): void {
        const canvasId = polygonDraft?.canvasId ?? canvasUnder(point);
        if (!canvasId) return;
        const vertex = viewerState.screenToCanvas(point, canvasId);
        if (!vertex) return;
        polygonDraft = {
            canvasId,
            points: [...(polygonDraft?.points ?? []), vertex],
        };
        polygonCursor = vertex;
    }

    /**
     * How close, in canvas pixels, two clicks have to be to count as the same
     * one. A double-click's two `pointerdown`s land on the same screen point and
     * so project to the same canvas point; the slop is for nothing but floating
     * point.
     */
    const COINCIDENT_VERTEX_CANVAS_PX = 0.5;

    function withoutCoincidentTail(points: readonly Point[]): Point[] {
        if (points.length < 2) return [...points];
        const last = points[points.length - 1];
        const previous = points[points.length - 2];
        return Math.hypot(last.x - previous.x, last.y - previous.y) <=
            COINCIDENT_VERTEX_CANVAS_PX
            ? points.slice(0, -1)
            : [...points];
    }

    /**
     * Close the outline and commit it.
     *
     * A double-click has already added a vertex on top of the one it closes at,
     * so a coincident tail is dropped first; closing with Enter leaves nothing
     * to drop. Below three vertices the close is REFUSED rather than the shape
     * discarded — that is not a region yet, and throwing the clicks away would
     * punish a premature Enter.
     */
    function closePolygon(): void {
        const drafted = polygonDraft;
        if (!drafted) return;
        const points = withoutCoincidentTail(drafted.points);
        if (points.length < MIN_POLYGON_VERTICES) return;
        polygonDraft = null;
        polygonCursor = null;
        void commitPolygon(drafted.canvasId, points);
    }

    function handlePointerDown(event: PointerEvent): void {
        if (!drawing || event.button !== 0) return;
        if (session.armedTool === 'polygon') {
            addPolygonVertex(stagePoint(event));
            return;
        }
        if (session.armedTool === 'point') {
            // A single press IS the whole gesture — no drag to follow, and no
            // minimum-size guard to pass, because a point has no size.
            void commitPoint(stagePoint(event));
            return;
        }
        if (dragPointerId !== null) return;
        const point = stagePoint(event);
        const canvasId = canvasUnder(point);
        if (!canvasId || !session.armedTool) return;

        dragOrigin = point;
        dragCanvasId = canvasId;
        dragTool = session.armedTool;
        dragPointerId = event.pointerId;
        // Capture so a drag that leaves the surface still finishes here rather
        // than being abandoned mid-shape.
        root.setPointerCapture(event.pointerId);
        updateDraft(point);
    }

    function handlePointerMove(event: PointerEvent): void {
        if (polygonDraft) {
            polygonCursor = viewerState.screenToCanvas(
                stagePoint(event),
                polygonDraft.canvasId,
            );
            return;
        }
        if (event.pointerId !== dragPointerId) return;
        updateDraft(stagePoint(event));
    }

    function handlePointerUp(event: PointerEvent): void {
        if (event.pointerId !== dragPointerId) return;
        updateDraft(stagePoint(event));
        const committed = draft;
        endDrag();
        draft = null;
        if (committed) void commitBox(committed);
    }

    function handlePointerCancel(event: PointerEvent): void {
        if (event.pointerId !== dragPointerId) return;
        cancelDraft();
    }

    /** The polygon tool's other close: a double-click anywhere on the surface. */
    function handleDoubleClick(): void {
        if (!drawing || session.armedTool !== 'polygon') return;
        closePolygon();
    }

    /**
     * Whether a key press belongs to something the reader is typing into. The
     * body editor is a sibling of this layer inside the same viewer, and Space
     * there is a space.
     */
    function isTypingTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) return false;
        if (target.isContentEditable) return true;
        return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    }

    function handleKeyDown(event: KeyboardEvent): void {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTypingTarget(event.target)) return;

        if (event.key === 'Escape') {
            // Escape has two jobs and does the first one it finds. A keyboard
            // shape being placed, or an annotation open for editing, is
            // cancelled with the tool left lit, so a second press is what
            // leaves the mode — that is how a reader abandons one shape and
            // starts another. With neither of those open there is nothing to
            // stop at, so the one press discards whatever the pointer was
            // drawing and disarms.
            if (creating) {
                creating = null;
                return;
            }
            if (editing) {
                cancelEditDrag();
                session.requestCancelEdit?.();
                return;
            }
            abandonDrawing();
            session.requestDisarm?.();
            return;
        }

        // Space and Enter are the drawing layer's keys only while a tool is
        // armed; during an edit they belong to the page as usual.
        if (!armed) return;

        if (event.key === 'Enter' && polygonDraft) {
            // Suppressed because focus is still on the panel button that armed
            // the tool, and Enter there would re-arm rather than close.
            event.preventDefault();
            closePolygon();
            return;
        }

        if (event.key !== ' ') return;
        // Suppressed on every repeat, not just the first: unhandled, Space
        // scrolls the page and activates whichever panel button armed the tool.
        event.preventDefault();
        if (event.repeat) return;
        // A drag already under way cannot become the pan — the pointer is
        // captured here and the renderer never saw its `pointerdown` — so it is
        // discarded rather than committed, and the reader presses again.
        cancelDraft();
        spaceHeld = true;
    }

    function handleKeyUp(event: KeyboardEvent): void {
        if (event.key !== ' ') return;
        event.preventDefault();
        // Nothing tries to reclaim a pan in flight: the renderer holds pointer
        // capture for it, so it finishes under the renderer's own gesture
        // handling however long the button stays down.
        spaceHeld = false;
    }

    /*
     * Space and Escape are heard on the window, not on this layer: the layer is
     * not focusable, and core deliberately puts focus back on the renderer root
     * after a press on it. Bound only while there is a mode to leave, so both
     * are the page's own keys at every other moment.
     */
    $effect(() => {
        // Bound while a tool is armed OR an annotation is open for editing:
        // Escape is the way out of both, and out of nothing else.
        if (!armed && !editing) {
            spaceHeld = false;
            return;
        }
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        // A keyup that lands on another window never arrives, which would
        // otherwise strand the surface click-through with a tool still lit.
        window.addEventListener('blur', releaseSpace);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('blur', releaseSpace);
            spaceHeld = false;
        };
    });

    function releaseSpace(): void {
        spaceHeld = false;
    }

    /*
     * A closed panel has no armed tool (story 12a). Arming turns the whole
     * image into a drawing surface, and the panel is the only thing on screen
     * that accounts for that, so the two cannot be allowed to come apart.
     *
     * Held as an invariant over the surface's open state rather than as an edge,
     * because core gives no lifecycle event to hang an edge on: it mounts this
     * plugin's content once per ACTIVATION and only re-parents it in and out of
     * the open surface, so closing the panel destroys no component. Reasserting
     * it is a no-op whenever nothing is armed, which is why it needs no
     * remembered previous value; `untrack` keeps `surfaceOpen` the only thing it
     * wakes for, so installing the session's callbacks cannot cancel an edit the
     * reader opened.
     *
     * What it runs is what Escape runs, in one step rather than two — cancel the
     * edit in progress, then disarm. A close commits nothing.
     */
    $effect(() => {
        if (viewerState.surfaceOpen) return;
        untrack(() => {
            cancelEditDrag();
            session.requestCancelEdit?.();
            session.requestDisarm?.();
        });
    });

    /**
     * The id the in-flight create will end up under. The store swaps a local id
     * for a server-assigned one before `persist` resolves, and the body editor
     * has to open on the canonical one.
     */
    let pendingCreateId: string | null = null;
    $effect(() => {
        const previous = store.onReconcileId;
        store.onReconcileId = (oldId, canonical) => {
            if (pendingCreateId === oldId) pendingCreateId = canonical.id;
            previous?.(oldId, canonical);
        };
        return () => {
            store.onReconcileId = previous;
        };
    });

    /**
     * Every write this layer makes, through the host's `beforeSave` hook: a
     * host that rewrites an annotation on its way out must see a reshape as
     * well as a create.
     */
    async function saveAnnotation(annotation: W3CAnnotation): Promise<boolean> {
        return await store.persist(
            session.beforeSave
                ? await session.beforeSave(annotation)
                : annotation,
        );
    }

    /**
     * Persist a committed shape and hand it to the panel for a body.
     *
     * The geometry is CANVAS space: the store deals exclusively in canvas-space
     * W3C annotations, and core's target parser reads both an `xywh=` fragment
     * and an `SvgSelector`'s coordinates as canvas units.
     */
    async function persistShape(
        canvasId: string,
        selector: W3CSelector | null,
    ): Promise<void> {
        // The store is scoped to one canvas at a time; persisting a shape drawn
        // on a different visible canvas would file it under the wrong key and
        // display it in the wrong place.
        if (store.currentCanvasId !== canvasId) return;

        const annotation: W3CAnnotation = {
            '@context': 'http://www.w3.org/ns/anno.jsonld',
            // Replaced through the store's id reconciliation when the adapter
            // returns a server-assigned id.
            id: `temp-${crypto.randomUUID()}`,
            type: 'Annotation',
            body: [],
            // A whole-canvas annotation targets the canvas itself and carries
            // NO selector — a page-sized `xywh` would be a rectangle, and would
            // be drawn as one over the whole image.
            target: {
                type: 'SpecificResource',
                source: canvasId,
                ...(selector ? { selector } : {}),
            },
        };

        // What the host's draft hook returns is what gets persisted, including
        // an id of its own — so the create is tracked from the prepared
        // annotation rather than from the one built above.
        const drafted = session.prepareDraft?.(annotation) ?? annotation;
        pendingCreateId = drafted.id;
        const ok = await saveAnnotation(drafted);
        const createdId = pendingCreateId;
        pendingCreateId = null;
        // A rejected create rolled back in the store; there is nothing to open.
        if (!ok || !createdId) return;

        session.onCreated?.(store.get(createdId) ?? drafted);
    }

    /**
     * A finished box drag. The rectangle tool persists the box itself as a
     * media fragment; the ellipse tool persists the polygon inscribed in it and
     * records nothing about having been an ellipse, because core has three
     * geometries and a polygon needs no fourth (ADR 0022).
     */
    async function commitBox(committed: {
        canvasId: string;
        tool: DrawingTool;
        rect: Rect;
    }): Promise<void> {
        // Hand jitter, not a region (story 7). No create reaches the store.
        if (!isDrawableRect(committed.rect)) return;
        await persistShape(
            committed.canvasId,
            selectorForGeometry(
                committed.tool === 'ellipse'
                    ? {
                          kind: 'polygon',
                          points: ellipseVertices(committed.rect),
                      }
                    : { kind: 'rect', rect: committed.rect },
            ),
        );
    }

    /**
     * A placed point, at the exact click location in the canvas's own pixels.
     *
     * A true `PointSelector`, never a tiny fragment rectangle: this editor
     * writes one representation of a point and reads no other (ADR 0004).
     */
    async function commitPoint(at: Point): Promise<void> {
        const canvasId = canvasUnder(at);
        if (!canvasId) return;
        const point = screenPointToCanvasPixel(at, (screen) =>
            viewerState.screenToCanvas(screen, canvasId),
        );
        if (!point) return;
        await persistShape(
            canvasId,
            selectorForGeometry({ kind: 'point', point }),
        );
    }

    /*
     * The whole-canvas tool has no gesture, so the controller calls this the
     * moment the panel activates it. It lives here rather than in the
     * controller so that a creation of any kind goes through one path — the
     * same id reconciliation, the same open-the-body-editor handoff.
     */
    $effect(() => {
        session.createWholeCanvasAnnotation = () => {
            const canvasId = store.currentCanvasId;
            if (canvasId) void persistShape(canvasId, null);
        };
        return () => {
            session.createWholeCanvasAnnotation = null;
        };
    });

    /** A closed outline. The same minimum-size guard, on its bounding box. */
    async function commitPolygon(
        canvasId: string,
        points: readonly Point[],
    ): Promise<void> {
        const geometry: EditableGeometry = {
            kind: 'polygon',
            points: [...points],
        };
        if (!isCommittableGeometry(geometry)) return;
        await persistShape(canvasId, selectorForGeometry(geometry));
    }

    /*
     * ===== Editing a persisted annotation =====
     *
     * Core renders and selects the whole persisted SET; this layer renders the
     * ONE annotation open for editing, with its handles. The split is ADR 0002's,
     * kept here so core's focusable, labelled shape targets are never duplicated
     * — and suppression of core's own rendering of that one shape is the edit
     * channel on `annotationEditBus`.
     */

    /**
     * The annotation open for editing, or `null`.
     *
     * Derived from the store's own copy rather than from a snapshot taken when
     * the edit opened, so an undo or a redo that replays a change to it
     * re-projects here with nothing to reconcile by hand. `editableShape`
     * declining is what keeps the suppression below honest: a shape this layer
     * cannot draw is never opened, because suppressed and undrawn reads to the
     * reader as data loss.
     */
    let editing = $derived.by(() => {
        const id = session.editingAnnotationId;
        if (!id) return null;
        const annotation = store.get(id);
        if (!annotation) return null;
        const shape = editableShape(annotation);
        return shape ? { id, annotation, ...shape } : null;
    });

    /**
     * A shape the keyboard placed and the reader has not committed yet, in
     * canvas space.
     *
     * The other half of the one state machine: creation from the keyboard is
     * place-then-shape, so an armed tool drops a default geometry here and the
     * ordinary editing verbs move and size it. Everything below — the
     * projection, the handles, the hit box, the nudge — reads
     * {@link editGeometry}, which is this or the stored shape, so there is no
     * keyboard-only creation path to keep in step with the pointer's.
     */
    let creating = $state<{
        canvasId: string;
        geometry: EditableGeometry;
    } | null>(null);

    /**
     * The one shape this layer draws handles on, and the canvas it is on: a
     * keyboard shape not yet committed, else the persisted annotation open for
     * editing. `annotation` is `null` for the former — there is nothing stored
     * to write back to until Enter commits it.
     */
    let underEdit = $derived.by(
        (): { canvasId: string; annotation: W3CAnnotation | null } | null => {
            if (creating) {
                return { canvasId: creating.canvasId, annotation: null };
            }
            return editing
                ? { canvasId: editing.canvasId, annotation: editing.annotation }
                : null;
        },
    );

    /**
     * The default geometry a tool starts from, at the centre of the current
     * view and a fraction of it across.
     *
     * `null` when the view's centre is not over the canvas the store is scoped
     * to — the keyboard's counterpart to a pointer drag beginning in the
     * letterbox between two folios, which belongs to no canvas and commits
     * nothing.
     */
    function defaultGeometry(
        tool: DrawingTool,
        canvasId: string,
    ): EditableGeometry | null {
        const bounds = viewerState.viewportBounds;
        const size = viewerState.canvasSize(canvasId);
        if (!bounds || !size) return null;
        const centre = {
            x: bounds.x + bounds.width / 2,
            y: bounds.y + bounds.height / 2,
        };
        if (
            !rectContainsPoint(
                { x: 0, y: 0, width: size.width, height: size.height },
                centre,
            )
        ) {
            return null;
        }
        if (tool === 'point') {
            return { kind: 'point', point: canvasPixelPoint(centre) };
        }
        const box = centredRect(
            centre,
            bounds.width * DEFAULT_SHAPE_VIEW_FRACTION,
            bounds.height * DEFAULT_SHAPE_VIEW_FRACTION,
        );
        if (tool === 'rectangle') return { kind: 'rect', rect: box };
        if (tool === 'ellipse') {
            return { kind: 'polygon', points: ellipseVertices(box) };
        }
        // Polygon: the smallest region there is, which the reader then moves,
        // adds vertices to and shapes. There is no keyboard vertex-placement
        // mode — a triangle IS the start of an outline.
        return { kind: 'polygon', points: triangleVertices(box) };
    }

    /*
     * A tool activated from the keyboard. The controller calls this rather than
     * the layer watching `armedTool`, because arming from the POINTER must not
     * drop a shape: a pointer user goes on to describe the region themselves.
     */
    $effect(() => {
        session.placeDefaultShape = (tool) => {
            const canvasId = store.currentCanvasId;
            if (!canvasId) return;
            const geometry = defaultGeometry(tool, canvasId);
            if (!geometry) return;
            // A half-clicked outline and a placed default shape are two answers
            // to the same question; the newer one wins.
            abandonDrawing();
            creating = { canvasId, geometry };
            void focusShape();
        };
        return () => {
            session.placeDefaultShape = null;
        };
    });

    /*
     * Leaving the armed state abandons everything uncommitted: a keyboard shape
     * and a half-clicked outline alike belong to the tool that started them, and
     * the panel no longer shows that tool lit. Escape's own disarm abandons them
     * explicitly; this is what covers the other two exits, the panel's mode
     * toggle and the panel closing.
     */
    $effect(() => {
        if (!armed) {
            abandonDrawing();
            creating = null;
        }
    });

    /**
     * Core's overlay drops exactly this annotation while the id is set. Written
     * from what this layer can actually DRAW, and cleared on cancel, on delete,
     * on a canvas change and on teardown — all of which are the derivation above
     * going `null`, so there is one place this can go stale and it cannot.
     */
    $effect(() => {
        const id = editing?.id ?? null;
        viewerState.annotationEditBus.activeEditAnnotationId = id;
        return () => {
            viewerState.annotationEditBus.activeEditAnnotationId = null;
        };
    });

    /**
     * The geometry a drag or a nudge is producing, in canvas space, beside the
     * id of the annotation it was made for; `null` when idle.
     *
     * Keyed rather than plain, because a draft outlives the selection that
     * started it: opening a different annotation re-derives {@link editing}
     * and nothing else. With the id here the mismatch is unrepresentable —
     * {@link draftGeometry} declines a draft made for another annotation — so
     * an abandoned draft can neither be drawn on its successor nor committed
     * to it.
     */
    let editDraft = $state<{
        annotationId: string;
        geometry: EditableGeometry;
    } | null>(null);

    /**
     * Write a draft for the annotation currently under edit.
     *
     * The only writer of {@link editDraft}, so the key can never be a
     * different annotation's from the geometry beside it.
     */
    function setEditDraft(geometry: EditableGeometry): void {
        const annotationId = editing?.id;
        if (!annotationId) return;
        editDraft = { annotationId, geometry };
    }

    /** The draft, but only while it still belongs to the annotation under edit. */
    let draftGeometry = $derived(
        editDraft && editDraft.annotationId === editing?.id
            ? editDraft.geometry
            : null,
    );

    // Drag bookkeeping, as for the create drag above: plain locals, because the
    // shape on screen is derived from `editDraft` rather than from any of them.
    let editDrag: {
        pointerId: number;
        /**
         * The annotation the drag began on. A selection change mid-drag ends
         * it, rather than carrying the geometry it started from across to
         * whatever is under edit now.
         */
        annotationId: string | null;
        /**
         * A compass edge for a rectangle, a vertex index for a polygon, the
         * one handle a point has, or `null` for a move — the whole shape
         * rather than one control point.
         */
        handle: HandleId | number | PointHandleId | null;
        origin: Point;
        start: EditableGeometry;
    } | null = null;

    /**
     * What the reader currently sees: the drag or nudge in progress, else the
     * keyboard shape being placed, else the stored shape.
     */
    let editGeometry = $derived(
        draftGeometry ?? creating?.geometry ?? editing?.geometry ?? null,
    );

    /** The same geometry in screen space, reprojected on every frame. */
    let editScreen = $derived.by((): EditableGeometry | null => {
        void frame;
        const geometry = editGeometry;
        if (!underEdit || !geometry) return null;
        const canvasId = underEdit.canvasId;
        if (geometry.kind === 'point') {
            const point = viewerState.canvasToScreen(geometry.point, canvasId);
            return point ? { kind: 'point', point } : null;
        }
        if (geometry.kind === 'rect') {
            const rect = canvasRectToScreenRect(geometry.rect, (point) =>
                viewerState.canvasToScreen(point, canvasId),
            );
            return rect ? { kind: 'rect', rect } : null;
        }
        const points: Point[] = [];
        for (const point of geometry.points) {
            const screen = viewerState.canvasToScreen(point, canvasId);
            if (!screen) return null;
            points.push(screen);
        }
        return { kind: 'polygon', points };
    });

    /**
     * The shape's own box on screen, before the hit margin is added.
     *
     * A point has no extent of its own, so its box is the marker's — the same
     * fixed screen size core draws, which is what makes the grabbable area
     * match what the reader sees rather than a zero-size box.
     */
    let editBounds = $derived.by((): Rect | null => {
        if (editScreen === null) return null;
        if (editScreen.kind === 'rect') return editScreen.rect;
        if (editScreen.kind === 'polygon') {
            return polygonBounds(editScreen.points);
        }
        return {
            x: editScreen.point.x - pointMarkerSize / 2,
            y: editScreen.point.y - pointMarkerSize / 2,
            width: pointMarkerSize,
            height: pointMarkerSize,
        };
    });

    /**
     * The control points on offer: a rectangle's eight edges, a polygon's
     * vertices, or the single handle a point is. All go through the same
     * nearest-centre hit test, so a vertex is a handle rather than a parallel
     * mechanism.
     */
    let editHandles = $derived.by(
        (): Handle<HandleId | number | PointHandleId>[] => {
            if (!editScreen) return [];
            if (editScreen.kind === 'rect') return rectHandles(editScreen.rect);
            if (editScreen.kind === 'polygon') {
                return polygonHandles(editScreen.points);
            }
            // One handle, at the point: editing a point IS moving it.
            return pointHandles(editScreen.point);
        },
    );

    /**
     * The box that takes the edit gesture: the shape grown by the handle hit
     * radius, so a corner handle is grabbable from outside the shape itself.
     * Only this box takes pointer events — a drag anywhere else on the image
     * still pans, which is what keeps editing non-modal.
     */
    let editHitBox = $derived(
        editBounds ? inflateRect(editBounds, HANDLE_HIT_RADIUS) : null,
    );

    /**
     * Whether a screen point is inside the shape itself, which is what makes a
     * press a move. A polygon is tested against its outline rather than its
     * bounding box: a press in the notch of a concave outline is outside it.
     */
    function editContainsPoint(point: Point): boolean {
        if (!editScreen) return false;
        if (editScreen.kind === 'rect') {
            return rectContainsPoint(editScreen.rect, point);
        }
        if (editScreen.kind === 'polygon') {
            return polygonContainsPoint(editScreen.points, point);
        }
        return (
            Math.hypot(
                editScreen.point.x - point.x,
                editScreen.point.y - point.y,
            ) <=
            pointMarkerSize / 2
        );
    }

    /** A canvas-space point from a pointer event, for the shape under edit. */
    function editCanvasPoint(event: MouseEvent): Point | null {
        if (!underEdit) return null;
        return viewerState.screenToCanvas(
            stagePoint(event),
            underEdit.canvasId,
        );
    }

    function endEditDrag(): void {
        if (
            editDrag &&
            editSurface?.hasPointerCapture(editDrag.pointerId) === true
        ) {
            editSurface.releasePointerCapture(editDrag.pointerId);
        }
        editDrag = null;
    }

    /** Abandon the reshape in progress; the stored geometry is what remains. */
    function cancelEditDrag(): void {
        endEditDrag();
        editDraft = null;
    }

    let editSurface: HTMLDivElement | undefined = $state();

    function handleEditPointerDown(event: PointerEvent): void {
        // While a tool is armed the surface is drawing, and a drag over the
        // edited shape draws a new one rather than reshaping it.
        if (drawing || event.button !== 0 || editDrag) return;
        const geometry = editGeometry;
        if (!underEdit || !editScreen || !geometry) return;

        const point = stagePoint(event);
        const handle = handleAtPoint(editHandles, point);
        // Neither a handle nor the shape's own interior: the margin around the
        // shape that exists so the handles are reachable, and nothing to do.
        if (handle === null && !editContainsPoint(point)) return;

        const origin = editCanvasPoint(event);
        if (!origin) return;

        editDrag = {
            pointerId: event.pointerId,
            annotationId: underEdit.annotation?.id ?? null,
            handle,
            origin,
            start: geometry,
        };
        // Captured so a drag that leaves the box still finishes here — a
        // reshape routinely ends well outside the shape it started on.
        editSurface?.setPointerCapture(event.pointerId);
    }

    function handleEditPointerMove(event: PointerEvent): void {
        if (!editDrag || event.pointerId !== editDrag.pointerId) return;
        // The annotation moved out from under the drag. Its `start` geometry
        // belongs to the one it began on, so there is nothing to continue.
        if (editDrag.annotationId !== (underEdit?.annotation?.id ?? null)) {
            cancelEditDrag();
            return;
        }
        const to = editCanvasPoint(event);
        if (!to) return;
        const delta = {
            x: to.x - editDrag.origin.x,
            y: to.y - editDrag.origin.y,
        };
        const start = editDrag.start;
        if (start.kind === 'point') {
            // Its handle and its geometry are the same thing, so grabbing the
            // handle and grabbing the shape do the same thing: it follows.
            setEditDraft({ kind: 'point', point: to });
            return;
        }
        if (start.kind === 'rect') {
            setEditDraft({
                kind: 'rect',
                rect: isHandleId(editDrag.handle)
                    ? resizeRect(start.rect, editDrag.handle, to)
                    : moveRect(start.rect, delta),
            });
            return;
        }
        setEditDraft({
            kind: 'polygon',
            // One vertex follows the pointer and every other one stays exactly
            // where it was; only a move without a handle translates them all.
            points:
                typeof editDrag.handle === 'number'
                    ? moveVertex(start.points, editDrag.handle, to)
                    : movePolygon(start.points, delta),
        });
    }

    function handleEditPointerUp(event: PointerEvent): void {
        if (!editDrag || event.pointerId !== editDrag.pointerId) return;
        handleEditPointerMove(event);
        const edited = draftGeometry;
        const annotation = underEdit?.annotation ?? null;
        endEditDrag();
        editDraft = null;
        if (edited && annotation) void commitEdit(annotation, edited);
    }

    function handleEditPointerCancel(event: PointerEvent): void {
        if (!editDrag || event.pointerId !== editDrag.pointerId) return;
        cancelEditDrag();
    }

    /**
     * Double-click on a polygon under edit adds or removes a vertex: on a
     * vertex it removes that one, anywhere else INSIDE the outline it inserts
     * one on the nearest edge. Which of the two it is comes from the same
     * nearest-handle test a drag goes through, so there is one answer to "what
     * is under the pointer" rather than two.
     *
     * The margin the hit box adds around the shape so the handles are
     * reachable is not insertion territory: a double-click that lands in it,
     * off a vertex, does nothing. Insertion needs a point on an edge to be
     * nearest to, and the reader has the keyboard verb either way.
     */
    function handleEditDoubleClick(event: MouseEvent): void {
        const geometry = editGeometry;
        const annotation = underEdit?.annotation;
        if (drawing || !annotation || geometry?.kind !== 'polygon') return;
        if (editScreen?.kind !== 'polygon') return;

        const point = stagePoint(event);
        const vertex = handleAtPoint(polygonHandles(editScreen.points), point);
        if (vertex !== null) {
            const points = removeVertex(geometry.points, vertex);
            // Refused at three vertices: fewer is a line, not a region.
            if (points)
                void commitEdit(annotation, { kind: 'polygon', points });
            return;
        }

        if (!polygonContainsPoint(editScreen.points, point)) return;
        const at = editCanvasPoint(event);
        if (!at) return;
        void commitEdit(annotation, {
            kind: 'polygon',
            points: insertVertex(
                geometry.points,
                nearestEdgeInsertIndex(geometry.points, at),
                at,
            ),
        });
    }

    /**
     * Persist a reshaped or moved annotation through the store's normal write
     * path, so display sync and the undo/redo op stack apply to a reshape
     * exactly as they do to a create.
     */
    async function commitEdit(
        annotation: W3CAnnotation,
        geometry: EditableGeometry,
    ): Promise<void> {
        // A commit requires a change. A plain click on the open shape is a
        // move at zero delta, and a nudge can net out to nothing, so both
        // reach here with the geometry that is already stored; writing it back
        // would cost a `beforeSave`, an adapter write and an undo entry for
        // nothing. Compared as geometry rather than as pointer travel, so the
        // keyboard path is covered by the same guard.
        const stored = editableShape(annotation)?.geometry;
        if (stored && geometriesEqual(stored, geometry)) return;
        // The same guard a create passes: a shape dragged down to a smudge is
        // hand jitter, and the stored geometry stands.
        if (!isCommittableGeometry(geometry)) return;
        await saveAnnotation(withEditedGeometry(annotation, geometry));
    }

    /*
     * An undo or a redo that replays a change to the annotation under edit.
     *
     * The geometry needs no reconciliation — it is derived from the store's own
     * copy — but a drag in flight would overwrite what the replay just restored
     * the moment the pointer moved, and a replayed DELETE leaves nothing to
     * edit at all.
     */
    $effect(() => {
        const previous = store.onReplay;
        store.onReplay = (affectedId, annotation) => {
            if (affectedId === session.editingAnnotationId) {
                cancelEditDrag();
                // A replayed delete closes the edit through the controller, not
                // by clearing `editingAnnotationId` here: the panel's selection
                // is what the body editor and the suppression channel hang off,
                // and it would otherwise stay open on an annotation the store no
                // longer holds — where a body save re-creates it.
                if (!annotation) session.requestCancelEdit?.();
            }
            previous?.(affectedId, annotation);
        };
        return () => {
            store.onReplay = previous;
        };
    });

    /*
     * ===== The keyboard verbs =====
     *
     * One set, shared by creation and editing: whichever put the shape on
     * screen, the arrows nudge it, Tab reaches its control points, Enter
     * commits and Escape cancels. There is no keyboard mode and no
     * keyboard-only variant of any tool.
     *
     * Bound on the shape's own box rather than on the window, which is what
     * keeps them off core's collision course. Core's arrow-pan and zoom keys
     * are bound on the RENDERER ROOT, and an overlay layer is its sibling — so
     * a key pressed with a handle focused never reaches the renderer, and a key
     * pressed with nothing here focused never reaches this. Arrows pan the
     * image or nudge a vertex according to where focus is, and neither has to
     * know about the other.
     */

    /**
     * The polygon vertex keys.
     *
     * Letters, deliberately: core binds `+ = - _ 0 Home` for zoom and the
     * arrows for pan, and a reader may well be zooming while a handle is
     * focused. `Insert` was the other candidate and is absent from most laptop
     * keyboards, Apple's included.
     */
    const VERTEX_INSERT_KEY = 'i';
    const VERTEX_REMOVE_KEY = 'x';

    /**
     * Which control point a key press is aimed at, read from the element it
     * landed on: a compass edge, a vertex index, a point's single handle, or
     * `null` for the move affordance — the whole shape rather than one control
     * point.
     */
    function handleFromTarget(
        target: EventTarget | null,
    ): HandleId | number | PointHandleId | null {
        if (!(target instanceof HTMLElement)) return null;
        const id = target.dataset.handle;
        if (id === undefined) return null;
        if (isHandleId(id) || id === POINT_HANDLE_ID) return id;
        const index = Number(id);
        return Number.isInteger(index) ? index : null;
    }

    /**
     * Write the geometry the reader is shaping. A keyboard shape not yet
     * committed is edited in place; a persisted one accumulates into
     * `editDraft`, exactly as a pointer drag does, so Enter commits and Escape
     * discards for both paths.
     */
    function setEditGeometry(geometry: EditableGeometry): void {
        if (creating) creating = { ...creating, geometry };
        else setEditDraft(geometry);
    }

    /** Move the focused control point, or the whole shape, by a canvas-space delta. */
    function nudge(
        geometry: EditableGeometry,
        handle: HandleId | number | PointHandleId | null,
        delta: Point,
    ): void {
        if (geometry.kind === 'point') {
            setEditGeometry({
                kind: 'point',
                point: translatePoint(geometry.point, delta),
            });
            return;
        }
        if (geometry.kind === 'rect') {
            if (!isHandleId(handle)) {
                setEditGeometry({
                    kind: 'rect',
                    rect: moveRect(geometry.rect, delta),
                });
                return;
            }
            // Through the same resize the pointer drives, aimed at where the
            // handle would be after the step — so a nudged edge and a dragged
            // edge cannot disagree about which edges a handle owns.
            const from = rectHandles(geometry.rect).find(
                (candidate) => candidate.id === handle,
            );
            if (!from) return;
            setEditGeometry({
                kind: 'rect',
                rect: resizeRect(
                    geometry.rect,
                    handle,
                    translatePoint(from, delta),
                ),
            });
            return;
        }
        if (typeof handle !== 'number') {
            setEditGeometry({
                kind: 'polygon',
                points: movePolygon(geometry.points, delta),
            });
            return;
        }
        const vertex = geometry.points[handle];
        if (!vertex) return;
        setEditGeometry({
            kind: 'polygon',
            points: moveVertex(
                geometry.points,
                handle,
                translatePoint(vertex, delta),
            ),
        });
    }

    /**
     * Enter. A keyboard shape becomes a new annotation; a persisted one takes
     * the accumulated nudges. Either way it is the store's normal write path,
     * so display sync, id reconciliation and undo/redo apply to a shape made
     * from the keyboard exactly as to one made with the pointer.
     */
    async function commitUnderEdit(): Promise<void> {
        const geometry = editGeometry;
        if (!geometry) return;
        if (creating) {
            const { canvasId } = creating;
            creating = null;
            if (!isCommittableGeometry(geometry)) return;
            await persistShape(canvasId, selectorForGeometry(geometry));
            return;
        }
        const annotation = underEdit?.annotation;
        if (!annotation) return;
        editDraft = null;
        await commitEdit(annotation, geometry);
    }

    /** Add a vertex after the focused one, and follow it with the focus. */
    async function insertVertexAt(
        geometry: EditableGeometry,
        index: number,
    ): Promise<void> {
        if (geometry.kind !== 'polygon') return;
        const points = insertVertexAfter(geometry.points, index);
        if (!points) return;
        setEditGeometry({ kind: 'polygon', points });
        await focusHandle(index + 1);
    }

    /**
     * Remove the focused vertex, refused at {@link MIN_POLYGON_VERTICES}, and
     * leave the focus on the vertex before it — never on nothing, which would
     * strand a keyboard reader back at the top of the page.
     */
    async function removeVertexAt(
        geometry: EditableGeometry,
        index: number,
    ): Promise<void> {
        if (geometry.kind !== 'polygon') return;
        const points = removeVertex(geometry.points, index);
        if (!points) return;
        setEditGeometry({ kind: 'polygon', points });
        await focusHandle(Math.max(0, index - 1));
    }

    function handleShapeKeyDown(event: KeyboardEvent): void {
        // A modified key belongs to the browser or the OS, as it does for
        // core's own bindings. Shift is ours: it is the larger step.
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const geometry = editGeometry;
        if (!geometry) return;
        const handle = handleFromTarget(event.target);

        const delta = nudgeDelta(event.key, event.shiftKey);
        if (delta) {
            // Suppressed because an unhandled arrow scrolls the page — the
            // renderer never sees it either way, being a sibling of this layer.
            event.preventDefault();
            nudge(geometry, handle, delta);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            void commitUnderEdit();
            return;
        }

        if (event.key === 'Delete') {
            // Only a persisted annotation can be deleted; an uncommitted
            // keyboard shape is abandoned with Escape, there being nothing
            // stored to remove.
            if (underEdit?.annotation) session.requestDelete?.();
            return;
        }

        if (event.key === VERTEX_INSERT_KEY && typeof handle === 'number') {
            void insertVertexAt(geometry, handle);
            return;
        }

        if (event.key === VERTEX_REMOVE_KEY && typeof handle === 'number') {
            void removeVertexAt(geometry, handle);
        }
    }

    /*
     * Focus follows the shape, because nothing else would put it there: the
     * handles are mounted into an overlay layer far down the tab order, and a
     * reader who armed a tool from the panel would otherwise have to Tab across
     * the whole viewer to reach the shape that tool just placed.
     *
     * Tab itself is left to the browser. The handles are ordinary buttons in
     * handle order, so Tab and Shift+Tab already walk every one of them; a
     * wrap-around trap was rejected because it would also trap the reader
     * short of the body editor the commit opens.
     */
    async function focusShape(): Promise<void> {
        await tick();
        const surface = editSurface;
        if (!surface) return;
        // The move affordance first: place-then-shape means the first thing a
        // reader does with a default shape is put it where they want it. A
        // point has no separate move button — its one handle IS the shape.
        const move = surface.querySelector<HTMLElement>(
            '[data-testid="annotation-edit-body"]',
        );
        const fallback = surface.querySelector<HTMLElement>(
            '[data-testid="annotation-edit-handle"]',
        );
        (move ?? fallback)?.focus();
    }

    async function focusHandle(
        id: HandleId | number | PointHandleId,
    ): Promise<void> {
        await tick();
        editSurface
            ?.querySelector<HTMLElement>(`[data-handle="${id}"]`)
            ?.focus();
    }

    /**
     * A handle's accessible name, in the viewer's locale: the edge a rectangle
     * handle moves, the one-based position of a polygon vertex, or the point
     * itself.
     */
    function handleLabel(id: HandleId | number | PointHandleId): string {
        if (typeof id === 'number') {
            return t('annotation_editor_handle_vertex', { index: id + 1 });
        }
        if (id === POINT_HANDLE_ID) {
            return t('annotation_editor_handle_point');
        }
        return t('annotation_editor_handle_resize', {
            edge: t(`annotation_editor_edge_${id}`),
        });
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    bind:this={root}
    {@attach measureMarker}
    class="drawing-surface"
    class:drawing
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
    ondblclick={handleDoubleClick}
>
    {#if previewRect}
        <!--
            The ellipse's preview is the box with its corners rounded away,
            which IS the ellipse inscribed in the drag — the reader sees the
            shape that will be persisted, not the box that describes it.
        -->
        <div
            class="draft"
            class:ellipse={draft?.tool === 'ellipse'}
            data-testid="annotation-draft"
            style:left="{previewRect.x}px"
            style:top="{previewRect.y}px"
            style:width="{previewRect.width}px"
            style:height="{previewRect.height}px"
        ></div>
    {/if}

    <!--
        The outline being clicked out, with the edge that runs to the pointer:
        without it the reader cannot see where the next vertex would land.
    -->
    {#if polygonPreview}
        <svg class="polygon-draft" data-testid="annotation-polygon-draft">
            <polyline
                points={[
                    ...polygonPreview.points,
                    ...(polygonPreview.cursor ? [polygonPreview.cursor] : []),
                ]
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
            />
            {#each polygonPreview.points as vertex, index (index)}
                <circle cx={vertex.x} cy={vertex.y} r="4" />
            {/each}
        </svg>
    {/if}

    <!--
        The annotation under edit, drawn ONCE: core's overlay is dropping this
        same annotation for as long as the edit channel names it.

        The hit box takes the gesture and the children take none, so which
        control point a pointer reached is decided by `handleAtPoint` rather than
        by document order — on a small shape the handles overlap, and the
        topmost is not the nearest. They are real `<button>`s with accessible
        names, which is what ADR 0021 requires and what makes every control
        point the pointer can reach reachable by Tab as well.

        The keys are heard here, on the box, so that a press with a handle
        focused is a nudge and the same press with nothing here focused is
        core's pan — see the keyboard notes in the script above. `data-handle`
        is what says which control point the press was aimed at, so the drag and
        the nudge answer that question the same way.
    -->
    {#if underEdit && editScreen && editBounds && editHitBox}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            bind:this={editSurface}
            class="edit-shape"
            class:inert={armed}
            data-testid="annotation-edit-shape"
            data-annotation-id={underEdit.annotation?.id}
            style:left="{editHitBox.x}px"
            style:top="{editHitBox.y}px"
            style:width="{editHitBox.width}px"
            style:height="{editHitBox.height}px"
            onpointerdown={handleEditPointerDown}
            onpointermove={handleEditPointerMove}
            onpointerup={handleEditPointerUp}
            onpointercancel={handleEditPointerCancel}
            ondblclick={handleEditDoubleClick}
            onkeydown={handleShapeKeyDown}
        >
            {#if editScreen.kind === 'polygon'}
                <!-- The outline itself; the move affordance below is the button. -->
                <svg class="edit-outline" aria-hidden="true">
                    <polygon
                        points={editScreen.points
                            .map(
                                (point) =>
                                    `${point.x - editHitBox.x},${point.y - editHitBox.y}`,
                            )
                            .join(' ')}
                    />
                </svg>
            {/if}
            <!--
                A point offers no separate move affordance: its one handle IS
                the shape, so a second button over the same pixels would be a
                duplicate accessible name for the same gesture.
            -->
            {#if editScreen.kind !== 'point'}
                <button
                    type="button"
                    class="edit-body"
                    class:outlined={editScreen.kind === 'rect'}
                    data-testid="annotation-edit-body"
                    aria-label={t('annotation_editor_handle_move')}
                    style:left="{editBounds.x - editHitBox.x}px"
                    style:top="{editBounds.y - editHitBox.y}px"
                    style:width="{editBounds.width}px"
                    style:height="{editBounds.height}px"
                ></button>
            {/if}
            {#each editHandles as handle (handle.id)}
                <button
                    type="button"
                    class="edit-handle"
                    class:point={handle.id === POINT_HANDLE_ID}
                    data-testid="annotation-edit-handle"
                    data-handle={handle.id}
                    aria-label={handleLabel(handle.id)}
                    style:left="{handle.x - editHitBox.x}px"
                    style:top="{handle.y - editHitBox.y}px"
                    style:--tri-annotation-handle-size={handle.id ===
                    POINT_HANDLE_ID
                        ? `${pointMarkerSize}px`
                        : null}
                ></button>
            {/each}
        </div>
    {/if}
</div>

<style>
    /*
     * Styling is CSS custom properties, following the project's theming: a
     * consumer restyles the draft shape with a selector and needs no
     * configuration option to do it.
     */
    .drawing-surface {
        position: absolute;
        inset: 0;
        /* Disarmed — or armed with Space held — the surface is not there at
           all: the drag falls through to the renderer and pans the image.
           Arming is the ONLY thing that makes this box take pointer events. */
        pointer-events: none;
        touch-action: none;
    }

    .drawing-surface.drawing {
        pointer-events: auto;
        cursor: var(--tri-annotation-draw-cursor, crosshair);
    }

    /*
     * The edit box is the only part of the surface that takes pointer events
     * while nothing is armed: a drag anywhere else still pans the image, so
     * editing one shape does not put the viewer into a mode.
     */
    .edit-shape {
        position: absolute;
        pointer-events: auto;
    }

    .edit-shape.inert {
        /* A tool is armed: a drag over the edited shape draws a new one.
           Arming alone, never `drawing`: Space is the escape hatch back to the
           renderer's pan, so restoring pointer events here would hand it the
           very drag Space exists to give away. */
        pointer-events: none;
    }

    /*
     * Both children are inert to the pointer so that `handleAtPoint` decides
     * which control point a gesture reached. They are buttons for focus and for
     * their accessible names, not for their hit areas.
     */
    .edit-body,
    .edit-handle {
        position: absolute;
        margin: 0;
        padding: 0;
        pointer-events: none;
        box-sizing: border-box;
        background: none;
        appearance: none;
    }

    .edit-body {
        cursor: var(--tri-annotation-edit-move-cursor, move);
    }

    /* A rectangle IS its bounding box, so the move button can draw it. A
       polygon's is drawn by the `<svg>` above instead, and the button over its
       bounds carries only the accessible name and the cursor. */
    .edit-body.outlined {
        border: var(--tri-annotation-draw-stroke-width, 2px) solid
            var(--tri-annotation-draw-stroke, var(--tri-color-primary));
        background: var(
            --tri-annotation-draw-fill,
            color-mix(in oklab, var(--tri-color-primary) 20%, transparent)
        );
    }

    .edit-outline {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: visible;
    }

    .edit-outline polygon {
        stroke: var(--tri-annotation-draw-stroke, var(--tri-color-primary));
        stroke-width: var(--tri-annotation-draw-stroke-width, 2px);
        fill: var(
            --tri-annotation-draw-fill,
            color-mix(in oklab, var(--tri-color-primary) 20%, transparent)
        );
    }

    .edit-handle {
        /* Read with a fallback rather than declared here: a declaration on the
           handle itself would shadow the value a host sets on the viewer or any
           ancestor, which is how every other token on this layer is set. The
           point handle still overrides it inline, from the viewer config's
           `pointStyle`. */
        width: var(--tri-annotation-handle-size, 10px);
        height: var(--tri-annotation-handle-size, 10px);
        /* Positioned by its CENTRE: a handle marks a point, not a box. */
        translate: -50% -50%;
        border: 1px solid
            var(--tri-annotation-handle-stroke, var(--tri-color-base-100, #fff));
        background: var(--tri-annotation-handle-fill, var(--tri-color-primary));
    }

    /* The point under edit is drawn at the marker's own diameter, so it is the
       size the reader sees at rest — the viewer config's `pointStyle` answers
       for both. Its colours
       and border width are the rest marker's too, and deliberately not the
       generic handle tokens above: a point must not look different selected
       than unselected, and the vertex and corner handles are the editor's own
       furniture while this one stands in for a marker the reader already sees.

       The fallbacks are core's own `--tri-annotation-*` theme tokens rather
       than copies of their values: the marker under edit and the marker at rest
       are the same marker, so they answer to one declaration. */
    .edit-handle.point {
        border-radius: calc(infinity * 1px);
        border-width: var(--tri-annotation-border-width, 2px);
        border-color: var(
            --tri-annotation-point-stroke,
            var(--tri-annotation-color)
        );
        background: var(
            --tri-annotation-point-fill,
            var(--tri-annotation-color)
        );
    }

    .edit-handle:focus-visible {
        outline: 2px solid var(--tri-color-primary);
        outline-offset: 2px;
    }

    .draft {
        position: absolute;
        box-sizing: border-box;
        pointer-events: none;
        border: var(--tri-annotation-draw-stroke-width, 2px) solid
            var(--tri-annotation-draw-stroke, var(--tri-color-primary));
        background: var(
            --tri-annotation-draw-fill,
            color-mix(in oklab, var(--tri-color-primary) 20%, transparent)
        );
    }

    .draft.ellipse {
        border-radius: 50%;
    }

    .polygon-draft {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: visible;
    }

    .polygon-draft polyline {
        fill: none;
        stroke: var(--tri-annotation-draw-stroke, var(--tri-color-primary));
        stroke-width: var(--tri-annotation-draw-stroke-width, 2px);
    }

    .polygon-draft circle {
        fill: var(--tri-annotation-handle-fill, var(--tri-color-primary));
        stroke: var(
            --tri-annotation-handle-stroke,
            var(--tri-color-base-100, #fff)
        );
    }
</style>
