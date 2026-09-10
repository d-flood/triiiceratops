/**
 * **Modal drawing**: arming the rectangle tool turns the whole image into a
 * drawing surface, and a drag on it becomes a persisted annotation.
 *
 * Two claims, and neither can be made anywhere but a browser:
 *
 * - **The image does not move.** This is the invariant the whole modal
 *   mechanism rests on, and the exact inverse of `a drag in a layer's empty
 *   space still pans the image` in the overlay-layer spec: there, the layer is
 *   click-through and the drag pans; here it is armed and the drag draws. The
 *   viewport is read mid-drag as well as after, because a pan that was started
 *   and then undone would leave the two ends equal.
 * - **The round trip.** Drawn, persisted through the LocalStorage **adapter**,
 *   and after a reload rendered by CORE's own shape overlay at the same canvas
 *   coordinates. The rectangle is placed against the same coordinate model
 *   every other geometric claim in this suite is gated against
 *   (`predictScreenPoint`), so a rect persisted in screen or image space lands
 *   somewhere else and fails here.
 *
 * The fixture loads core from source and the plugin from its BUILT dist — see
 * `public/e2e/annotation-editor-drawing.html` for why the pair is split that
 * way.
 */

import { existsSync } from 'node:fs';

import { expect, test, type Locator, type Page } from '@playwright/test';

import {
    PLUGIN_IIFE,
    serveAnnotationEditorDist,
} from './helpers/annotationEditorDist';
import {
    findFeature,
    getView,
    predictScreenPoint,
    setView,
    type RendererView,
} from './helpers/numberedGrid';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/annotation-editor-drawing.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
/** The plugin's in-progress preview rectangle. */
const DRAFT = '[data-testid="annotation-draft"]';
/** Core's toolbar button for this plugin — how a reader dismisses the panel. */
const EDITOR_TOGGLE = '[data-plugin-toggle="annotation-editor"]';

