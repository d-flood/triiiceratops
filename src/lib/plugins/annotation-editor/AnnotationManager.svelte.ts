import type {
    DrawingStyle,
    OpenSeadragonAnnotator,
    W3CImageAnnotation,
} from '@annotorious/openseadragon';
import type { ImageAnnotation } from '@annotorious/annotorious';
import { SvelteMap } from 'svelte/reactivity';

import type {
    AnnotationEditorConfig,
    AnnotationEditorRuntimeContext,
    AnnotationPersistenceOp,
    DrawingTool,
} from './types';
import type { W3CAnnotation, W3CTarget } from './adapters/types';
import { AnnotationStore } from './AnnotationStore.svelte';
import { manifestsState } from '../../state/manifests.svelte';
import {
    canvasPointToImagePoint,
    imagePointToCanvasPoint,
    transformAnnotationToCanvasSpace,
    transformAnnotationToImageSpace,
    type CanvasImageSpaceDimensions,
} from '../../utils/canvasImageSpace';
import { resolveCanvasImage } from '../../utils/resolveCanvasImage';
import { resolvePointRadius } from '../../utils/pointMarker';
// The real Annotorious stylesheet, imported as a string so it can be injected
// into the OSD viewer's root node — the shadow root in the element build, where
// a document-head `<link>` never reaches (F23). This is the single source of
// truth: bundlers track it against the installed `@annotorious/*` version, so it
// can't silently drift like the old vendored, hash-classed copy did.
import annotoriousCss from '@annotorious/openseadragon/annotorious-openseadragon.css?inline';

/** Every tool the plugin knows how to draw, in default button order. */
export const ALL_TOOLS: DrawingTool[] = ['rectangle', 'polygon', 'point'];

/**
 * Resolve the effective tool set and default tool from config so the manager
 * and controller share one source of truth (F8). An empty/absent `tools` list
 * means "all tools"; `defaultTool` is honored only when it's within `tools`,
 * otherwise the first available tool wins.
 */
export function resolveTools(config: {
    tools?: DrawingTool[];
    defaultTool?: DrawingTool;
}): { tools: DrawingTool[]; defaultTool: DrawingTool } {
    const tools = config.tools?.length ? config.tools : ALL_TOOLS;
    const defaultTool =
        config.defaultTool && tools.includes(config.defaultTool)
            ? config.defaultTool
            : tools[0];
    return { tools, defaultTool };
}

/**
 * Manages the Annotorious instance and annotation CRUD operations.
 * Instantiated within the controller component.
 */
export class AnnotationManager {
    private static readonly ACTIVE_EDIT_ID_EVENT =
        'triiiceratops:annotation-editor:active-edit-id';

    // Fallback marker colours for the editor's Annotorious styling when the host
    // hasn't set `pointStyle` (§3.3). Annotorious `DrawingStyle` colours must be
    // rgb/hex, so these approximate the read-only overlay's `--anno-red` token.
    private static readonly DEFAULT_POINT_FILL = '#e5484d';
    private static readonly DEFAULT_POINT_STROKE = '#e5484d';
    private static readonly DEFAULT_POINT_STROKE_WIDTH = 2;
    private static readonly DEFAULT_DRAWING_STYLE = {
        fill: '#1e90ff',
        fillOpacity: 0.25,
        stroke: '#1e90ff',
        strokeWidth: 2,
    } as const;

    private config: AnnotationEditorConfig;
    // All persistence (cache, hydration state, save queue, load-race token, the
    // raw adapter, and the current canvas context) lives in the store; the
    // manager only drives Annotorious/OSD mechanics and calls the store (issue 05).
    private store: AnnotationStore;
    // True only when the manager created its own store (no shared store passed).
    // A shared store's lifecycle belongs to the plugin/loader, not the panel.
    private readonly ownsStore: boolean;
    private annotorious: OpenSeadragonAnnotator<
        ImageAnnotation,
        W3CImageAnnotation
    > | null = null;

    // Store reference to OSD viewer for mouse nav toggling
    private osdViewer: any = null;

    // Retained references to the viewer handlers registered in init() so
    // destroy() can remove them and not leak listeners on the OSD viewer (F12).
    private openHandler: ((...args: any[]) => void) | null = null;
    private canvasClickHandler: ((...args: any[]) => void) | null = null;

    // Dynamic dependencies
    private createOSDAnnotator: any = null;
    private W3CImageFormat: any = null;
    // OpenSeadragon module, loaded lazily; used to measure screen-pixel size for
    // the point editing marker (§3.2).
    private OSD: any = null;

    // The exact canvas-space point for each annotation currently open for
    // editing (§3.2). Annotorious v3 has no point tool, so a point is edited via
    // a small fragment rectangle; keeping the origin here lets an unmoved point
    // round-trip bit-identically instead of drifting through the rect centre.
    private editingPointOrigin = new SvelteMap<
        string,
        { x: number; y: number }
    >();

    // Current canvas context is owned by the store; these getters keep the
    // manager's Annotorious/transform call sites reading it unchanged (issue 05).
    private get currentManifestId(): string | null {
        return this.store.currentManifestId;
    }
    private get currentCanvasId(): string | null {
        return this.store.currentCanvasId;
    }
    private activeEditingAnnotationId: string | null = null;
    // The canvas key the manager last ran handleCanvasChange for. Owned by the
    // manager (not read from the shared store) so the loader advancing the
    // store's context can't cause the guard to skip real changes.
    private lastHandledCanvasKey: string | null = null;

