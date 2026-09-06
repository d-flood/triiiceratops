/**
 * The **editable** annotation shape: a focusable, labelled target with
 * Enter/Space activation (ticket 14, spec §Overlays and accessibility).
 *
 * > The canvas paints pixels; a parallel DOM layer carries the focusable,
 * > labelled targets.
 *
 * This is the branch that rule is about, and it is the one branch of the overlay
 * nothing else executes: it is gated on the annotation-editor plugin's toolbar
 * button, and that plugin is paused for this phase, so the viewer, the demo page,
 * and the whole e2e suite reach only the read-only shapes. `a11y-axe` cannot
 * notice: an element that is never rendered has nothing to fail.
 *
 * Seeding `pluginMenuButtons` with a stub button reaches it, which turns "the
 * accessible targets are preserved by construction" into an assertion — and
 * protects it from silent rot, since a rename of `annotationEditBus.requestEdit`,
 * a change to the shape of `pluginMenuButtons`, or a renamed `parseAnnotations`
 * field would all still compile.
 */

import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AnnotationShapeOverlayTestHost from './AnnotationShapeOverlayTestHost.svelte';

/** One commenting annotation on a known canvas-space box. */
const RECTANGLE = {
    id: 'anno-rectangle',
    type: 'Annotation',
    motivation: 'commenting',
    body: { type: 'TextualBody', value: 'A region worth marking' },
    target: 'canvas-1#xywh=10,20,30,40',
};

const POINT = {
    id: 'anno-point',
    type: 'Annotation',
    motivation: 'commenting',
    body: { type: 'TextualBody', value: 'A point worth marking' },
    target: {
        type: 'SpecificResource',
        source: 'canvas-1',
        selector: { type: 'PointSelector', x: 60, y: 80 },
    },
};

const POLYGON = {
    id: 'anno-polygon',
    type: 'Annotation',
    motivation: 'commenting',
    body: { type: 'TextualBody', value: 'A shape worth marking' },
    target: {
        type: 'SpecificResource',
        source: 'canvas-1',
        selector: {
            type: 'SvgSelector',
            value: '<svg><polygon points="10,10 40,10 40,50" /></svg>',
        },
    },
};

describe('AnnotationShapeOverlay — the editable shape', () => {
    let mounted: ReturnType<typeof mount> | null = null;

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
            props: { annotations: [RECTANGLE], ...props },
        });
        flushSync();
    }

    /**
     * The buttons the OVERLAY owns.
     *
     * Scoped to the shape layer because the host renders stage chrome beside it —
     * a document-wide `button` query would count the toolbar stub.
     */
    function shapeButtons(): HTMLButtonElement[] {
        const layer = document.querySelector(
            '[data-testid="annotation-shapes"]',
        );
        return [...(layer?.querySelectorAll('button') ?? [])];
    }

    it('is a real button carrying the annotation body as its accessible name', () => {
        render({ editorOpen: true });

        const buttons = shapeButtons();
        expect(buttons).toHaveLength(1);
        expect(buttons[0].getAttribute('aria-label')).toBe(
            'A region worth marking',
        );
        // Focusable means genuinely focusable, not merely `<button>`-shaped: a
        // `pointer-events: none` ancestor would not stop this, but `disabled`,
        // `inert`, or `tabindex="-1"` would.
        buttons[0].focus();
        expect(document.activeElement).toBe(buttons[0]);
    });

    it('has no focusable target at all while the editor is closed', () => {
        render({ editorOpen: false });

        // The read-only shape is drawn and inert — a drag starting on top of an
        // annotation must still pan the image.
        expect(shapeButtons()).toHaveLength(0);
        expect(
            document.querySelector('[data-annotation-id="anno-rectangle"]'),
        ).not.toBeNull();
    });

    it.each([
        ['Enter', 'Enter'],
        ['Space', ' '],
    ])('requests an edit on %s', (_name, key) => {
        const requestEdit = vi.fn();
        render({ editorOpen: true, requestEdit });

        const [button] = shapeButtons();
        button.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true }),
        );

        expect(requestEdit).toHaveBeenCalledWith('anno-rectangle');
    });

    it('ignores other keys, so typing is not an edit request', () => {
        const requestEdit = vi.fn();
        render({ editorOpen: true, requestEdit });

        shapeButtons()[0].dispatchEvent(
            new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
        );

        expect(requestEdit).not.toHaveBeenCalled();
    });

    it('gives every shape type a labelled button, not just rectangles', () => {
        render({
            annotations: [RECTANGLE, POINT, POLYGON],
            editorOpen: true,
        });

        const names = shapeButtons().map((button) =>
            button.getAttribute('aria-label'),
        );
        expect(names).toEqual([
            'A region worth marking',
            'A point worth marking',
            'A shape worth marking',
        ]);
    });

    it('is positioned from the projected geometry, in surface-local pixels', () => {
        // A scale-and-offset stand-in for the renderer, so the button's inline
        // style is arithmetic this test states rather than reads back.
        render({
            editorOpen: true,
            canvasToScreen: (point: { x: number; y: number }) => ({
                x: point.x * 2 + 5,
                y: point.y * 2 + 7,
            }),
        });

        const style = shapeButtons()[0].style;
        expect(style.left).toBe('25px');
        expect(style.top).toBe('47px');
        expect(style.width).toBe('60px');
        expect(style.height).toBe('80px');
    });
});

