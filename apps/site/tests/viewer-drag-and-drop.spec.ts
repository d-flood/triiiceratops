/**
 * Cookbook recipe 0599: dragging a IIIF content state onto the bare viewer at
 * `/viewer/` opens what it points at.
 *
 * The drag is dispatched, not gestured: Playwright's mouse moves produce no
 * `dragover` or `drop`, so each screen builds a real `DataTransfer` in the page,
 * fills it through the recipe's own published drag source, and dispatches the
 * pair. The recipe's drag source is an `<img draggable="true">` whose
 * `dragstart` handler writes the content state as `text/plain` — the flavour the
 * Content State API requires "for maximum compatibility" — so these screens run
 * the same handler a reader's drag would.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

import { HOSTED_VIEWER_PATH as VIEWER_PATH } from '../src/lib/site';
import { CANVAS_COLORS, twoCanvasManifest } from './fixtures/manifests';
import { ORIGIN } from './helpers/origin';

const MANIFEST = `${ORIGIN}/test-manifests/two-canvas.json`;

const PANE = '.viewer-pane';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const DROP_TARGET = '[data-testid="drop-target"]';
const REJECTED = '[data-testid="content-state-rejected"]';
const FALLBACK_INPUT = '[data-testid="content-state-input"]';

/** A content-state Annotation naming one canvas of the fixture manifest. */
function contentStateFor(canvas: 1 | 2): string {
    return JSON.stringify({
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: 'https://example.org/content-state/0599',
        type: 'Annotation',
        motivation: 'contentState',
        target: {
            id: `${MANIFEST}/canvas/${canvas}`,
            type: 'Canvas',
            partOf: [{ id: MANIFEST, type: 'Manifest' }],
        },
    });
}

/**
 * Drag `payload` from the recipe's own drag source onto the viewer pane.
 *
 * The `DataTransfer` is created once and shared by all three events, which is
 * what a browser does: the object the drag source filled in `dragstart` is the
 * object the drop target reads.
 */
async function dragOnto(
    page: Page,
    payload: string,
    { drop = true }: { drop?: boolean } = {},
): Promise<void> {
    await page.evaluate(
        ({ text, pane, release }) => {
            // Recipe 0599's published drag source, verbatim but for the logo's
            // src, which is not what is under test.
            const source = document.createElement('img');
            source.draggable = true;
            source.alt =
                'IIIF logo; drag and drop onto a supporting viewer to see this resource in that viewer';
            source.addEventListener('dragstart', (event) => {
                (event as DragEvent).dataTransfer?.setData('text/plain', text);
            });
            document.body.append(source);

            const dataTransfer = new DataTransfer();
            const fire = (type: string, target: Element) =>
                target.dispatchEvent(
                    new DragEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        dataTransfer,
                    }),
                );

            fire('dragstart', source);

            const target = document.querySelector(pane);
            if (!target) throw new Error(`no drop target matched ${pane}`);
            fire('dragover', target);
            if (release) fire('drop', target);

            source.remove();
        },
        { text: payload, pane: PANE, release: drop },
    );
}

async function dragLeave(page: Page): Promise<void> {
    await page.evaluate((pane) => {
        const target = document.querySelector(pane);
        if (!target) throw new Error(`no drop target matched ${pane}`);
        target.dispatchEvent(
            new DragEvent('dragleave', {
                bubbles: true,
                cancelable: true,
                composed: true,
                dataTransfer: new DataTransfer(),
            }),
        );
    }, PANE);
}

/**
 * The colour at the middle of the renderer surface, once it has stopped
 * changing. Settled rather than sampled: the image has to decode and the fit is
 * a transition, so a single read is a moment of an animation.
 */
