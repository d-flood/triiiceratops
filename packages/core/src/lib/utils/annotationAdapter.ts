import {
    extractIiifTargetId,
    getIiifCanvasId,
    normalizeIiifTargets,
} from './iiifTargets';
import { getAnnotationId, getReferenceId } from './iiifIds';
import { resolveLanguageValue } from './languageMap';
import { isHttpUrl } from './sanitizeHtml';
import { getChoiceAlternatives, isChoiceBody } from './iiifParsing';
import { logger } from '../logging/logger';

/**
 * One rendered annotation body.
 *
 * `href` is a dereferenceable `http`/`https` identity the body stands for — a
 * `SpecificResource`'s `source`, or the body's own `id` — and is present only
 * where the body has one. It is kept apart from `value` because a URI is not
 * prose: every consumer that renders `value` would otherwise print a bare URL
 * as text, and only the panel knows how to make a followable link out of it. A
 * body may carry both (an external resource with a label) or a URI alone, in
 * which case `value` is empty and the link's own text is the reader's only
 * handle on it.
 */
export interface AnnotationBody {
    value: string;
    isHtml: boolean;
    purpose?: string;
    format?: string;
    href?: string;
}

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
    body: AnnotationBody[];
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
    if (selector?.type !== 'PointSelector') {
        return null;
    }

    const x = Number(selector.x);
    const y = Number(selector.y);
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
 * The origin marker is a **fallback**, not the rule: it must not be consulted
 * before the target test below, or every manifest annotation becomes image
 * space regardless of what it targets. That is invisible while a Canvas
 * declares the same dimensions as its image — the common case, and every
 * fixture in this repository — but on a manifest that declares a smaller
 * image than its Canvas it scales every shape up by the ratio between them:
 * a 1200-wide Canvas painted by a body declaring 600 would draw its
 * annotations at twice their size.
 *
 * Which canvas the target is compared against comes from the annotation's own
 * embedded context where it has one, and otherwise from the canvas the CALLER
 * asked about. A **content-search hit** is the case that needs the second: it
 * is built from the search response as `on: "<canvasId>#xywh=…"` and carries
 * no embedded context, so without the caller's canvas the comparison could
 * never be made and every hit would fall through to image space. Search hits
 * are canvas coordinates: the Content Search API returns annotations
 * targeting the Canvas.
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
 * Callers hand this one selector out of `normalizeIiifTargets`, which has
 * already flattened selector arrays and unwrapped the v2 `item` nesting, so
 * there is exactly one shape left to read.
 */
function extractSvgValue(target: any): string | null {
    const selector = target?.selector || target;

    return selector?.type === 'SvgSelector' && selector.value
        ? selector.value
        : null;
}

/**
 * Simplified SVG-to-polygon conversion; does not handle curves.
 *
 * `<polygon>`/`<path>` cover what annotation editors emit, but `<rect>` and
 * `<circle>` also reach here: `utils/canvasImageSpace` scales both inside
 * `SvgSelector` values for the exported `transformAnnotationTo*Space`, so
 * first-party code already treats them as valid selector geometry. Collecting no
 * points is not a degraded shape but a dropped annotation — the caller falls
 * through to whole-canvas geometry, which refuses a targeted annotation, and the
 * row disappears from the panel as well as the overlay.
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

        const polygons = doc.querySelectorAll('polygon');
        for (const poly of polygons) {
            const pointsAttr = poly.getAttribute('points');
            if (pointsAttr) {
                const polyPoints = parsePolygonPoints(pointsAttr);
                points.push(...polyPoints);
            }
        }

        const paths = doc.querySelectorAll('path');
        for (const path of paths) {
            const d = path.getAttribute('d');
            if (d) {
                const pathPoints = parsePathData(d);
                points.push(...pathPoints);
            }
        }

        // Circles/ellipses are approximated as polygons.
        const circles = doc.querySelectorAll('circle');
        for (const circle of circles) {
            const cx = parseFloat(circle.getAttribute('cx') || '0');
            const cy = parseFloat(circle.getAttribute('cy') || '0');
            const r = parseFloat(circle.getAttribute('r') || '0');
            points.push(...generateCirclePoints(cx, cy, r));
        }

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

/** Parses a `points` attribute of the form "x1,y1 x2,y2 x3,y3". */
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