/**
 * The read-only hover tooltip, and the element it listens on.
 *
 * A read-only shape takes no pointer events — a drag starting over one must still
 * pan the image — so its hover state comes from a hit test on the stage rather
 * than from `:hover`. The stage also holds the toolbar, the canvas-nav chrome and
 * the error covers, where the previous renderer's handler was on its own root; without narrowing, hovering a toolbar button that overlaps an
 * annotation pops that annotation's tooltip.
 */
describe('AnnotationShapeOverlay — the read-only tooltip', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    /** A pointer move over `testId`, at a point inside the rectangle above. */
    function moveOver(testId: string): void {
        document.querySelector(`[data-testid="${testId}"]`)!.dispatchEvent(
            new MouseEvent('pointermove', {
                bubbles: true,
                clientX: 20,
                clientY: 30,
            }),
        );
        flushSync();
    }

    function tooltip(): string | null {
        return (
            document
                .querySelector('.readonly-tooltip')
                ?.getAttribute('data-tip') ?? null
        );
    }

    beforeEach(() => {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: { annotations: [RECTANGLE] },
        });
        flushSync();
    });

    it('shows the annotation body for a move over the renderer', () => {
        moveOver('stub-renderer');
        expect(tooltip()).toBe('A region worth marking');
    });

    it('stays closed for a move over stage chrome at the same point', () => {
        moveOver('stub-chrome');
        expect(tooltip()).toBeNull();
    });

    it('closes again when the pointer leaves the image for the chrome', () => {
        moveOver('stub-renderer');
        expect(tooltip()).not.toBeNull();

        moveOver('stub-chrome');
        expect(tooltip()).toBeNull();
    });
});

/**
 * More than one canvas on screen: a facing-page spread, and a run of folios in
 * continuous mode.
 *
 * The overlay used to read `viewerState.canvasId` — one canvas — so the facing
 * page's annotations were drawn nowhere at all, and anything it did draw was
 * projected through the current canvas's rect. Both halves are asserted here: that
 * every canvas on screen contributes shapes, and that each shape went through ITS
 * OWN canvas's placement, which is the only thing that puts a mark on the right
 * page.
 */