/** One stored rectangle, as the spec needs to read it back. */
interface StoredRect {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The viewport every test below drives from: the canvas centred at 1:1.
 *
 * Adopted rather than arrived at. The fixture opens two panels, each of which
 * animates a column out of the stage while the renderer re-measures, so the
 * view a drag is planned against and the view it lands in would otherwise be
 * different ones. At 1:1 a canvas pixel is a CSS pixel, which is also what makes
 * the sub-threshold drag below expressible: two screen pixels are two canvas
 * pixels, under the minimum-size guard rather than over it.
 */
const VIEW = { centre: { x: 600, y: 450 }, scale: 1 };

/**
 * `query` is appended to the fixture URL, for the one spec that needs the
 * viewer configured differently — a non-default point-marker radius.
 */
async function openFixture(page: Page, query = ''): Promise<void> {
    await page.goto(`${FIXTURE}${query}`, { waitUntil: 'domcontentloaded' });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    // Until a feature is findable the canvas is painted but empty, and the
    // renderer has not settled on a view to adopt from.
    await expect
        .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
        .not.toBeNull();
    await settleSurface(page);
    await setView(page, VIEW);
}

/** Wait until the panels have finished animating the stage narrower. */
async function settleSurface(page: Page): Promise<void> {
    let previous = -1;
    await expect
        .poll(async () => {
            const { width } = await getView(page);
            const stable = width === previous;
            previous = width;
            return stable;
        })
        .toBe(true);
}

/**
 * Wait until the viewport has stopped moving.
 *
 * A released pan carries momentum for several frames, so a view read straight
 * after `mouse.up` is a view the next assertion will not still be looking at.
 */
async function settleView(page: Page): Promise<void> {
    let previous = Number.NaN;
    await expect
        .poll(async () => {
            const { centre } = await getView(page);
            const stable = centre.x === previous;
            previous = centre.x;
            return stable;
        })
        .toBe(true);
}

/**
 * Where a canvas-space point currently is on the page.
 *
 * The screen half comes from `predictScreenPoint` — the coordinate model
 * written out independently — so a drag aimed at a canvas point and a rectangle
 * persisted in canvas coordinates are compared through the same model every
 * other geometric claim in this suite goes through.
 */
async function pageAt(
    page: Page,
    canvasPoint: { x: number; y: number },
    view: RendererView,
): Promise<{ x: number; y: number }> {
    const surface = (await page.locator(SURFACE).boundingBox())!;
    const predicted = predictScreenPoint(canvasPoint, view);
    return { x: surface.x + predicted.x, y: surface.y + predicted.y };
}

/** Arm a tool from the panel: create mode, then the tool. */
async function armTool(page: Page, tool: string): Promise<void> {
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('button', { name: tool }).click();
}

async function armRectangle(page: Page): Promise<void> {
    await armTool(page, 'Rectangle');
}

/** The LocalStorage adapter's frozen 1.0 namespace prefix. */
const STORAGE_PREFIX = '@triiiceratops/plugin-annotation-editor:v1';

/** The commentary written into the body editor on the annotation just drawn. */
const BODY_TEXT = 'The rubricated initial';

/**
 * One stored annotation, reduced to what the readers below ask about.
 *
 * The `SvgSelector`'s `<polygon>` is parsed in the page rather than here,
 * because that is the way core's own parser reads one and the test suite has no
 * DOM of its own. An ellipse is indistinguishable from a clicked-out outline in
 * this shape, which is the point — nothing records that a shape was drawn as an
 * ellipse.
 */
interface StoredAnnotation {
    id: string;
    /** The selector's `type`, or `null` for a whole-canvas annotation. */
    selector: string | null;
    /** A `FragmentSelector`'s `xywh=`, or `null` for anything else. */
    fragment: string | null;
    /** A `PointSelector`'s coordinates, or `null` for anything else. */
    point: { x: number; y: number } | null;
    /** An `SvgSelector`'s `<polygon>` vertices, or `null` for anything else. */
    polygon: { x: number; y: number }[] | null;
    /** The annotation's bodies, always as a list. */
    bodies: { value?: string }[];
}

/**
 * Every annotation the LocalStorage adapter has stored, across every canvas key
 * in its namespace. One scan behind all the readers below, so each of them is
 * only the question it asks.
 */
async function storedAnnotations(page: Page): Promise<StoredAnnotation[]> {
    return page.evaluate((prefix) => {
        const annotations: StoredAnnotation[] = [];
        for (let index = 0; index < localStorage.length; index++) {
            const key = localStorage.key(index);
            if (!key?.startsWith(prefix)) continue;
            const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
            for (const annotation of stored) {
                const selector = annotation?.target?.selector;
                const vertices =
                    selector?.type === 'SvgSelector'
                        ? new DOMParser()
                              .parseFromString(selector.value, 'image/svg+xml')
                              .querySelector('polygon')
                              ?.getAttribute('points')
                        : null;
                annotations.push({
                    id: annotation.id,
                    selector: selector?.type ?? null,
                    fragment:
                        selector?.type === 'FragmentSelector'
                            ? selector.value
                            : null,
                    point:
                        selector?.type === 'PointSelector'
                            ? { x: selector.x, y: selector.y }
                            : null,
                    polygon: vertices
                        ? vertices
                              .trim()
                              .split(/\s+/)
                              .map((pair: string) => {
                                  const [x, y] = pair.split(',').map(Number);
                                  return { x, y };
                              })
                        : null,
                    bodies: [annotation.body ?? []].flat(),
                });
            }
        }
        return annotations;
    }, STORAGE_PREFIX) as Promise<StoredAnnotation[]>;
}

/** Every polygon the LocalStorage adapter has stored. */
async function storedPolygons(page: Page): Promise<StoredPolygon[]> {
    return (await storedAnnotations(page))
        .filter((annotation) => annotation.polygon !== null)
        .map((annotation) => ({
            id: annotation.id,
            points: annotation.polygon as { x: number; y: number }[],
        }));
}

/** Every rectangle the LocalStorage adapter has stored for this canvas. */
async function storedRects(page: Page): Promise<StoredRect[]> {
    const rects: StoredRect[] = [];
    for (const annotation of await storedAnnotations(page)) {
        const match = /^xywh=(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(
            annotation.fragment ?? '',
        );
        if (!match) continue;
        rects.push({
            id: annotation.id,
            x: Number(match[1]),
            y: Number(match[2]),
            width: Number(match[3]),
            height: Number(match[4]),
        });
    }
    return rects;
}

/** Every stored point, read as a `PointSelector` and nothing else. */
async function storedPoints(
    page: Page,
): Promise<{ id: string; x: number; y: number }[]> {
    return (await storedAnnotations(page))
        .filter((annotation) => annotation.point !== null)
        .map((annotation) => ({
            id: annotation.id,
            ...(annotation.point as { x: number; y: number }),
        }));
}

/** Every stored annotation's id beside the selector kind it carries. */
async function storedSelectorKinds(
    page: Page,
): Promise<{ id: string; selector: string | null }[]> {
    return (await storedAnnotations(page)).map((annotation) => ({
        id: annotation.id,
        selector: annotation.selector,
    }));
}

/** The text of the first body stored against one annotation, if any. */
async function storedBodyText(
    page: Page,
    annotationId: string,
): Promise<string | null> {
    const annotation = (await storedAnnotations(page)).find(
        (candidate) => candidate.id === annotationId,
    );
    return annotation?.bodies[0]?.value ?? null;
}

/** One stored polygon, read back out of its `SvgSelector`. */
interface StoredPolygon {
    id: string;
    points: { x: number; y: number }[];
}

/** The axis-aligned box a set of canvas-space points spans. */
function boundsOf(points: { x: number; y: number }[]): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

test.describe('annotation editor drawing', () => {
    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    test('an armed drag draws instead of panning, and the image does not move', async ({
        page,
    }) => {
        await openFixture(page);
        await armRectangle(page);

        const view = await getView(page);
        const from = await pageAt(page, { x: 500, y: 380 }, view);
        const to = await pageAt(page, { x: 700, y: 520 }, view);

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });

        // Mid-drag, which is where a pan would be visible: a pan started and
        // then settled back would leave the two ENDS equal and this spec blind.
        const during = await getView(page);
        expect(during.centre.x).toBeCloseTo(view.centre.x, 5);
        expect(during.centre.y).toBeCloseTo(view.centre.y, 5);
        expect(during.scale).toBeCloseTo(view.scale, 5);

        // And the drag is drawing — without this the assertion above would pass
        // just as well for a layer that swallowed the gesture and did nothing.
        await expect(page.locator(DRAFT)).toBeVisible();

        await page.mouse.up();

        const after = await getView(page);
        expect(after.centre.x).toBeCloseTo(view.centre.x, 5);
        expect(after.centre.y).toBeCloseTo(view.centre.y, 5);
        expect(after.scale).toBeCloseTo(view.scale, 5);
    });

    test('a sub-threshold drag creates nothing', async ({ page }) => {
        await openFixture(page);
        await armRectangle(page);

        const view = await getView(page);
        const origin = await pageAt(page, { x: 600, y: 450 }, view);

        // Two screen pixels, which at 1:1 are two canvas pixels: the hand jitter
        // the minimum-size guard exists to discard.
        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        await page.mouse.move(origin.x + 2, origin.y + 2);
        await page.mouse.up();

        // Polled rather than read once: a create that DID reach the store would
        // arrive asynchronously, so an immediate read could pass by racing it.
        await expect.poll(() => storedRects(page)).toEqual([]);
    });

    test('a drawn rectangle persists in canvas coordinates and survives a reload', async ({
        page,
    }) => {
        await openFixture(page);
        await armRectangle(page);

        // The region aimed at, in the canvas's own coordinates. Drawn from its
        // bottom-right to its top-left, so the normalisation into a positive
        // width and height is exercised by the same drag.
        const region = { x: 500, y: 380, width: 200, height: 140 };
        const view = await getView(page);
        const from = await pageAt(
            page,
            { x: region.x + region.width, y: region.y + region.height },
            view,
        );
        const to = await pageAt(page, { x: region.x, y: region.y }, view);

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();

        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [stored] = await storedRects(page);

        // Canvas space, not screen space. At 1:1 the two agree in SIZE, which is
        // why the origin carries the claim: the canvas is centred in a stage a
        // few hundred pixels across, so its screen origin is nowhere near its
        // canvas origin.
        expect(Math.abs(stored.x - region.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(stored.y - region.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(stored.width - region.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(stored.height - region.height)).toBeLessThanOrEqual(1);

        // The body editor opened on the annotation that was just created, and a
        // body written into it persists — which is what makes a drawn region
        // worth drawing.
        await page.getByRole('button', { name: 'Add Content' }).click();
        await page.getByPlaceholder('Enter text...').fill(BODY_TEXT);
        await page.getByRole('button', { name: 'Save Changes' }).click();
        await expect
            .poll(() => storedBodyText(page, stored.id))
            .toBe(BODY_TEXT);

        // The round trip. After a reload nothing of the drawing layer is
        // involved: the shape on screen is CORE's own, hydrated from the adapter
        // through the store's display sync.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        const shape = page.locator(`[data-annotation-id="${stored.id}"]`);
        await shape.waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);

        const reloaded = await getView(page);
        const predicted = predictScreenPoint(
            { x: stored.x, y: stored.y },
            reloaded,
        );
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const shapeBox = (await shape.boundingBox())!;

        expect(
            Math.abs(shapeBox.x - surface.x - predicted.x),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(shapeBox.y - surface.y - predicted.y),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(shapeBox.width - stored.width * reloaded.scale),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(shapeBox.height - stored.height * reloaded.scale),
        ).toBeLessThanOrEqual(1);
    });
});

/*
 * **Navigation while a tool is armed.** Modal drawing takes the whole surface,
 * and without these four the reader is pinned at one zoom and one position for
 * the length of a shape.
 *
 * Two of them the plugin does not implement and must not break. The wheel is
 * bound on the STAGE, which accepts events raised inside a
 * `.plugin-overlay-layer`; the pan keys are bound on the RENDERER ROOT, which
 * core refocuses after a press on a layer that offers no control of its own.
 * `canvas-renderer-overlay-layer.spec.ts` proves both for a synthetic layer —
 * these prove them for the real drawing layer, armed, which is the case a
 * consumer meets. A failure here is the drawing layer consuming the wheel or
 * holding on to focus, never core lacking something.
 *
 * The rest are the layer's own: Space drops it back to click-through for as long
 * as it is held, and the two exits from arming — Escape, and closing the panel —
 * give the surface back for good.
 */
test.describe('navigation while a tool is armed', () => {
    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    test('wheel zoom and arrow-key pan still act while a tool is armed', async ({
        page,
    }) => {
        await openFixture(page);
        await armRectangle(page);

        const before = await getView(page);
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const centre = {
            x: surface.x + surface.width / 2,
            y: surface.y + surface.height / 2,
        };

        await page.mouse.move(centre.x, centre.y);
        await page.mouse.wheel(0, -400);
        await expect
            .poll(async () => (await getView(page)).scale)
            .toBeGreaterThan(before.scale * 1.05);

        // The keyboard half needs the focus core hands back, so the press comes
        // first — and it is a press on the ARMED surface, which is the whole
        // point: a layer that kept the focus would strand the pan keys. A
        // click is a zero-size drag, discarded by the minimum-size guard.
        await page.mouse.click(centre.x, centre.y);
        expect(
            await page.evaluate(
                () =>
                    document
                        .getElementById('v')
                        ?.shadowRoot?.activeElement?.getAttribute(
                            'data-testid',
                        ) ?? null,
            ),
        ).toBe('canvas-renderer-root');

        const beforePan = await getView(page);
        await page.keyboard.down('ArrowRight');
        // `ArrowRight` moves the viewport CENTRE right, scrollbar-sense.
        await expect
            .poll(async () => (await getView(page)).centre.x)
            .toBeGreaterThan(beforePan.centre.x + 10);
        await page.keyboard.up('ArrowRight');
    });

    test('holding Space pans by drag, and releasing it returns the surface to drawing', async ({
        page,
    }) => {
        await openFixture(page);
        await armRectangle(page);

        const view = await getView(page);
        const from = await pageAt(page, { x: 600, y: 450 }, view);

        // Focus is still on the tool button the click above armed. Space must
        // not activate it, and must not scroll the page: the layer suppresses
        // the default wherever the key lands.
        await page.keyboard.down(' ');
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x - 80, from.y, { steps: 8 });

        // Mid-drag: a released pan carries momentum, and reading only the ends
        // would confuse "panned and settled back" with "panned".
        const during = await getView(page);
        expect(during.centre.x).toBeCloseTo(view.centre.x + 80 / view.scale, 5);
        // Nothing was drawn on the way: the surface was click-through, so the
        // gesture never reached the layer at all.
        await expect(page.locator(DRAFT)).toHaveCount(0);

        await page.mouse.up();
        await page.keyboard.up(' ');
        await settleView(page);

        // Released, the tool is still armed and the very next drag draws again.
        const resumed = await getView(page);
        const drawFrom = await pageAt(page, { x: 500, y: 380 }, resumed);
        const drawTo = await pageAt(page, { x: 700, y: 520 }, resumed);
        await page.mouse.move(drawFrom.x, drawFrom.y);
        await page.mouse.down();
        await page.mouse.move(drawTo.x, drawTo.y, { steps: 8 });

        await expect(page.locator(DRAFT)).toBeVisible();
        const drawing = await getView(page);
        expect(drawing.centre.x).toBeCloseTo(resumed.centre.x, 5);
        expect(drawing.centre.y).toBeCloseTo(resumed.centre.y, 5);
        await page.mouse.up();
    });

    test('a Space-drag commits nothing', async ({ page }) => {
        await openFixture(page);
        await armRectangle(page);

        const view = await getView(page);
        const from = await pageAt(page, { x: 500, y: 380 }, view);
        const to = await pageAt(page, { x: 700, y: 520 }, view);

        // Far above the minimum-size guard, so an annotation appearing here
        // would be a shape the pan committed rather than jitter it discarded.
        await page.keyboard.down(' ');
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();
        await page.keyboard.up(' ');

        // Polled: a create that DID reach the store arrives asynchronously, so
        // an immediate read could pass by racing it.
        await expect.poll(() => storedRects(page)).toEqual([]);
    });

    test('a Space-drag over the shape an armed tool placed pans instead of reshaping it', async ({
        page,
    }) => {
        const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';
        const EDIT_BODY = '[data-testid="annotation-edit-body"]';
        /** The plugin's default shape fraction, restated independently. */
        const DEFAULT_FRACTION = 0.25;

        await openFixture(page);

        // Armed from the KEYBOARD, because activating a tool that way places
        // its default shape: that is the one state in which a shape is open
        // for editing while a tool is still armed, and so the only place the
        // edit box and the Space escape hatch are live at the same moment.
        await page.getByRole('button', { name: 'Create', exact: true }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Rectangle' }).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();

        const view = await getView(page);
        // Centred on the view, so the drag below starts inside its hit box —
        // which is the whole failing case: anywhere else falls through.
        const placed = {
            x:
                view.centre.x -
                ((view.width / view.scale) * DEFAULT_FRACTION) / 2,
            y:
                view.centre.y -
                ((view.height / view.scale) * DEFAULT_FRACTION) / 2,
            width: (view.width / view.scale) * DEFAULT_FRACTION,
            height: (view.height / view.scale) * DEFAULT_FRACTION,
        };
        const from = await pageAt(page, view.centre, view);

        await page.keyboard.down(' ');
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x - 80, from.y, { steps: 8 });

        // Mid-drag, before the release carries momentum: the IMAGE moved.
        const during = await getView(page);
        expect(during.centre.x).toBeCloseTo(view.centre.x + 80 / view.scale, 5);

        await page.mouse.up();
        await page.keyboard.up(' ');
        await settleView(page);

        // And the shape did not. Read through the projection at the view the
        // pan left behind: a box that had been dragged with the pointer would
        // still be under the cursor and so 80 canvas pixels to the left here.
        const after = await getView(page);
        const predicted = predictScreenPoint(
            { x: placed.x, y: placed.y },
            after,
        );
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const body = (await page.locator(EDIT_BODY).boundingBox())!;
        expect(Math.abs(body.x - surface.x - predicted.x)).toBeLessThanOrEqual(
            1,
        );
        expect(Math.abs(body.y - surface.y - predicted.y)).toBeLessThanOrEqual(
            1,
        );
        expect(
            Math.abs(body.width - placed.width * after.scale),
        ).toBeLessThanOrEqual(1);

        // Nothing reached storage either: the shape is still uncommitted, so a
        // write here would be the reshape persisting behind the pan.
        await expect.poll(() => storedRects(page)).toEqual([]);

        // Space up, the box is inert again and a drag across it draws a new
        // shape rather than reshaping the one under the pointer.
        const drawFrom = await pageAt(page, after.centre, after);
        await page.mouse.move(drawFrom.x, drawFrom.y);
        await page.mouse.down();
        await page.mouse.move(drawFrom.x + 120, drawFrom.y + 90, { steps: 8 });
        await expect(page.locator(DRAFT)).toBeVisible();
        await page.mouse.up();
    });

    test('Escape disarms the tool and discards the shape in progress', async ({
        page,
    }) => {
        await openFixture(page);
        await armRectangle(page);

        const view = await getView(page);
        const from = await pageAt(page, { x: 500, y: 380 }, view);
        const to = await pageAt(page, { x: 700, y: 520 }, view);

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await expect(page.locator(DRAFT)).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(page.locator(DRAFT)).toHaveCount(0);
        await page.mouse.up();
        await expect.poll(() => storedRects(page)).toEqual([]);

        // Disarmed for good, not just for that shape: the surface is the
        // renderer's again and the next drag pans.
        const after = await getView(page);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x - 80, from.y, { steps: 8 });
        const during = await getView(page);
        await page.mouse.up();

        expect(during.centre.x).toBeCloseTo(
            after.centre.x + 80 / after.scale,
            5,
        );
        await expect(page.locator(DRAFT)).toHaveCount(0);
    });

    test('closing the panel disarms the tool and hands the image back', async ({
        page,
    }) => {
        await openFixture(page);
        await armRectangle(page);

        /*
         * A rectangle drawn first, so the drag after the close has something to
         * damage as well as somewhere to pan. It also leaves the body editor
         * open on the shape just created — an uncommitted edit for the close to
         * cancel rather than save.
         */
        const region = { x: 500, y: 380, width: 200, height: 140 };
        const drawView = await getView(page);
        const drawFrom = await pageAt(page, region, drawView);
        const drawTo = await pageAt(
            page,
            { x: region.x + region.width, y: region.y + region.height },
            drawView,
        );
        await page.mouse.move(drawFrom.x, drawFrom.y);
        await page.mouse.down();
        await page.mouse.move(drawTo.x, drawTo.y, { steps: 8 });
        await page.mouse.up();
        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [drawn] = await storedRects(page);
        await expect(
            page.getByRole('button', { name: 'Add Content' }),
        ).toBeVisible();

        /*
         * The toolbar button, which is the close a reader actually performs —
         * and the one core mounts no lifecycle event behind: the panel's content
         * element is re-parented out of the surface, not destroyed.
         *
         * Pressed from the keyboard rather than clicked. In this fixture's
         * 1280px stage the open panel's tool row overlaps its own rail button,
         * so a pointer click is intercepted by the panel; the keyboard reaches
         * the same handler, and is a reader's path in its own right.
         */
        await page.locator(EDITOR_TOGGLE).focus();
        await page.keyboard.press('Enter');
        await expect(
            page.getByRole('button', { name: 'Create', exact: true }),
        ).toBeHidden();
        // The panel's column leaves the stage, and the renderer re-measures.
        await settleSurface(page);
        await settleView(page);

        /*
         * The claim is that the VIEWPORT moves. Reading `armedTool` back would
         * pass just as well on a fix that cleared the state variable while the
         * layer went on holding `pointer-events` across the whole surface, and
         * the trap is the pointer-events fact. Read mid-drag, because a pan
         * that was started and then settled back leaves the two ends equal.
         */
        const after = await getView(page);
        const from = await pageAt(page, { x: 500, y: 600 }, after);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(from.x - 80, from.y, { steps: 8 });
        const during = await getView(page);
        await page.mouse.up();

        expect(during.centre.x).toBeCloseTo(
            after.centre.x + 80 / after.scale,
            5,
        );
        await expect(page.locator(DRAFT)).toHaveCount(0);
        // Nothing created and nothing reshaped by the drag that panned, and the
        // annotation the body editor had open was cancelled rather than written.
        await expect.poll(() => storedRects(page)).toEqual([drawn]);
    });
});

