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
export declare function canvasRectToImageRect(rect: Rect, dimensions: CanvasImageSpaceDimensions | null | undefined): Rect;
export declare function imageRectToCanvasRect(rect: Rect, dimensions: CanvasImageSpaceDimensions | null | undefined): Rect;
export declare function canvasPointToImagePoint(point: Point, dimensions: CanvasImageSpaceDimensions | null | undefined): Point;
export declare function imagePointToCanvasPoint(point: Point, dimensions: CanvasImageSpaceDimensions | null | undefined): Point;
export declare function canvasPointsToImagePoints(points: Array<[number, number]>, dimensions: CanvasImageSpaceDimensions | null | undefined): Array<[number, number]>;
export declare function transformAnnotationToImageSpace<T extends {
    target?: any;
    on?: any;
}>(annotation: T, dimensions: CanvasImageSpaceDimensions | null | undefined): T;
export declare function transformAnnotationToCanvasSpace<T extends {
    target?: any;
    on?: any;
}>(annotation: T, dimensions: CanvasImageSpaceDimensions | null | undefined): T;
export {};