describe('AnnotationShapeOverlay — more than one canvas on screen', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    /** The same box on each of two pages. */
    const VERSO_NOTE = {
        id: 'anno-verso',
        type: 'Annotation',
        motivation: 'commenting',
        body: { type: 'TextualBody', value: 'On the verso' },
        target: 'canvas-2#xywh=10,20,30,40',
    };

    /**
     * A spread's placement: page two sits a page-width plus a gap to the right,
     * which is what the renderer's layout does and what `canvasToScreen(point,
     * canvasId)` answers with.
     */
    const PAGE_OFFSET = 500;

    function renderSpread() {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: {
                annotationsByCanvas: {
                    'canvas-1': [RECTANGLE],
                    'canvas-2': [VERSO_NOTE],
                },
                canvasToScreen: (
                    point: { x: number; y: number },
                    canvasId?: string,
                ) => ({
                    x: point.x + (canvasId === 'canvas-2' ? PAGE_OFFSET : 0),
                    y: point.y,
                }),
            },
        });
        flushSync();
    }

    function shapeFor(annotationId: string): HTMLElement {
        const element = document.querySelector<HTMLElement>(
            `[data-annotation-id="${annotationId}"]`,
        );
        expect(element, `no shape for ${annotationId}`).not.toBeNull();
        return element!;
    }

    it('draws a shape for every canvas on screen, not just the current one', () => {
        renderSpread();

        expect(
            document
                .querySelector('[data-testid="annotation-shapes"]')!
                .querySelectorAll('[data-annotation-id]'),
        ).toHaveLength(2);
    });

    it('projects each shape through its own canvas’s placement', () => {
        renderSpread();

        // Identical geometry on both pages, so the ONLY difference in the result
        // is which canvas answered — a shape projected through the current canvas
        // would land on top of the recto's.
        expect(shapeFor('anno-rectangle').style.left).toBe('10px');
        expect(shapeFor('anno-verso').style.left).toBe(`${10 + PAGE_OFFSET}px`);
        expect(shapeFor('anno-rectangle').style.top).toBe('20px');
        expect(shapeFor('anno-verso').style.top).toBe('20px');
    });

    it('drops a shape whose canvas the renderer cannot place', () => {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: {
                annotationsByCanvas: {
                    'canvas-1': [RECTANGLE],
                    'canvas-2': [VERSO_NOTE],
                },
                // The honest-absence answer: a canvas this renderer has not laid
                // out. Drawing it at the other page's offset would be worse than
                // not drawing it.
                canvasToScreen: (
                    point: { x: number; y: number },
                    canvasId?: string,
                ) => (canvasId === 'canvas-2' ? null : point),
            },
        });
        flushSync();

        expect(
            document.querySelector('[data-annotation-id="anno-rectangle"]'),
        ).not.toBeNull();
        expect(
            document.querySelector('[data-annotation-id="anno-verso"]'),
        ).toBeNull();
    });
});

/**
 * A content-search hit is CANVAS coordinates.
 *
 * The Content Search API returns annotations targeting the Canvas, and a hit is
 * built as `on: "<canvasId>#xywh=…"` with no embedded canvas context — so while
 * the canvas could only come from that context, the target comparison could never
 * be made and every hit fell through to image space. On a manifest whose declared
 * image is not its Canvas's size, that rescaled every highlight by the ratio
 * between them: the same mis-scaling manifest annotations had, reached by a
 * different door, and left behind when that one was fixed.
 *
 * The whole path is exercised — collected for the canvas, parsed against it,
 * classified, and projected — because each step in isolation looks right.
 */
describe('AnnotationShapeOverlay — a search hit', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    /**
     * A Canvas whose declared image is HALF its own size — the case the two
     * spaces stop coinciding in, and the reason the misreading was invisible in
     * every fixture where they match.
     */
    const CANVAS = {
        id: 'canvas-1',
        type: 'Canvas',
        width: 1000,
        height: 1000,
        items: [
            {
                id: 'page-1',
                type: 'AnnotationPage',
                items: [
                    {
                        id: 'painting-1',
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: 'https://example.org/image.jpg',
                            type: 'Image',
                            width: 500,
                            height: 500,
                        },
                        target: 'canvas-1',
                    },
                ],
            },
        ],
    };

    const HIT = {
        '@id': 'urn:search-hit:0',
        '@type': 'oa:Annotation',
        on: 'canvas-1#xywh=100,100,200,200',
        canvasId: 'canvas-1',
        isSearchHit: true,
    };

    it('is drawn at its canvas-space size, not rescaled by the image’s', () => {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: {
                annotations: [],
                searchAnnotations: [HIT],
                canvases: [CANVAS],
            },
        });
        flushSync();

        const shape = document.querySelector<HTMLElement>(
            '[data-annotation-id="urn:search-hit:0"]',
        );
        expect(shape, 'the search hit has no shape').not.toBeNull();
        // `canvasToScreen` is the identity here, so these ARE the canvas-space
        // numbers. Read as image space they would be doubled to 400×400 at
        // (200,200) — the Canvas being twice the declared image.
        expect(shape!.style.width).toBe('200px');
        expect(shape!.style.height).toBe('200px');
        expect(shape!.style.left).toBe('100px');
        expect(shape!.style.top).toBe('100px');
    });

    it('still converts an annotation that really does target the image', () => {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: {
                annotations: [
                    {
                        id: 'anno-on-image',
                        type: 'Annotation',
                        motivation: 'commenting',
                        body: { type: 'TextualBody', value: 'On the image' },
                        // Targets the IMAGE resource, not the canvas: image
                        // pixels, and the conversion still applies.
                        target: 'https://example.org/image.jpg#xywh=100,100,200,200',
                    },
                ],
                canvases: [CANVAS],
            },
        });
        flushSync();

        const shape = document.querySelector<HTMLElement>(
            '[data-annotation-id="anno-on-image"]',
        );
        // Image space → canvas space doubles it: the Canvas is 1000 wide and the
        // image declares 500.
        expect(shape!.style.width).toBe('400px');
        expect(shape!.style.left).toBe('200px');
    });
});

