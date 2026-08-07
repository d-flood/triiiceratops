function isPositiveNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function getScaleFactors(dimensions, direction) {
    if (!dimensions ||
        !isPositiveNumber(dimensions.canvasWidth) ||
        !isPositiveNumber(dimensions.canvasHeight) ||
        !isPositiveNumber(dimensions.imageWidth) ||
        !isPositiveNumber(dimensions.imageHeight)) {
        return null;
    }
    if (direction === 'canvas-to-image') {
        return {
            scaleX: dimensions.imageWidth / dimensions.canvasWidth,
            scaleY: dimensions.imageHeight / dimensions.canvasHeight,
        };
    }
    return {
        scaleX: dimensions.canvasWidth / dimensions.imageWidth,
        scaleY: dimensions.canvasHeight / dimensions.imageHeight,
    };
}
function scalePoint(point, dimensions, direction) {
    const scales = getScaleFactors(dimensions, direction);
    if (!scales)
        return point;
    return {
        x: point.x * scales.scaleX,
        y: point.y * scales.scaleY,
    };
}
function scaleRect(rect, dimensions, direction) {
    const scales = getScaleFactors(dimensions, direction);
    if (!scales)
        return rect;
    return {
        x: rect.x * scales.scaleX,
        y: rect.y * scales.scaleY,
        width: rect.width * scales.scaleX,
        height: rect.height * scales.scaleY,
    };
}
function scaleSvgValue(value, dimensions, direction) {
    const scales = getScaleFactors(dimensions, direction);
    if (!scales || typeof DOMParser === 'undefined') {
        return value;
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'image/svg+xml');
    if (doc.documentElement.nodeName === 'parsererror') {
        return value;
    }
    const scaleNumber = (raw, axis) => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed))
            return raw;
        return String(parsed * (axis === 'x' ? scales.scaleX : scales.scaleY));
    };
    const scalePointList = (raw) => {
        if (!raw)
            return raw;
        return raw.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g, (_match, x, y) => `${scaleNumber(x, 'x')},${scaleNumber(y, 'y')}`);
    };
    const scaleAttr = (element, attr, axis) => {
        const value = element.getAttribute(attr);
        if (value !== null) {
            element.setAttribute(attr, scaleNumber(value, axis));
        }
    };
    for (const element of Array.from(doc.querySelectorAll('polygon, polyline'))) {
        const scaled = scalePointList(element.getAttribute('points'));
        if (scaled !== null) {
            element.setAttribute('points', scaled);
        }
    }
    for (const element of Array.from(doc.querySelectorAll('rect'))) {
        scaleAttr(element, 'x', 'x');
        scaleAttr(element, 'y', 'y');
        scaleAttr(element, 'width', 'x');
        scaleAttr(element, 'height', 'y');
        scaleAttr(element, 'rx', 'x');
        scaleAttr(element, 'ry', 'y');
    }
    for (const element of Array.from(doc.querySelectorAll('circle'))) {
        scaleAttr(element, 'cx', 'x');
        scaleAttr(element, 'cy', 'y');
        scaleAttr(element, 'r', 'x');
    }
    for (const element of Array.from(doc.querySelectorAll('ellipse'))) {
        scaleAttr(element, 'cx', 'x');
        scaleAttr(element, 'cy', 'y');
        scaleAttr(element, 'rx', 'x');
        scaleAttr(element, 'ry', 'y');
    }
    for (const element of Array.from(doc.querySelectorAll('line'))) {
        scaleAttr(element, 'x1', 'x');
        scaleAttr(element, 'y1', 'y');
        scaleAttr(element, 'x2', 'x');
        scaleAttr(element, 'y2', 'y');
    }
    const root = doc.documentElement;
    const viewBox = root.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox
            .trim()
            .split(/\s+/)
            .map((part) => Number(part));
        if (parts.length === 4 &&
            parts.every((part) => Number.isFinite(part))) {
            root.setAttribute('viewBox', [
                parts[0] * scales.scaleX,
                parts[1] * scales.scaleY,
                parts[2] * scales.scaleX,
                parts[3] * scales.scaleY,
            ].join(' '));
        }
    }
    return new XMLSerializer().serializeToString(doc.documentElement);
}
function scaleXywhValue(value, dimensions, direction) {
    const rectMatch = value.match(/xywh=(pixel:)?(-?\d*\.?\d+),(-?\d*\.?\d+),(-?\d*\.?\d+),(-?\d*\.?\d+)/);
    if (!rectMatch)
        return value;
    const scaled = scaleRect({
        x: Number(rectMatch[2]),
        y: Number(rectMatch[3]),
        width: Number(rectMatch[4]),
        height: Number(rectMatch[5]),
    }, dimensions, direction);
    return value.replace(rectMatch[0], `xywh=${rectMatch[1] || ''}${scaled.x},${scaled.y},${scaled.width},${scaled.height}`);
}
function scaleSelector(selector, dimensions, direction) {
    if (!selector || typeof selector !== 'object') {
        return selector;
    }
    if (Array.isArray(selector)) {
        return selector.map((item) => scaleSelector(item, dimensions, direction));
    }
    const clone = { ...selector };
    if (clone.item) {
        clone.item = scaleSelector(clone.item, dimensions, direction);
    }
    if (clone.selector) {
        clone.selector = scaleSelector(clone.selector, dimensions, direction);
    }
    if (clone.type === 'PointSelector') {
        return {
            ...clone,
            ...scalePoint({ x: Number(clone.x), y: Number(clone.y) }, dimensions, direction),
        };
    }
    if (typeof clone.value === 'string' && clone.value.includes('xywh=')) {
        clone.value = scaleXywhValue(clone.value, dimensions, direction);
    }
    if (clone.type === 'SvgSelector' && typeof clone.value === 'string') {
        clone.value = scaleSvgValue(clone.value, dimensions, direction);
    }
    return clone;
}
function scaleTarget(target, dimensions, direction) {
    if (!target)
        return target;
    if (Array.isArray(target)) {
        return target.map((item) => scaleTarget(item, dimensions, direction));
    }
    if (typeof target === 'string') {
        return target.includes('xywh=')
            ? scaleXywhValue(target, dimensions, direction)
            : target;
    }
    if (typeof target !== 'object') {
        return target;
    }
    const clone = { ...target };
    if (clone.source) {
        clone.source = scaleTarget(clone.source, dimensions, direction);
    }
    if (clone.selector) {
        clone.selector = scaleSelector(clone.selector, dimensions, direction);
    }
    if (clone.id &&
        typeof clone.id === 'string' &&
        clone.id.includes('xywh=')) {
        clone.id = scaleXywhValue(clone.id, dimensions, direction);
    }
    return clone;
}
export function canvasRectToImageRect(rect, dimensions) {
    return scaleRect(rect, dimensions, 'canvas-to-image');
}
export function imageRectToCanvasRect(rect, dimensions) {
    return scaleRect(rect, dimensions, 'image-to-canvas');
}
export function canvasPointToImagePoint(point, dimensions) {
    return scalePoint(point, dimensions, 'canvas-to-image');
}
export function imagePointToCanvasPoint(point, dimensions) {
    return scalePoint(point, dimensions, 'image-to-canvas');
}
export function canvasPointsToImagePoints(points, dimensions) {
    return points.map(([x, y]) => {
        const scaled = canvasPointToImagePoint({ x, y }, dimensions);
        return [scaled.x, scaled.y];
    });
}
export function transformAnnotationToImageSpace(annotation, dimensions) {
    return {
        ...annotation,
        ...(annotation.target
            ? {
                target: scaleTarget(annotation.target, dimensions, 'canvas-to-image'),
            }
            : {}),
        ...(annotation.on
            ? { on: scaleTarget(annotation.on, dimensions, 'canvas-to-image') }
            : {}),
    };
}
export function transformAnnotationToCanvasSpace(annotation, dimensions) {
    return {
        ...annotation,
        ...(annotation.target
            ? {
                target: scaleTarget(annotation.target, dimensions, 'image-to-canvas'),
            }
            : {}),
        ...(annotation.on
            ? { on: scaleTarget(annotation.on, dimensions, 'image-to-canvas') }
            : {}),
    };
}
