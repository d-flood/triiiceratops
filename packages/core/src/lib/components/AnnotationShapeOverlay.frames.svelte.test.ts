/**
 * What the overlay does on the frame tick, and what it refuses to do again.
 *
 * A pan or a zoom moves every shape on screen without changing a word of its
 * tooltip or a number of its canvas-space geometry, so the shapes are prepared
 * once and only their placements recomputed per frame. The counters below are
 * the assertion: the real helpers run, wrapped so the test can say how often
 * each half was asked.
 */

import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const counts = vi.hoisted(() => ({ prepare: 0, place: 0 }));

vi.mock('../utils/annotationShapes', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('../utils/annotationShapes')>();
    return {
        ...actual,
        prepareAnnotationShapes: (
            ...args: Parameters<typeof actual.prepareAnnotationShapes>
        ) => {
            counts.prepare += 1;
            return actual.prepareAnnotationShapes(...args);
        },
        placePreparedShapes: (
            ...args: Parameters<typeof actual.placePreparedShapes>
        ) => {
            counts.place += 1;
            return actual.placePreparedShapes(...args);
        },
    };
});

import AnnotationShapeOverlayTestHost from './AnnotationShapeOverlayTestHost.svelte';

/**
 * One rectangle targeting the IMAGE resource, so preparation has a real
 * image-space → canvas-space conversion to do rather than the identity.
 */
function rectangle(value = 'A region worth marking') {
    return {
        id: 'anno-rectangle',
        type: 'Annotation',
        motivation: 'commenting',
        body: { type: 'TextualBody', value },
        target: 'https://example.org/image.jpg#xywh=20,40,60,80',
    };
}

/** A canvas half the size of its image, so the conversion is not the identity. */
const CANVAS = {
    id: 'canvas-1',
    type: 'Canvas',
    width: 50,
    height: 50,
    items: [
        {
            type: 'AnnotationPage',
            items: [
                {
                    type: 'Annotation',
                    motivation: 'painting',
                    body: {
                        type: 'Image',
                        id: 'https://example.org/image.jpg',
                        width: 100,
                        height: 100,
                    },
                },
            ],
        },
    ],
};