/*
 * **Editing a persisted annotation.** Tapping a shape the viewer drew opens it
 * with handles, and dragging one reshapes it through the store's normal write
 * path — so display sync, id reconciliation and the undo/redo stack all apply.
 *
 * The claim that cannot be made anywhere but here is the COUNT. Core renders
 * and selects the whole persisted set; the drawing layer renders the one under
 * edit, and the two agree only because core drops that one annotation while the
 * edit channel names it. A spec that asserted a shape merely EXISTS would pass
 * just as well with the shape drawn twice, which is the failure this guards.
 */
test.describe('editing a persisted annotation', () => {
    /** Core's own rendering of an annotation, and the editor's, share this. */
    const shapeOf = (id: string) => `[data-annotation-id="${id}"]`;
    const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';
    const HANDLE = '[data-testid="annotation-edit-handle"]';

    /** The region every test below draws before it edits, in canvas space. */
    const REGION = { x: 500, y: 380, width: 200, height: 140 };

    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    /** Drag a rectangle over `REGION` and return the annotation it persisted. */
    async function drawRegion(page: Page): Promise<StoredRect> {
        await armRectangle(page);
        const view = await getView(page);
        const from = await pageAt(page, { x: REGION.x, y: REGION.y }, view);
        const to = await pageAt(
            page,
            { x: REGION.x + REGION.width, y: REGION.y + REGION.height },
            view,
        );

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();

        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        return (await storedRects(page))[0]!;
    }

    /**
     * Back to a loaded viewer with nothing selected, the shape hydrated from
     * storage and drawn by CORE.
     *
     * A reload rather than a cancel: it is the state a reader who comes back to
     * their annotations meets, and it leaves the panel in its default Edit mode
     * with no selection carried over from the drag that created the shape.
     */
    async function reopen(page: Page, id: string): Promise<void> {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(shapeOf(id))
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);
    }

    /** Open the persisted shape for editing by tapping it. */
    async function openForEditing(page: Page, id: string): Promise<void> {
        await page.locator(shapeOf(id)).first().click();
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
    }

    /** Where a canvas point currently is on the page, at the settled view. */
    async function at(
        page: Page,
        point: { x: number; y: number },
    ): Promise<{ x: number; y: number }> {
        return pageAt(page, point, await getView(page));
    }

    test('the annotation being edited is rendered once', async ({ page }) => {
        await openFixture(page);
        const stored = await drawRegion(page);
        await reopen(page, stored.id);

        // One before: core's own shape, which is what a reader sees and taps.
        await expect(page.locator(shapeOf(stored.id))).toHaveCount(1);

        await openForEditing(page, stored.id);

        // And one after — not two. The rendering has CHANGED HANDS, which is
        // the whole point of the suppression channel: core dropped its shape
        // for this annotation because the editor is drawing it.
        await expect(page.locator(shapeOf(stored.id))).toHaveCount(1);
        await expect(
            page.locator(`${EDIT_SHAPE}${shapeOf(stored.id)}`),
        ).toHaveCount(1);
        // Handles, on a shape that has them for the first time.
        await expect(page.locator(HANDLE)).toHaveCount(8);
    });

    test('every handle is a focusable element with an accessible name', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await drawRegion(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);

        // ADR 0016: painted handles would have no focus, no name and no
        // keyboard reach, and no accessibility scan could report their absence.
        // Reading the names through the ROLE is the assertion — a `<div>` with
        // an `aria-label` would not answer here.
        await expect(
            page.getByRole('button', { name: 'Resize top left' }),
        ).toHaveCount(1);
        await expect(
            page.getByRole('button', { name: 'Resize bottom right' }),
        ).toHaveCount(1);

        const focused = await page.evaluate(() => {
            const root = document.getElementById('v')?.shadowRoot;
            const handles = root?.querySelectorAll<HTMLElement>(
                '[data-testid="annotation-edit-handle"]',
            );
            return [...(handles ?? [])].map((handle) => {
                handle.focus();
                return {
                    name: handle.getAttribute('aria-label'),
                    focused: root?.activeElement === handle,
                };
            });
        });

        expect(focused).toHaveLength(8);
        for (const handle of focused) {
            expect(handle.focused).toBe(true);
            expect(handle.name?.length ?? 0).toBeGreaterThan(0);
        }
    });

    test('dragging a handle reshapes the annotation and the geometry survives a reload', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await drawRegion(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);

        // The bottom-right corner, dragged out by 120x80 canvas pixels. The
        // origin must not move: a handle drag reshapes from the edges it owns,
        // and a reshape that translated the whole box would fail below.
        const grabAt = await at(page, {
            x: stored.x + stored.width,
            y: stored.y + stored.height,
        });
        const dropAt = await at(page, {
            x: stored.x + stored.width + 120,
            y: stored.y + stored.height + 80,
        });

        await page.mouse.move(grabAt.x, grabAt.y);
        await page.mouse.down();
        await page.mouse.move(dropAt.x, dropAt.y, { steps: 8 });
        await page.mouse.up();

        await expect
            .poll(async () => (await storedRects(page))[0]?.width)
            .toBe(stored.width + 120);

        const [reshaped] = await storedRects(page);
        expect(reshaped.height).toBe(stored.height + 80);
        expect(reshaped.x).toBe(stored.x);
        expect(reshaped.y).toBe(stored.y);

        // And it is storage that says so, not the screen: after a reload the
        // shape is core's again, projected from what the adapter kept.
        await reopen(page, stored.id);
        expect((await storedRects(page))[0]).toEqual(reshaped);

        const predicted = predictScreenPoint(
            { x: reshaped.x, y: reshaped.y },
            await getView(page),
        );
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const shapeBox = (await page
            .locator(shapeOf(stored.id))
            .first()
            .boundingBox())!;
        expect(
            Math.abs(shapeBox.x - surface.x - predicted.x),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(shapeBox.width - reshaped.width * VIEW.scale),
        ).toBeLessThanOrEqual(1);
    });

    test('dragging the interior moves the shape without changing its dimensions', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await drawRegion(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);

        const centre = {
            x: stored.x + stored.width / 2,
            y: stored.y + stored.height / 2,
        };
        const grabAt = await at(page, centre);
        const dropAt = await at(page, {
            x: centre.x - 90,
            y: centre.y + 60,
        });

        await page.mouse.move(grabAt.x, grabAt.y);
        await page.mouse.down();
        await page.mouse.move(dropAt.x, dropAt.y, { steps: 8 });
        await page.mouse.up();

        await expect
            .poll(async () => (await storedRects(page))[0]?.x)
            .toBe(stored.x - 90);

        const [moved] = await storedRects(page);
        expect(moved.y).toBe(stored.y + 60);
        // A move is a translation: the extent is the claim.
        expect(moved.width).toBe(stored.width);
        expect(moved.height).toBe(stored.height);
    });

    test('cancelling an edit gives the shape back to core', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await drawRegion(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);

        // Escape is the only way out of an open edit — the body editor offers
        // no cancel of its own.
        await page.keyboard.press('Escape');

        await expect(page.locator(EDIT_SHAPE)).toHaveCount(0);
        // Back to exactly one rendering, and this time core's. A stale edit id
        // would leave the annotation invisible with nothing drawing it, which
        // reads to the reader as data loss.
        await expect(page.locator(shapeOf(stored.id))).toHaveCount(1);
        await expect(
            page.locator(`${EDIT_SHAPE}${shapeOf(stored.id)}`),
        ).toHaveCount(0);
    });

    test('deleting removes the annotation, and undo restores it after a reload', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await drawRegion(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);

        await page.getByRole('button', { name: 'Delete annotation' }).click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();

        await expect.poll(() => storedRects(page)).toEqual([]);
        // Gone from the image too, from both renderers at once.
        await expect(page.locator(shapeOf(stored.id))).toHaveCount(0);
        await expect(page.locator(EDIT_SHAPE)).toHaveCount(0);

        await page.getByRole('button', { name: 'Undo' }).click();

        // ADR 0003: undo agrees with STORAGE, not merely with the screen — an
        // annotation restored only in the overlay would vanish on the reload.
        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [restored] = await storedRects(page);
        expect({
            x: restored.x,
            y: restored.y,
            width: restored.width,
            height: restored.height,
        }).toEqual({
            x: stored.x,
            y: stored.y,
            width: stored.width,
            height: stored.height,
        });

        await reopen(page, restored.id);
        expect((await storedRects(page))[0]).toEqual(restored);
    });
});

