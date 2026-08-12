import {
    extractIiifTargetId,
    getIiifCanvasId,
    normalizeIiifTargets,
} from './iiifTargets';
import { getAnnotationId } from './iiifIds';
import { logger } from '../logging/logger';

/**
 * Parsed annotation interface for custom rendering
 */
export interface ParsedAnnotation {
    id: string;
    renderId: string;
    sourceAnnotationId: string;
    /**
     * The canvas this annotation was read from, or `null` when the caller did
     * not say.
     *
     * Geometry is meaningless without it: `canvasToScreen(point, canvasId)` maps
     * through that canvas's own laid-out rect, and on a facing-page spread the
     * two pages have different rects. Supplied by the caller — the canvas it
     * ASKED about — rather than inferred from the target, so a user annotation
     * with no canvas context is placed like any other.
     */
    canvasId: string | null;
    geometryIndex: number;
    geometry: RectangleGeometry | PolygonGeometry | PointGeometry;
    coordinateSpace: 'canvas' | 'image';
    isFullCanvasTarget: boolean;
    body: {
        value: string;
        isHtml: boolean;
        purpose?: string;
        format?: string;
    }[];
    isSearchHit: boolean;
}

export interface RectangleGeometry {
    type: 'RECTANGLE';
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PolygonGeometry {
    type: 'POLYGON';
    points: [number, number][];
}

export interface PointGeometry {
    type: 'POINT';
    x: number;
    y: number;
}

interface CanvasContext {
    id?: string;
    width?: number;
    height?: number;
}

type AnnotationOrigin = 'manifest' | 'user';

/**
 * Extract target geometry from various annotation formats
 */
function extractGeometries(
    annotation: any,
): Array<RectangleGeometry | PolygonGeometry | PointGeometry> {
    const target = getAnnotationTarget(annotation);
    const geometries: Array<
        RectangleGeometry | PolygonGeometry | PointGeometry
    > = [];

    for (const normalizedTarget of normalizeIiifTargets(target)) {
        for (const selector of normalizedTarget.selectors) {
            const svgSelector = extractSvgValue(selector);
            if (svgSelector) {
                const polygon = convertSvgToPolygon(svgSelector);
                if (polygon) {
                    geometries.push(polygon);
                }
            }

            const point = extractPointFromSelector(selector);
            if (point) {
                geometries.push(point);
            }
        }

        if (normalizedTarget.xywh) {
            geometries.push({
                type: 'RECTANGLE',
                x: normalizedTarget.xywh[0],
                y: normalizedTarget.xywh[1],
                w: normalizedTarget.xywh[2],
                h: normalizedTarget.xywh[3],
            });
        }
    }

    if (geometries.length > 0) {
        return geometries;
    }

    const canvasRect = extractWholeCanvasGeometry(annotation);
    if (canvasRect) {
        return [canvasRect];
    }

    return [];
}

function extractPointFromSelector(selector: any): PointGeometry | null {
    const item = selector?.item || selector;
    if (item?.type !== 'PointSelector') {
        return null;
    }

    const x = Number(item.x);
    const y = Number(item.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    return {
        type: 'POINT',
        x,
        y,
    };
}

function getCanvasContext(annotation: any): CanvasContext | null {
    const canvas = annotation?.__triiiceratopsCanvas;
    if (!canvas || typeof canvas !== 'object') {
        return null;
    }

    return canvas;
}

function getAnnotationTarget(annotation: any): any {
    // IIIF v3 spells it `target`, v2 `on`; both are read.
    return annotation?.target || annotation?.on || null;
}

function getTargetId(target: any): string | null {
    const targetId = extractIiifTargetId(target);
    if (!targetId) {
        return null;
    }

    return getIiifCanvasId(targetId) || targetId;
}

function hasTargetSelector(target: any): boolean {
    if (!target) return false;

    if (Array.isArray(target)) {
        return target.some(hasTargetSelector);
    }

    if (typeof target === 'string') {
        return target.includes('#');
    }

    if (target.selector) {
        return true;
    }

    return Boolean(target.source && hasTargetSelector(target.source));
}

function extractWholeCanvasGeometry(annotation: any): RectangleGeometry | null {
    const canvas = getCanvasContext(annotation);
    if (!canvas?.id || !canvas.width || !canvas.height) {
        return null;
    }

    const target = annotation.target || annotation.on;
    if (hasTargetSelector(target)) {
        return null;
    }

    if (getTargetId(target) !== canvas.id) {
        return null;
    }

    return {
        type: 'RECTANGLE',
        x: 0,
        y: 0,
        w: canvas.width,
        h: canvas.height,
    };
}

export function isFullCanvasAnnotation(annotation: any): boolean {
    return extractWholeCanvasGeometry(annotation) !== null;
}

/**
 * Which space an annotation's geometry is written in — decided by **what it
 * targets**, not by who wrote it.
 *
 * An annotation targeting the Canvas is in canvas space: that is what IIIF says
 * (`#xywh=` on a Canvas is Canvas coordinates), and canvas space is this
 * viewer's persistence format for annotation geometry (`types/viewport.ts`). One
 * targeting the image resource itself is in image space, and there the image's
 * pixel dimensions are the only reading that makes sense.
 *
 * The origin marker is a **fallback**, not the rule. It used to be consulted
 * first, which made every manifest annotation image space and left the target
 * test below unreachable for exactly the annotations it decides. That is
 * invisible while a Canvas declares the same dimensions as its image — the
 * common case, and every fixture in this repository — and on a manifest that
 * declares a smaller image than its Canvas it scaled every shape up by the
 * ratio between them: a 1200-wide Canvas painted by a body declaring 600 drew
 * its annotations at twice their size.
 *
 * Which canvas the target is compared against comes from the annotation's own
 * embedded context where it has one, and otherwise from the canvas the CALLER
 * asked about. A **content-search hit** is the case that needs the second: it is
 * built from the search response as `on: "<canvasId>#xywh=…"` and carries no
 * embedded context, so with only the first reading the comparison could never be
 * made and every hit fell through to image space — the same mis-scaling, reached
 * by a different door. Search hits are canvas coordinates: the Content Search API
 * returns annotations targeting the Canvas.
 */
function resolveCoordinateSpace(
    annotation: any,
    isFullCanvasTarget: boolean,
    canvasId: string | null,
): 'canvas' | 'image' {
    if (isFullCanvasTarget) {
        return 'canvas';
    }

    const origin = annotation?.__triiiceratopsAnnotationOrigin as
        | AnnotationOrigin
        | undefined;

    if (origin === 'user') {
        return 'canvas';
    }

    const contextCanvasId = getCanvasContext(annotation)?.id ?? canvasId;
    const targetId = getTargetId(getAnnotationTarget(annotation));

    if (contextCanvasId && targetId === contextCanvasId) {
        return 'canvas';
    }

    return 'image';
}

/**
 * Extract SVG value from single target object
 */
function extractSvgValue(target: any): string | null {
    if (!target) return null;

    // Check for selector property or use target itself
    const selector = target.selector || target;

    // Handle array of selectors
    if (Array.isArray(selector)) {
        // Determine which selector to use?
        // Usually SvgSelector is preferred if present
        const svgSel = selector.find((s) => s.type === 'SvgSelector');
        if (svgSel && svgSel.value) return svgSel.value;

        // Or just look for any with value?
        return null;
    }

    // Check for SvgSelector
    if (selector?.type === 'SvgSelector' && selector.value) {
        return selector.value;
    }

    // Check item (sometimes nested)
    if (selector?.item?.type === 'SvgSelector' && selector.item.value) {
        return selector.item.value;
    }

    return null;
}

/**
 * Convert SVG string to POLYGON geometry
 * Parses points from SVG path or polygon element
 */
function convertSvgToPolygon(svgString: string): PolygonGeometry | null {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');

        if (doc.documentElement.nodeName === 'parsererror') {
            logger.warn('Failed to parse SVG selector:', svgString);
            return null;
        }

        const points: [number, number][] = [];

        // Extract points from polygon elements
        const polygons = doc.querySelectorAll('polygon');
        for (const poly of polygons) {
            const pointsAttr = poly.getAttribute('points');
            if (pointsAttr) {
                const polyPoints = parsePolygonPoints(pointsAttr);
                points.push(...polyPoints);
            }
        }

        // Extract points from path elements (simple conversion, doesn't handle curves)
        const paths = doc.querySelectorAll('path');
        for (const path of paths) {
            const d = path.getAttribute('d');
            if (d) {
                const pathPoints = parsePathData(d);
                points.push(...pathPoints);
            }
        }

        // Extract points from circle/ellipse (approximate as polygon)
        const circles = doc.querySelectorAll('circle');
        for (const circle of circles) {
            const cx = parseFloat(circle.getAttribute('cx') || '0');
            const cy = parseFloat(circle.getAttribute('cy') || '0');
            const r = parseFloat(circle.getAttribute('r') || '0');
            const circlePoints = generateCirclePoints(cx, cy, r);
            points.push(...circlePoints);
        }

        // Extract points from rect elements
        const rects = doc.querySelectorAll('rect');
        for (const rect of rects) {
            const x = parseFloat(rect.getAttribute('x') || '0');
            const y = parseFloat(rect.getAttribute('y') || '0');
            const w = parseFloat(rect.getAttribute('width') || '0');
            const h = parseFloat(rect.getAttribute('height') || '0');
            points.push([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
        }

        if (points.length === 0) {
            return null;
        }

        return {
            type: 'POLYGON',
            points,
        };
    } catch (e) {
        logger.warn('Failed to convert SVG to polygon:', e);
        return null;
    }
}

/**
 * Parse polygon points attribute
 * Format: "x1,y1 x2,y2 x3,y3"
 */
function parsePolygonPoints(pointsStr: string): [number, number][] {
    const points: [number, number][] = [];
    const pairs = pointsStr.trim().split(/\s+/);

    for (const pair of pairs) {
        const [x, y] = pair.split(',').map((v) => parseFloat(v));
        if (!isNaN(x) && !isNaN(y)) {
            points.push([x, y]);
        }
    }

    return points;
}

/**
 * Parse SVG path data (simplified)
 * Extracts M (moveto) and L (lineto) commands
 */
function parsePathData(d: string): [number, number][] {
    const points: [number, number][] = [];
    // Simple regex: match M and L commands followed by coordinates
    const commandRegex = /[ML]\s*([\d.]+)[,\s]+([\d.]+)/g;
    let match;

    while ((match = commandRegex.exec(d)) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        if (!isNaN(x) && !isNaN(y)) {
            points.push([x, y]);
        }
    }

    return points;
}

/**
 * Generate polygon points approximating a circle
 */
function generateCirclePoints(
    cx: number,
    cy: number,
    r: number,
    numPoints: number = 8,
): [number, number][] {
    const points: [number, number][] = [];
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        points.push([x, y]);
    }
    return points;
}

/**
 * Extract xywh from annotation target (multiple formats)
 */
/**
 * The text of one annotation body or resource.
 *
 * IIIF spells it three ways — v2 `chars`, v3 `value`, and the `cnt:` prefixed
 * form some v2 publishers emit. Every reader of body text goes through here so
 * a manifest cannot render in one panel and come back empty in another.
 */
export function bodyText(resource: any): string {
    return resource?.chars || resource?.value || resource?.['cnt:chars'] || '';
}

/**
 * Extract annotation body content (text, label, etc)
 */
export function extractBody(annotation: any): {
    value: string;
    isHtml: boolean;
    purpose?: string;
    format?: string;
}[] {
    const bodies: {
        value: string;
        isHtml: boolean;
        purpose?: string;
        format?: string;
    }[] = [];

    // Raw JSON body/resource — `resource` is the IIIF v2 spelling, `body` the
    // v3 one, and both are read.
    const processResource = (r: any) => {
        const val = bodyText(r);
        if (val) {
            // Only a declared format may route a body through the rich-text
            // path. IIIF defaults `TextualBody` to `text/plain`, so the type
            // says nothing about markup; a transcription containing `<` or `&`
            // has to survive as those characters.
            const isHtml = r.format === 'text/html';
            bodies.push({
                value: val,
                isHtml,
                purpose: r.purpose,
                format: r.format,
            });
        }
    };

    if (annotation.resource) {
        const resources = Array.isArray(annotation.resource)
            ? annotation.resource
            : [annotation.resource];
        resources.forEach(processResource);
    } else if (annotation.body) {
        const bodyArr = Array.isArray(annotation.body)
            ? annotation.body
            : [annotation.body];
        bodyArr.forEach(processResource);
    }

    // fallback for label if no bodies found
    if (bodies.length === 0) {
        let value = '';
        if (annotation.label) {
            value = Array.isArray(annotation.label)
                ? annotation.label.join(' ')
                : annotation.label;
        }

        if (value) {
            bodies.push({ value, isHtml: false, purpose: 'commenting' });
        }
    }

    // Default if still nothing
    if (bodies.length === 0) {
        bodies.push({
            value: 'Annotation',
            isHtml: false,
            purpose: 'commenting',
        });
    }

    return bodies;
}

function createRenderId(annotationId: string, geometryIndex: number): string {
    return `${annotationId}::${geometryIndex}`;
}

function buildParsedAnnotations(
    annotation: any,
    index: number,
    isSearchHit: boolean,
    canvasId: string | null = null,
): ParsedAnnotation[] {
    const id = getAnnotationId(annotation) || `anno-${index}`;
    const geometries = extractGeometries(annotation);
    const isFullCanvasTarget = isFullCanvasAnnotation(annotation);
    const coordinateSpace = resolveCoordinateSpace(
        annotation,
        isFullCanvasTarget,
        canvasId,
    );

    if (!geometries.length) {
        return [];
    }

    const body = extractBody(annotation);

    return geometries.map((geometry, geometryIndex) => ({
        id,
        renderId: createRenderId(id, geometryIndex),
        sourceAnnotationId: id,
        canvasId: canvasId ?? getCanvasContext(annotation)?.id ?? null,
        geometryIndex,
        geometry,
        coordinateSpace,
        isFullCanvasTarget,
        body,
        isSearchHit,
    }));
}

/**
 * Parse a raw JSON IIIF annotation to internal format
 */
export function parseAnnotation(
    annotation: any,
    index: number,
    isSearchHit: boolean = false,
    canvasId: string | null = null,
): ParsedAnnotation | null {
    return (
        buildParsedAnnotations(annotation, index, isSearchHit, canvasId)[0] ??
        null
    );
}

/**
 * Batch parse annotations
 */
export function parseAnnotations(
    annotations: any[],
    searchHitIds: Set<string> = new Set(),
    canvasId: string | null = null,
): ParsedAnnotation[] {
    return annotations
        .flatMap((anno, idx) => {
            const isSearchHit = searchHitIds.has(getAnnotationId(anno));
            return buildParsedAnnotations(anno, idx, isSearchHit, canvasId);
        })
        .filter((anno) => anno !== null) as ParsedAnnotation[];
}
