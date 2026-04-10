import type {
    OpenSeadragonAnnotator,
    W3CImageAnnotation,
} from '@annotorious/openseadragon';
import type { ImageAnnotation } from '@annotorious/annotorious';

import type {
    AnnotationEditorConfig,
    AnnotationEditorRuntimeContext,
    DrawingTool,
    W3CAnnotationBody,
    AnnotationStorageAdapter,
} from './types';
import type { W3CAnnotation } from './adapters/types';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';

/**
 * Manages the Annotorious instance and annotation CRUD operations.
 * Instantiated within the controller component.
 */
export class AnnotationManager {
    private static readonly POINT_SELECTOR_RENDER_SIZE = 6;
    private static readonly ACTIVE_EDIT_ID_EVENT =
        'triiiceratops:annotation-editor:active-edit-id';

    private config: AnnotationEditorConfig;
    private adapter: AnnotationStorageAdapter;
    private annotorious: OpenSeadragonAnnotator<
        ImageAnnotation,
        W3CImageAnnotation
    > | null = null;

    // Store reference to OSD viewer for mouse nav toggling
    private osdViewer: any = null;

    // Dynamic dependencies
    private OSD: any = null;
    private createOSDAnnotator: any = null;
    private W3CImageFormat: any = null;

    // Current canvas tracking
    private currentManifestId: string | null = null;
    private currentCanvasId: string | null = null;
    private persistedAnnotations = new Map<string, W3CAnnotation>();
    private activeEditingAnnotationId: string | null = null;

    // Internal state tracking
    private isDrawingEnabled = false;
    private activeTool: DrawingTool = 'rectangle';
    private selectedAnnotation: W3CAnnotation | null = null;

    // Callbacks for state updates (set by controller)
    onSelectionChange?: (annotation: any | null) => void;
    onUndoRedoChange?: (canUndo: boolean, canRedo: boolean) => void;
    onAnnotationCreated?: (annotation: any) => void;
    onAnnotationHydrationChange?: (isHydrating: boolean) => void;

    constructor(config: AnnotationEditorConfig) {
        this.config = config;
        this.adapter = config.adapter ?? new LocalStorageAdapter();
        this.activeTool = config.defaultTool ?? 'rectangle';
    }

    init(viewer: any, canvasId: string | null): void {
        if (!viewer) {
            console.error('[AnnotationManager] Cannot init: Viewer is null');
            return;
        }

        // Store viewer reference
        this.osdViewer = viewer;
        this.currentCanvasId = canvasId;

        // If viewer is already open, init immediately
        const worldCount = viewer.world?.getItemCount() ?? 0;

        if (worldCount > 0) {
            this.initAnnotorious(viewer, canvasId);
        } else {
            // Wait for open event and give it a moment to settle layout
            viewer.addHandler('open', () => {
                setTimeout(() => {
                    this.initAnnotorious(viewer, canvasId);
                }, 250);
            });
        }

        // Attach global click handler for Point tool
        // "canvas-click" is robust and handles drag vs click detection
        // Attach global click handler for ALL tools when drawing is enabled
        // This ensures we can block Zoom on click, while allowing Panning (Drag)
        viewer.addHandler('canvas-click', (event: any) => {
            if (this.isDrawingEnabled && event.quick) {
                // Prevent default OSD navigation (zoom on click)
                event.preventDefaultAction = true;

                if (this.activeTool === 'point' && this.annotorious) {
                    this.handlePointClick(event);
                }
            }
        });
    }