/*
 * **The two polygon-backed tools.** A polygon is clicked out vertex by vertex;
 * an ellipse is dragged as a bounding box and persisted as the polygon
 * inscribed in it, with nothing recording that it was ever an ellipse.
 *
 * The claim that can only be made here is the one about CORE's parser: what the
 * editor writes is read back by the read-only overlay without degrading, at the
 * same canvas coordinates. An `<ellipse>` in the selector would fail that —
 * core approximates one into points on read, so the shape would lose fidelity on
 * every round trip — and asserting the stored value alone would not catch it.
 */
test.describe('polygon and ellipse tools', () => {
    const shapeOf = (id: string) => `[data-annotation-id="${id}"]`;
    const POLYGON_DRAFT = '[data-testid="annotation-polygon-draft"]';
    const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';
    const HANDLE = '[data-testid="annotation-edit-handle"]';

    /** The outline the polygon tests click out, in canvas space. */
    const TRIANGLE = [
        { x: 500, y: 380 },
        { x: 700, y: 400 },
        { x: 620, y: 540 },
    ];

    /** A SQUARE drag, so the ellipse it inscribes is a circle. */
    const SQUARE = { x: 500, y: 350, width: 200, height: 200 };

    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    /** Click each vertex in turn. Never a drag: the tool has one gesture. */
    async function clickVertices(
        page: Page,
        vertices: { x: number; y: number }[],
    ): Promise<void> {
        const view = await getView(page);
        for (const vertex of vertices) {
            const at = await pageAt(page, vertex, view);
            await page.mouse.click(at.x, at.y);
        }
    }

    /** Where a canvas point currently is on the page, at the settled view. */
    async function at(
        page: Page,
        point: { x: number; y: number },
    ): Promise<{ x: number; y: number }> {
        return pageAt(page, point, await getView(page));
    }

    /** Back to a loaded viewer with the shape hydrated and drawn by CORE. */
    async function reopen(page: Page, id: string): Promise<void> {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(shapeOf(id))
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);
    }

    async function openForEditing(page: Page, id: string): Promise<void> {
        await page.locator(shapeOf(id)).first().click();
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
    }

    /**
     * Core's own rendering of the shape lands where the stored geometry says it
     * should. The bounding box is what core positions the polygon's `<svg>` by,
     * and it is compared through `predictScreenPoint` — the coordinate model
     * every other geometric claim in this suite is gated against.
     */
    async function expectRenderedAtStoredCoordinates(
        page: Page,
        stored: StoredPolygon,
    ): Promise<void> {
        const bounds = boundsOf(stored.points);
        const view = await getView(page);
        const predicted = predictScreenPoint(
            { x: bounds.x, y: bounds.y },
            view,
        );
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const shapeBox = (await page
            .locator(shapeOf(stored.id))
            .first()
            .boundingBox())!;

        expect(
            Math.abs(shapeBox.x - surface.x - predicted.x),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(shapeBox.y - surface.y - predicted.y),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(shapeBox.width - bounds.width * view.scale),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(shapeBox.height - bounds.height * view.scale),
        ).toBeLessThanOrEqual(1);
    }

    /** Click out `TRIANGLE`, close it with Enter, and return what was stored. */
    async function drawTriangle(page: Page): Promise<StoredPolygon> {
        await armTool(page, 'Polygon');
        await clickVertices(page, TRIANGLE);
        await page.keyboard.press('Enter');
        await expect
            .poll(async () => (await storedPolygons(page)).length)
            .toBe(1);
        return (await storedPolygons(page))[0]!;
    }

    test('a drawn polygon persists in canvas coordinates and survives a reload', async ({
        page,
    }) => {
        await openFixture(page);
        await armTool(page, 'Polygon');

        await clickVertices(page, TRIANGLE);
        // Clicking placed vertices rather than drawing a box: a tool that had
        // fallen through to the drag path would show the rectangle preview.
        await expect(page.locator(POLYGON_DRAFT)).toBeVisible();
        await expect(page.locator(DRAFT)).toHaveCount(0);

        await page.keyboard.press('Enter');

        await expect
            .poll(async () => (await storedPolygons(page)).length)
            .toBe(1);
        const [stored] = await storedPolygons(page);
        expect(stored.points).toHaveLength(TRIANGLE.length);
        // Canvas space, not screen space: the canvas is centred in a stage a
        // few hundred pixels across, so its screen origin is nowhere near its
        // canvas origin and a polygon stored in either would differ here.
        stored.points.forEach((point, index) => {
            expect(Math.abs(point.x - TRIANGLE[index].x)).toBeLessThanOrEqual(
                1,
            );
            expect(Math.abs(point.y - TRIANGLE[index].y)).toBeLessThanOrEqual(
                1,
            );
        });

        // The round trip. After a reload nothing of the drawing layer is
        // involved: the shape is CORE's own, parsed out of the `SvgSelector`.
        await reopen(page, stored.id);
        await expectRenderedAtStoredCoordinates(page, stored);
    });

    test('a double-click closes the outline without leaving a stray vertex', async ({
        page,
    }) => {
        await openFixture(page);
        await armTool(page, 'Polygon');

        await clickVertices(page, TRIANGLE.slice(0, 2));
        const last = await at(page, TRIANGLE[2]);
        await page.mouse.dblclick(last.x, last.y);

        await expect
            .poll(async () => (await storedPolygons(page)).length)
            .toBe(1);
        // Three, not four: a double-click's two presses both land on the layer,
        // and the coincident tail vertex is dropped when the outline closes.
        const [stored] = await storedPolygons(page);
        expect(stored.points).toHaveLength(3);
    });

    test('Enter refuses a polygon of fewer than three vertices, and Escape abandons the whole outline', async ({
        page,
    }) => {
        await openFixture(page);
        await armTool(page, 'Polygon');

        await clickVertices(page, TRIANGLE.slice(0, 2));
        await page.keyboard.press('Enter');

        // Two vertices are a line, not a region. The close is REFUSED and the
        // clicks so far are kept — Escape is what discards them.
        await expect.poll(() => storedPolygons(page)).toEqual([]);
        await expect(page.locator(POLYGON_DRAFT)).toBeVisible();

        await page.keyboard.press('Escape');
        // The WHOLE outline, not merely the vertex last placed.
        await expect(page.locator(POLYGON_DRAFT)).toHaveCount(0);
        await expect.poll(() => storedPolygons(page)).toEqual([]);
    });

    test('a drawn ellipse persists as a 64-point polygon core renders unchanged', async ({
        page,
    }) => {
        await openFixture(page);
        await armTool(page, 'Ellipse');

        const view = await getView(page);
        const from = await pageAt(page, { x: SQUARE.x, y: SQUARE.y }, view);
        const to = await pageAt(
            page,
            { x: SQUARE.x + SQUARE.width, y: SQUARE.y + SQUARE.height },
            view,
        );
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();

        await expect
            .poll(async () => (await storedPolygons(page)).length)
            .toBe(1);
        const [stored] = await storedPolygons(page);

        // A polygon, and no `<ellipse>`, no `<circle>` and no circle-ness
        // property anywhere: the 64 points ARE the stored shape.
        expect(stored.points).toHaveLength(64);
        expect(
            await page.evaluate((prefix) => {
                for (let index = 0; index < localStorage.length; index++) {
                    const key = localStorage.key(index);
                    if (!key?.startsWith(prefix)) continue;
                    if (/ellipse|circle/i.test(localStorage.getItem(key) ?? ''))
                        return true;
                }
                return false;
            }, STORAGE_PREFIX),
        ).toBe(false);

        // A square drag inscribes a CIRCLE: every vertex the same distance from
        // the centre. A polygon that had merely traced the box would not be.
        const centre = {
            x: SQUARE.x + SQUARE.width / 2,
            y: SQUARE.y + SQUARE.height / 2,
        };
        for (const point of stored.points) {
            expect(
                Math.abs(
                    Math.hypot(point.x - centre.x, point.y - centre.y) -
                        SQUARE.width / 2,
                ),
            ).toBeLessThanOrEqual(1);
        }

        // And core reads it back as the same polygon, undegraded — the reason
        // an ellipse is not persisted as one.
        await reopen(page, stored.id);
        await expectRenderedAtStoredCoordinates(page, stored);
    });

    test('dragging one vertex moves only that vertex', async ({ page }) => {
        await openFixture(page);
        const stored = await drawTriangle(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);

        // One handle per vertex — a polygon's control points are its vertices,
        // not the eight compass edges a bounding box offers.
        await expect(page.locator(HANDLE)).toHaveCount(3);

        const grabAt = await at(page, stored.points[0]);
        const dropAt = await at(page, {
            x: stored.points[0].x - 60,
            y: stored.points[0].y - 40,
        });
        await page.mouse.move(grabAt.x, grabAt.y);
        await page.mouse.down();
        await page.mouse.move(dropAt.x, dropAt.y, { steps: 8 });
        await page.mouse.up();

        await expect
            .poll(async () => (await storedPolygons(page))[0]?.points[0]?.x)
            .toBeLessThan(stored.points[0].x - 55);

        const [edited] = await storedPolygons(page);
        expect(
            Math.abs(edited.points[0].y - (stored.points[0].y - 40)),
        ).toBeLessThanOrEqual(1);
        // The invariant: the others did not move at all. A whole-shape
        // translation would have passed the assertion above just as well.
        expect(edited.points[1]).toEqual(stored.points[1]);
        expect(edited.points[2]).toEqual(stored.points[2]);
    });

    test('a vertex can be added and removed, and removal below three is refused', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await drawTriangle(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);

        // Inside the outline and near the edge running from vertex 0 to vertex
        // 1, which is where the new vertex is spliced in.
        const nearEdge = {
            x: (stored.points[0].x + stored.points[1].x) / 2,
            y: (stored.points[0].y + stored.points[1].y) / 2 + 12,
        };
        const insertAt = await at(page, nearEdge);
        await page.mouse.dblclick(insertAt.x, insertAt.y);

        await expect
            .poll(async () => (await storedPolygons(page))[0]?.points.length)
            .toBe(4);
        const grown = (await storedPolygons(page))[0]!;
        expect(Math.abs(grown.points[1].x - nearEdge.x)).toBeLessThanOrEqual(1);
        await expect(page.locator(HANDLE)).toHaveCount(4);

        // Double-clicking a vertex takes it back out again.
        const removeAt = await at(page, grown.points[1]);
        await page.mouse.dblclick(removeAt.x, removeAt.y);

        await expect
            .poll(async () => (await storedPolygons(page))[0]?.points.length)
            .toBe(3);

        // And at three it is refused: fewer is a line, not a region.
        const refusedAt = await at(page, stored.points[0]);
        await page.mouse.dblclick(refusedAt.x, refusedAt.y);
        await expect(page.locator(HANDLE)).toHaveCount(3);
        expect((await storedPolygons(page))[0]?.points).toHaveLength(3);
    });
});

