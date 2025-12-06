import type { ImageAnnotation } from '@annotorious/annotorious';

/**
 * Helper to extract ID from annotation object
 * Handles Manifesto objects and raw JSON
 */
function getAnnotationId(anno: any): string {
  return anno.id || anno['@id'] || (typeof anno.getId === 'function' ? anno.getId() : '');
}

/**
 * Parse xywh media fragment from target string
 * Format: "canvas-id#xywh=x,y,w,h"
 */
function parseXywh(targetStr: string): { x: number; y: number; w: number; h: number } | null {
  if (!targetStr) return null;
  const match = targetStr.match(/xywh=(\d+),(\d+),(\d+),(\d+)/);
  if (match) {
    return {
      x: parseInt(match[1], 10),
      y: parseInt(match[2], 10),
      w: parseInt(match[3], 10),
      h: parseInt(match[4], 10),
    };
  }
  return null;
}

/**
 * Extract target geometry from various annotation formats
 */
function extractGeometry(annotation: any): any {
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
      geometry: {
        x: xywh.x,
        y: xywh.y,
        w: xywh.w,
        h: xywh.h,
        bounds: {
          minX: xywh.x,
          minY: xywh.y,
          maxX: xywh.x + xywh.w,
          maxY: xywh.y + xywh.h,
        },
      },
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

  // Check for SvgSelector
  const selector = target.selector || target;
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
 * Convert SVG string to Annotorious POLYGON geometry
 * Parses points from SVG path or polygon element
 */
function convertSvgToPolygon(svgString: string): any {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');

    if (doc.documentElement.nodeName === 'parsererror') {
      console.warn('Failed to parse SVG selector:', svgString);
      return null;
    }

    const points: [number, number][] = [];
    let bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

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

    // Calculate bounds
    for (const [x, y] of points) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }

    if (points.length === 0) {
      return null;
    }

    return {
      type: 'POLYGON',
      geometry: {
        points,
        bounds,
      },
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
function generateCirclePoints(cx: number, cy: number, r: number, numPoints: number = 8): [number, number][] {
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
function extractXywhFromTarget(annotation: any): { x: number; y: number; w: number; h: number } | null {
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
function extractXywhFromRawTarget(target: any): { x: number; y: number; w: number; h: number } | null {
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
    const sel = target.selector;
    const item = sel.item || sel;

    if (item.value && typeof item.value === 'string' && item.value.includes('xywh=')) {
      return parseXywh(item.value);
    }
  }

  return null;
}

/**
 * Extract annotation body content (text, label, etc)
 */
function extractBody(annotation: any): any[] {
  const bodies: any[] = [];

  // Try Manifesto getBody method
  if (typeof annotation.getBody === 'function') {
    const body = annotation.getBody();
    if (body && Array.isArray(body)) {
      for (const b of body) {
        const value = b.getValue ? b.getValue() : '';
        const format = b.getFormat ? b.getFormat() : '';

        if (value) {
          bodies.push({
            purpose: 'commenting',
            value,
            // Note: Don't include format, Annotorious doesn't track it
          });
        }
      }
    }
  } else {
    // Handle raw JSON body/resource
    const getText = (r: any) => {
      if (!r) return '';
      return r.chars || r.value || r['cnt:chars'] || '';
    };

    if (annotation.resource) {
      const resources = Array.isArray(annotation.resource) ? annotation.resource : [annotation.resource];
      for (const r of resources) {
        const text = getText(r);
        if (text) {
          bodies.push({
            purpose: 'commenting',
            value: text,
          });
        }
      }
    } else if (annotation.body) {
      const bodyArr = Array.isArray(annotation.body) ? annotation.body : [annotation.body];
      for (const b of bodyArr) {
        const text = getText(b);
        if (text) {
          bodies.push({
            purpose: 'commenting',
            value: text,
          });
        }
      }
    }
  }

  // Try to extract label if no body content found
  if (bodies.length === 0) {
    let label = '';
    if (typeof annotation.getLabel === 'function') {
      label = annotation.getLabel();
    } else if (annotation.label) {
      label = Array.isArray(annotation.label) ? annotation.label.join(' ') : annotation.label;
    }

    if (label) {
      bodies.push({
        purpose: 'commenting',
        value: label,
      });
    }
  }

  return bodies;
}

/**
 * Convert Manifesto/IIIF annotation to Annotorious ImageAnnotation format
 */
export function convertToAnnotoriousFormat(annotation: any, index: number, isSearchHit: boolean = false): ImageAnnotation | null {
  const id = getAnnotationId(annotation) || `anno-${index}`;
  const geometry = extractGeometry(annotation);

  // Skip annotations without geometry
  if (!geometry) {
    return null;
  }

  const bodies = extractBody(annotation);

  // Add search-hit purpose if this is a search result
  if (isSearchHit) {
    bodies.push({
      purpose: 'search-hit',
      value: 'search-hit',
    });
  }

  return {
    id,
    target: {
      selector: geometry,
    },
    bodies,
  } as ImageAnnotation;
}

/**
 * Batch convert annotations
 */
export function convertAnnotations(annotations: any[], searchHitIds: Set<string> = new Set()): ImageAnnotation[] {
  return annotations
    .map((anno, idx) => {
      const isSearchHit = searchHitIds.has(getAnnotationId(anno));
      return convertToAnnotoriousFormat(anno, idx, isSearchHit);
    })
    .filter((anno) => anno !== null) as ImageAnnotation[];
}
