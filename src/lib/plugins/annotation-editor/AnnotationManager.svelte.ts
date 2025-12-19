import {
    createOSDAnnotator,
    W3CImageFormat,
    type OpenSeadragonAnnotator,
    type W3CImageAnnotation,
} from '@annotorious/openseadragon';
import type { ImageAnnotation } from '@annotorious/annotorious';
import OpenSeadragon from 'openseadragon';

import type {
    AnnotationEditorConfig,
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
    private config: AnnotationEditorConfig;
    private adapter: AnnotationStorageAdapter;
    private annotorious: OpenSeadragonAnnotator<
        ImageAnnotation,
        W3CImageAnnotation
    > | null = null;

    // Store reference to OSD viewer for mouse nav toggling
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private osdViewer: any = null;

    // Current canvas tracking
    private currentManifestId: string | null = null;
    private currentCanvasId: string | null = null;

    // Internal state tracking
    private isDrawingEnabled = false;
    private activeTool: DrawingTool = 'rectangle';

    // Callbacks for state updates (set by controller)
    onSelectionChange?: (annotation: any | null) => void;
    onUndoRedoChange?: (canUndo: boolean, canRedo: boolean) => void;
    onAnnotationCreated?: (annotation: any) => void;

    constructor(config: AnnotationEditorConfig) {
        this.config = config;
        this.adapter = config.adapter ?? new LocalStorageAdapter();
        this.activeTool = config.defaultTool ?? 'rectangle';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private initAnnotorious(viewer: any, canvasId: string | null): void {
        if (this.annotorious) return;

        try {
            const sourceId = canvasId ?? 'unknown';

            // Initial drawing enabled state only if tool is NOT point (Annotorious handles others)
            const initialDrawingEnabled =
                this.isDrawingEnabled && this.activeTool !== 'point';

            const config = {
                adapter: W3CImageFormat(sourceId),
                drawingEnabled: initialDrawingEnabled,
                autoSave: false,
                drawingMode: 'click' as 'click',
                style: this.config.drawingStyle ?? {
                    fill: '#1e90ff',
                    fillOpacity: 0.25,
                    stroke: '#1e90ff',
                    strokeWidth: 2,
                },
                formatter: (annotation: any) => {
                    // Check if this is a 'point' annotation
                    if (annotation.id && annotation.id.startsWith('point-')) {
                        return 'point-annotation';
                    }
                    return ''; // No class for normal annotations
                },
            };

            const anno = createOSDAnnotator(viewer, config);
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
            this.annotorious.setVisible(true); // Always start visible
        } catch (error) {
            console.error(
                '[AnnotationManager] Failed to create annotator:',
                error,
            );
        }
    }

    // ... (injectStyles remains same) ...

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const OSD = OpenSeadragon as any;

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            this.onAnnotationCreated?.(annotation);
            await this.saveAnnotation(annotation);
            this.updateUndoRedoState();
        });

        this.annotorious.on('updateAnnotation', async (updated) => {
            await this.saveAnnotation(updated);
            this.updateUndoRedoState();
        });

        this.annotorious.on('selectionChanged', (annotations) => {
            const selected = annotations.length > 0 ? annotations[0] : null;

            // Robustly toggle a class on the viewer container
            if (selected && selected.id && selected.id.startsWith('point-')) {
                this.osdViewer.element.classList.add('point-selected');
            } else {
                this.osdViewer.element.classList.remove('point-selected');
            }

            this.onSelectionChange?.(selected);
        });
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
        this.onSelectionChange?.(null);
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
            this.annotorious.clearAnnotations();

            const annotations = await this.adapter.load(
                this.currentManifestId,
                this.currentCanvasId,
            );

            if (annotations.length > 0) {
                this.annotorious.setAnnotations(annotations, true);
            }

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

        const w3cAnnotation = this.ensureTargetSource(annotation);

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

    async deleteAnnotation(annotationId: string): Promise<void> {
        if (!this.currentManifestId || !this.currentCanvasId) return;

        try {
            await this.adapter.delete(
                this.currentManifestId,
                this.currentCanvasId,
                annotationId,
            );
            this.annotorious?.removeAnnotation(annotationId);
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
            // Cast to any to avoid type conflicts with Annotorious internals
            this.annotorious?.updateAnnotation(updated as any);
        }
    }

    cancelSelection(): void {
        this.annotorious?.cancelSelected();
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
        this.annotorious?.destroy();
        this.annotorious = null;
        this.adapter.destroy?.();
    }
}