/*
 * **The two tools with no region.**
 *
 * A point is a single click and persists as a IIIF `PointSelector` in whole
 * canvas pixels (ADR 0004) — never a tiny fragment rectangle, because this
 * editor writes one representation of a point and reads no other.
 * A whole-canvas annotation has no selector at all: the target IS the canvas,
 * so it is listed in the annotation panel and draws nothing on the image.
 *
 * Both claims are about what reached STORAGE, so both read the adapter's own
 * records rather than the DOM alone — a spec that only checked that something
 * rendered would pass just as well for a two-pixel rectangle.
 */
test.describe('point and whole-canvas tools', () => {
    const shapeOf = (id: string) => `[data-annotation-id="${id}"]`;
    const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';
    const HANDLE = '[data-testid="annotation-edit-handle"]';

    /** Where the point tests click, in the canvas's own coordinates. */
    const SPOT = { x: 540, y: 410 };

    /** Core's point marker: `DEFAULT_POINT_RADIUS` of 5, as a diameter. */
    const MARKER_SIZE = 10;

    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    /** Where a canvas point currently is on the page, at the settled view. */
    async function at(
        page: Page,
        point: { x: number; y: number },
    ): Promise<{ x: number; y: number }> {
        return pageAt(page, point, await getView(page));
    }

    /** Back to a loaded viewer with the point hydrated and drawn by CORE. */
    async function reopen(page: Page, id: string): Promise<void> {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(shapeOf(id))
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);
    }

    /** Arm the point tool and click once at `SPOT`. */
    async function placePoint(
        page: Page,
    ): Promise<{ id: string; x: number; y: number }> {
        await armTool(page, 'Point');
        const target = await at(page, SPOT);
        await page.mouse.click(target.x, target.y);
        await expect
            .poll(async () => (await storedPoints(page)).length)
            .toBe(1);
        return (await storedPoints(page))[0]!;
    }

    /**
     * Core's own point marker sits centred on the stored canvas point, at the
     * fixed screen size `pointStyle` resolves — the same value the editor draws
     * the point at, which is why a point looks the same selected and not.
     */
    async function expectMarkerAt(
        page: Page,
        point: { id: string; x: number; y: number },
    ): Promise<void> {
        const view = await getView(page);
        const predicted = predictScreenPoint({ x: point.x, y: point.y }, view);
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const box = (await page
            .locator(shapeOf(point.id))
            .first()
            .boundingBox())!;

        expect(Math.abs(box.width - MARKER_SIZE)).toBeLessThanOrEqual(1);
        expect(Math.abs(box.height - MARKER_SIZE)).toBeLessThanOrEqual(1);
        expect(
            Math.abs(box.x + box.width / 2 - surface.x - predicted.x),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(box.y + box.height / 2 - surface.y - predicted.y),
        ).toBeLessThanOrEqual(1);
    }

    test('a placed point persists as a PointSelector and survives a reload', async ({
        page,
    }) => {
        await openFixture(page);
        // Off the default view, so the projection has both a zoom and a pan to
        // get right: a point stored in screen space lands nowhere near here.
        await setView(page, { centre: { x: 520, y: 400 }, scale: 1.75 });
        await settleView(page);

        const stored = await placePoint(page);

        // The representation, not merely that something was stored. A fragment
        // rectangle standing in for a point is exactly what ADR 0004 rejected.
        expect(await storedSelectorKinds(page)).toEqual([
            { id: stored.id, selector: 'PointSelector' },
        ]);
        expect(Number.isInteger(stored.x)).toBe(true);
        expect(Number.isInteger(stored.y)).toBe(true);
        expect(Math.abs(stored.x - SPOT.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(stored.y - SPOT.y)).toBeLessThanOrEqual(1);

        // The round trip: after a reload the marker on screen is CORE's own,
        // hydrated from the adapter, at the coordinates that were stored.
        await reopen(page, stored.id);
        await expectMarkerAt(page, stored);
    });

    test('a point is moved by dragging it, and the move survives a reload', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await placePoint(page);
        await reopen(page, stored.id);

        await page.locator(shapeOf(stored.id)).first().click();
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
        // One handle, at the point: a point has no edges to resize.
        await expect(page.locator(HANDLE)).toHaveCount(1);

        const destination = { x: SPOT.x + 90, y: SPOT.y - 60 };
        const from = await at(page, { x: stored.x, y: stored.y });
        const to = await at(page, destination);
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();

        await expect
            .poll(async () => {
                const [moved] = await storedPoints(page);
                return moved
                    ? Math.max(
                          Math.abs(moved.x - destination.x),
                          Math.abs(moved.y - destination.y),
                      )
                    : Number.POSITIVE_INFINITY;
            })
            .toBeLessThanOrEqual(1);

        const [moved] = await storedPoints(page);
        // Still a point, still whole canvas pixels — a move must not change
        // either the representation or its precision.
        expect(await storedSelectorKinds(page)).toEqual([
            { id: stored.id, selector: 'PointSelector' },
        ]);
        expect(Number.isInteger(moved.x)).toBe(true);
        expect(Number.isInteger(moved.y)).toBe(true);

        await reopen(page, stored.id);
        await expectMarkerAt(page, moved);
    });

    /**
     * The computed values of `props`, once two consecutive reads agree. Core's
     * marker transitions its colours over 0.15s
     * (`AnnotationShapeOverlay.svelte`), so a single read taken just after a
     * click can catch a colour mid-interpolation.
     */
    async function settledStyle(
        locator: Locator,
        props: string[],
    ): Promise<Record<string, string>> {
        let previous: string | null = null;
        let current: string | null = null;
        await expect
            .poll(async () => {
                previous = current;
                current = JSON.stringify(
                    await locator.evaluate((element, names: string[]) => {
                        const style = getComputedStyle(element);
                        return Object.fromEntries(
                            names.map((name) => [
                                name,
                                style.getPropertyValue(name),
                            ]),
                        );
                    }, props),
                );
                return previous !== null && previous === current;
            })
            .toBe(true);
        return JSON.parse(current!) as Record<string, string>;
    }

    test('a point open for editing is painted like the same point at rest', async ({
        page,
    }) => {
        await openFixture(page);
        const stored = await placePoint(page);
        await reopen(page, stored.id);

        // Off the marker before reading it: core's `.anno-point:hover` thins
        // the fill, and the pointer is still where the point was placed.
        await page.mouse.move(20, 20);
        const marker = page.locator(shapeOf(stored.id)).first();
        const rest = await settledStyle(marker, [
            'background-color',
            'border-top-width',
        ]);

        await marker.click();
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
        const handle = page.locator(HANDLE);
        await expect(handle).toHaveCount(1);
        const open = await settledStyle(handle, [
            'background-color',
            'border-top-width',
        ]);

        // Read from both sides rather than compared against a literal: the
        // claim is that the two agree, not that either is a particular red.
        expect(open).toEqual(rest);
    });

    /**
     * The size half of the invariant the colour spec above holds for paint.
     *
     * Driven at a NON-default radius, because at the default both sides fall
     * back to the same `DEFAULT_POINT_RADIUS` and agree whether or not they
     * read one source — so the default proves nothing. A configured radius is
     * what makes the single source load-bearing: the viewer config is the only
     * place a radius can be set, because core's read-only marker reads nothing
     * else and the plugin cannot write it. A second source would give a point
     * one size at rest and another the moment it was opened; this is the guard.
     *
     * Both diameters are read off the rendered elements rather than compared
     * against the configured number — the claim is that the two agree, not that
     * either resolves a particular arithmetic.
     */
    test('a point open for editing is the same size as the same point at rest, at a non-default radius', async ({
        page,
    }) => {
        const RADIUS = 9;
        await openFixture(page, `?pointRadius=${RADIUS}`);
        const stored = await placePoint(page);
        await reopen(page, stored.id);

        // Off the marker before measuring: core's `.anno-point:hover` restyles
        // it, and the pointer is still where the point was placed.
        await page.mouse.move(20, 20);
        const marker = page.locator(shapeOf(stored.id)).first();
        const rest = (await marker.boundingBox())!;

        await marker.click();
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
        const handle = page.locator(HANDLE);
        await expect(handle).toHaveCount(1);
        const open = (await handle.boundingBox())!;

        expect(Math.abs(open.width - rest.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(open.height - rest.height)).toBeLessThanOrEqual(1);

        // The fixture really did take the configured radius: at the default
        // both sides agree whether or not they read one source, so a run that
        // silently fell back to it would assert nothing.
        expect(rest.width).not.toBe(MARKER_SIZE);
        expect(open.width).not.toBe(MARKER_SIZE);
    });

    test('a whole-canvas annotation is created with no selector and drawn as no shape', async ({
        page,
    }) => {
        await openFixture(page);

        // The tool has no gesture: activating it IS the whole interaction.
        await armTool(page, 'Whole canvas');

        await expect
            .poll(async () => (await storedSelectorKinds(page)).length)
            .toBe(1);
        const [stored] = await storedSelectorKinds(page);
        // No selector at all. A page-sized `xywh` would be a rectangle, and
        // would be drawn as one over the whole image.
        expect(stored.selector).toBeNull();

        // Listed where a whole-page note belongs — the annotation panel …
        await expect(
            page.locator(`[data-annotation-row="${stored.id}"]`),
        ).toHaveCount(1);
        // … and nowhere on the image, which is core's existing, deliberate
        // treatment of a target that is the canvas itself.
        await expect(page.locator(shapeOf(stored.id))).toHaveCount(0);
    });
});

/*
 * **Full keyboard parity.** Every tool creates and shapes from the keyboard
 * alone, on the same verbs the pointer paths edit with.
 *
 * These five flows are the slice's core claim and the reason they are five
 * rather than one parameterised sweep: each tool's default geometry, handle set
 * and stored selector differ, and a blur across them would pass with four of
 * the five broken. Not one of them raises a pointer event — `focus()` and
 * `keyboard.press` only — so a creation path that still needed a drag
 * somewhere cannot pass.
 *
 * Two guards sit beside them. One is core's accessibility contract, which the
 * paint hook was rejected for failing (ADR 0016): with the editor open, every
 * persisted annotation is still a focusable, labelled element, and the shape
 * under edit is reachable by Tab. The other is the arrow-key collision — core
 * binds pan on the renderer root and this layer binds nudge on the shape under
 * edit, and getting it wrong makes the image lurch when a reader meant to move
 * a vertex.
 */