/** Extracts only M (moveto) and L (lineto) commands; curves are not supported. */
function parsePathData(d: string): [number, number][] {
    const points: [number, number][] = [];
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

function generateCirclePoints(
    cx: number,
    cy: number,
    r: number,
    numPoints: number = 8,
): [number, number][] {
    const points: [number, number][] = [];
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    return points;
}

/**
 * The text of one annotation body or resource.
 *
 * IIIF spells it three ways — v2 `chars`, v3 `value`, and the `cnt:` prefixed
 * form some v2 publishers emit. Every reader of body text goes through here so
 * a manifest cannot render in one panel and come back empty in another.
 */
export function bodyText(resource: unknown): string {
    if (!resource || typeof resource !== 'object') return '';
    const body = resource as {
        chars?: unknown;
        value?: unknown;
        'cnt:chars'?: unknown;
    };
    // `||`, not `??`: an empty string in one spelling falls through to the
    // next, which is what the reader that this replaced did.
    const text = body.chars || body.value || body['cnt:chars'];
    return typeof text === 'string' ? text : '';
}

/**
 * The one item of a `Choice` body to render, or the resource unchanged when it
 * is not a Choice.
 *
 * Selection order: an item whose `language` matches the active locale exactly,
 * then one matching on the primary subtag, then the first item — because the
 * recipe (IIIF Cookbook 0346) has manifest authors establish preference through
 * item order. An item carrying no `language` is a legitimate candidate for that
 * last rung, not an error.
 *
 * A Choice's items are ALTERNATIVES, so the ones not picked are dropped
 * silently: that is the shape behaving as designed, not a degradation, and it
 * warrants no warning. Note that annotation bodies do not use language maps —
 * an item carries sibling `language` and `value` properties — so this resolves
 * language itself rather than through `resolveLanguageValue`.
 */
function selectChoiceItem(resource: any, locale?: string): any {
    if (!isChoiceBody(resource)) {
        return resource;
    }

    const items = getChoiceAlternatives(resource);
    if (!items.length) {
        return resource;
    }

    if (locale) {
        const exact = items.find((item) => item?.language === locale);
        if (exact) return exact;

        const primary = locale.split('-')[0];
        const bySubtag = items.find(
            (item) =>
                typeof item?.language === 'string' &&
                item.language.split('-')[0] === primary,
        );
        if (bySubtag) return bySubtag;
    }

    return items[0];
}

/**
 * The web identity a textless body stands for, or `''` where it has none.
 *
 * IIIF Cookbook recipe 0258 tags a region with an authority record rather than
 * a phrase: the body is a `SpecificResource` whose `source` is the record's
 * URI and which carries no text at all. `getReferenceId` reads that, a body's
 * own `id`, and the v2 `@id` spelling alike.
 *
 * Only an absolute `http`/`https` URI qualifies. The value comes from a
 * manifest and ends up in an `href`, so a `javascript:` or `data:` identity is
 * dropped here rather than at the point of render — nothing downstream should
 * have to know that a body's link target might be hostile.
 */
function externalBodyHref(resource: any): string {
    const uri = getReferenceId(resource);
    return uri && isHttpUrl(uri) ? uri : '';
}

export function extractBody(
    annotation: any,
    locale?: string,
): AnnotationBody[] {
    const bodies: AnnotationBody[] = [];

    // Raw JSON body/resource — `resource` is the IIIF v2 spelling, `body` the
    // v3 one, and both are read.
    const processResource = (raw: any) => {
        const r = selectChoiceItem(raw, locale);
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
            return;
        }

        const href = externalBodyHref(r);
        if (href) {
            bodies.push({
                value: resolveLanguageValue(r.label, locale),
                isHtml: false,
                purpose: r.purpose,
                href,
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
    locale?: string,
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

    const body = extractBody(annotation, locale);

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

export function parseAnnotation(
    annotation: any,
    index: number,
    isSearchHit: boolean = false,
    canvasId: string | null = null,
    locale?: string,
): ParsedAnnotation | null {
    return (
        buildParsedAnnotations(
            annotation,
            index,
            isSearchHit,
            canvasId,
            locale,
        )[0] ?? null
    );
}

export function parseAnnotations(
    annotations: any[],
    searchHitIds: Set<string> = new Set(),
    canvasId: string | null = null,
    locale?: string,
): ParsedAnnotation[] {
    return annotations.flatMap((anno, idx) =>
        buildParsedAnnotations(
            anno,
            idx,
            searchHitIds.has(getAnnotationId(anno)),
            canvasId,
            locale,
        ),
    );
}
