import { describe, expect, it } from 'vitest';

import {
    canvasPointToImagePoint,
    canvasPointsToImagePoints,
    canvasRectToImageRect,
    imageRectToCanvasRect,
    transformAnnotationToCanvasSpace,
    transformAnnotationToImageSpace,
} from './canvasImageSpace';

const dimensions = {
    canvasWidth: 1920,
    canvasHeight: 1080,
    imageWidth: 640,
    imageHeight: 360,
};

describe('canvasImageSpace', () => {
    it('maps canvas rectangles into image coordinates', () => {
        expect(
            canvasRectToImageRect(
                { x: 960, y: 540, width: 480, height: 270 },
                dimensions,
            ),
        ).toEqual({
            x: 320,
            y: 180,
            width: 160,
            height: 90,
        });
    });

    it('maps image rectangles back into canvas coordinates', () => {
        expect(
            imageRectToCanvasRect(
                { x: 100, y: 50, width: 10, height: 20 },
                dimensions,
            ),
        ).toEqual({
            x: 300,
            y: 150,
            width: 30,
            height: 60,
        });
    });

    it('maps points and polygons into image coordinates', () => {
        expect(canvasPointToImagePoint({ x: 960, y: 540 }, dimensions)).toEqual(
            { x: 320, y: 180 },
        );

        expect(
            canvasPointsToImagePoints(
                [
                    [0, 0],
                    [960, 540],
                    [1920, 1080],
                ],
                dimensions,
            ),
        ).toEqual([
            [0, 0],
            [320, 180],
            [640, 360],
        ]);
    });

    it('transforms fragment selectors between canvas and image space', () => {
        const canvasSpace = {
            target: {
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'FragmentSelector',
                    value: 'xywh=300,150,30,60',
                },
            },
        };

        expect(
            transformAnnotationToImageSpace(canvasSpace, dimensions),
        ).toEqual({
            target: {
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'FragmentSelector',
                    value: 'xywh=100,50,10,20',
                },
            },
        });

        expect(
            transformAnnotationToCanvasSpace(
                transformAnnotationToImageSpace(canvasSpace, dimensions),
                dimensions,
            ),
        ).toEqual(canvasSpace);
    });

    it('scales svg selector polygons between spaces', () => {
        const imageSpace = transformAnnotationToImageSpace(
            {
                target: {
                    source: 'http://example.org/canvas/1',
                    selector: {
                        type: 'SvgSelector',
                        value: '<svg viewBox="0 0 1920 1080"><polygon points="960,540 1920,1080" /></svg>',
                    },
                },
            },
            dimensions,
        );

        expect(imageSpace).toEqual({
            target: {
                source: 'http://example.org/canvas/1',
                selector: {
                    type: 'SvgSelector',
                    value: '<svg viewBox="0 0 640 360"><polygon points="320,180 640,360"/></svg>',
                },
            },
        });
    });
});