test.describe('keyboard parity', () => {
    const shapeOf = (id: string) => `[data-annotation-id="${id}"]`;
    const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';
    const EDIT_BODY = '[data-testid="annotation-edit-body"]';
    const HANDLE = '[data-testid="annotation-edit-handle"]';

    /**
     * The plugin's own constants, restated here rather than imported.
     *
     * The spec asserts that the shipped plugin agrees with the contract, so its
     * side of the arithmetic has to be independent of the plugin's — the same
     * reason `predictScreenPoint` restates the renderer's coordinate model.
     */
    const NUDGE = 1;
    const NUDGE_LARGE = 10;
    const DEFAULT_FRACTION = 0.25;

    /** The eight compass handles' accessible names, in tab order. */
    const RECT_HANDLE_NAMES = [
        'Resize top left',
        'Resize top',
        'Resize top right',
        'Resize right',
        'Resize bottom right',
        'Resize bottom',
        'Resize bottom left',
        'Resize left',
    ];

    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    /** The accessible name of whatever is focused inside the viewer. */
    async function focusedLabel(page: Page): Promise<string | null> {
        return page.evaluate(() => {
            const active = document.getElementById('v')?.shadowRoot
                ?.activeElement as HTMLElement | null;
            return active?.getAttribute('aria-label') ?? null;
        });
    }

    /**
     * Walk the tab order until the named element has focus. The return value is
     * the assertion: `false` means Tab does not reach it, which is the failure
     * ADR 0016 exists to make visible.
     */
    async function tabTo(
        page: Page,
        name: string,
        limit = 20,
    ): Promise<boolean> {
        for (let press = 0; press < limit; press++) {
            if ((await focusedLabel(page)) === name) return true;
            await page.keyboard.press('Tab');
        }
        return (await focusedLabel(page)) === name;
    }

    /** Every accessible name Tab and Shift+Tab reach from where focus is now. */
    async function tabReachableNames(
        page: Page,
        steps = 30,
    ): Promise<Set<string>> {
        const seen = new Set<string>();
        const start = await focusedLabel(page);
        if (start) seen.add(start);
        for (const key of ['Tab', 'Shift+Tab'] as const) {
            for (let press = 0; press < steps; press++) {
                await page.keyboard.press(key);
                const name = await focusedLabel(page);
                if (name) seen.add(name);
            }
        }
        return seen;
    }

    async function pressRepeatedly(
        page: Page,
        key: string,
        times: number,
    ): Promise<void> {
        for (let press = 0; press < times; press++) {
            await page.keyboard.press(key);
        }
    }

    /**
     * Enter create mode from the keyboard: focus the mode button and press
     * Enter. `focus()` raises no pointer event, and Enter on a focused
     * `<button>` is what tells the plugin the activation was a keyboard one.
     */
    async function enterCreateMode(page: Page): Promise<void> {
        await page.getByRole('button', { name: 'Create', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Drawing Tool')).toBeVisible();
    }

    /** Activate a tool from the keyboard, which places its default shape. */
    async function activateTool(page: Page, tool: string): Promise<void> {
        await page.getByRole('button', { name: tool }).focus();
        await page.keyboard.press('Enter');
    }

    /**
     * The default shape's box in canvas space: a quarter of the visible box in
     * each dimension, centred on the view.
     *
     * Written out from the view rather than read off the shape, so a plugin
     * that placed its default shape anywhere else — at the canvas's centre, at
     * a fixed canvas-space size — fails here.
     */
    function defaultBox(view: RendererView): {
        x: number;
        y: number;
        width: number;
        height: number;
    } {
        const width = (view.width / view.scale) * DEFAULT_FRACTION;
        const height = (view.height / view.scale) * DEFAULT_FRACTION;
        return {
            x: view.centre.x - width / 2,
            y: view.centre.y - height / 2,
            width,
            height,
        };
    }

    /** Back to a loaded viewer with the shape hydrated and drawn by CORE. */
    async function reopen(page: Page, id: string): Promise<void> {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(shapeOf(id))
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);
    }

    /** Core's own rendering of a shape sits where the stored geometry says. */
    async function expectRenderedAt(
        page: Page,
        id: string,
        bounds: { x: number; y: number; width: number; height: number },
    ): Promise<void> {
        const view = await getView(page);
        const predicted = predictScreenPoint(
            { x: bounds.x, y: bounds.y },
            view,
        );
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const box = (await page.locator(shapeOf(id)).first().boundingBox())!;

        expect(Math.abs(box.x - surface.x - predicted.x)).toBeLessThanOrEqual(
            1,
        );
        expect(Math.abs(box.y - surface.y - predicted.y)).toBeLessThanOrEqual(
            1,
        );
        expect(
            Math.abs(box.width - bounds.width * view.scale),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(box.height - bounds.height * view.scale),
        ).toBeLessThanOrEqual(1);
    }

    test('keyboard creation: a rectangle is placed, moved, resized and committed', async ({
        page,
    }) => {
        await openFixture(page);
        await enterCreateMode(page);

        const view = await getView(page);
        const expected = defaultBox(view);
        await activateTool(page, 'Rectangle');

        // Placed, with its eight handles, and the focus already on it: a reader
        // who armed the tool from the panel must not have to Tab across the
        // whole viewer to reach the shape that tool just made.
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
        await expect(page.locator(HANDLE)).toHaveCount(8);
        expect(await focusedLabel(page)).toBe('Move annotation');

        // The default shape landed at the centre of the view. Asserted on
        // screen as well as in storage below, because "the centre of the view"
        // is a claim about where the reader is looking.
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const placed = (await page.locator(EDIT_BODY).boundingBox())!;
        expect(
            Math.abs(placed.x + placed.width / 2 - surface.x - view.width / 2),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(
                placed.y + placed.height / 2 - surface.y - view.height / 2,
            ),
        ).toBeLessThanOrEqual(1);

        // Move the whole shape: the larger step twice right, the small step
        // three times down. Both are canvas-space, and at 1:1 a canvas pixel is
        // a CSS pixel — which is what makes the two comparable at all.
        await pressRepeatedly(page, 'Shift+ArrowRight', 2);
        await pressRepeatedly(page, 'ArrowDown', 3);

        // Tab reaches the corner handle, which is the reachability claim.
        expect(await tabTo(page, 'Resize bottom right')).toBe(true);
        await pressRepeatedly(page, 'Shift+ArrowRight', 4);
        await pressRepeatedly(page, 'Shift+ArrowUp', 1);

        await page.keyboard.press('Enter');

        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [stored] = await storedRects(page);
        // The move translated it; the corner handle resized it from the edges
        // it owns, so the origin carries only the move.
        expect(
            Math.abs(stored.x - (expected.x + 2 * NUDGE_LARGE)),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(stored.y - (expected.y + 3 * NUDGE)),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(stored.width - (expected.width + 4 * NUDGE_LARGE)),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(stored.height - (expected.height - NUDGE_LARGE)),
        ).toBeLessThanOrEqual(1);

        // And it survives a reload, drawn by CORE from what the adapter kept.
        await reopen(page, stored.id);
        expect((await storedRects(page))[0]).toEqual(stored);
        await expectRenderedAt(page, stored.id, stored);
    });

    test('keyboard creation: an ellipse is placed as a 64-point polygon and moved', async ({
        page,
    }) => {
        await openFixture(page);
        await enterCreateMode(page);

        const view = await getView(page);
        const expected = defaultBox(view);
        await activateTool(page, 'Ellipse');

        // One handle per vertex: an ellipse is the polygon inscribed in its box
        // from the moment it is created, keyboard or pointer (ADR 0016).
        await expect(page.locator(HANDLE)).toHaveCount(64);
        expect(await focusedLabel(page)).toBe('Move annotation');

        await pressRepeatedly(page, 'Shift+ArrowLeft', 3);
        await page.keyboard.press('Enter');

        await expect
            .poll(async () => (await storedPolygons(page)).length)
            .toBe(1);
        const [stored] = await storedPolygons(page);
        expect(stored.points).toHaveLength(64);

        const bounds = boundsOf(stored.points);
        expect(
            Math.abs(bounds.x - (expected.x - 3 * NUDGE_LARGE)),
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.y - expected.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.width - expected.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds.height - expected.height)).toBeLessThanOrEqual(
            1,
        );

        await reopen(page, stored.id);
        await expectRenderedAt(page, stored.id, boundsOf(stored.points));
    });

    test('keyboard creation: a polygon is placed as a triangle, then gains and loses vertices', async ({
        page,
    }) => {
        await openFixture(page);
        await enterCreateMode(page);

        const view = await getView(page);
        const expected = defaultBox(view);
        await activateTool(page, 'Polygon');

        // The fewest vertices a region can have. There is no keyboard
        // vertex-placement mode: a triangle IS the start of an outline.
        await expect(page.locator(HANDLE)).toHaveCount(3);

        expect(await tabTo(page, 'Move vertex 1')).toBe(true);
        await pressRepeatedly(page, 'Shift+ArrowUp', 2);

        // `i` inserts after the focused vertex and takes the focus with it, so
        // the reader can shape the vertex they just made without hunting for
        // it; `x` removes the focused one.
        await page.keyboard.press('i');
        await expect(page.locator(HANDLE)).toHaveCount(4);
        expect(await focusedLabel(page)).toBe('Move vertex 2');

        await page.keyboard.press('i');
        await expect(page.locator(HANDLE)).toHaveCount(5);
        expect(await focusedLabel(page)).toBe('Move vertex 3');

        await page.keyboard.press('x');
        await expect(page.locator(HANDLE)).toHaveCount(4);
        expect(await focusedLabel(page)).toBe('Move vertex 2');

        await page.keyboard.press('Enter');

        await expect
            .poll(async () => (await storedPolygons(page)).length)
            .toBe(1);
        const [stored] = await storedPolygons(page);
        // Four, not three and not five: the inserted vertices persisted and the
        // removed one did not.
        expect(stored.points).toHaveLength(4);
        // The apex is the vertex that was nudged, twenty canvas pixels above
        // the default triangle's own apex.
        expect(
            Math.abs(stored.points[0].y - (expected.y - 2 * NUDGE_LARGE)),
        ).toBeLessThanOrEqual(1);

        await reopen(page, stored.id);
        await expectRenderedAt(page, stored.id, boundsOf(stored.points));
    });

    test('keyboard creation: a point is placed at the view centre and nudged', async ({
        page,
    }) => {
        await openFixture(page);
        // Off the default view, so the placement has both a zoom and a pan to
        // get right rather than only a pan.
        await setView(page, { centre: { x: 520, y: 400 }, scale: 1.75 });
        await settleView(page);
        await enterCreateMode(page);

        const view = await getView(page);
        await activateTool(page, 'Point');

        // One handle, and it IS the shape: a point has no edges to resize and
        // so no separate move affordance to duplicate its name.
        await expect(page.locator(HANDLE)).toHaveCount(1);
        expect(await focusedLabel(page)).toBe('Move point');

        await pressRepeatedly(page, 'Shift+ArrowRight', 3);
        await pressRepeatedly(page, 'ArrowDown', 4);
        await page.keyboard.press('Enter');

        await expect
            .poll(async () => (await storedPoints(page)).length)
            .toBe(1);
        const [stored] = await storedPoints(page);
        // A `PointSelector` in whole canvas pixels, as ADR 0004 requires — the
        // keyboard path writes the same one representation the pointer does.
        expect(await storedSelectorKinds(page)).toEqual([
            { id: stored.id, selector: 'PointSelector' },
        ]);
        expect(Number.isInteger(stored.x)).toBe(true);
        expect(Number.isInteger(stored.y)).toBe(true);
        // The nudges are CANVAS pixels: thirty and four of them, at 1.75× zoom,
        // where a screen-pixel step would have moved it by a different amount.
        expect(
            Math.abs(stored.x - (view.centre.x + 3 * NUDGE_LARGE)),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(stored.y - (view.centre.y + 4 * NUDGE)),
        ).toBeLessThanOrEqual(1);

        await reopen(page, stored.id);
        expect((await storedPoints(page))[0]).toEqual(stored);
    });

    test('keyboard creation: a whole-canvas annotation is made by activating its tool', async ({
        page,
    }) => {
        await openFixture(page);
        await enterCreateMode(page);
        await activateTool(page, 'Whole canvas');

        await expect
            .poll(async () => (await storedSelectorKinds(page)).length)
            .toBe(1);
        const [stored] = await storedSelectorKinds(page);
        // No selector, and so no default shape either: the tool has no region
        // to place, from the keyboard any more than from the pointer.
        expect(stored.selector).toBeNull();
        await expect(page.locator(EDIT_SHAPE)).toHaveCount(0);
        await expect(
            page.locator(`[data-annotation-row="${stored.id}"]`),
        ).toHaveCount(1);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await expect
            .poll(async () => (await storedSelectorKinds(page)).length)
            .toBe(1);
    });

    test('every persisted annotation is focusable and labelled while the editor is open', async ({
        page,
    }) => {
        await openFixture(page);
        await enterCreateMode(page);

        // Two annotations of different kinds, so the assertion is about core's
        // whole rendered set rather than about one shape.
        await activateTool(page, 'Rectangle');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [rect] = await storedRects(page);

        await activateTool(page, 'Point');
        await page.keyboard.press('Enter');
        await expect
            .poll(async () => (await storedPoints(page)).length)
            .toBe(1);

        await reopen(page, rect.id);

        // ADR 0016: painted pixels have no focus, no accessible name and no
        // keyboard reach, and no scan can report an element that is not there.
        // Read through the ROLE, so a `<div>` with an `aria-label` fails.
        const shapes = await page.evaluate(() => {
            const root = document.getElementById('v')?.shadowRoot;
            const rendered = root?.querySelectorAll<HTMLElement>(
                '[data-testid="annotation-shapes"] [data-annotation-id]',
            );
            return [...(rendered ?? [])].map((shape) => {
                shape.focus();
                return {
                    tag: shape.tagName,
                    name: shape.getAttribute('aria-label'),
                    focused: root?.activeElement === shape,
                };
            });
        });

        expect(shapes).toHaveLength(2);
        for (const shape of shapes) {
            expect(shape.tag).toBe('BUTTON');
            expect(shape.name?.length ?? 0).toBeGreaterThan(0);
            expect(shape.focused).toBe(true);
        }

        // And the shape under edit is reachable by Tab — every handle of it,
        // not merely the first. Opened from the keyboard too: core's own shape
        // answers Enter, which is how a reader without a pointer selects one.
        await page.locator(shapeOf(rect.id)).first().focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
        await expect(page.locator(HANDLE)).toHaveCount(8);

        const reachable = await tabReachableNames(page);
        expect(reachable).toContain('Move annotation');
        for (const name of RECT_HANDLE_NAMES) {
            expect([...reachable]).toContain(name);
        }
    });

    test('arrow keys pan the image when nothing in the drawing layer is focused, and nudge when a handle is', async ({
        page,
    }) => {
        await openFixture(page);
        await enterCreateMode(page);
        await activateTool(page, 'Rectangle');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [stored] = await storedRects(page);

        await reopen(page, stored.id);

        // Nothing in the drawing layer focused: the arrows are CORE's, bound on
        // the renderer root, and they pan.
        await page.locator('[data-testid="canvas-renderer-root"]').focus();
        const beforePan = await getView(page);
        await page.keyboard.down('ArrowRight');
        await expect
            .poll(async () => (await getView(page)).centre.x)
            .toBeGreaterThan(beforePan.centre.x + 10);
        await page.keyboard.up('ArrowRight');
        await settleView(page);
        await setView(page, VIEW);

        // A handle focused: the same key nudges, and the image must not move.
        // An overlay layer is a SIBLING of the renderer root, so the press
        // never reaches core at all — which is the whole mechanism.
        await page.locator(shapeOf(stored.id)).first().focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();
        expect(await tabTo(page, 'Resize bottom right')).toBe(true);

        const beforeNudge = await getView(page);
        await pressRepeatedly(page, 'Shift+ArrowRight', 2);
        await pressRepeatedly(page, 'Shift+ArrowDown', 1);

        const during = await getView(page);
        expect(during.centre.x).toBeCloseTo(beforeNudge.centre.x, 5);
        expect(during.centre.y).toBeCloseTo(beforeNudge.centre.y, 5);
        expect(during.scale).toBeCloseTo(beforeNudge.scale, 5);

        await page.keyboard.press('Enter');
        await expect
            .poll(async () => (await storedRects(page))[0]?.width)
            .toBe(stored.width + 2 * NUDGE_LARGE);
        const [nudged] = await storedRects(page);
        expect(nudged.height).toBe(stored.height + NUDGE_LARGE);
        // The corner handle owns the east and south edges only.
        expect(nudged.x).toBe(stored.x);
        expect(nudged.y).toBe(stored.y);
    });
});

