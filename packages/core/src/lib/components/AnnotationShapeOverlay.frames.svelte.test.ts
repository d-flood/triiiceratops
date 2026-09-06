/**
 * What the overlay does on the frame tick, and what it refuses to do again.
 *
 * A pan or a zoom moves every shape on screen without changing a word of its
 * tooltip or a number of its canvas-space geometry, so those are prepared once
 * and only projected per frame. The counters below are the assertion: the real
 * helpers run, wrapped so the test can say how often each half was asked.
 */

import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const counts = vi.hoisted(() => ({ prepare: 0, project: 0 }));

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
        projectPreparedShapes: (
            ...args: Parameters<typeof actual.projectPreparedShapes>
        ) => {
            counts.project += 1;
            return actual.projectPreparedShapes(...args);
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
        counts.project = 0;
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
        const projectedOnce = counts.project;
        expect(preparedOnce).toBeGreaterThan(0);
        expect(projectedOnce).toBeGreaterThan(0);

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
        expect(counts.project).toBe(projectedOnce + 4);

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
        expect(counts.project).toBe(0);
    });
});
