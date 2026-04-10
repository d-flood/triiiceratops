export type CanvasImageSpaceDimensions = {
    canvasWidth: number;
    canvasHeight: number;
    imageWidth: number;
    imageHeight: number;
};

type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type Point = {
    x: number;
    y: number;
};

type SpaceDirection = 'canvas-to-image' | 'image-to-canvas';

function isPositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function getScaleFactors(
    dimensions: CanvasImageSpaceDimensions | null | undefined,
    direction: SpaceDirection,
): { scaleX: number; scaleY: number } | null {
    if (
        !dimensions ||
        !isPositiveNumber(dimensions.canvasWidth) ||
        !isPositiveNumber(dimensions.canvasHeight) ||
        !isPositiveNumber(dimensions.imageWidth) ||
        !isPositiveNumber(dimensions.imageHeight)
    ) {
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

function scalePoint(
    point: Point,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
    direction: SpaceDirection,
): Point {
    const scales = getScaleFactors(dimensions, direction);
    if (!scales) return point;

    return {
        x: point.x * scales.scaleX,
        y: point.y * scales.scaleY,
    };
}

function scaleRect(
    rect: Rect,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
    direction: SpaceDirection,
): Rect {
    const scales = getScaleFactors(dimensions, direction);
    if (!scales) return rect;

    return {
        x: rect.x * scales.scaleX,
        y: rect.y * scales.scaleY,
        width: rect.width * scales.scaleX,
        height: rect.height * scales.scaleY,
    };
}

function scaleSvgValue(
    value: string,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
    direction: SpaceDirection,
): string {
    const scales = getScaleFactors(dimensions, direction);
    if (!scales || typeof DOMParser === 'undefined') {
        return value;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(value, 'image/svg+xml');

    if (doc.documentElement.nodeName === 'parsererror') {
        return value;
    }

    const scaleNumber = (raw: string, axis: 'x' | 'y') => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return raw;
        return String(parsed * (axis === 'x' ? scales.scaleX : scales.scaleY));
    };

    const scalePointList = (raw: string | null) => {
        if (!raw) return raw;
        return raw.replace(
            /(-?\d*\.?\d+),(-?\d*\.?\d+)/g,
            (_match, x, y) => `${scaleNumber(x, 'x')},${scaleNumber(y, 'y')}`,
        );
    };

    const scaleAttr = (element: Element, attr: string, axis: 'x' | 'y') => {
        const value = element.getAttribute(attr);
        if (value !== null) {
            element.setAttribute(attr, scaleNumber(value, axis));
        }
    };

    for (const element of Array.from(
        doc.querySelectorAll('polygon, polyline'),
    )) {
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
        if (
            parts.length === 4 &&
            parts.every((part) => Number.isFinite(part))
        ) {
            root.setAttribute(
                'viewBox',
                [
                    parts[0] * scales.scaleX,
                    parts[1] * scales.scaleY,
                    parts[2] * scales.scaleX,
                    parts[3] * scales.scaleY,
                ].join(' '),
            );
        }
    }

    return new XMLSerializer().serializeToString(doc.documentElement);
}

function scaleXywhValue(
    value: string,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
    direction: SpaceDirection,
): string {
    const rectMatch = value.match(
        /xywh=(pixel:)?(-?\d*\.?\d+),(-?\d*\.?\d+),(-?\d*\.?\d+),(-?\d*\.?\d+)/,
    );
    if (!rectMatch) return value;

    const scaled = scaleRect(
        {
            x: Number(rectMatch[2]),
            y: Number(rectMatch[3]),
            width: Number(rectMatch[4]),
            height: Number(rectMatch[5]),
        },
        dimensions,
        direction,
    );

    return value.replace(
        rectMatch[0],
        `xywh=${rectMatch[1] || ''}${scaled.x},${scaled.y},${scaled.width},${scaled.height}`,
    );
}

function scaleSelector(
    selector: any,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
    direction: SpaceDirection,
): any {
    if (!selector || typeof selector !== 'object') {
        return selector;
    }

    if (Array.isArray(selector)) {
        return selector.map((item) =>
            scaleSelector(item, dimensions, direction),
        );
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
            ...scalePoint(
                { x: Number(clone.x), y: Number(clone.y) },
                dimensions,
                direction,
            ),
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

function scaleTarget(
    target: any,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
    direction: SpaceDirection,
): any {
    if (!target) return target;

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

    if (
        clone.id &&
        typeof clone.id === 'string' &&
        clone.id.includes('xywh=')
    ) {
        clone.id = scaleXywhValue(clone.id, dimensions, direction);
    }

    return clone;
}

export function canvasRectToImageRect(
    rect: Rect,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
): Rect {
    return scaleRect(rect, dimensions, 'canvas-to-image');
}

export function imageRectToCanvasRect(
    rect: Rect,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
): Rect {
    return scaleRect(rect, dimensions, 'image-to-canvas');
}

export function canvasPointToImagePoint(
    point: Point,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
): Point {
    return scalePoint(point, dimensions, 'canvas-to-image');
}

export function imagePointToCanvasPoint(
    point: Point,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
): Point {
    return scalePoint(point, dimensions, 'image-to-canvas');
}

export function canvasPointsToImagePoints(
    points: Array<[number, number]>,
    dimensions: CanvasImageSpaceDimensions | null | undefined,
): Array<[number, number]> {
    return points.map(([x, y]) => {
        const scaled = canvasPointToImagePoint({ x, y }, dimensions);
        return [scaled.x, scaled.y];
    });
}

export function transformAnnotationToImageSpace<
    T extends { target?: any; on?: any },
>(annotation: T, dimensions: CanvasImageSpaceDimensions | null | undefined): T {
    return {
        ...annotation,
        ...(annotation.target
            ? {
                  target: scaleTarget(
                      annotation.target,
                      dimensions,
                      'canvas-to-image',
                  ),
              }
            : {}),
        ...(annotation.on
            ? { on: scaleTarget(annotation.on, dimensions, 'canvas-to-image') }
            : {}),
    };
}

export function transformAnnotationToCanvasSpace<
    T extends { target?: any; on?: any },
>(annotation: T, dimensions: CanvasImageSpaceDimensions | null | undefined): T {
    return {
        ...annotation,
        ...(annotation.target
            ? {
                  target: scaleTarget(
                      annotation.target,
                      dimensions,
                      'image-to-canvas',
                  ),
              }
            : {}),
        ...(annotation.on
            ? { on: scaleTarget(annotation.on, dimensions, 'image-to-canvas') }
            : {}),
    };
}