/*
 * **Escape's two jobs, and Delete.** Escape cancels the edit in progress if
 * there is one and disarms the tool if there is not, so a reader who placed a
 * default shape they did not want presses it twice: once to throw the shape
 * away, once to leave the mode. Getting the order wrong makes the first press
 * drop the reader out of create mode with the unwanted shape still on screen.
 */
test.describe('keyboard cancel and delete', () => {
    const shapeOf = (id: string) => `[data-annotation-id="${id}"]`;
    const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';

    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    async function enterCreateMode(page: Page): Promise<void> {
        await page.getByRole('button', { name: 'Create', exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Drawing Tool')).toBeVisible();
    }

    async function activateTool(page: Page, tool: string): Promise<void> {
        await page.getByRole('button', { name: tool }).focus();
        await page.keyboard.press('Enter');
    }

    test('Escape cancels the keyboard shape, then disarms the tool', async ({
        page,
    }) => {
        await openFixture(page);
        await enterCreateMode(page);
        await activateTool(page, 'Rectangle');
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();

        await page.keyboard.press('Escape');

        // The shape is gone and nothing was stored — a placed default shape is
        // uncommitted until Enter, so cancelling it leaves no trace.
        await expect(page.locator(EDIT_SHAPE)).toHaveCount(0);
        await expect.poll(() => storedRects(page)).toEqual([]);
        // And the tool is STILL armed: the panel goes on offering it, so the
        // next activation places another shape.
        await expect(page.getByText('Drawing Tool')).toBeVisible();
        await activateTool(page, 'Rectangle');
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();

        // Two presses to leave altogether: one for the shape, one for the mode.
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        await expect(page.getByText('Drawing Tool')).toHaveCount(0);
        await expect.poll(() => storedRects(page)).toEqual([]);
    });

    test('Delete removes the annotation being edited', async ({ page }) => {
        await openFixture(page);
        await enterCreateMode(page);
        await activateTool(page, 'Rectangle');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [stored] = await storedRects(page);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(shapeOf(stored.id))
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);

        await page.locator(shapeOf(stored.id)).first().focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(EDIT_SHAPE)).toBeVisible();

        // Delete on the shape under edit opens the SAME confirmation the
        // panel's delete button does: parity means the keyboard reaches the
        // deletion, not that it skips the guard the pointer path has.
        await page.getByRole('button', { name: 'Move annotation' }).focus();
        await page.keyboard.press('Delete');
        await expect(page.getByText('Delete Annotation?')).toBeVisible();

        await page.getByRole('button', { name: 'Delete', exact: true }).focus();
        await page.keyboard.press('Enter');

        await expect.poll(() => storedRects(page)).toEqual([]);
        await expect(page.locator(shapeOf(stored.id))).toHaveCount(0);
        await expect(page.locator(EDIT_SHAPE)).toHaveCount(0);
    });
});

/*
 * **A draft belongs to one annotation.** An uncommitted nudge accumulates into
 * the drawing layer's draft, and selecting a different annotation abandons it.
 *
 * The claim is that the abandoned draft is unreadable rather than merely
 * stale, and it takes a browser because it is about what two annotations do to
 * each other: the second must be DRAWN from its own geometry, and Enter on it
 * must write its own geometry, not the shape the reader was pushing around a
 * moment ago. Asserted on the rendered box as well as on storage, because the
 * two failures are separable — a repaint glitch is ugly, a commit through it
 * writes one annotation's outline onto another.
 */