describe('AnnotationShapeOverlay — frame cadence', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    beforeEach(() => {
        counts.prepare = 0;
        counts.place = 0;
    });

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    function render(props: Record<string, unknown>) {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props,
        });
        flushSync();
        return mounted as unknown as {
            tickFrame: () => void;
            frameSubscriptionCount: () => number;
            tapAt: (point: { x: number; y: number }) => void;
        };
    }

    function shapeElement(): HTMLElement {
        const element = document.querySelector<HTMLElement>(
            '[data-annotation-id="anno-rectangle"]',
        );
        expect(element).not.toBeNull();
        return element!;
    }

    it('re-projects every frame without re-preparing tooltip text or canvas-space geometry', () => {
        // The viewport moves: each frame translates by a further 10px.
        let offset = 0;
        const host = render({
            annotations: [rectangle()],
            canvases: [CANVAS],
            canvasToScreen: (point: { x: number; y: number }) => ({
                x: point.x + offset,
                y: point.y + offset,
            }),
        });

        const preparedOnce = counts.prepare;
        const placedOnce = counts.place;
        expect(preparedOnce).toBeGreaterThan(0);
        expect(placedOnce).toBeGreaterThan(0);

        const positions: string[] = [shapeElement().style.left];
        for (let frame = 1; frame <= 4; frame += 1) {
            offset = frame * 10;
            host.tickFrame();
            flushSync();
            positions.push(shapeElement().style.left);
        }

        // The still half ran once for the whole pan; the moving half ran again
        // for every frame of it.
        expect(counts.prepare).toBe(preparedOnce);
        expect(counts.place).toBe(placedOnce + 4);

        // And the shape followed the viewport: the image-space rect at 20,40 is
        // a canvas rect at 10,20 through a half-size canvas.
        expect(positions).toEqual(['10px', '20px', '30px', '40px', '50px']);
    });

    it('prepares again, with new text, when the annotation body changes', () => {
        const props = $state({
            annotations: [rectangle()],
            canvases: [CANVAS],
            editorOpen: true,
        });
        const host = render(props);

        host.tickFrame();
        flushSync();
        const beforeChange = counts.prepare;
        expect(shapeElement().getAttribute('aria-label')).toBe(
            'A region worth marking',
        );

        props.annotations = [rectangle('A revised note')];
        flushSync();

        expect(counts.prepare).toBeGreaterThan(beforeChange);
        expect(shapeElement().getAttribute('aria-label')).toBe(
            'A revised note',
        );
    });

    it('prepares again, in the new language, when the active locale changes', () => {
        // A `Choice` body: which item the tooltip takes is the active locale's
        // question, and it is answered during preparation.
        const bilingual = {
            id: 'anno-rectangle',
            type: 'Annotation',
            motivation: 'commenting',
            body: {
                type: 'Choice',
                items: [
                    { type: 'TextualBody', language: 'en', value: 'A note' },
                    { type: 'TextualBody', language: 'fr', value: 'Une note' },
                ],
            },
            target: 'https://example.org/image.jpg#xywh=20,40,60,80',
        };
        const props = $state({
            annotations: [bilingual],
            canvases: [CANVAS],
            editorOpen: true,
            activeLocale: 'en',
        });
        const host = render(props);

        host.tickFrame();
        flushSync();
        const beforeChange = counts.prepare;
        expect(shapeElement().getAttribute('aria-label')).toBe('A note');

        props.activeLocale = 'fr';
        flushSync();

        expect(counts.prepare).toBeGreaterThan(beforeChange);
        expect(shapeElement().getAttribute('aria-label')).toBe('Une note');
    });

    it('never subscribes to the frame cadence when nothing is shown', () => {
        const host = render({ annotations: [], canvases: [CANVAS] });

        expect(host.frameSubscriptionCount()).toBe(0);
        expect(counts.place).toBe(0);
    });

    it('moves shapes on a frame tick by position alone, re-deriving nothing', () => {
        let offset = 0;
        const host = render({
            annotations: [
                rectangle(),
                {
                    id: 'anno-polygon',
                    type: 'Annotation',
                    motivation: 'commenting',
                    body: { type: 'TextualBody', value: 'A polygon' },
                    target: {
                        type: 'SpecificResource',
                        source: 'canvas-1',
                        selector: {
                            type: 'SvgSelector',
                            value: '<svg><polygon points="0,0 10,0 5,10"/></svg>',
                        },
                    },
                },
            ],
            canvases: [CANVAS],
            canvasToScreen: (point: { x: number; y: number }) => ({
                x: point.x + offset,
                y: point.y + offset,
            }),
        });

        const layer = document.querySelector(
            '[data-testid="annotation-shapes"]',
        )!;
        const before = [...layer.querySelectorAll('[data-annotation-id]')];
        expect(before).toHaveLength(2);
        const prepared = counts.prepare;

        const observer = new MutationObserver(() => {});
        observer.observe(layer, {
            subtree: true,
            childList: true,
            attributes: true,
        });
        for (let frame = 1; frame <= 3; frame += 1) {
            offset = frame * 10;
            host.tickFrame();
            flushSync();
        }
        const records = observer.takeRecords();
        observer.disconnect();

        expect(counts.prepare).toBe(prepared);
        expect([...layer.querySelectorAll('[data-annotation-id]')]).toEqual(
            before,
        );
        expect(records.length).toBeGreaterThan(0);
        expect(
            records.filter(
                (record) =>
                    record.type !== 'attributes' ||
                    record.attributeName !== 'style',
            ),
        ).toEqual([]);
        expect(shapeElement().style.left).toBe('40px');
    });

    it('re-derives the shapes when the annotation geometry changes', () => {
        const props = $state({
            annotations: [rectangle()],
            canvases: [CANVAS],
        });
        const host = render(props);

        host.tickFrame();
        flushSync();
        const beforeChange = counts.prepare;

        props.annotations = [
            {
                ...rectangle(),
                target: 'https://example.org/image.jpg#xywh=40,40,60,80',
            },
        ];
        flushSync();

        expect(counts.prepare).toBeGreaterThan(beforeChange);
        expect(shapeElement().style.left).toBe('20px');
    });

    it('shows a selection change on the same shape element', () => {
        const host = render({ annotations: [rectangle()], canvases: [CANVAS] });
        const element = shapeElement();
        const fill = () => element.querySelector('.anno-rect-fill')!;
        expect(fill().classList.contains('active')).toBe(false);

        host.tapAt({ x: 20, y: 30 });
        flushSync();

        expect(shapeElement()).toBe(element);
        expect(fill().classList.contains('active')).toBe(true);
    });

    it('reads the layer rect once per animation frame, however many pointer moves land in it', () => {
        const frameCallbacks: FrameRequestCallback[] = [];
        const requestFrame = vi
            .spyOn(window, 'requestAnimationFrame')
            .mockImplementation((callback) => {
                frameCallbacks.push(callback);
                return frameCallbacks.length;
            });
        render({ annotations: [rectangle()], canvases: [CANVAS] });

        const layer = document.querySelector<HTMLElement>(
            '[data-testid="annotation-shapes"]',
        )!;
        const rectReads = vi.spyOn(layer, 'getBoundingClientRect');
        const renderer = document.querySelector(
            '[data-testid="stub-renderer"]',
        )!;
        const move = (clientX: number) => {
            renderer.dispatchEvent(
                new MouseEvent('pointermove', {
                    bubbles: true,
                    clientX,
                    clientY: 30,
                }),
            );
            flushSync();
        };
        const tooltip = () =>
            document
                .querySelector('.readonly-tooltip')
                ?.getAttribute('data-tip') ?? null;

        for (const x of [12, 14, 16, 18, 20]) move(x);
        expect(rectReads).toHaveBeenCalledTimes(1);
        expect(tooltip()).toBe('A region worth marking');

        for (const callback of frameCallbacks.splice(0)) callback(0);
        move(5);
        move(20);
        expect(rectReads).toHaveBeenCalledTimes(2);
        expect(tooltip()).toBe('A region worth marking');

        requestFrame.mockRestore();
    });
});
