<script lang="ts">
    /**
     * A host for `AnnotationShapeOverlay` with a stub `ViewerState`.
     *
     * The overlay reads a dozen things off viewer state and nothing else, so a
     * stub is the whole seam: no renderer, no manifest fetch, and `canvasToScreen`
     * supplied by the test so the projected geometry is arithmetic the assertion
     * can state.
     *
     * It exists for one branch in particular — the **editable** shape, which is a
     * real `<button>` with an accessible name and Enter/Space activation. That
     * branch is gated on the annotation-editor plugin's toolbar button, and that
     * plugin is paused for this phase, so nothing in a shipped viewer or in the
     * e2e suite reaches it. Seeding `pluginMenuButtons` with a stub button is what
     * makes the accessibility contract an assertion rather than a promise.
     */
    import { setContext } from 'svelte';

    import { VIEWER_STATE_KEY } from '../state/viewer.svelte';
    import AnnotationShapeOverlay from './AnnotationShapeOverlay.svelte';

    let {
        annotations = [],
        annotationsByCanvas,
        searchAnnotations = [],
        canvases = [],
        editorOpen = false,
        activeLocale = 'en',
        requestEdit,
        canvasToScreen = (point: { x: number; y: number }) => point,
    }: {
        /** Raw IIIF annotation JSON on the single canvas `canvas-1`. */
        annotations?: any[];
        /**
         * Annotations per canvas, for the multi-canvas modes: the keys become the
         * canvases on screen, in order, exactly as `annotatableCanvasIds` reports
         * a spread or a run of folios in continuous mode. Takes the place of
         * `annotations` when given.
         */
        annotationsByCanvas?: Record<string, any[]>;
        /**
         * Ephemeral content-search hits, in the shape `buildSearchAnnotations`
         * makes them: a v2 `on` naming the canvas, a `canvasId`, and no embedded
         * canvas context.
         */
        searchAnnotations?: any[];
        /**
         * Raw IIIF Canvas JSON, for the canvas/image dimensions an image-space
         * target is converted through. Without it the conversion is the identity
         * and a mis-classified annotation looks correct.
         */
        canvases?: any[];
        /** Whether the stub annotation-editor button reports itself active. */
        editorOpen?: boolean;
        /** The viewer's active locale, which picks a `Choice` body's item. */
        activeLocale?: string;
        /** Told which annotation the overlay asked to edit. */
        requestEdit?: (annotationId: string) => void;
        /**
         * The renderer's placement, per canvas — so a test can give a spread's two
         * pages different offsets and assert that each shape used its own.
         */
        canvasToScreen?: (
            point: { x: number; y: number },
            canvasId?: string,
        ) => {
            x: number;
            y: number;
        } | null;
    } = $props();

    /** The canvases on screen, and what each of them carries. */
    const byCanvas = $derived(
        annotationsByCanvas ?? { 'canvas-1': annotations },
    );
    const canvasIds = $derived(Object.keys(byCanvas));

    /**
     * The selection the overlay writes, and the tap that makes it.
     *
     * `tapAt` is the renderer's reserved single tap, delivered through the same
     * subscription the real host publishes it on — so a test drives selection by
     * tapping a point rather than by calling into the overlay.
     */
    let activeAnnotationId = $state<string | null>(null);
    let tapListeners: ((point: { x: number; y: number }) => void)[] = [];

    export function tapAt(point: { x: number; y: number }) {
        for (const listener of [...tapListeners]) listener(point);
    }

    export function selectedAnnotationId(): string | null {
        return activeAnnotationId;
    }

    /**
     * The renderer's frame cadence, driven by the test.
     *
     * `frameSubscriptions` counts how often the overlay attached at all, which
     * is what an idle overlay is supposed to keep at zero.
     */
    let frameListeners: (() => void)[] = [];
    let frameSubscriptions = 0;

    export function tickFrame() {
        for (const listener of [...frameListeners]) listener();
    }

    export function frameSubscriptionCount(): number {
        return frameSubscriptions;
    }

    const viewerState = {
        config: {},
        manifestId: 'manifest-1',
        get activeLocale() {
            return activeLocale;
        },
        get canvasId() {
            return canvasIds[0] ?? null;
        },
        get annotatableCanvasIds() {
            return canvasIds;
        },
        get searchAnnotations() {
            return searchAnnotations;
        },
        rendererReady: true,
        hoveredAnnotationId: null,
        get activeAnnotationId() {
            return activeAnnotationId;
        },
        setActiveAnnotationId: (annotationId: string | null) => {
            activeAnnotationId =
                annotationId !== null && annotationId === activeAnnotationId
                    ? null
                    : annotationId;
        },
        subscribeSurfaceTap: (
            listener: (point: { x: number; y: number }) => void,
        ) => {
            tapListeners.push(listener);
            return () => {
                tapListeners = tapListeners.filter(
                    (entry) => entry !== listener,
                );
            };
        },
        get visibleAnnotationIds() {
            return new Set(
                Object.values(byCanvas)
                    .flat()
                    .map((anno: any) => anno.id ?? anno['@id']),
            );
        },
        annotationEditBus: {
            activeEditAnnotationId: null,
            requestEdit: (annotationId: string) => requestEdit?.(annotationId),
        },
        // The one seed that reaches the editable branch: the overlay reads the
        // editor's open state off its toolbar button, by plugin id.
        get pluginMenuButtons() {
            return editorOpen
                ? [{ pluginId: 'annotation-editor', isActive: () => true }]
                : [];
        },
        getAnnotations: (_manifestId: string, canvasId: string) =>
            byCanvas[canvasId] ?? [],
        getCanvases: () => canvases,
        canvasToScreen: (point: { x: number; y: number }, canvasId?: string) =>
            canvasToScreen(point, canvasId),
        subscribeFrame: (listener: () => void) => {
            frameSubscriptions += 1;
            frameListeners.push(listener);
            return () => {
                frameListeners = frameListeners.filter(
                    (entry) => entry !== listener,
                );
            };
        },
    };

    setContext(VIEWER_STATE_KEY, viewerState);
</script>

<!--
    The stage, as `TriiiceratopsViewer` builds it: the renderer's root and the
    overlay as siblings, with chrome (a toolbar button here) in the same box. The
    overlay's pointer listeners live on this element and are narrowed to the
    renderer's own root, so the chrome has to be present for that to be testable
    at all.
-->
<div class="stage">
    <div class="renderer-root" data-testid="stub-renderer"></div>
    <AnnotationShapeOverlay />
    <button type="button" data-testid="stub-chrome">Zoom in</button>
</div>