    private async initAnnotorious(
        viewer: any,
        canvasId: string | null,
    ): Promise<void> {
        if (this.annotorious) return;

        try {
            // Load dynamic dependencies
            if (!this.createOSDAnnotator || !this.W3CImageFormat) {
                const mod = await import('@annotorious/openseadragon');
                this.createOSDAnnotator = mod.createOSDAnnotator;
                this.W3CImageFormat = mod.W3CImageFormat;
            }
            if (!this.OSD) {
                const mod = await import('openseadragon');
                this.OSD = mod.default || mod;
            }

            const sourceId = canvasId ?? 'unknown';

            // Initial drawing enabled state only if tool is NOT point (Annotorious handles others)
            const initialDrawingEnabled =
                this.isDrawingEnabled && this.activeTool !== 'point';

            const config = {
                adapter: this.W3CImageFormat(sourceId),
                drawingEnabled: initialDrawingEnabled,
                autoSave: false,
                drawingMode: 'click' as const,
                style: this.config.drawingStyle ?? {
                    fill: '#1e90ff',
                    fillOpacity: 0.25,
                    stroke: '#1e90ff',
                    strokeWidth: 2,
                },
                formatter: (annotation: any) => {
                    if (this.isPointAnnotation(annotation)) {
                        return 'point-annotation';
                    }
                    return ''; // No class for normal annotations
                },
            };

            const anno = this.createOSDAnnotator(viewer, config);
            this.annotorious = anno;

            if (this.config.user) {
                anno.setUser(this.config.user);
            }

            // Set initial tool
            if (this.activeTool !== 'point') {
                anno.setDrawingTool(this.activeTool);
            }

            // Inject styles
            this.injectStyles(viewer);

            this.setupEvents();

            // Apply pending state
            this.updateDrawingMode(this.isDrawingEnabled);
            anno.setVisible(true); // Always start visible

            if (this.currentManifestId && this.currentCanvasId) {
                void this.loadAnnotations();
            }
        } catch (error) {
            console.error(
                '[AnnotationManager] Failed to create annotator:',
                error,
            );
        }
    }

    // ... (injectStyles remains same) ...

    private handlePointClick(event: any): void {
        if (!this.osdViewer || !this.annotorious) return;

        // Helper to get the TiledImage (first item) for accurate conversion
        const tiledImage = this.osdViewer.world.getItemAt(0);
        if (!tiledImage) return;

        // 1. Resolve Click Position
        // event.position is in "Web Coordinates" (Pixels relative to viewer)
        // We MUST convert to Viewport coordinates first.
        const viewportPoint = this.osdViewer.viewport.pointFromPixel(
            event.position,
        );

        // Then convert Viewport -> Image
        const imagePoint = tiledImage.viewportToImageCoordinates(viewportPoint);

        // Calculate width/height based on "Screen Pixels" to ensure visibility
        // User requested a 2x2 pixel rectangle.
        const targetScreenPixels = 2;

        const OSD = this.OSD;

        const p1 = this.osdViewer.viewport.pointFromPixel(new OSD.Point(0, 0));
        const p2 = this.osdViewer.viewport.pointFromPixel(
            new OSD.Point(targetScreenPixels, 0),
        );

        const imgP1 = tiledImage.viewportToImageCoordinates(p1);
        const imgP2 = tiledImage.viewportToImageCoordinates(p2);

        const imageDist = Math.abs(imgP2.x - imgP1.x);

        // Ensure at least 1 image unit, but otherwise strictly follow the screen-pixel math
        const size = Math.max(Math.round(imageDist), 1);
        const width = size;
        const height = size;

        // Center the rectangle on the click
        const x = Math.round(imagePoint.x - width / 2);
        const y = Math.round(imagePoint.y - height / 2);

        console.log('[PointTool] Sizing Debug:', {
            p1,
            p2,
            imageDist,
            size,
            width,
            height,
        });

        console.log('[PointTool] Creating Rect:', {
            clickViewport: viewportPoint,
            clickImage: imagePoint,
            finalRect: { x, y, width, height },
            imageBounds: this.osdViewer.world.getItemAt(0)?.getBounds(),
        });

        const id = `point-${crypto.randomUUID()}`;
        const annotation = {
            '@context': 'http://www.w3.org/ns/anno.jsonld' as const,
            id: id,
            type: 'Annotation' as const,
            body: [],
            target: {
                source: this.currentCanvasId ?? 'unknown',
                selector: {
                    type: 'FragmentSelector' as const,
                    conformsTo: 'http://www.w3.org/TR/media-frags/' as const,
                    value: `xywh=${x},${y},${width},${height}`,
                },
            },
        };

        // 5. Add to Annotorious
        this.annotorious.addAnnotation(annotation);

        // Wait for render cycle before selecting coverage
        setTimeout(() => {
            (this.annotorious as any).setSelected(id);
        }, 50);
    }

    // ... (injectStyles/styles/etc)

    // === Public API ===

