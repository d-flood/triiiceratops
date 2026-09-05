/**
 * Where an annotation's shape lands on screen, and what is under the pointer.
 *
 * The arithmetic half of the annotation shape overlay
 * (`components/AnnotationShapeOverlay.svelte`), split out for the reason every
 * other renderer split in this codebase is: a projection is a pure function of a
 * geometry, an image-space scale, and a point mapping, so it can be asserted
 * exhaustively with no browser — while the component around it is markup,
 * focus, and a frame subscription.
 *
 * ## The two spaces, and the one that is gone
 *
 * A IIIF annotation targets **canvas space** (the Canvas's own `width`/`height`)
 * or, when its target names image dimensions, **image space**. Everything here
 * converts image space to canvas space first and then asks the caller's
 * `toScreen` for the rest. That mapping is `ViewerState.canvasToScreen` — so
 * this module knows nothing about the renderer, and the third-party viewport
 * coordinates the old overlay converted through do not appear at all.
 *
 * ## Why screen space, and not the paint hook
 *
 * These shapes are drawn as DOM elements: every editable one is a real
 * `<button>` with an accessible name and Enter/Space activation, and canvas-drawn
 * pixels have no focus, no name, and no keyboard reach. Painting them would
 * silently delete keyboard and screen-reader access to every annotation, and an
 * automated scan could not catch it because the elements would not be there to
 * fail. The canvas paints pixels; this layer carries the targets. Both are
 * projected from one geometry, which is why they cannot disagree.
 */

import type { ParsedAnnotation } from './annotationAdapter';
import {
    imagePointToCanvasPoint,
    imageRectToCanvasRect,
    type CanvasImageSpaceDimensions,
} from './canvasImageSpace';

export interface ScreenPoint {
    x: number;
    y: number;
}

export interface ScreenRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface ShapeCommon {
    /** `renderId` — unique per geometry, so a multi-target annotation keys. */
    id: string;
    /** The annotation the shape belongs to; several shapes may share one. */
    annotationId: string;
    /** The canvas the shape was projected through; `null` if unstated. */
    canvasId: string | null;
    isSearchHit: boolean;
    isFullCanvasTarget: boolean;
    /** The accessible name, and the tooltip text where one is shown. */
    tooltip: string;
}

export interface RectangleShape extends ShapeCommon {
    type: 'RECTANGLE';
    rect: ScreenRect;
}

export interface PolygonShape extends ShapeCommon {
    type: 'POLYGON';
    /** The shape's bounding box, which positions the `<svg>`. */
    bounds: ScreenRect;
    /** Points relative to {@link bounds}, as the `<polygon>` takes them. */
    points: [number, number][];
}

export interface PointShape extends ShapeCommon {
    type: 'POINT';
    point: ScreenPoint;
}

export type AnnotationShape = RectangleShape | PolygonShape | PointShape;

export interface ProjectShapesOptions {
    /**
     * Canvas space → screen space, in CSS pixels from the surface's top-left
     * corner, for the named canvas. `null` when the renderer cannot place that
     * canvas, in which case the shape is dropped rather than drawn somewhere
     * wrong.
     *
     * Takes the canvas id because a screen position is only meaningful with one:
     * a facing-page spread lays its two pages out at different offsets, and in
     * continuous mode every folio has its own. An annotation carrying no canvas
     * id (`ParsedAnnotation.canvasId === null`) is asked about the viewer's
     * current canvas, which is what `canvasToScreen` does with an omitted id.
     */
    toScreen: (
        point: ScreenPoint,
        canvasId: string | null,
    ) => ScreenPoint | null;
    /**
     * A canvas's canvas/image dimensions, for the annotations whose targets are
     * in image space. `null` means "unknown", and the conversion helpers treat
     * that as the identity — the same thing they do when the two spaces coincide.
     *
     * A lookup rather than one value: the canvases on screen are not all the same
     * size, and a spread's two pages may declare different image dimensions.
     */
    imageDimensions: (
        canvasId: string | null,
    ) => CanvasImageSpaceDimensions | null;
}

/**
 * Project every annotation onto the screen, dropping the ones the renderer
 * cannot place.
 *
 * Called once per painted frame. It allocates a fresh array each time, which is
 * the same cost the derived value it replaces had, and is what lets the caller
 * compare nothing and simply render the answer.
 */
export function projectAnnotationShapes(
    annotations: readonly ParsedAnnotation[],
    options: ProjectShapesOptions,
): AnnotationShape[] {
    const shapes: AnnotationShape[] = [];

    for (const annotation of annotations) {
        const shape = projectAnnotationShape(annotation, options);
        if (shape) shapes.push(shape);
    }

    return shapes;
}