    // Ids whose next Annotorious `updateAnnotation`/`deleteAnnotation` echo we
    // triggered ourselves and must not re-persist (F3/F27). This is Annotorious
    // event bookkeeping, so it stays with the manager. See withSuppressedEcho()
    // for why this is an id set rather than a boolean flag.
    // A per-id *count* of Annotorious lifecycle echoes we triggered ourselves and
    // must not re-persist. A count, not a set, because one id can have more than
    // one echo in flight at once: saving a body pushes an `updateAnnotation` echo
    // and the editor teardown's `clearAnnotations()` pushes a `deleteAnnotation`
    // echo for the same id. A single-bit mark suppressed only the first and let
    // the delete leak, deleting the just-saved annotation (F3/F27).
    private suppressedEchoIds = new SvelteMap<string, number>();

    // Internal state tracking
    private isDrawingEnabled = false;
    private activeTool: DrawingTool = 'rectangle';
    private selectedAnnotation: W3CAnnotation | null = null;

    // Effective tool config (F8), resolved once from config in the constructor.
    private readonly resolvedTools: DrawingTool[];
    readonly resolvedDefaultTool: DrawingTool;

    // Callbacks for state updates (set by controller)
    onSelectionChange?: (annotation: any | null) => void;
    onAnnotationCreated?: (annotation: any) => void;
    onAnnotationHydrationChange?: (isHydrating: boolean) => void;
    onActiveEditingAnnotationChange?: (annotationId: string | null) => void;

    constructor(config: AnnotationEditorConfig, store?: AnnotationStore) {
        this.config = config;
        // The plugin constructs one store and shares it with the loader; when a
        // manager is created outside that wiring (e.g. tests) it falls back to
        // its own store built from config. A shared store outlives the panel, so
        // the manager only tears down a store it created itself.
        this.ownsStore = !store;
        this.store = store ?? new AnnotationStore(config);
        // When a create reconciles onto a server-assigned id (F5), re-open the
        // annotation in Annotorious under the canonical id so later edits/deletes
        // reference it and the active-edit-id signal carries the new id.
        this.store.onReconcileId = (oldId, canonical) =>
            this.handleIdReconciled(oldId, canonical);
        // Keep the open Annotorious editing session in step with an undo/redo
        // replay (F6): refresh it under the affected id, or clear it when the
        // replay removed the annotation being edited.
        this.store.onReplay = (affectedId, annotation) =>
            this.handleReplay(affectedId, annotation);
        const { tools, defaultTool } = resolveTools(config);
        this.resolvedTools = tools;
        this.resolvedDefaultTool = defaultTool;
        this.activeTool = defaultTool;
    }