    setEditing(enabled: boolean): void {
        this.isDrawingEnabled = enabled; // Keep track of "Drawing" state

        if (this.annotorious) {
            this.updateDrawingMode(enabled);
            // Always keep visible so that "Drawing Mode: Off" acts as "Edit/Select Mode"
            this.annotorious.setVisible(true);
        }
    }

    private updateDrawingMode(enabled: boolean): void {
        if (!this.annotorious || !this.osdViewer?.element) return;

        // If tool is 'point', we do NOT enable Annotorious native drawing
        // because we handle it manually.
        if (this.activeTool === 'point') {
            this.annotorious.setDrawingEnabled(false);
        } else {
            this.annotorious.setDrawingEnabled(enabled);
        }

        // Toggle class for CSS cursor control
        if (enabled) {
            this.osdViewer.element.classList.add('annotorious-drawing-mode');
        } else {
            this.osdViewer.element.classList.remove('annotorious-drawing-mode');
        }

        // NOTE: We do NOT disable mouse nav (panning) here anymore.
        // User workflow is "Click-Move-Click", so Dragging should Pan.
        // We also do NOT isolate events, so that MouseDown/Up bubble to OSD for Panning.
    }

    private isPointAnnotation(annotation: any): boolean {
        const selector = annotation?.target?.selector;

        return (
            annotation?.id?.startsWith?.('point-') ||
            selector?.type === 'PointSelector'
        );
    }

    private getPointCoordinates(
        annotation: any,
    ): { x: number; y: number } | null {
        const selector = annotation?.target?.selector;

        if (
            selector?.type === 'PointSelector' &&
            typeof selector.x === 'number' &&
            typeof selector.y === 'number'
        ) {
            return { x: selector.x, y: selector.y };
        }

        if (
            selector?.type === 'FragmentSelector' &&
            typeof selector.value === 'string'
        ) {
            const match = selector.value.match(
                /^xywh=([\d.-]+),([\d.-]+),([\d.-]+),([\d.-]+)$/,
            );

            if (match) {
                const [, x, y, width, height] = match;

                return {
                    x: Number(x) + Number(width) / 2,
                    y: Number(y) + Number(height) / 2,
                };
            }
        }

        return null;
    }

    private toPointSelectorTarget(annotation: W3CAnnotation): W3CAnnotation {
        if (!this.isPointAnnotation(annotation)) {
            return annotation;
        }

        const point = this.getPointCoordinates(annotation);
        if (!point) {
            return annotation;
        }

        return {
            ...annotation,
            target: {
                type: 'SpecificResource',
                source:
                    annotation.target?.source ??
                    this.currentCanvasId ??
                    'unknown',
                selector: {
                    type: 'PointSelector',
                    x: point.x,
                    y: point.y,
                },
            },
        } as W3CAnnotation;
    }

    private toAnnotoriousTarget(annotation: W3CAnnotation): W3CAnnotation {
        const selector = annotation?.target?.selector as any;

        if (selector?.type !== 'PointSelector') {
            return annotation;
        }

        const size = AnnotationManager.POINT_SELECTOR_RENDER_SIZE;
        const x = selector.x - size / 2;
        const y = selector.y - size / 2;

        return {
            ...annotation,
            target: {
                source:
                    annotation.target?.source ??
                    this.currentCanvasId ??
                    'unknown',
                selector: {
                    type: 'FragmentSelector',
                    conformsTo: 'http://www.w3.org/TR/media-frags/',
                    value: `xywh=${x},${y},${size},${size}`,
                },
            },
        } as W3CAnnotation;
    }

    setTool(tool: DrawingTool): void {
        this.activeTool = tool;
        // Re-evaluate drawing mode to enable/disable native drawing
        this.updateDrawingMode(this.isDrawingEnabled);

        if (tool !== 'point') {
            this.annotorious?.setDrawingTool(tool);
        }
    }

    // ... (rest is same)

    get availableTools(): DrawingTool[] {
        return this.config.tools ?? ['rectangle', 'polygon', 'point'];
    }

