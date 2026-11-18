/** `subscribeSettled` against the real renderer. */

import { expect, test, type Page } from '@playwright/test';

import { openGridManifest } from './helpers/numberedGrid';

const SURFACE = '[data-testid="canvas-renderer-surface"]';

interface Probe {
    settled: number;
    targets: Array<{
        manifestId: string;
        canvasId?: string;
        region?: { x: number; y: number; width: number; height: number };
    }>;
}

async function listen(page: Page): Promise<void> {
    await page.evaluate(() => {
        const host = document.querySelector(
            'triiiceratops-viewer',
        ) as unknown as {
            viewerState: { subscribeSettled(listener: () => void): () => void };
        };
        const runtime = (
            window as unknown as {
                Triiiceratops: {
                    contentState: { capture(state: unknown): unknown };
                };
            }
        ).Triiiceratops;
        const probe = { settled: 0, targets: [] as unknown[] };
        (window as unknown as { __probe: typeof probe }).__probe = probe;
        host.viewerState.subscribeSettled(() => {
            probe.settled += 1;
            probe.targets.push(runtime.contentState.capture(host.viewerState));
        });
    });
}

interface ViewerHandle {
    toggleMetadataPanel(): void;
    setViewportRotation(rotation: number): void;
    readonly viewportBounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

function viewer<T>(page: Page, fn: (state: ViewerHandle) => T): Promise<T> {
    return page.evaluate(
        (source) =>
            new Function('state', `return (${source})(state)`)(
                (
                    document.querySelector(
                        'triiiceratops-viewer',
                    ) as unknown as {
                        viewerState: ViewerHandle;
                    }
                ).viewerState,
            ),
        fn.toString(),
    );
}

function probe(page: Page): Promise<Probe> {
    return page.evaluate(
        () => (window as unknown as { __probe: Probe }).__probe,
    );
}

async function surfaceCentre(page: Page): Promise<{ x: number; y: number }> {
    const box = (await page.locator(SURFACE).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('settled notification', () => {
    test('a drag settles once, after release, never while held', async ({
        page,
    }) => {
        await openGridManifest(page);
        await listen(page);
        const start = await surfaceCentre(page);

        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        for (let step = 1; step <= 5; step += 1) {
            await page.mouse.move(start.x - step * 30, start.y - step * 20);
        }
        // Hold the finger still mid-drag.
        await page.waitForTimeout(400);
        expect((await probe(page)).settled).toBe(0);

        await page.mouse.up();
        await expect.poll(async () => (await probe(page)).settled).toBe(1);

        // Tile repaints at rest must not wake it.
        await page.waitForTimeout(500);
        expect((await probe(page)).settled).toBe(1);
    });

    test('an animated zoom settles once, after it lands', async ({ page }) => {
        await openGridManifest(page);
        await listen(page);
        const centre = await surfaceCentre(page);

        await page.mouse.move(centre.x, centre.y);
        await page.mouse.wheel(0, -200);
        await expect.poll(async () => (await probe(page)).settled).toBe(1);

        await page.waitForTimeout(500);
        expect((await probe(page)).settled).toBe(1);
    });

    test('captures a region that round-trips through the content state', async ({
        page,
    }) => {
        await openGridManifest(page);
        await listen(page);
        const centre = await surfaceCentre(page);

        await page.mouse.move(centre.x, centre.y);
        await page.mouse.wheel(0, -400);
        await expect
            .poll(async () => (await probe(page)).settled)
            .toBeGreaterThan(0);

        const { targets } = await probe(page);
        const target = targets.at(-1)!;
        expect(target.canvasId).toBeTruthy();
        expect(target.region).toBeDefined();
        const { x, y, width, height } = target.region!;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + width).toBeLessThanOrEqual(1200);
        expect(y + height).toBeLessThanOrEqual(900);

        const reopened = await page.evaluate((view) => {
            const { parse, serialize } = (
                window as unknown as {
                    Triiiceratops: {
                        contentState: {
                            parse(value: string): unknown;
                            serialize(view: unknown): string;
                        };
                    };
                }
            ).Triiiceratops.contentState;
            return parse(serialize(view));
        }, target);
        // The harness opens a relative manifest.
        expect(reopened).toMatchObject({
            manifestId: new URL(target.manifestId, page.url()).href,
            canvasId: new URL(target.canvasId!, page.url()).href,
            region: target.region,
        });
    });

    test('a docked panel sliding in settles once', async ({ page }) => {
        await openGridManifest(page);
        await listen(page);

        await viewer(page, (state) => state.toggleMetadataPanel());
        await expect
            .poll(async () => (await probe(page)).settled)
            .toBeGreaterThan(0);

        await page.waitForTimeout(800);
        expect((await probe(page)).settled).toBe(1);
    });

    test('captures the box on screen when the view is turned', async ({
        page,
    }) => {
        await openGridManifest(page);
        await listen(page);
        await viewer(page, (state) => state.setViewportRotation(90));
        await expect.poll(async () => (await probe(page)).settled).toBe(1);

        const centre = await surfaceCentre(page);
        await page.mouse.move(centre.x, centre.y);
        await page.mouse.wheel(0, -400);
        await expect.poll(async () => (await probe(page)).settled).toBe(2);

        const target = (await probe(page)).targets.at(-1)!;
        const bounds = await viewer(page, (state) => state.viewportBounds);
        const x = Math.round(Math.max(0, bounds.x));
        const y = Math.round(Math.max(0, bounds.y));
        expect(target.region).toEqual({
            x,
            y,
            width: Math.round(Math.min(1200, bounds.x + bounds.width)) - x,
            height: Math.round(Math.min(900, bounds.y + bounds.height)) - y,
        });
    });
});
