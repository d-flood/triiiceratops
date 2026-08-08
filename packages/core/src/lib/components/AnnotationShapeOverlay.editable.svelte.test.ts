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