/**
 * Selection from the image, on the one gesture the renderer reserves for it.
 *
 * Driven through `subscribeSurfaceTap` — the seam the real host publishes taps
 * on — rather than by synthesizing pointer events, because what a tap IS was
 * decided by the arbiter (`gestureArbiter.test.ts` asserts that half, including
 * that a held input claim reports none). What is asserted here is the other
 * half: which annotation a tap at a point selects.
 */
describe('AnnotationShapeOverlay — selection', () => {
    let host: { tapAt(point: { x: number; y: number }): void } | null = null;
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
            host = null;
        }
        document.body.innerHTML = '';
    });

    /** The stub viewer state's selection, read back through the host. */
    function selected(): string | null {
        return (
            host as unknown as { selectedAnnotationId(): string | null }
        ).selectedAnnotationId();
    }

    function tap(x: number, y: number): void {
        host!.tapAt({ x, y });
        flushSync();
    }

    function render(annotations: unknown[]): void {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: { annotations },
        });
        host = mounted as never;
        flushSync();
    }

    it('selects the annotation under the tap', () => {
        render([RECTANGLE]);

        // Inside `xywh=10,20,30,40`, which the stub projects unchanged.
        tap(20, 30);
        expect(selected()).toBe('anno-rectangle');
    });

    it('marks the selected shape, so the image shows what the panel says', () => {
        render([RECTANGLE]);
        tap(20, 30);

        expect(
            document.querySelector(
                '[data-annotation-id="anno-rectangle"] .active',
            ),
        ).not.toBeNull();
    });

    it('clears the selection on a tap that hits no shape', () => {
        render([RECTANGLE]);
        tap(20, 30);

        tap(500, 500);
        expect(selected()).toBeNull();
    });

    it('puts a selected annotation down again when it is tapped twice', () => {
        render([RECTANGLE]);

        tap(20, 30);
        tap(20, 30);
        expect(selected()).toBeNull();
    });

    it('selects the topmost shape where two overlap, as a click would', () => {
        // `OVERLAPPING` covers the same box as RECTANGLE and is drawn after it.
        const OVERLAPPING = {
            ...RECTANGLE,
            id: 'anno-on-top',
            body: { type: 'TextualBody', value: 'The one in front' },
        };
        render([RECTANGLE, OVERLAPPING]);

        tap(20, 30);
        expect(selected()).toBe('anno-on-top');
    });

    /**
     * A whole-page annotation is deliberately unselectable from the image: its
     * box answers every tap on the canvas, including the taps that mean "clear
     * the selection". The panel row is how it is reached.
     */
    it('is not selected by a tap when the target is the whole canvas', () => {
        render([
            {
                id: 'anno-whole-canvas',
                type: 'Annotation',
                motivation: 'commenting',
                body: { type: 'TextualBody', value: 'About the whole page' },
                target: 'canvas-1',
                __triiiceratopsCanvas: {
                    id: 'canvas-1',
                    width: 400,
                    height: 400,
                },
            },
        ]);

        tap(20, 30);
        expect(selected()).toBeNull();
    });
});

/**
 * Every shape type, in both states, through the rendered overlay.
 *
 * All three types share one wrapper implementation, so what distinguishes a
 * rectangle from a polygon from a point — its class, its children, and the box
 * it is positioned by — is only true by construction until something asserts
 * it. These are the settled values: the geometry is arithmetic on the identity
 * projection the host supplies, and the pointer-events reading is the
 * pan-versus-tap contract, which is a rule of the component's own stylesheet
 * rather than of any one branch of its markup.
 */