test.describe('a draft abandoned by a selection change', () => {
    const shapeOf = (id: string) => `[data-annotation-id="${id}"]`;
    const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';
    const EDIT_BODY = '[data-testid="annotation-edit-body"]';

    /** The plugin's large nudge step, restated as every other spec here does. */
    const NUDGE_LARGE = 10;

    /** Two regions far enough apart that neither one's hit box covers the other. */
    const FIRST = { x: 500, y: 380, width: 90, height: 60 };
    const SECOND = { x: 620, y: 460, width: 80, height: 55 };

    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    /** Drag out one rectangle over `region`. */
    async function drawRect(
        page: Page,
        region: { x: number; y: number; width: number; height: number },
    ): Promise<void> {
        await armRectangle(page);
        const view = await getView(page);
        const from = await pageAt(page, { x: region.x, y: region.y }, view);
        const to = await pageAt(
            page,
            { x: region.x + region.width, y: region.y + region.height },
            view,
        );
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();
    }

    /**
     * Draw both rectangles and return them identified by WIDTH rather than by
     * storage order, so the spec never depends on what the adapter's array
     * happens to look like.
     */
    async function drawBoth(
        page: Page,
    ): Promise<{ first: StoredRect; second: StoredRect }> {
        await drawRect(page, FIRST);
        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        await drawRect(page, SECOND);
        await expect.poll(async () => (await storedRects(page)).length).toBe(2);

        const stored = await storedRects(page);
        const first = stored.find(
            (rect) => Math.abs(rect.width - FIRST.width) <= 1,
        )!;
        const second = stored.find(
            (rect) => Math.abs(rect.width - SECOND.width) <= 1,
        )!;
        expect(first).toBeDefined();
        expect(second).toBeDefined();
        return { first, second };
    }

    async function reopen(page: Page, id: string): Promise<void> {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(shapeOf(id))
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);
    }

    /** Open a persisted shape for editing by tapping core's rendering of it. */
    async function openForEditing(page: Page, id: string): Promise<void> {
        await page.locator(shapeOf(id)).first().click();
        await expect(page.locator(EDIT_SHAPE)).toHaveAttribute(
            'data-annotation-id',
            id,
        );
    }

    /**
     * The editor's own outline of the shape under edit sits exactly where the
     * given canvas-space bounds project to.
     *
     * `annotation-edit-body` is the projected bounds and nothing else — the hit
     * box around it carries the handle margin, which is not geometry.
     */
    async function expectEditBodyAt(
        page: Page,
        bounds: { x: number; y: number; width: number; height: number },
    ): Promise<void> {
        const view = await getView(page);
        const predicted = predictScreenPoint(
            { x: bounds.x, y: bounds.y },
            view,
        );
        const surface = (await page.locator(SURFACE).boundingBox())!;
        const box = (await page.locator(EDIT_BODY).boundingBox())!;

        expect(Math.abs(box.x - surface.x - predicted.x)).toBeLessThanOrEqual(
            1,
        );
        expect(Math.abs(box.y - surface.y - predicted.y)).toBeLessThanOrEqual(
            1,
        );
        expect(
            Math.abs(box.width - bounds.width * view.scale),
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(box.height - bounds.height * view.scale),
        ).toBeLessThanOrEqual(1);
    }

    /**
     * Nudge the whole shape under edit right by `steps` large steps, without
     * committing. Aimed through the move affordance, so the nudge translates
     * the shape rather than resizing it from a corner.
     */
    async function nudgeRight(page: Page, steps: number): Promise<void> {
        await page.getByRole('button', { name: 'Move annotation' }).focus();
        for (let press = 0; press < steps; press++) {
            await page.keyboard.press('Shift+ArrowRight');
        }
    }

    test('the newly selected annotation renders its own geometry, and Enter commits to it', async ({
        page,
    }) => {
        await openFixture(page);
        const { first, second } = await drawBoth(page);
        await reopen(page, first.id);

        // An uncommitted nudge: `editDraft` now holds a geometry made for the
        // FIRST annotation, and nothing has been written to storage.
        await openForEditing(page, first.id);
        await nudgeRight(page, 3);
        await expectEditBodyAt(page, {
            ...first,
            x: first.x + 3 * NUDGE_LARGE,
        });

        // Abandoned by selecting the other annotation — no Enter, no Escape.
        await openForEditing(page, second.id);

        // Drawn from the SECOND annotation's own stored geometry. Under the
        // defect the layer draws the first one's nudged box here, at the first
        // one's size, with handles and a hit box to match.
        await expectEditBodyAt(page, second);

        // And Enter commits the second annotation's geometry to the second
        // annotation. Under the defect it writes the first one's outline onto
        // it, which is data loss rather than a repaint.
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await storedRects(page)).length).toBe(2);

        const stored = await storedRects(page);
        expect(stored.find((rect) => rect.id === second.id)).toEqual(second);
        // The abandoned nudge was never committed anywhere, either.
        expect(stored.find((rect) => rect.id === first.id)).toEqual(first);

        // Storage says so after a reload, not just the screen.
        await reopen(page, first.id);
        const persisted = await storedRects(page);
        expect(persisted.find((rect) => rect.id === second.id)).toEqual(second);
        expect(persisted.find((rect) => rect.id === first.id)).toEqual(first);
    });

    test('a pointer drag on the newly selected annotation reshapes it from its own geometry', async ({
        page,
    }) => {
        await openFixture(page);
        const { first, second } = await drawBoth(page);
        await reopen(page, first.id);

        await openForEditing(page, first.id);
        await nudgeRight(page, 3);
        await openForEditing(page, second.id);

        // The drag reads the geometry the shape is being drawn from, so a stale
        // draft would make this reshape the FIRST annotation's box and commit
        // it to the second — a wrong origin as well as a wrong size.
        const view = await getView(page);
        const grabAt = await pageAt(
            page,
            { x: second.x + second.width, y: second.y + second.height },
            view,
        );
        const dropAt = await pageAt(
            page,
            {
                x: second.x + second.width + 40,
                y: second.y + second.height + 30,
            },
            view,
        );

        await page.mouse.move(grabAt.x, grabAt.y);
        await page.mouse.down();
        await page.mouse.move(dropAt.x, dropAt.y, { steps: 8 });
        await page.mouse.up();

        await expect
            .poll(
                async () =>
                    (await storedRects(page)).find(
                        (rect) => rect.id === second.id,
                    )?.width,
            )
            .toBe(second.width + 40);

        const stored = await storedRects(page);
        const reshaped = stored.find((rect) => rect.id === second.id)!;
        expect(reshaped.height).toBe(second.height + 30);
        expect(reshaped.x).toBe(second.x);
        expect(reshaped.y).toBe(second.y);
        expect(stored.find((rect) => rect.id === first.id)).toEqual(first);
    });
});

/*
 * **A commit requires a change.** A gesture that leaves the geometry where it
 * was writes nothing at all.
 *
 * A press on the shape's interior with no handle under it is how a whole-shape
 * move starts, so a plain click reaches the move path at zero delta — and a
 * keyboard nudge can net out to nothing the same way. Unguarded, both reach the
 * adapter, spending a `beforeSave`, a write and an undo entry on a shape that
 * has not moved.
 *
 * Asserted by counting the adapter's writes rather than by reading the stored
 * geometry back, because such a write stores the SAME geometry: storage looks
 * identical afterwards, and only the fact that it was written at all is
 * observable.
 */
test.describe('a commit requires a change', () => {
    const shapeOf = (id: string) => `[data-annotation-id="${id}"]`;
    const EDIT_SHAPE = '[data-testid="annotation-edit-shape"]';

    /** The plugin's large nudge step, restated as every other spec here does. */
    const NUDGE_LARGE = 10;

    const REGION = { x: 520, y: 400, width: 100, height: 70 };

    /** How long a write would take to land, if one were coming. */
    const WRITE_SETTLE_MS = 400;

    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    /**
     * Start counting adapter writes: every `setItem` under the LocalStorage
     * adapter's namespace, which is the whole of what persisting an annotation
     * does to the page. Survives nothing — reinstall it after a reload.
     */
    async function countWrites(page: Page): Promise<void> {
        await page.evaluate((prefix) => {
            const counter = window as unknown as { __adapterWrites: number };
            counter.__adapterWrites = 0;
            const setItem = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key: string, value: string) {
                if (key.startsWith(prefix)) counter.__adapterWrites++;
                return setItem.call(this, key, value);
            };
        }, STORAGE_PREFIX);
    }

    async function adapterWrites(page: Page): Promise<number> {
        return page.evaluate(
            () =>
                (window as unknown as { __adapterWrites: number })
                    .__adapterWrites,
        );
    }

    /** Drag out the one rectangle these specs edit. */
    async function drawRegion(page: Page): Promise<StoredRect> {
        await armRectangle(page);
        const view = await getView(page);
        const from = await pageAt(page, { x: REGION.x, y: REGION.y }, view);
        const to = await pageAt(
            page,
            { x: REGION.x + REGION.width, y: REGION.y + REGION.height },
            view,
        );
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 8 });
        await page.mouse.up();

        await expect.poll(async () => (await storedRects(page)).length).toBe(1);
        const [stored] = await storedRects(page);
        return stored;
    }

    async function reopen(page: Page, id: string): Promise<void> {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page
            .locator(shapeOf(id))
            .first()
            .waitFor({ state: 'visible', timeout: 20_000 });
        await settleSurface(page);
        await setView(page, VIEW);
    }

    async function openForEditing(page: Page, id: string): Promise<void> {
        await page.locator(shapeOf(id)).first().click();
        await expect(page.locator(EDIT_SHAPE)).toHaveAttribute(
            'data-annotation-id',
            id,
        );
    }

    /** Draw one region, reload onto it, and open it with the counter armed. */
    async function editReadyRegion(page: Page): Promise<StoredRect> {
        await openFixture(page);
        const stored = await drawRegion(page);
        await reopen(page, stored.id);
        await openForEditing(page, stored.id);
        await countWrites(page);
        return stored;
    }

    test('a click on the open annotation with no drag writes nothing', async ({
        page,
    }) => {
        const stored = await editReadyRegion(page);

        // The shape's own interior, well clear of every handle: the press that
        // begins a whole-shape move, released without moving.
        const view = await getView(page);
        const centre = await pageAt(
            page,
            {
                x: stored.x + stored.width / 2,
                y: stored.y + stored.height / 2,
            },
            view,
        );
        await page.mouse.move(centre.x, centre.y);
        await page.mouse.down();
        await page.mouse.up();

        await page.waitForTimeout(WRITE_SETTLE_MS);
        expect(await adapterWrites(page)).toBe(0);
        expect(await storedRects(page)).toEqual([stored]);
        // The click is still a selection: only the write goes.
        await expect(page.locator(EDIT_SHAPE)).toHaveAttribute(
            'data-annotation-id',
            stored.id,
        );
    });

    test('Enter after a net-zero nudge writes nothing', async ({ page }) => {
        const stored = await editReadyRegion(page);

        await page.getByRole('button', { name: 'Move annotation' }).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowLeft');
        await page.keyboard.press('Shift+ArrowLeft');
        await page.keyboard.press('Enter');

        await page.waitForTimeout(WRITE_SETTLE_MS);
        expect(await adapterWrites(page)).toBe(0);
        expect(await storedRects(page)).toEqual([stored]);
    });

    test('a real move still commits, exactly once', async ({ page }) => {
        const stored = await editReadyRegion(page);

        await page.getByRole('button', { name: 'Move annotation' }).focus();
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Enter');

        await expect
            .poll(async () => (await storedRects(page))[0]?.x)
            .toBe(stored.x + NUDGE_LARGE);
        await page.waitForTimeout(WRITE_SETTLE_MS);
        expect(await adapterWrites(page)).toBe(1);
    });
});