async function settledCenterColor(
    surface: Locator,
): Promise<[number, number, number]> {
    const read = () =>
        surface.evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            const context = canvas.getContext('2d');
            if (!context || !canvas.width) return '';
            const { data } = context.getImageData(
                Math.floor(canvas.width / 2),
                Math.floor(canvas.height / 2),
                1,
                1,
            );
            return data[3] === 255 ? `${data[0]},${data[1]},${data[2]}` : '';
        });

    let previous = '';
    let unchanged = 0;
    let latest = '';
    await expect
        .poll(
            async () => {
                latest = await read();
                if (latest && latest === previous) unchanged += 1;
                else {
                    unchanged = 0;
                    previous = latest;
                }
                return unchanged >= 3;
            },
            { intervals: [100], message: 'the surface stopped changing' },
        )
        .toBe(true);

    const [r, g, b] = latest.split(',').map(Number);
    return [r, g, b];
}

test.beforeEach(async ({ page }) => {
    await page.route(MANIFEST, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(twoCanvasManifest(MANIFEST)),
        }),
    );
    await page.goto(VIEWER_PATH);
    await expect(page.locator(FALLBACK_INPUT)).toBeVisible();
});

test('a dropped content state opens the manifest and canvas it names', async ({
    page,
}) => {
    await dragOnto(page, contentStateFor(2));

    const surface = page.locator(SURFACE);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    // Blue is canvas 2. Rendering anything at all is the manifest; the colour is
    // the canvas.
    expect(await settledCenterColor(surface)).toEqual([...CANVAS_COLORS[2]]);
});

test('a dropped bare manifest URL opens its first canvas', async ({ page }) => {
    await dragOnto(page, MANIFEST);

    const surface = page.locator(SURFACE);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    expect(await settledCenterColor(surface)).toEqual([...CANVAS_COLORS[1]]);
});

test('a dropped link carrying iiif-content opens what the parameter names', async ({
    page,
}) => {
    const encoded = Buffer.from(contentStateFor(2), 'utf8')
        .toString('base64url')
        .replace(/=+$/, '');
    await dragOnto(
        page,
        `${ORIGIN}/some/other/page/?iiif-content=${encodeURIComponent(encoded)}`,
    );

    const surface = page.locator(SURFACE);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    expect(await settledCenterColor(surface)).toEqual([...CANVAS_COLORS[2]]);
});

test('the drop state appears while a drag is over the pane and clears on drop', async ({
    page,
}) => {
    await expect(page.locator(DROP_TARGET)).toHaveCount(0);

    await dragOnto(page, contentStateFor(1), { drop: false });
    await expect(page.locator(DROP_TARGET)).toBeVisible();

    await dragOnto(page, contentStateFor(1));
    await expect(page.locator(DROP_TARGET)).toHaveCount(0);
});

test('the drop state clears when the drag leaves the pane', async ({
    page,
}) => {
    await dragOnto(page, contentStateFor(1), { drop: false });
    await expect(page.locator(DROP_TARGET)).toBeVisible();

    await dragLeave(page);
    await expect(page.locator(DROP_TARGET)).toHaveCount(0);
});

test('a dropped non-URL says so and leaves the view untouched', async ({
    page,
}) => {
    // A view to leave untouched: the fallback input is gone once it renders.
    await page.locator(FALLBACK_INPUT).fill(MANIFEST);
    await page.locator('[data-testid="content-state-open"]').click();

    const surface = page.locator(SURFACE);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    expect(await settledCenterColor(surface)).toEqual([...CANVAS_COLORS[1]]);

    await dragOnto(page, 'just some words');

    // The form is this page's only text surface, so a rejected drop brings it
    // back to say so — over the canvas the viewer still holds.
    await expect(page.locator(REJECTED)).toBeVisible();
    await expect(page.locator(DROP_TARGET)).toHaveCount(0);
    expect(await settledCenterColor(surface)).toEqual([...CANVAS_COLORS[1]]);

    // And the way onward is the form that came back with it.
    await page.locator(FALLBACK_INPUT).fill(MANIFEST);
    await page.locator('[data-testid="content-state-open"]').click();
    await expect(page.locator(REJECTED)).toHaveCount(0);
    await expect(page.locator(FALLBACK_INPUT)).toHaveCount(0);
});
