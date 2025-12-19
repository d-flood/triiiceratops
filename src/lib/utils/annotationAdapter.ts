/**
 * Parsed annotation interface for custom rendering
 */
export interface ParsedAnnotation {
    id: string;
    geometry: RectangleGeometry | PolygonGeometry;
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

/**
 * Helper to extract ID from annotation object
 * Handles Manifesto objects and raw JSON
 */
function getAnnotationId(anno: any): string {
    return (
        anno.id ||
        anno['@id'] ||
        (typeof anno.getId === 'function' ? anno.getId() : '')
    );
}

/**
 * Parse xywh media fragment from target string
 * Format: "canvas-id#xywh=x,y,w,h"
 */
function parseXywh(
    targetStr: string,
): { x: number; y: number; w: number; h: number } | null {
    if (!targetStr) return null;
    // Match xywh= optionally followed by "pixel:" and handle floats
    const match = targetStr.match(
        /xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/,
    );
    if (match) {
        return {
            x: parseFloat(match[1]),
            y: parseFloat(match[2]),
            w: parseFloat(match[3]),
            h: parseFloat(match[4]),
        };
    }
    return null;
}

/**
 * Extract target geometry from various annotation formats
 */
function extractGeometry(
    annotation: any,
): RectangleGeometry | PolygonGeometry | null {
    // Try to find SVG selector first
    const svgSelector = findSvgSelector(annotation);
    if (svgSelector) {
        return convertSvgToPolygon(svgSelector);
    }

    // Extract xywh from target
    const xywh = extractXywhFromTarget(annotation);
    if (xywh) {
        return {
            type: 'RECTANGLE',
            x: xywh.x,
            y: xywh.y,
            w: xywh.w,
            h: xywh.h,
        };
    }

    return null;
}

/**
 * Find SVG selector in annotation target
 */
function findSvgSelector(annotation: any): string | null {
    // Try Manifesto method
    if (typeof annotation.getTarget === 'function') {
        // For Manifesto, check raw JSON for SVG
        const rawOn = annotation.__jsonld?.on || annotation.__jsonld?.target;
        if (rawOn) {
            return extractSvgFromTarget(rawOn);
        }
    }

    // Check common locations in raw JSON
    const target = annotation.target || annotation.on;
    if (target) {
        return extractSvgFromTarget(target);
    }

    return null;
}

/**
 * Extract SVG from target object/array
 */
function extractSvgFromTarget(target: any): string | null {
    if (!target) return null;

    // Handle array of targets
    if (Array.isArray(target)) {
        for (const t of target) {
            const svg = extractSvgValue(t);
            if (svg) return svg;
        }
    } else {
        return extractSvgValue(target);
    }

    return null;
}

/**
 * Extract SVG value from single target object
 */
function extractSvgValue(target: any): string | null {
    if (!target) return null;

    // Check for selector property or use target itself
    let selector = target.selector || target;

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
            console.warn('Failed to parse SVG selector:', svgString);
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
        console.warn('Failed to convert SVG to polygon:', e);
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
function extractXywhFromTarget(
    annotation: any,
): { x: number; y: number; w: number; h: number } | null {
    // Try Manifesto getTarget method
    if (typeof annotation.getTarget === 'function') {
        const target = annotation.getTarget();
        if (typeof target === 'string' && target.includes('xywh=')) {
            return parseXywh(target);
        }
        // Check raw JSON as fallback
        const rawOn = annotation.__jsonld?.on;
        if (rawOn) {
            const xywh = extractXywhFromRawTarget(rawOn);
            if (xywh) return xywh;
        }
    }

    // Check raw annotation formats (v2 and v3)
    const target = annotation.target || annotation.on;
    if (target) {
        return extractXywhFromRawTarget(target);
    }

    return null;
}

/**
 * Extract xywh from raw target object/array
 */
function extractXywhFromRawTarget(
    target: any,
): { x: number; y: number; w: number; h: number } | null {
    if (!target) return null;

    // Handle arrays
    if (Array.isArray(target)) {
        for (const t of target) {
            const xywh = extractXywhFromRawTarget(t);
            if (xywh) return xywh;
        }
    }

    // Handle string targets with xywh
    if (typeof target === 'string' && target.includes('xywh=')) {
        return parseXywh(target);
    }

    // Handle object with selector
    if (target.selector) {
        let sel = target.selector;

        // Handle array of selectors
        if (Array.isArray(sel)) {
            // Prefer FragmentSelector
            const fragment = sel.find(
                (s) =>
                    s.type === 'FragmentSelector' &&
                    s.value &&
                    s.value.includes('xywh='),
            );
            if (fragment) return parseXywh(fragment.value);

            // Or generic
            const anyXywh = sel.find(
                (s) => s.value && s.value.includes('xywh='),
            );
            if (anyXywh) return parseXywh(anyXywh.value);

            return null;
        }

        const item = sel.item || sel;

        if (
            item.value &&
            typeof item.value === 'string' &&
            item.value.includes('xywh=')
        ) {
            return parseXywh(item.value);
        }
    }

    return null;
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

    // Try Manifesto getBody method
    if (typeof annotation.getBody === 'function') {
        const body = annotation.getBody();
        if (body) {
            const bodyArr = Array.isArray(body) ? body : [body];
            for (const b of bodyArr) {
                const val = b.getValue ? b.getValue() : '';
                if (val) {
                    const format = b.getFormat ? b.getFormat() : '';
                    const purpose = b.getPurpose ? b.getPurpose() : undefined;
                    bodies.push({
                        value: val,
                        isHtml:
                            format === 'text/html' ||
                            format === 'application/html',
                        purpose: purpose,
                        format: format,
                    });
                }
            }
        }
    } else {
        // Handle raw JSON body/resource
        const processResource = (r: any) => {
            const val = r.chars || r.value || r['cnt:chars'] || '';
            if (val) {
                const isHtml =
                    r.format === 'text/html' || r.type === 'TextualBody';
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
    }

    // fallback for label if no bodies found
    if (bodies.length === 0) {
        let value = '';
        if (typeof annotation.getLabel === 'function') {
            value = annotation.getLabel() || '';
        } else if (annotation.label) {
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

/**
 * Parse Manifesto/IIIF annotation to internal format
 */
export function parseAnnotation(
    annotation: any,
    index: number,
    isSearchHit: boolean = false,
): ParsedAnnotation | null {
    const id = getAnnotationId(annotation) || `anno-${index}`;
    const geometry = extractGeometry(annotation);

    // Skip annotations without geometry
    if (!geometry) {
        return null;
    }

    const body = extractBody(annotation);

    return {
        id,
        geometry,
        body,
        isSearchHit,
    };
}

/**
 * Batch parse annotations
 */
export function parseAnnotations(
    annotations: any[],
    searchHitIds: Set<string> = new Set(),
): ParsedAnnotation[] {
    return annotations
        .map((anno, idx) => {
            const isSearchHit = searchHitIds.has(getAnnotationId(anno));
            return parseAnnotation(anno, idx, isSearchHit);
        })
        .filter((anno) => anno !== null) as ParsedAnnotation[];
}
