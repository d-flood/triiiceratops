import { expect, test, type Page } from '@playwright/test';

import {
    findFeature,
    GRID_FEATURES,
    nextPaint,
    setView,
    type GridFeatureName,
} from './helpers/numberedGrid';
import { VELOCITY_WINDOW_MS } from '../src/lib/renderer/rendererDefaults';

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const ROOT = '[data-testid="canvas-renderer-root"]';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only until it has tiles.',
);

type Point = { x: number; y: number };

interface Host {
    viewerState: {
        setViewportRotation(rotation: number): void;
        canvasToScreen(point: Point): Point | null;
        canvasSize(): { width: number; height: number } | null;
        readonly containerSize: { width: number; height: number };
        readonly viewportScale: number;
    };
}

async function openShadowGrid(page: Page): Promise<void> {
    await page.goto('/e2e/canvas-renderer-wc.html', {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    await expect
        .poll(() => findFeature(page, 'bravo'), { timeout: 20_000 })
        .not.toBeNull();
}

async function rotate(page: Page, rotation: number): Promise<void> {
    await page.evaluate((next) => {
        const host = document.getElementById('v') as unknown as Host;
        host.viewerState.setViewportRotation(next);
    }, rotation);
    await nextPaint(page);
}

async function predicted(page: Page, point: Point): Promise<Point> {
    return page.evaluate((p) => {
        const host = document.getElementById('v') as unknown as Host;
        return host.viewerState.canvasToScreen(p)!;
    }, point);
}

test.describe('Canvas2D renderer — a turned view', () => {
    test('paints every feature where canvasToScreen puts it, at every turn', async ({
        page,
    }) => {
        await openShadowGrid(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.4 });

        for (const rotation of [90, 180, 270, 0]) {
            await rotate(page, rotation);
            for (const name of Object.keys(
                GRID_FEATURES,
            ) as GridFeatureName[]) {
                const expected = await predicted(page, GRID_FEATURES[name]);
                const actual = await findFeature(page, name);
                expect(actual, `${name} at ${rotation}°`).not.toBeNull();
                expect(
                    Math.abs(actual!.x - expected.x),
                    `${name} x at ${rotation}°`,
                ).toBeLessThanOrEqual(1);
                expect(
                    Math.abs(actual!.y - expected.y),
                    `${name} y at ${rotation}°`,
                ).toBeLessThanOrEqual(1);
            }
        }
    });

    test('turns clockwise: the top-left feature lands top-right', async ({
        page,
    }) => {
        await openShadowGrid(page);
        await rotate(page, 90);

        const alpha = (await findFeature(page, 'alpha'))!;
        const bravo = (await findFeature(page, 'bravo'))!;
        expect(alpha.x).toBeGreaterThan(bravo.x);
        expect(alpha.y).toBeLessThan(bravo.y);
    });

    test('a fitted view is still fitted after the turn', async ({ page }) => {
        await openShadowGrid(page);
        await rotate(page, 90);

        const { scale, expected } = await page.evaluate(() => {
            const { viewerState } = document.getElementById(
                'v',
            ) as unknown as Host;
            const canvas = viewerState.canvasSize()!;
            const surface = viewerState.containerSize;
            return {
                scale: viewerState.viewportScale,
                expected: Math.min(
                    surface.width / canvas.height,
                    surface.height / canvas.width,
                ),
            };
        });
        expect(scale).toBeCloseTo(expected, 6);
    });

    test('a drag moves the painted pixels by the pointer delta under a turn', async ({
        page,
    }) => {
        await openShadowGrid(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 0.5 });
        await rotate(page, 270);

        const before = (await findFeature(page, 'bravo'))!;
        const box = (await page.locator(SURFACE).boundingBox())!;
        const delta = { x: 60, y: -45 };
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
            box.x + box.width / 2 + delta.x,
            box.y + box.height / 2 + delta.y,
        );
        await page.waitForTimeout(VELOCITY_WINDOW_MS * 2);
        await page.mouse.up();
        await nextPaint(page);

        const after = (await findFeature(page, 'bravo'))!;
        expect(Math.abs(after.x - (before.x + delta.x))).toBeLessThanOrEqual(1);
        expect(Math.abs(after.y - (before.y + delta.y))).toBeLessThanOrEqual(1);
    });

    test('an arrow key pans along the screen, not the world', async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openShadowGrid(page);
        await setView(page, { centre: { x: 600, y: 450 }, scale: 1 });
        await rotate(page, 90);

        const before = (await findFeature(page, 'bravo'))!;
        await page.locator(ROOT).focus();
        await page.keyboard.press('ArrowRight');
        await nextPaint(page);
        const after = (await findFeature(page, 'bravo'))!;

        expect(after.x).toBeLessThan(before.x - 1);
        expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    });
});
