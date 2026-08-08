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
        annotations,
        editorOpen = false,
        requestEdit,
        canvasToScreen = (point: { x: number; y: number }) => point,
    }: {
        /** Raw IIIF annotation JSON, exactly as the cache holds it. */
        annotations: any[];
        /** Whether the stub annotation-editor button reports itself active. */
        editorOpen?: boolean;
        /** Told which annotation the overlay asked to edit. */
        requestEdit?: (annotationId: string) => void;
        canvasToScreen?: (point: { x: number; y: number }) => {
            x: number;
            y: number;
        } | null;
    } = $props();

    const viewerState = {
        config: {},
        manifestId: 'manifest-1',
        canvasId: 'canvas-1',
        rendererReady: true,
        hoveredAnnotationId: null,
        currentCanvasSearchAnnotations: [] as any[],
        get visibleAnnotationIds() {
            return new Set(annotations.map((anno) => anno.id ?? anno['@id']));
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
        getAnnotations: () => annotations,
        getCanvases: () => [],
        canvasToScreen: (point: { x: number; y: number }) =>
            canvasToScreen(point),
        subscribeFrame: () => () => {},
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