    init(viewer: any, canvasId: string | null): void {
        if (!viewer) {
            console.error('[AnnotationManager] Cannot init: Viewer is null');
            return;
        }

        // Store viewer reference
        this.osdViewer = viewer;
        // Seed the store's canvas context (the manifest arrives via the
        // controller's handleCanvasChange right after init).
        this.store.setCanvas(this.store.currentManifestId, canvasId);

        // If viewer is already open, init immediately
        const worldCount = viewer.world?.getItemCount() ?? 0;

        if (worldCount > 0) {
            this.initAnnotorious(viewer, canvasId);
        } else {
            // Wait for the open event, then let layout settle for one frame
            // before initializing — event-driven rather than a magic delay (F25).
            this.openHandler = () => {
                requestAnimationFrame(() => {
                    void this.initAnnotorious(viewer, canvasId);
                });
            };
            viewer.addHandler('open', this.openHandler);
        }

        // Attach global click handler for Point tool
        // "canvas-click" is robust and handles drag vs click detection
        // Attach global click handler for ALL tools when drawing is enabled
        // This ensures we can block Zoom on click, while allowing Panning (Drag)
        this.canvasClickHandler = (event: any) => {
            if (this.isDrawingEnabled && event.quick) {
                // Prevent default OSD navigation (zoom on click)
                event.preventDefaultAction = true;

                if (this.activeTool === 'point' && this.annotorious) {
                    void this.handlePointClick(event);
                }
            }
        };
        viewer.addHandler('canvas-click', this.canvasClickHandler);
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
            // OpenSeadragon itself, for screen-pixel measurement (§3.2).
            if (!this.OSD) {
                const osdModule = await import('openseadragon');
                this.OSD = (osdModule as any).default || osdModule;
            }

            // The serializer stamps this into target.source, but forceTargetSource()
            // overwrites it on every save, so the captured value is irrelevant to
            // persisted output. Pass the real canvas id when we have one.
            const sourceId = canvasId ?? '';

            // Initial drawing enabled state only if tool is NOT point (Annotorious handles others)
            const initialDrawingEnabled =
                this.isDrawingEnabled && this.activeTool !== 'point';

            const config = {
                adapter: this.W3CImageFormat(sourceId),
                drawingEnabled: initialDrawingEnabled,
                autoSave: false,
                drawingMode: 'click' as const,
                // Annotorious v3's supported per-annotation styling is the
                // `style` function form `(annotation, state) => DrawingStyle`
                // (v3.7 has no per-annotation className), replacing the dead v2
                // `formatter` (F9). Points render with the configured point
                // marker colours; everything else uses the drawing style.
                style: (annotation: any) =>
                    this.styleForAnnotation(annotation),
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

    /**
     * Create a true IIIF `PointSelector` annotation at the exact click point
     * (F17). The click is converted click → viewport → image coords → canvas
     * coords and rounded once to integer canvas pixels (D2) — no synthetic
     * fragment rectangle, no zoom-dependent geometry, no `point-` id heuristic.
     * The annotation goes through the same store create path as drawn shapes
     * (prepareDraft, stamping, display sync); it is already canvas-space, so the
     * image→canvas transform is skipped. It is then opened for body editing.
     */
    private async handlePointClick(event: any): Promise<void> {
        if (!this.osdViewer || !this.annotorious) return;
        // Never create an annotation without a real canvas to target (F1/F26).
        if (this.currentCanvasId === null) return;

        // The TiledImage (first item) drives the accurate pixel→image conversion.
        const tiledImage = this.osdViewer.world.getItemAt(0);
        if (!tiledImage) return;

        // event.position is in web pixels relative to the viewer; convert to
        // viewport coords, then to image coords via the tiled image.
        const viewportPoint = this.osdViewer.viewport.pointFromPixel(
            event.position,
        );
        const imagePoint = tiledImage.viewportToImageCoordinates(viewportPoint);

        // Image coords → canvas coords, rounding once on the final canvas-space
        // values (D2). No center-derivation, no screen-pixel sizing.
        const canvasPoint = imagePointToCanvasPoint(
            { x: imagePoint.x, y: imagePoint.y },
            this.getCurrentCanvasImageDimensions(),
        );
        const x = Math.round(canvasPoint.x);
        const y = Math.round(canvasPoint.y);

        const annotation = {
            '@context': 'http://www.w3.org/ns/anno.jsonld' as const,
            // Replaced via the store's id reconciliation when the adapter
            // returns a server-assigned id (F5).
            id: `temp-${crypto.randomUUID()}`,
            type: 'Annotation' as const,
            body: [],
            target: {
                type: 'SpecificResource' as const,
                source: this.currentCanvasId,
                selector: {
                    type: 'PointSelector' as const,
                    x,
                    y,
                },
            },
        };

        // Same create pipeline as drawn shapes (prepareDraft, stamping, display
        // sync), but the point is already canvas-space so the image→canvas
        // transform is skipped. Mark it active before persisting so an id
        // reconciliation (temp → server id) re-opens it under the canonical id.
        const prepared = this.prepareAnnotation(annotation, {
            canvasSpace: true,
        });
        this.onAnnotationCreated?.(prepared);
        this.setActiveEditingAnnotationId(prepared.id);

        const ok = await this.persistCreate(prepared);
        if (!ok) {
            // The store rolled back the failed create; drop the transient
            // selection so the panel isn't left editing a phantom point (F20).
            if (this.activeEditingAnnotationId === prepared.id) {
                this.clearSelectionState();
            }
            return;
        }

        // Open the created point for body editing under its canonical id (id
        // reconciliation advances activeEditingAnnotationId when it changed).
        await this.selectAnnotationById(
            this.activeEditingAnnotationId ?? prepared.id,
        );
    }

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

        // Never enable drawing without a real canvas to target (F1/F26), and
        // never for a tool the config doesn't allow (F8).
        const canDraw =
            enabled &&
            this.currentCanvasId !== null &&
            this.resolvedTools.includes(this.activeTool);

        // If tool is 'point', we do NOT enable Annotorious native drawing
        // because we handle it manually.
        if (this.activeTool === 'point') {
            this.annotorious.setDrawingEnabled(false);
        } else {
            this.annotorious.setDrawingEnabled(canDraw);
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

    /**
     * A point annotation is one whose target carries a `PointSelector` (F17).
     * Recurses one level into `selector.item` for wrapped selectors, matching
     * `annotationAdapter.ts`. No `point-` id heuristic — geometry, not id, is
     * authoritative.
     */
    private isPointAnnotation(annotation: any): boolean {
        const selector = annotation?.target?.selector;
        const item = selector?.item ?? selector;
        return item?.type === 'PointSelector';
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
        const selector = (annotation as any)?.target?.selector;
        // New (and previously stored) points are authored as PointSelector
        // already — pass them through untouched (issue 11). Reconstructing would
        // needlessly drop unrelated target fields.
        if (selector?.type === 'PointSelector') {
            return annotation;
        }

        // Read-compat: derive a PointSelector from legacy fragment-center data
        // so odd previously-stored points still resolve (D3). New writes never
        // reach this branch — the point tool authors PointSelector directly.
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
                    (annotation.target as W3CTarget)?.source ??
                    this.currentCanvasId,
                selector: {
                    type: 'PointSelector',
                    x: point.x,
                    y: point.y,
                },
            },
        } as W3CAnnotation;
    }

    /**
     * Convert a cached (canvas-space) annotation into the image-space shape
     * Annotorious edits. Non-points scale straight to image space. A point has
     * no Annotorious tool, so it becomes a small fragment rectangle centred on
     * the point and sized in **screen pixels at selection time** (§3.2): the
     * marker keeps a constant visual size regardless of image resolution or
     * zoom. The exact point is recorded separately (`editingPointOrigin`) so the
     * reverse conversion never re-derives it from the rect centre.
     */
    private toAnnotoriousTarget(annotation: W3CAnnotation): W3CAnnotation {
        const dimensions = this.getCurrentCanvasImageDimensions();
        const selector = (annotation?.target as W3CTarget)?.selector as any;

        if (selector?.type !== 'PointSelector') {
            return transformAnnotationToImageSpace(annotation, dimensions);
        }

        const imageCenter = canvasPointToImagePoint(
            { x: selector.x, y: selector.y },
            dimensions,
        );
        const size = this.pointEditRectImageSize();
        const x = imageCenter.x - size / 2;
        const y = imageCenter.y - size / 2;

        return {
            ...annotation,
            target: {
                source:
                    (annotation.target as W3CTarget)?.source ??
                    this.currentCanvasId,
                selector: {
                    type: 'FragmentSelector',
                    conformsTo: 'http://www.w3.org/TR/media-frags/',
                    value: `xywh=${x},${y},${size},${size}`,
                },
            },
        } as W3CAnnotation;
    }

    /**
     * Reverse of {@link toAnnotoriousTarget} for a point being edited: turn the
     * image-space fragment rect Annotorious holds back into a canvas-space
     * `PointSelector`. If the rect's centre still maps to the recorded origin
     * (integer canvas px, D2), the point wasn't dragged and the origin is emitted
     * verbatim — a bit-identical round-trip. If it moved, the new rect centre is
     * used (§3.2).
     */
    private pointFromEditingRect(annotation: W3CAnnotation): W3CAnnotation {
        const dimensions = this.getCurrentCanvasImageDimensions();
        const origin = this.editingPointOrigin.get((annotation as any)?.id);
        const rect = this.parseFragmentRect(
            (annotation as any)?.target?.selector?.value,
        );

        let point = origin ?? null;
        if (rect) {
            const centerCanvas = imagePointToCanvasPoint(
                { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
                dimensions,
            );
            const candidate = {
                x: Math.round(centerCanvas.x),
                y: Math.round(centerCanvas.y),
            };
            if (
                !origin ||
                candidate.x !== origin.x ||
                candidate.y !== origin.y
            ) {
                point = candidate;
            }
        }

        if (!point) {
            return annotation;
        }

        return {
            ...annotation,
            target: {
                type: 'SpecificResource',
                source:
                    (annotation as any)?.target?.source ??
                    this.currentCanvasId,
                selector: {
                    type: 'PointSelector',
                    x: point.x,
                    y: point.y,
                },
            },
        } as W3CAnnotation;
    }

    private parseFragmentRect(
        value: unknown,
    ): { x: number; y: number; width: number; height: number } | null {
        if (typeof value !== 'string') return null;
        const match = value.match(
            /xywh=(?:pixel:)?(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/,
        );
        if (!match) return null;
        const [, x, y, width, height] = match;
        return {
            x: Number(x),
            y: Number(y),
            width: Number(width),
            height: Number(height),
        };
    }

    /**
     * The point editing rectangle's side length in **image units**, derived from
     * the configured marker diameter (screen px) and the current
     * image-units-per-screen-pixel. Falls back to treating the diameter as
     * canvas units (scaled to image space) when the viewport can't be measured
     * yet — e.g. before the viewer's first render.
     */
    private pointEditRectImageSize(): number {
        const diameter = 2 * resolvePointRadius(this.config.pointStyle);
        const perScreenPixel = this.imageUnitsPerScreenPixel();
        if (perScreenPixel && perScreenPixel > 0) {
            return perScreenPixel * diameter;
        }
        const fallback = canvasPointToImagePoint(
            { x: diameter, y: 0 },
            this.getCurrentCanvasImageDimensions(),
        );
        return Math.abs(fallback.x) || diameter;
    }

    /**
     * Image units spanned by one screen pixel at the current zoom, measured the
     * way the old point-authoring code did: convert two 1px-apart screen points
     * to image coordinates and take the delta. Returns null when the viewport
     * isn't available.
     */
    private imageUnitsPerScreenPixel(): number | null {
        const viewport = this.osdViewer?.viewport;
        const tiledImage = this.osdViewer?.world?.getItemAt?.(0);
        if (!viewport || !tiledImage || !this.OSD?.Point) {
            return null;
        }
        const v0 = viewport.pointFromPixel(new this.OSD.Point(0, 0));
        const v1 = viewport.pointFromPixel(new this.OSD.Point(1, 0));
        const i0 = tiledImage.viewportToImageCoordinates(v0);
        const i1 = tiledImage.viewportToImageCoordinates(v1);
        const delta = Math.abs(i1.x - i0.x);
        return Number.isFinite(delta) && delta > 0 ? delta : null;
    }

    /**
     * Annotorious `style` callback: points get the configured marker colours,
     * every other shape gets the host's drawing style (F9). A point is
     * identified by having an editing origin recorded for its id.
     */
    private styleForAnnotation(annotation: any): DrawingStyle {
        if (annotation?.id && this.editingPointOrigin.has(annotation.id)) {
            const ps = this.config.pointStyle;
            return {
                fill: (ps?.fill ??
                    AnnotationManager.DEFAULT_POINT_FILL) as DrawingStyle['fill'],
                fillOpacity: 1,
                stroke: (ps?.stroke ??
                    AnnotationManager.DEFAULT_POINT_STROKE) as DrawingStyle['stroke'],
                strokeWidth:
                    ps?.strokeWidth ??
                    AnnotationManager.DEFAULT_POINT_STROKE_WIDTH,
            };
        }
        return (this.config.drawingStyle ??
            AnnotationManager.DEFAULT_DRAWING_STYLE) as DrawingStyle;
    }

    private getCurrentCanvasImageDimensions(): CanvasImageSpaceDimensions | null {
        if (!this.currentManifestId || !this.currentCanvasId) {
            return null;
        }

        const canvas = manifestsState
            .getCanvases(this.currentManifestId)
            .find((entry: any) => {
                const id =
                    entry?.id ||
                    entry?.['@id'] ||
                    entry?.__jsonld?.id ||
                    entry?.__jsonld?.['@id'] ||
                    entry?.getCanvasId?.() ||
                    entry?.getId?.();
                return id === this.currentCanvasId;
            });

        const resolved = canvas ? resolveCanvasImage(canvas) : null;
        if (
            !resolved ||
            typeof resolved.resourceWidth !== 'number' ||
            typeof resolved.resourceHeight !== 'number'
        ) {
            return null;
        }

        return {
            canvasWidth: resolved.canvasWidth,
            canvasHeight: resolved.canvasHeight,
            imageWidth: resolved.resourceWidth,
            imageHeight: resolved.resourceHeight,
        };
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
        return this.resolvedTools;
    }

    /**
     * The store's current unhandled persistence error for the panel's default
     * error line, or `null` when there's nothing to show (F20).
     */
    get persistenceError(): {
        op: AnnotationPersistenceOp;
        annotationId?: string;
    } | null {
        return this.store.panelError;
    }

    /** Dismiss the panel's persistence error line. */
    dismissPersistenceError(): void {
        this.store.dismissError();
    }

    /** Whether an undo is available (reactive; drives the panel button — F6). */
    get canUndo(): boolean {
        return this.store.canUndo;
    }

    /** Whether a redo is available (reactive; drives the panel button — F6). */
    get canRedo(): boolean {
        return this.store.canRedo;
    }

    /**
     * Reverse the most recent persisted operation through the store's op stack,
     * replaying its inverse against the adapter so storage and display stay in
     * agreement (F6).
     */
    async undo(): Promise<void> {
        await this.store.undo();
    }

    /** Re-apply the most recently undone operation (F6). */
    async redo(): Promise<void> {
        await this.store.redo();
    }

    private injectStyles(viewer: any): void {
        if (!viewer.element) return;

        const root = viewer.element.getRootNode();
        const styleId = 'annotorious-fixes';

        // Define the critical CSS fixes, appended to the real Annotorious
        // stylesheet imported at module scope (F23).
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

            /* Render the edited point as a circular marker even though
               Annotorious edits it via a tiny fragment rectangle. The
               manager toggles the .point-selected class on the viewer. */
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

        this.annotorious.on('createAnnotation', (annotation) => {
            void this.handleCreateAnnotation(annotation);
        });

        this.annotorious.on('updateAnnotation', (updated) => {
            void this.handleUpdateAnnotation(updated);
        });

        this.annotorious.on('deleteAnnotation', (annotation) => {
            void this.handleDeleteAnnotation(annotation);
        });

        this.annotorious.on('selectionChanged', (annotations) => {
            const selected =
                annotations.length > 0
                    ? this.annotationToCanvasSpace(
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
        this.onActiveEditingAnnotationChange?.(annotationId);

        if (typeof window === 'undefined') {
            return;
        }

        window.dispatchEvent(
            new CustomEvent(AnnotationManager.ACTIVE_EDIT_ID_EVENT, {
                detail: { annotationId },
            }),
        );
    }

    /**
     * Reset the manager's Annotorious-facing selection fields. Shared by the two
     * teardown paths: `clearSelectionState()` (also notifies the host, leaves
     * Annotorious untouched) and `clearAnnotoriousEditingAnnotation()` (also
     * clears Annotorious's annotation set).
     */
    private resetSelectionFields(): void {
        this.selectedAnnotation = null;
        this.osdViewer?.element?.classList.remove('point-selected');
        this.setActiveEditingAnnotationId(null);
    }

    /**
     * Tear down the current selection and tell the host it's gone, without
     * touching Annotorious's own annotation set. Used on the create/delete/
     * rollback paths where Annotorious's shape is managed separately.
     */
    private clearSelectionState(): void {
        this.resetSelectionFields();
        this.onSelectionChange?.(null);
        this.notifyExtensionSelectionChange(null);
    }

    private clearAnnotoriousEditingAnnotation(): void {
        this.resetSelectionFields();
        this.clearAnnotationsSuppressed();
    }

    /**
     * Clear all annotations from Annotorious, marking each so the resulting
     * (async) `deleteAnnotation` echo is consumed by handleDeleteAnnotation and
     * never mistaken for a user-originated deletion (F27). Only ids actually
     * present are marked, so no stale marks accrue.
     */
    private clearAnnotationsSuppressed(): void {
        if (!this.annotorious) return;

        const annotations = this.annotorious.getAnnotations() ?? [];
        if (annotations.length === 0) return;

        for (const entry of annotations) {
            const id = (entry as any)?.id;
            if (id) this.markSuppressedEcho(id);
        }
        this.annotorious.clearAnnotations();
    }

    async handleCanvasChange(
        manifestId: string | null,
        canvasId: string | null,
    ): Promise<void> {
        // Guard against the canvas the manager itself last handled, not the
        // store's context: the shared loader can advance the store's context
        // first, and reading it here would make the manager skip its own
        // selection cleanup + Annotorious reload for a genuine change.
        const canvasKey = `${manifestId}::${canvasId}`;
        if (canvasKey === this.lastHandledCanvasKey) {
            return;
        }
        this.lastHandledCanvasKey = canvasKey;

        // The store owns the canvas context and drops the previous canvas's
        // cache; the manager clears its Annotorious-facing selection state.
        this.store.setCanvas(manifestId, canvasId);
        this.selectedAnnotation = null;
        // Point origins belong to the previous canvas's editing session.
        this.editingPointOrigin.clear();
        this.onSelectionChange?.(null);
        this.notifyExtensionSelectionChange(null);
        await this.loadAnnotations();
    }

    private async loadAnnotations(): Promise<void> {
        if (!this.annotorious || !this.store.ready) {
            return;
        }

        this.clearAnnotoriousEditingAnnotation();

        try {
            // The store bumps its load-race token and discards a stale result
            // if the canvas changed while awaiting (F14).
            await this.store.load();
        } catch (error) {
            console.error(
                '[AnnotationEditor] Failed to load annotations:',
                error,
            );
        }
    }

    /**
     * Handles Annotorious's (async) `createAnnotation` lifecycle event. Persists
     * exactly what the host's prepareDraft/prepareAnnotation produced — not the
     * raw event payload — so draft enrichment survives create (F2).
     */
    private async handleCreateAnnotation(annotation: any): Promise<void> {
        const prepared = this.prepareAnnotation(annotation);
        this.onAnnotationCreated?.(prepared);
        const ok = await this.persistCreate(prepared);
        if (ok) return;

        // The create failed and the store rolled back its optimistic entry.
        // Remove the just-drawn shape from Annotorious and clear the selection so
        // the panel isn't left editing an annotation that was never persisted
        // (F20). Suppress the resulting delete echo — the cache never held it.
        const id = prepared.id;
        if (this.annotorious && id) {
            this.withSuppressedEcho(id, () => {
                this.annotorious?.removeAnnotation(id);
            });
        }
        this.clearSelectionState();
    }

    /**
     * Handles Annotorious's (async) `updateAnnotation` lifecycle event. Echoes
     * we triggered ourselves (e.g. pushing edited bodies back into Annotorious)
     * are consumed here so they don't double-persist (F3).
     */
    private async handleUpdateAnnotation(updated: any): Promise<void> {
        if (this.consumeSuppressedEcho(updated?.id)) return;

        await this.saveAnnotation(updated);
    }

    /**
     * Handles Annotorious's (async) `deleteAnnotation` lifecycle event. Echoes
     * from our own `clearAnnotations()` teardown are marked and consumed here so
     * they never reach the adapter. A genuine Annotorious-originated deletion of
     * a persisted annotation syncs the adapter, cache, and selection state (F27).
     */
    private async handleDeleteAnnotation(annotation: any): Promise<void> {
        const id = annotation?.id;
        if (this.consumeSuppressedEcho(id)) return;
        if (!id || !this.store.ready) return;

        // Not in the cache → either we already deleted it ourselves (the trash
        // button removes it from the cache before Annotorious) or it was never
        // persisted. Nothing to sync.
        if (!this.store.has(id)) return;

        // On failure the store keeps the cache entry and reports the error; the
        // annotation reappears on the next load (F20).
        const ok = await this.store.delete(id);
        if (!ok) return;

        if (this.activeEditingAnnotationId === id) {
            this.clearSelectionState();
        }
    }

    /**
     * Persist an annotation that arrived in **image space** (Annotorious event
     * payloads, geometry edits). Transforms to canvas space, forces the target
     * source, applies beforeSave, then persists.
     */
    async saveAnnotation(annotation: any): Promise<boolean> {
        if (!this.store.ready) return false;

        const w3cAnnotation = await this.applyBeforeSave(
            this.annotationToCanvasSpace(this.forceTargetSource(annotation)),
        );

        return await this.store.persist(w3cAnnotation);
    }

    /**
     * Convert an image-space annotation from Annotorious into canvas space for
     * the cache/panel/store. An actively-edited point takes the lossless
     * origin-aware path (§3.2); everything else scales normally, with legacy
     * fragment-centre read-compat via `toPointSelectorTarget` (D3).
     */
    private annotationToCanvasSpace(
        annotation: W3CAnnotation,
    ): W3CAnnotation {
        if (this.editingPointOrigin.has((annotation as any)?.id)) {
            return this.pointFromEditingRect(annotation);
        }
        return transformAnnotationToCanvasSpace(
            this.toPointSelectorTarget(annotation),
            this.getCurrentCanvasImageDimensions(),
        );
    }

    /**
     * Persist a freshly created annotation that is already in **canvas space**
     * (the output of prepareAnnotation). Skips the image→canvas re-transform;
     * beforeSave still runs last. Returns whether the write succeeded.
     */
    private async persistCreate(prepared: W3CAnnotation): Promise<boolean> {
        if (!this.store.ready) return false;

        const w3cAnnotation = await this.applyBeforeSave(prepared);
        return await this.store.persist(w3cAnnotation);
    }

    /**
     * Run a store mutation whose resulting (asynchronous) Annotorious lifecycle
     * echo for `annotationId` must not be re-persisted.
     *
     * NOTE: Annotorious v3 dispatches lifecycle events via `setTimeout(…, 1)`
     * (verified in @annotorious/core@3.7.19), so a synchronous boolean guard as
     * originally planned would already be reset by the time the echo fires. We
     * mark the id and let the echo consume the mark instead. A body-change
     * update emits exactly one echo, so one mark == one consumed echo.
     */
    private withSuppressedEcho(annotationId: string, mutate: () => void): void {
        this.markSuppressedEcho(annotationId);
        mutate();
    }

    /** Record one more expected self-triggered echo for this id. */
    private markSuppressedEcho(annotationId: string): void {
        this.suppressedEchoIds.set(
            annotationId,
            (this.suppressedEchoIds.get(annotationId) ?? 0) + 1,
        );
    }

    /**
     * Consume one expected echo for this id. Returns true (and decrements the
     * count, deleting the entry at zero) while echoes remain outstanding, so two
     * concurrent echoes — e.g. a body-save update echo and a teardown delete echo
     * for the same id — are each matched and neither leaks (F3/F27).
     */
    private consumeSuppressedEcho(annotationId: string | undefined): boolean {
        if (!annotationId) return false;
        const count = this.suppressedEchoIds.get(annotationId) ?? 0;
        if (count <= 0) return false;
        if (count === 1) {
            this.suppressedEchoIds.delete(annotationId);
        } else {
            this.suppressedEchoIds.set(annotationId, count - 1);
        }
        return true;
    }

    /**
     * Always overwrite `target.source` with the current canvas id. Within this
     * plugin the target is by definition the canvas the user is annotating, so
     * overwriting is safe regardless of what the Annotorious W3C serializer
     * stamped at init time (see F1). All other target fields are preserved.
     */
    private forceTargetSource(annotation: any): W3CAnnotation {
        const clone = JSON.parse(JSON.stringify(annotation));
        if (typeof clone.target === 'string' || !clone.target) {
            clone.target = { source: this.currentCanvasId };
        } else {
            clone.target.source = this.currentCanvasId;
        }
        return clone;
    }

    private prepareAnnotation(
        annotation: any,
        options?: { canvasSpace?: boolean },
    ): W3CAnnotation {
        const base = this.forceTargetSource(annotation);
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
        // The point tool authors canvas-space coordinates directly (issue 11);
        // drawn shapes arrive in Annotorious image space and must be scaled.
        // No hydration marker: a freshly prepared draft always has its full
        // body, and persist() records its hydration state as 'full' (F7). The
        // marker is intentionally omitted so it can't leak to the panel.
        if (options?.canvasSpace) {
            return clone;
        }
        return transformAnnotationToCanvasSpace(
            clone,
            this.getCurrentCanvasImageDimensions(),
        );
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
        if (!this.annotorious || !this.store.ready || !this.store.hydrateSupported) {
            return;
        }

        // Consult internal hydration state, not a body marker — the
        // `__fullBodyLoaded` marker is stripped before annotations reach
        // Annotorious, so it can never be read back off the selection (F7).
        if (!this.store.isSkeleton(annotationId)) {
            this.onAnnotationHydrationChange?.(false);
            return;
        }

        this.onAnnotationHydrationChange?.(true);

        try {
            // The store fetches + caches the full body, discarding the result if
            // the canvas changed underneath it (F14); we also veto committing it
            // if the annotation is no longer present in Annotorious for editing.
            const full = await this.store.hydrate(annotationId, () => {
                const current = this.annotorious?.getAnnotations() ?? [];
                return current.some((entry: any) => entry.id === annotationId);
            });

            if (full) {
                this.onSelectionChange?.(full);
            }
        } catch (error) {
            console.error(
                '[AnnotationEditor] Failed to hydrate annotation body:',
                error,
            );
        } finally {
            this.onAnnotationHydrationChange?.(false);
        }
    }

    async deleteAnnotation(annotationId: string): Promise<boolean> {
        if (!this.store.ready) return false;

        // Drop from the store (cache first) before removing from Annotorious, so
        // the resulting delete echo finds no cache entry and is ignored. On
        // failure the store keeps the entry + reports the error; leave the
        // annotation on screen and the selection open (F20).
        const ok = await this.store.delete(annotationId);
        if (!ok) return false;

        this.annotorious?.removeAnnotation(annotationId);

        if (this.activeEditingAnnotationId === annotationId) {
            this.clearAnnotoriousEditingAnnotation();
            this.onSelectionChange?.(null);
            this.notifyExtensionSelectionChange(null);
        }
        return true;
    }

    async updateAnnotationBodies(
        annotationId: string,
        bodies: unknown[] | unknown,
    ): Promise<boolean> {
        const annotations = this.annotorious?.getAnnotations() ?? [];
        const annotation = annotations.find((a: any) => a.id === annotationId);

        if (!annotation) return false;

        const updated = {
            ...annotation,
            body: bodies,
        };
        // Persist exactly once (this updates the cache on success).
        const ok = await this.saveAnnotation(updated);

        if (!ok) {
            // The save failed and the store rolled back to the previous cached
            // copy. Re-signal selection with that copy so the panel reverts the
            // phantom edit instead of showing unsaved state (F20). Annotorious
            // is intentionally left untouched — it never received the edit.
            const rolledBack = this.store.get(annotationId);
            if (rolledBack) {
                this.onSelectionChange?.(rolledBack);
            }
            return false;
        }

        // Push the edited bodies back into Annotorious so a subsequent geometry
        // edit carries them, but suppress the resulting async updateAnnotation
        // echo so it doesn't persist a second time (F3).
        if (this.annotorious) {
            this.withSuppressedEcho(annotationId, () => {
                // Cast to any to avoid type conflicts with Annotorious internals
                this.annotorious?.updateAnnotation(updated as any);
            });
        }
        return true;
    }

    /**
     * React to the store swapping a freshly-created annotation onto its
     * server-assigned id (F5). If that annotation is the one currently open for
     * editing, re-open it under the canonical id: this re-adds it to Annotorious,
     * reselects it, and re-emits the active-edit-id signal with the new id.
     */
    private handleIdReconciled(
        oldId: string,
        canonical: W3CAnnotation,
    ): void {
        if (this.activeEditingAnnotationId !== oldId) return;
        void this.selectAnnotationById(canonical.id);
    }

    /**
     * Reconcile the open Annotorious editing session with an undo/redo replay
     * (F6). Only the annotation currently open is affected: if the replay left
     * it in storage, re-open it so its geometry and body reflect the restored
     * state; if the replay removed it (e.g. undoing the create of the annotation
     * being edited), tear the editing session down.
     */
    private handleReplay(
        affectedId: string,
        annotation: W3CAnnotation | null,
    ): void {
        if (this.activeEditingAnnotationId !== affectedId) return;

        if (annotation) {
            void this.selectAnnotationById(affectedId);
        } else {
            this.clearAnnotoriousEditingAnnotation();
            this.onSelectionChange?.(null);
            this.notifyExtensionSelectionChange(null);
        }
    }

    async selectAnnotationById(annotationId: string): Promise<void> {
        if (!this.annotorious || !this.store.ready) {
            return;
        }

        const annotation = await this.store.resolve(annotationId);

        if (!annotation) {
            console.warn(
                '[AnnotationEditor] Could not resolve annotation for editing:',
                annotationId,
            );
            return;
        }

        // toAnnotoriousTarget returns the fully image-space editable shape
        // (points become a screen-sized fragment rect; other shapes are scaled
        // straight to image space), so no further transform here.
        const editableAnnotation = this.toAnnotoriousTarget(annotation);

        this.clearAnnotoriousEditingAnnotation();

        // Record the exact canvas-space point before Annotorious ever sees the
        // fragment rect, so an unmoved point round-trips bit-identically (§3.2).
        const pointSelector = (annotation as any)?.target?.selector;
        if (pointSelector?.type === 'PointSelector') {
            this.editingPointOrigin.set(annotationId, {
                x: pointSelector.x,
                y: pointSelector.y,
            });
        }

        this.annotorious.setAnnotations(
            [editableAnnotation] as Partial<W3CImageAnnotation>[],
            true,
        );
        this.setActiveEditingAnnotationId(annotationId);

        // v3 store state mutates synchronously, so the annotation set above is
        // immediately selectable — no timing guess needed (F25).
        (this.annotorious as any)?.setSelected(annotationId);
    }

    cancelSelection(): void {
        this.selectedAnnotation = null;
        this.onSelectionChange?.(null);
        this.notifyExtensionSelectionChange(null);
        this.onAnnotationHydrationChange?.(false);
        this.clearAnnotoriousEditingAnnotation();
    }

    destroy(): void {
        // Remove the viewer handlers registered in init() so no listeners leak
        // once the plugin is torn down (F12).
        if (this.osdViewer) {
            if (this.openHandler) {
                this.osdViewer.removeHandler('open', this.openHandler);
            }
            if (this.canvasClickHandler) {
                this.osdViewer.removeHandler(
                    'canvas-click',
                    this.canvasClickHandler,
                );
            }
        }
        this.openHandler = null;
        this.canvasClickHandler = null;

        this.clearAnnotoriousEditingAnnotation();
        this.editingPointOrigin.clear();
        this.annotorious?.destroy();
        this.annotorious = null;

        // A shared store outlives the panel (the loader keeps displaying the
        // overlay), so only tear it down when the manager created it. When
        // shared, the loader's effect cleanup owns store.destroy().
        if (this.ownsStore) {
            // Store clears its cache/hydration state, its injected overlays, and
            // releases the adapter (F11).
            this.store.destroy();
        }
        this.osdViewer = null;
    }
}