function projectAnnotationShape(
    annotation: ParsedAnnotation,
    options: ProjectShapesOptions,
): AnnotationShape | null {
    const canvasId = annotation.canvasId;
    const toScreen = (point: ScreenPoint) => options.toScreen(point, canvasId);
    const imageDimensions = options.imageDimensions(canvasId);
    const inImageSpace = annotation.coordinateSpace === 'image';
    const common: ShapeCommon = {
        id: annotation.renderId,
        canvasId,
        annotationId: annotation.sourceAnnotationId,
        isSearchHit: annotation.isSearchHit,
        isFullCanvasTarget: annotation.isFullCanvasTarget,
        tooltip: annotation.body.map((body) => body.value).join(' '),
    };

    const geometry = annotation.geometry;

    if (geometry.type === 'RECTANGLE') {
        const rect = inImageSpace
            ? imageRectToCanvasRect(
                  {
                      x: geometry.x,
                      y: geometry.y,
                      width: geometry.w,
                      height: geometry.h,
                  },
                  imageDimensions,
              )
            : {
                  x: geometry.x,
                  y: geometry.y,
                  width: geometry.w,
                  height: geometry.h,
              };

        // Both corners are projected, rather than one corner plus a scale: the
        // size on screen is then whatever the transform makes it, which is the
        // only formulation that stays correct when layout has normalized this
        // canvas's rect for a facing-page spread.
        const topLeft = toScreen({ x: rect.x, y: rect.y });
        const bottomRight = toScreen({
            x: rect.x + rect.width,
            y: rect.y + rect.height,
        });
        if (!topLeft || !bottomRight) return null;

        return {
            ...common,
            type: 'RECTANGLE',
            rect: {
                x: topLeft.x,
                y: topLeft.y,
                width: bottomRight.x - topLeft.x,
                height: bottomRight.y - topLeft.y,
            },
        };
    }

    if (geometry.type === 'POINT') {
        const canvasPoint = inImageSpace
            ? imagePointToCanvasPoint(
                  { x: geometry.x, y: geometry.y },
                  imageDimensions,
              )
            : { x: geometry.x, y: geometry.y };
        const point = toScreen(canvasPoint);
        if (!point) return null;

        return { ...common, type: 'POINT', point };
    }

    const projected: ScreenPoint[] = [];
    for (const [x, y] of geometry.points) {
        const canvasPoint = inImageSpace
            ? imagePointToCanvasPoint({ x, y }, imageDimensions)
            : { x, y };
        const point = toScreen(canvasPoint);
        // One unplaceable vertex makes the whole polygon wrong, not partly
        // wrong: a shape missing a corner is a different shape.
        if (!point) return null;
        projected.push(point);
    }
    if (projected.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { x, y } of projected) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    return {
        ...common,
        type: 'POLYGON',
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        // Relative to the bounding box, because the `<svg>` is positioned at it.
        points: projected.map(({ x, y }) => [x - minX, y - minY]),
    };
}

/** Even-odd containment, the standard ray-crossing test. */
function pointInPolygon(
    x: number,
    y: number,
    points: readonly [number, number][],
): boolean {
    let inside = false;

    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const intersects =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersects) inside = !inside;
    }

    return inside;
}

/**
 * Whether a surface-local point is inside a shape — the read-only overlay's hit
 * test.
 *
 * A read-only shape takes no pointer events (it must not swallow a pan that
 * starts on top of it), so its hover state cannot come from `:hover`. This is
 * what answers instead, against the shapes' own projected geometry rather than
 * against the DOM: no layout read, and the same answer during a pan as the
 * pixels on screen.
 *
 * `pointSize` is the point marker's diameter in screen pixels.
 */
export function shapeContainsPoint(
    shape: AnnotationShape,
    x: number,
    y: number,
    pointSize: number,
): boolean {
    if (shape.type === 'RECTANGLE') {
        return (
            x >= shape.rect.x &&
            x <= shape.rect.x + shape.rect.width &&
            y >= shape.rect.y &&
            y <= shape.rect.y + shape.rect.height
        );
    }

    if (shape.type === 'POINT') {
        const radius = pointSize / 2;
        return (
            (x - shape.point.x) ** 2 + (y - shape.point.y) ** 2 <= radius ** 2
        );
    }

    return pointInPolygon(x - shape.bounds.x, y - shape.bounds.y, shape.points);
}