    private injectStyles(viewer: any): void {
        if (!viewer.element) return;

        const root = viewer.element.getRootNode();
        const styleId = 'annotorious-fixes';

        // Annotorious default CSS (minified) to ensure it works in Shadow DOM
        const annotoriousCss =
            'canvas.a9s-gl-canvas{height:100%;left:0;position:absolute;top:0;width:100%}canvas.a9s-gl-canvas.hidden{display:none}canvas.a9s-gl-canvas.hover{cursor:pointer!important}svg.svelte-g4ws1v.svelte-g4ws1v{pointer-events:none}svg.drawing.svelte-g4ws1v.svelte-g4ws1v,svg.editing.svelte-g4ws1v .svelte-g4ws1v{pointer-events:all}svg.hover.svelte-g4ws1v.svelte-g4ws1v{cursor:pointer}svg.svelte-g4ws1v .svelte-g4ws1v{pointer-events:all}text.svelte-1rehw2p{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-weight:600}rect.svelte-1rehw2p{stroke-width:1.2;vector-effect:non-scaling-stroke}polygon.svelte-fgq4n0{stroke-width:1.2;vector-effect:non-scaling-stroke}rect.svelte-gze948{stroke-width:1.2;vector-effect:non-scaling-stroke}svg.svelte-1krwc4m{position:absolute;top:0;left:0;width:100%;height:100%;outline:none;pointer-events:none}svg.svelte-jwrce3{overflow:visible;position:absolute;top:0;left:0;width:100%;height:100%;outline:none;pointer-events:none}.a9s-osd-selectionlayer :is(rect,path,polygon,ellipse,line){fill:#3182ed40;stroke:#3182ed;stroke-width:1.5px;vector-effect:non-scaling-stroke}rect.a9s-union-fg.svelte-jwrce3{fill:#3182ed1f;stroke-width:1px}rect.a9s-union-bg.svelte-jwrce3{fill:transparent;stroke:#fff;stroke-width:2px}circle.a9s-handle-buffer.svelte-qtyc7s:focus{outline:none}circle.a9s-handle-buffer.svelte-qtyc7s:focus-visible{stroke:#fffc;stroke-width:3px}.a9s-polygon-midpoint.svelte-12ykj76{cursor:crosshair}.a9s-polygon-midpoint-buffer.svelte-12ykj76{fill:transparent}.a9s-polygon-midpoint-outer.svelte-12ykj76{display:none;fill:transparent;pointer-events:none;stroke:#00000059;stroke-width:1.5px;vector-effect:non-scaling-stroke}.a9s-polygon-midpoint-inner.svelte-12ykj76{fill:#00000040;pointer-events:none;stroke:#fff;stroke-width:1px;vector-effect:non-scaling-stroke}mask.a9s-polygon-editor-mask.svelte-1h2slbm>rect.svelte-1h2slbm{fill:#fff}mask.a9s-polygon-editor-mask.svelte-1h2slbm>circle.svelte-1h2slbm,mask.a9s-polygon-editor-mask.svelte-1h2slbm>polygon.svelte-1h2slbm{fill:#000}mask.a9s-rectangle-editor-mask.svelte-1njczvj>rect.rect-mask-bg.svelte-1njczvj{fill:#fff}mask.a9s-rectangle-editor-mask.svelte-1njczvj>rect.rect-mask-fg.svelte-1njczvj{fill:#000}mask.a9s-multipolygon-editor-mask.svelte-1vxo6dc>rect.svelte-1vxo6dc{fill:#fff}mask.a9s-multipolygon-editor-mask.svelte-1vxo6dc>circle.svelte-1vxo6dc,mask.a9s-multipolygon-editor-mask.svelte-1vxo6dc>path.svelte-1vxo6dc{fill:#000}mask.a9s-rubberband-rectangle-mask.svelte-1a76qe7>rect.rect-mask-bg.svelte-1a76qe7{fill:#fff}mask.a9s-rubberband-rectangle-mask.svelte-1a76qe7>rect.rect-mask-fg.svelte-1a76qe7{fill:#000}mask.a9s-rubberband-polygon-mask.svelte-18wrg3t>rect.svelte-18wrg3t{fill:#fff}mask.a9s-rubberband-polygon-mask.svelte-18wrg3t>polygon.svelte-18wrg3t{fill:#000}circle.a9s-handle.svelte-18wrg3t.svelte-18wrg3t{fill:#fff;pointer-events:none;stroke:#00000059;stroke-width:1px;vector-effect:non-scaling-stroke}path.open.svelte-1w0132l{fill:transparent!important}.a9s-annotationlayer{box-sizing:border-box;height:100%;left:0;outline:none;position:absolute;top:0;touch-action:none;width:100%;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;-o-user-select:none;user-select:none}.a9s-annotationlayer.hover{cursor:pointer}.a9s-annotationlayer.hidden{display:none}.a9s-annotationlayer ellipse,.a9s-annotationlayer line,.a9s-annotationlayer path,.a9s-annotationlayer polygon,.a9s-annotationlayer rect{fill:transparent;shape-rendering:geometricPrecision;vector-effect:non-scaling-stroke;-webkit-tap-highlight-color:transparent}.a9s-touch-halo{fill:transparent;pointer-events:none;stroke-width:0;transition:fill .15s}.a9s-touch-halo.touched{fill:#fff6}.a9s-handle-buffer{fill:transparent}.a9s-handle [role=button]{cursor:inherit!important}.a9s-handle-dot{fill:#fff;pointer-events:none;stroke:#00000059;stroke-width:1px;vector-effect:non-scaling-stroke}.a9s-handle-dot.selected{fill:#1a1a1a;stroke:none}.a9s-handle-selected{animation:dash-rotate .35s linear infinite reverse;fill:#ffffff40;stroke:#000000e6;stroke-dasharray:2 2;stroke-width:1px;pointer-events:none;vector-effect:non-scaling-stroke}@keyframes dash-rotate{0%{stroke-dashoffset:0}to{stroke-dashoffset:4}}.a9s-edge-handle{fill:transparent;stroke:transparent;stroke-width:6px}.a9s-shape-handle,.a9s-handle{cursor:move}.a9s-handle.a9s-corner-handle{cursor:crosshair}.a9s-edge-handle-top{cursor:n-resize}.a9s-edge-handle-right{cursor:e-resize}.a9s-edge-handle-bottom{cursor:s-resize}.a9s-edge-handle-left{cursor:w-resize}.a9s-handle.a9s-corner-handle-topleft{cursor:nw-resize}.a9s-handle.a9s-corner-handle-topright{cursor:ne-resize}.a9s-handle.a9s-corner-handle-bottomright{cursor:se-resize}.a9s-handle.a9s-corner-handle-bottomleft{cursor:sw-resize}.a9s-annotationlayer .a9s-outer,div[data-theme=dark] .a9s-annotationlayer .a9s-outer{display:none}.a9s-annotationlayer .a9s-inner,div[data-theme=dark] .a9s-annotationlayer .a9s-inner{fill:#0000001f;stroke:#000;stroke-width:1px}rect.a9s-handle,div[data-theme=dark] rect.a9s-handle{fill:#000;rx:2px}rect.a9s-close-polygon-handle,div[data-theme=dark] rect.a9s-close-polygon-handle{fill:#000;rx:1px}.a9s-annotationlayer .a9s-outer,div[data-theme=light] .a9s-annotationlayer .a9s-outer{display:block;stroke:#00000059;stroke-width:3px}.a9s-annotationlayer .a9s-inner,div[data-theme=light] .a9s-annotationlayer .a9s-inner{fill:#ffffff26;stroke:#fff;stroke-width:1.5px}rect.a9s-handle,div[data-theme=light] rect.a9s-handle{fill:#fff;rx:1px;stroke:#00000073;stroke-width:1px}rect.a9s-close-polygon-handle,div[data-theme=light] rect.a9s-close-polygon-handle{fill:#fff;rx:1px;stroke:#00000073;stroke-width:1px}';

        // Define the critical CSS fixes
        const cssContent = `
            ${annotoriousCss}

            .a9s-annotationlayer, .a9s-osd-drawinglayer {
                width: 100% !important;
                height: 100% !important;
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none; /* Let clicks pass through to children */
            }
            .a9s-annotationlayer svg, .a9s-osd-drawinglayer svg {
                pointer-events: auto; /* Default: Only capture clicks on shapes */
                width: 100%;
                height: 100%;
            }
            /* When in drawing mode, ensure crosshair but DO NOT BLOCK events */
            /* We want events to fall through to OSD for Panning */
            .annotorious-drawing-mode .a9s-annotationlayer svg,
            .annotorious-drawing-mode .a9s-osd-drawinglayer svg {
                pointer-events: none !important;
                cursor: crosshair;
            }

            /* Ensure custom styling for unselected annotations */
            .a9s-annotationlayer :is(rect, polygon, path, ellipse, line) {
                stroke: #1e90ff;
                stroke-width: 2px;
                fill: transparent;
                vector-effect: non-scaling-stroke;
            }

            /* Ensure circles support events (usually stripped by default CSS) */
            .a9s-annotationlayer circle {
                stroke: #1e90ff;
                stroke-width: 2px;
                vector-effect: non-scaling-stroke;
                pointer-events: visiblePainted; 
            }

            /* Render point annotations as circular markers even though
               Annotorious edits them via a tiny fragment rectangle. */
            .a9s-annotation.point-annotation rect,
            .point-selected .a9s-osd-selectionlayer rect {
                rx: 999px;
                ry: 999px;
            }

            /* HIDE resize handles for point annotations using robust container class */
            .point-selected .a9s-handle,
            .point-selected .a9s-edge-handle {
                display: none !important;
                pointer-events: none !important;
            }
            .a9s-osd-selectionlayer circle {
                fill: transparent;
                stroke: #3182ed;
                stroke-width: 1.5px;
                vector-effect: non-scaling-stroke;
                pointer-events: none;
            }
        `;

        if (root instanceof ShadowRoot) {
            if (!root.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = cssContent;
                root.appendChild(style);
            }
        } else {
            // Document context
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = cssContent;
                document.head.appendChild(style);
            }
        }
    }

    private setupEvents(): void {
        if (!this.annotorious) return;

        this.annotorious.on('createAnnotation', async (annotation) => {
            const prepared = this.prepareAnnotation(annotation);
            this.onAnnotationCreated?.(prepared);
            await this.saveAnnotation(prepared);
            this.updateUndoRedoState();
        });

        this.annotorious.on('updateAnnotation', async (updated) => {
            await this.saveAnnotation(updated);
            this.updateUndoRedoState();
        });

        this.annotorious.on('selectionChanged', (annotations) => {
            const selected =
                annotations.length > 0
                    ? this.toPointSelectorTarget(
                          annotations[0] as unknown as W3CAnnotation,
                      )
                    : null;
            this.selectedAnnotation = selected;

            this.setActiveEditingAnnotationId(selected?.id ?? null);

            // Robustly toggle a class on the viewer container
            if (this.isPointAnnotation(selected)) {
                this.osdViewer.element.classList.add('point-selected');
            } else {
                this.osdViewer.element.classList.remove('point-selected');
            }

            this.onSelectionChange?.(selected);
            this.notifyExtensionSelectionChange(selected);

            if (selected?.id) {
                void this.hydrateAnnotation(selected.id);
            } else {
                this.clearAnnotoriousEditingAnnotation();
                this.onAnnotationHydrationChange?.(false);
            }
        });
    }

    private setActiveEditingAnnotationId(annotationId: string | null): void {
        this.activeEditingAnnotationId = annotationId;

        if (typeof window === 'undefined') {
            return;
        }

        window.dispatchEvent(
            new CustomEvent(AnnotationManager.ACTIVE_EDIT_ID_EVENT, {
                detail: { annotationId },
            }),
        );
    }

    private cachePersistedAnnotations(annotations: W3CAnnotation[]): void {
        this.persistedAnnotations = new Map(
            annotations.map((annotation) => [annotation.id, annotation]),
        );
    }

    private async resolvePersistedAnnotation(
        annotationId: string,
    ): Promise<W3CAnnotation | null> {
        const cached = this.persistedAnnotations.get(annotationId);

        if (cached?.__fullBodyLoaded !== false) {
            return cached ?? null;
        }

        if (
            cached &&
            this.adapter.hydrate &&
            this.currentManifestId &&
            this.currentCanvasId
        ) {
            const hydrated = await this.adapter.hydrate(
                this.currentManifestId,
                this.currentCanvasId,
                annotationId,
            );

            if (hydrated) {
                this.persistedAnnotations.set(annotationId, hydrated);
                return hydrated;
            }
        }

        if (!cached && this.currentManifestId && this.currentCanvasId) {
            const annotations = await this.adapter.load(
                this.currentManifestId,
                this.currentCanvasId,
            );
            this.cachePersistedAnnotations(annotations);
            return this.persistedAnnotations.get(annotationId) ?? null;
        }

        return cached ?? null;
    }

    private clearAnnotoriousEditingAnnotation(): void {
        this.selectedAnnotation = null;
        this.osdViewer?.element?.classList.remove('point-selected');
        this.setActiveEditingAnnotationId(null);

        if (!this.annotorious) {
            return;
        }

        const annotations = this.annotorious.getAnnotations() ?? [];

        if (annotations.length > 0) {
            this.annotorious.clearAnnotations();
        }
    }

    private updateUndoRedoState(): void {
        const canUndo = this.annotorious?.canUndo() ?? false;
        const canRedo = this.annotorious?.canRedo() ?? false;
        this.onUndoRedoChange?.(canUndo, canRedo);
    }

    async handleCanvasChange(
        manifestId: string | null,
        canvasId: string | null,
    ): Promise<void> {
        if (
            manifestId === this.currentManifestId &&
            canvasId === this.currentCanvasId
        ) {
            return;
        }

        this.currentManifestId = manifestId;
        this.currentCanvasId = canvasId;
        this.persistedAnnotations.clear();
        this.selectedAnnotation = null;
        this.onSelectionChange?.(null);
        this.notifyExtensionSelectionChange(null);
        await this.loadAnnotations();
    }

    private async loadAnnotations(): Promise<void> {
        if (
            !this.annotorious ||
            !this.currentManifestId ||
            !this.currentCanvasId
        ) {
            return;
        }

        try {
            this.clearAnnotoriousEditingAnnotation();

            const annotations = await this.adapter.load(
                this.currentManifestId,
                this.currentCanvasId,
            );
            this.cachePersistedAnnotations(annotations);

            this.updateUndoRedoState();
        } catch (error) {
            console.error(
                '[AnnotationEditor] Failed to load annotations:',
                error,
            );
        }
    }

    async saveAnnotation(annotation: any): Promise<void> {
        if (!this.currentManifestId || !this.currentCanvasId) return;

        const w3cAnnotation = await this.applyBeforeSave(
            this.toPointSelectorTarget(this.ensureTargetSource(annotation)),
        );

        this.persistedAnnotations.set(w3cAnnotation.id, w3cAnnotation);

        try {
            const existing = await this.adapter.load(
                this.currentManifestId,
                this.currentCanvasId,
            );
            const exists = existing.some((a: any) => a.id === w3cAnnotation.id);

            if (exists) {
                await this.adapter.update(
                    this.currentManifestId,
                    this.currentCanvasId,
                    w3cAnnotation,
                );
            } else {
                await this.adapter.create(
                    this.currentManifestId,
                    this.currentCanvasId,
                    w3cAnnotation,
                );
            }
        } catch (error) {
            console.error(
                '[AnnotationEditor] Failed to save annotation:',
                error,
            );
        }
    }

    private ensureTargetSource(annotation: any): W3CAnnotation {
        const clone = JSON.parse(JSON.stringify(annotation));
        if (clone.target && !clone.target.source) {
            clone.target.source = this.currentCanvasId;
        } else if (typeof clone.target === 'string') {
            clone.target = { source: this.currentCanvasId };
        }
        return clone;
    }

    private prepareAnnotation(annotation: any): W3CAnnotation {
        const base = this.ensureTargetSource(annotation);
        const prepared = this.config.extension?.prepareDraft
            ? this.config.extension.prepareDraft(
                  base,
                  this.getRuntimeContext(null),
              )
            : this.config.prepareAnnotation
              ? this.config.prepareAnnotation(base)
              : base;
        const clone = this.toPointSelectorTarget(
            JSON.parse(JSON.stringify(prepared)),
        );
        clone.__fullBodyLoaded = true;
        return clone;
    }

    private async applyBeforeSave(
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        if (this.config.extension?.beforeSave) {
            return await this.config.extension.beforeSave(
                annotation,
                this.getRuntimeContext(annotation),
            );
        }
        return annotation;
    }

    private getRuntimeContext(
        selectedAnnotation: W3CAnnotation | null,
    ): AnnotationEditorRuntimeContext {
        return {
            manifestId: this.currentManifestId,
            canvasId: this.currentCanvasId,
            isEditing: this.isDrawingEnabled,
            selectedAnnotation,
            user: this.config.user,
            hostContext: this.config.extension?.getContext?.() ?? null,
        };
    }

    private notifyExtensionSelectionChange(
        annotation: W3CAnnotation | null,
    ): void {
        this.config.extension?.onSelectionChange?.(
            annotation,
            this.getRuntimeContext(annotation),
        );
    }

    private async hydrateAnnotation(annotationId: string): Promise<void> {
        if (
            !this.currentManifestId ||
            !this.currentCanvasId ||
            !this.adapter.hydrate ||
            !this.annotorious
        ) {
            return;
        }

        const annotations = this.annotorious.getAnnotations() ?? [];
        const selected = annotations.find(
            (entry: any) => entry.id === annotationId,
        );
        if (!selected || selected.__fullBodyLoaded !== false) {
            this.onAnnotationHydrationChange?.(false);
            return;
        }

        this.onAnnotationHydrationChange?.(true);

        try {
            const hydrated = await this.adapter.hydrate(
                this.currentManifestId,
                this.currentCanvasId,
                annotationId,
            );
            if (!hydrated) return;

            const current = this.annotorious.getAnnotations() ?? [];
            const stillPresent = current.some(
                (entry: any) => entry.id === annotationId,
            );
            if (!stillPresent) return;
            this.onSelectionChange?.(hydrated);
        } catch (error) {
            console.error(
                '[AnnotationEditor] Failed to hydrate annotation body:',
                error,
            );
        } finally {
            this.onAnnotationHydrationChange?.(false);
        }
    }

    async deleteAnnotation(annotationId: string): Promise<void> {
        if (!this.currentManifestId || !this.currentCanvasId) return;

        try {
            await this.adapter.delete(
                this.currentManifestId,
                this.currentCanvasId,
                annotationId,
            );
            this.persistedAnnotations.delete(annotationId);
            this.annotorious?.removeAnnotation(annotationId);

            if (this.activeEditingAnnotationId === annotationId) {
                this.clearAnnotoriousEditingAnnotation();
                this.onSelectionChange?.(null);
                this.notifyExtensionSelectionChange(null);
            }

            this.updateUndoRedoState();
        } catch (error) {
            console.error(
                '[AnnotationEditor] Failed to delete annotation:',
                error,
            );
        }
    }

    async updateAnnotationBodies(
        annotationId: string,
        bodies: W3CAnnotationBody[],
    ): Promise<void> {
        const annotations = this.annotorious?.getAnnotations() ?? [];
        const annotation = annotations.find((a: any) => a.id === annotationId);

        if (annotation) {
            const updated = {
                ...annotation,
                body: bodies.length === 1 ? bodies[0] : bodies,
            };
            await this.saveAnnotation(updated);
            this.persistedAnnotations.set(
                annotationId,
                this.toPointSelectorTarget(this.ensureTargetSource(updated)),
            );
            // Cast to any to avoid type conflicts with Annotorious internals
            this.annotorious?.updateAnnotation(updated as any);
        }
    }

    async selectAnnotationById(annotationId: string): Promise<void> {
        if (
            !this.annotorious ||
            !this.currentManifestId ||
            !this.currentCanvasId
        ) {
            return;
        }

        const annotation = await this.resolvePersistedAnnotation(annotationId);

        if (!annotation) {
            console.warn(
                '[AnnotationEditor] Could not resolve annotation for editing:',
                annotationId,
            );
            return;
        }

        const editableAnnotation = this.toAnnotoriousTarget(annotation);

        this.clearAnnotoriousEditingAnnotation();
        this.annotorious.setAnnotations(
            [editableAnnotation] as Partial<W3CImageAnnotation>[],
            true,
        );
        this.setActiveEditingAnnotationId(annotationId);

        setTimeout(() => {
            (this.annotorious as any)?.setSelected(annotationId);
        }, 0);
    }

    cancelSelection(): void {
        this.selectedAnnotation = null;
        this.onSelectionChange?.(null);
        this.notifyExtensionSelectionChange(null);
        this.onAnnotationHydrationChange?.(false);
        this.clearAnnotoriousEditingAnnotation();
    }

    undo(): void {
        this.annotorious?.undo();
        this.updateUndoRedoState();
    }

    redo(): void {
        this.annotorious?.redo();
        this.updateUndoRedoState();
    }

    destroy(): void {
        this.clearAnnotoriousEditingAnnotation();
        this.annotorious?.destroy();
        this.annotorious = null;
    }
}