describe('AnnotationShapeOverlay — every shape type in both states', () => {
    let mounted: ReturnType<typeof mount> | null = null;

    afterEach(async () => {
        if (mounted) {
            await unmount(mounted);
            mounted = null;
        }
        document.body.innerHTML = '';
    });

    function render(editorOpen: boolean): void {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: {
                annotations: [RECTANGLE, POLYGON, POINT],
                editorOpen,
            },
        });
        flushSync();
    }

    function wrapper(annotationId: string): HTMLElement {
        const element = document.querySelector<HTMLElement>(
            `[data-testid="annotation-shapes"] [data-annotation-id="${annotationId}"]`,
        );
        expect(element, `no shape for ${annotationId}`).not.toBeNull();
        return element!;
    }

    /** The box a shape was positioned by, as the browser settled it. */
    function box(annotationId: string): Record<string, string> {
        const { style } = wrapper(annotationId);
        return {
            left: style.left,
            top: style.top,
            width: style.width,
            height: style.height,
        };
    }

    /**
     * The projection is the identity, so these ARE the canvas-space numbers: the
     * rectangle's `xywh`, the polygon's bounding box, and a point drawn at the
     * fixed 10px screen diameter centred on (60, 80).
     */
    const GEOMETRY = {
        'anno-rectangle': {
            left: '10px',
            top: '20px',
            width: '30px',
            height: '40px',
        },
        'anno-polygon': {
            left: '10px',
            top: '10px',
            width: '30px',
            height: '40px',
        },
        'anno-point': {
            left: '55px',
            top: '75px',
            width: '10px',
            height: '10px',
        },
    };

    it('positions each shape by its own geometry when read-only', () => {
        render(false);

        for (const [annotationId, expected] of Object.entries(GEOMETRY)) {
            expect(box(annotationId), annotationId).toEqual(expected);
        }
    });

    it('positions each shape by the same geometry when editable', () => {
        render(true);

        for (const [annotationId, expected] of Object.entries(GEOMETRY)) {
            expect(box(annotationId), annotationId).toEqual(expected);
        }
    });

    it('gives a read-only shape an inert wrapper and its own fill', () => {
        render(false);

        for (const annotationId of Object.keys(GEOMETRY)) {
            const element = wrapper(annotationId);
            expect(element.tagName, annotationId).toBe('DIV');
            expect(element.classList.contains('anno-readonly-wrap')).toBe(true);
            // A drag that starts on top of an annotation must still pan.
            expect(getComputedStyle(element).pointerEvents, annotationId).toBe(
                'none',
            );
        }

        expect(
            wrapper('anno-rectangle').querySelector('.anno-rect-fill'),
        ).not.toBeNull();
        expect(
            wrapper('anno-point').querySelector('.anno-point-fill'),
        ).not.toBeNull();
        // The polygon draws itself, in both states, and its SVG opts out of
        // pointer events only while the shape is read-only.
        expect(
            wrapper('anno-polygon')
                .querySelector('.anno-polygon-svg')!
                .classList.contains('readonly'),
        ).toBe(true);
        expect(
            wrapper('anno-polygon')
                .querySelector('polygon')!
                .getAttribute('points'),
        ).toBe('0,0 30,0 30,40');
    });

    it('gives an editable shape its own operable wrapper', () => {
        render(true);

        const classes = {
            'anno-rectangle': 'anno-rect',
            'anno-polygon': 'anno-polygon-btn',
            'anno-point': 'anno-point',
        };
        for (const [annotationId, expected] of Object.entries(classes)) {
            const element = wrapper(annotationId);
            expect(element.tagName, annotationId).toBe('BUTTON');
            expect(element.getAttribute('type'), annotationId).toBe('button');
            expect(element.className.split(' '), annotationId).toContain(
                expected,
            );
            expect(element.getAttribute('id'), annotationId).toMatch(
                /^annotation-visual-/,
            );
            expect(getComputedStyle(element).pointerEvents, annotationId).toBe(
                'auto',
            );
        }

        // The editable arm wears its own treatment: no read-only fill child.
        expect(
            wrapper('anno-rectangle').querySelector('.anno-rect-fill'),
        ).toBeNull();
        expect(
            wrapper('anno-point').querySelector('.anno-point-fill'),
        ).toBeNull();
        expect(
            wrapper('anno-polygon')
                .querySelector('.anno-polygon-shape')!
                .classList.contains('interactive'),
        ).toBe(true);
    });

    it('marks the selected shape of every type on the image', () => {
        mounted = mount(AnnotationShapeOverlayTestHost, {
            target: document.body,
            props: { annotations: [RECTANGLE, POLYGON, POINT] },
        });
        flushSync();

        // Inside the point's marker, which is drawn last and so is on top.
        (
            mounted as never as { tapAt(p: { x: number; y: number }): void }
        ).tapAt({ x: 60, y: 80 });
        flushSync();

        expect(
            wrapper('anno-point').querySelector('.anno-point-fill.active'),
        ).not.toBeNull();
    });
});
