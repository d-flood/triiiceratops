/**
 * Content-state ingestion in a real browser, on the web-component surface (ADR
 * 0006).
 *
 * The fixture page (`/e2e/content-state.html`) does nothing but copy its own
 * query string onto the element's `content-state`,
 * `read-content-state-from-url` and `manifest-id` inputs. It never reads
 * `iiif-content` itself, so a view that appears from the URL is a view the
 * VIEWER read the URL for.
 *
 * Both content states target the local fixture corpus — the static-image
 * manifest for the image path, the generated tone for the AV path — so the
 * whole spec runs with no network. `pnpm build:all` must have run: the page
 * loads core's built element and the AV plugin's built dist, as a consumer
 * would.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { settled, settledBox } from './helpers/settle';
import { AV_MANIFESTS, TONE_DURATION, TONE_MP3 } from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/content-state.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';

const IMAGE_MANIFEST = '/demo-manifests/static-image/manifest.json';
const IMAGE_CANVAS = '/demo-manifests/static-image/canvas/plain';
/** The 1200x900 canvas of the same fixture, and a region well inside it. */
const GRID_CANVAS = '/demo-manifests/static-image/canvas/grid';
const GRID_REGION = { x: 600, y: 450, width: 300, height: 150 };
const AUDIO_CANVAS = `${AV_MANIFESTS.audio}/canvas/tone`;
/** Well inside the 2 s tone, so a seek to it is unambiguously not the start. */
const AUDIO_START = 1;

/** A content-state Annotation in the shape the cookbook publishes. */
function annotation(manifestId: string, canvasId: string, fragment = '') {
    return {
        id: 'https://example.org/content-state/1',
        type: 'Annotation',
        motivation: 'contentState',
        target: {
            id: `${canvasId}${fragment}`,
            type: 'Canvas',
            partOf: [{ id: manifestId, type: 'Manifest' }],
        },
    };
}

/** The base64url form the `iiif-content` parameter delivers. */
function encode(document: unknown): string {
    return Buffer.from(JSON.stringify(document), 'utf8')
        .toString('base64url')
        .replace(/=+$/, '');
}

/**
 * The spelling the Cookbook itself publishes (recipe 0485): JSON through
 * `encodeURIComponent` before base64url, so the decoded payload is
 * percent-encoded rather than JSON.
 */
function encodeAsCookbook(document: unknown): string {
    return Buffer.from(encodeURIComponent(JSON.stringify(document)), 'utf8')
        .toString('base64url')
        .replace(/=+$/, '');
}

/**
 * What the viewport is actually looking at, in canvas coordinates — the public
 * `viewportBounds` query, read off the element's own state.
 */
function visibleBounds(page: Page, viewerId = 'v') {
    return page.evaluate((id) => {
        const host = document.getElementById(id) as unknown as {
            viewerState?: {
                viewportBounds: {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                } | null;
            };
        } | null;
        return host?.viewerState?.viewportBounds ?? null;
    }, viewerId);
}

/** The canvas the viewer is on, read off the element's own state. */
function currentCanvas(page: Page, viewerId = 'v'): Promise<string | null> {
    return page.evaluate((id) => {
        const host = document.getElementById(id) as unknown as {
            viewerState?: { canvasId: string | null };
        } | null;
        return host?.viewerState?.canvasId ?? null;
    }, viewerId);
}

async function open(page: Page, query: string) {
    await serveAvPluginDist(page);
    await page.goto(`${FIXTURE}${query}`, { waitUntil: 'domcontentloaded' });
}

test('opens an image canvas from a content-state input', async ({ page }) => {
    await open(
        page,
        `?content-state=${encode(annotation(IMAGE_MANIFEST, IMAGE_CANVAS))}`,
    );

    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(IMAGE_CANVAS);
});

test('frames the region an image content state names', async ({ page }) => {
    const { x, y, width, height } = GRID_REGION;
    await open(
        page,
        `?content-state=${encode(
            annotation(
                IMAGE_MANIFEST,
                GRID_CANVAS,
                `#xywh=${x},${y},${width},${height}`,
            ),
        )}`,
    );

    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);

    // Settled, not sampled: the fit is eased, so any single read is a moment of
    // an animation. The region is wider than it is tall relative to the surface,
    // so the fit binds on width — the visible box is the region's own width at
    // its own left edge, taller than the region by the aspect difference and
    // centred on it.
    const bounds = await settled(page, visibleBounds);
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeCloseTo(x, 0);
    expect(bounds!.width).toBeCloseTo(width, 0);
    expect(bounds!.y + bounds!.height / 2).toBeCloseTo(y + height / 2, 0);
    // Framed, not merely opened: the whole 1200x900 canvas would be in view.
    expect(bounds!.height).toBeLessThan(900);
});

test('frames a region from a percent-encoded content state, as recipe 0485 publishes it', async ({
    page,
}) => {
    const { x, y, width, height } = GRID_REGION;
    await open(
        page,
        `?content-state=${encodeAsCookbook(
            annotation(
                IMAGE_MANIFEST,
                GRID_CANVAS,
                `#xywh=${x},${y},${width},${height}`,
            ),
        )}`,
    );

    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);

    const bounds = await settled(page, visibleBounds);
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeCloseTo(x, 0);
    expect(bounds!.width).toBeCloseTo(width, 0);
    expect(bounds!.height).toBeLessThan(900);
});

test('opens an AV canvas from a content-state input', async ({ page }) => {
    await open(
        page,
        `?content-state=${encode(
            annotation(AV_MANIFESTS.audio, AUDIO_CANVAS, `#t=${AUDIO_START}`),
        )}`,
    );

    await page.locator(STAGE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(AUDIO_CANVAS);
    // The temporal half of the target: the tone opens parked at `#t=`, not at 0.
    await expect
        .poll(
            () =>
                page
                    .locator(MEDIA)
                    .evaluate((el: HTMLMediaElement) => el.currentTime),
            { timeout: 30_000 },
        )
        .toBeGreaterThan(AUDIO_START - 0.1);
    // The tone is actually mounted, not just a stage over an empty rect.
    await expect(page.locator(MEDIA)).toHaveAttribute(
        'src',
        new RegExp(TONE_MP3.replace(/[.]/g, '\\.')),
    );
    expect(
        await page
            .locator(MEDIA)
            .evaluate((el: HTMLMediaElement) => el.duration),
    ).toBeCloseTo(TONE_DURATION, 1);
});

test('captures the content-state time before the AV media can seek to it', async ({
    page,
}) => {
    await page.route(`**${TONE_MP3}`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.continue();
    });
    await open(
        page,
        `?content-state=${encode(
            annotation(AV_MANIFESTS.audio, AUDIO_CANVAS, `#t=${AUDIO_START}`),
        )}`,
    );
    await page.locator(STAGE).waitFor({ state: 'visible', timeout: 30_000 });

    const time = await page.evaluate(() => {
        const runtime = (
            window as unknown as {
                Triiiceratops: {
                    contentState: {
                        capture(state: unknown): { time?: unknown } | null;
                    };
                };
            }
        ).Triiiceratops;
        const host = document.getElementById('v') as unknown as {
            viewerState: unknown;
        };
        return runtime.contentState.capture(host.viewerState)?.time;
    });
    expect(
        await page
            .locator(MEDIA)
            .evaluate((el: HTMLMediaElement) => el.readyState),
    ).toBe(0);
    expect(time).toEqual({ seconds: AUDIO_START });
});

test('reads the iiif-content parameter only when the host opts in', async ({
    page,
}) => {
    const value = encode(annotation(IMAGE_MANIFEST, IMAGE_CANVAS));

    // Opted in: the viewer reads the parameter the page ignored.
    await open(page, `?iiif-content=${value}&read-url`);
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(IMAGE_CANVAS);
    // And the address the host handed the viewer is untouched.
    expect(new URL(page.url()).searchParams.get('iiif-content')).toBe(value);

    // Not opted in: the same URL loads nothing at all.
    await open(page, `?iiif-content=${value}`);
    await page.locator('#v').waitFor({ state: 'attached', timeout: 30_000 });
    await expect(page.locator(SURFACE)).toHaveCount(0);
    expect(await currentCanvas(page)).toBeFalsy();
});

test('writes the settled zoom in place and restores it on reload', async ({
    page,
}) => {
    const { x, y, width, height } = GRID_REGION;
    const value = encode(
        annotation(
            IMAGE_MANIFEST,
            GRID_CANVAS,
            `#xywh=${x},${y},${width},${height}`,
        ),
    );
    const query = `?write-url&iiif-content=${value}`;
    await open(page, query);
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);
    const initial = await settled(page, visibleBounds);
    expect(initial!.width).toBeCloseTo(width, 0);
    expect(page.url()).toBe(new URL(`${FIXTURE}${query}`, page.url()).href);
    const historyLength = await page.evaluate(() => history.length);

    const box = await settledBox(page, SURFACE);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    const contentParam = () =>
        new URL(page.url()).searchParams.get('iiif-content');
    await expect.poll(contentParam).not.toBe(value);
    const zoomed = await settled(page, visibleBounds);
    expect(zoomed!.width).toBeLessThan(initial!.width);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(new URL(page.url()).searchParams.has('write-url')).toBe(true);

    const zoomedUrl = page.url();
    await page.reload();
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);
    const restored = await settled(page, visibleBounds);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(restored![key] - zoomed![key])).toBeLessThan(1);
    }
    expect(page.url()).toBe(zoomedUrl);
});

test('writes once per settled gesture without growing history', async ({
    page,
}) => {
    await page.addInitScript(() => {
        const replace = history.replaceState.bind(history);
        const counter = window as unknown as { writes: number };
        counter.writes = 0;
        history.replaceState = (...args) => {
            counter.writes += 1;
            replace(...args);
        };
    });
    const { x, y, width, height } = GRID_REGION;
    const value = encode(
        annotation(
            IMAGE_MANIFEST,
            GRID_CANVAS,
            `#xywh=${x},${y},${width},${height}`,
        ),
    );
    await open(page, `?write-url&iiif-content=${value}`);
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    await settled(page, visibleBounds);
    const historyLength = await page.evaluate(() => history.length);
    const writes = () =>
        page.evaluate(() => (window as unknown as { writes: number }).writes);
    expect(await writes()).toBe(0);

    const box = await settledBox(page, SURFACE);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    let expected = 0;
    for (const [dx, dy] of [
        [-80, -40],
        [60, 50],
    ]) {
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
        await page.waitForTimeout(300);
        expect(await writes()).toBe(expected);
        await page.mouse.up();
        await expect.poll(writes).toBe(++expected);
        await settled(page, visibleBounds);
    }

    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
    await expect.poll(writes).toBe(++expected);
    await settled(page, visibleBounds);

    expect(await writes()).toBe(expected);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
});

test('lets the discrete manifest input win over both content-state sources', async ({
    page,
}) => {
    const audio = encode(annotation(AV_MANIFESTS.audio, AUDIO_CANVAS));
    await open(
        page,
        `?manifest=${encodeURIComponent(IMAGE_MANIFEST)}` +
            `&content-state=${audio}&iiif-content=${audio}&read-url`,
    );

    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    // The manifest's own first canvas, never the canvas either content state named.
    expect(await currentCanvas(page)).toBe(
        '/demo-manifests/static-image/canvas/grid',
    );
    await expect(page.locator(STAGE)).toHaveCount(0);
});

test('restores a written view of the manifest the host named', async ({
    page,
}) => {
    const { x, y, width, height } = GRID_REGION;
    const value = encode(
        annotation(
            IMAGE_MANIFEST,
            GRID_CANVAS,
            `#xywh=${x},${y},${width},${height}`,
        ),
    );
    await open(
        page,
        `?write-url&manifest=${encodeURIComponent(IMAGE_MANIFEST)}&iiif-content=${value}`,
    );

    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);
    const bounds = await settled(page, visibleBounds);
    expect(bounds!.x).toBeCloseTo(x, 0);
    expect(bounds!.width).toBeCloseTo(width, 0);
});

test('ignores a written view of another manifest than the host named', async ({
    page,
}) => {
    const audio = encode(
        annotation(AV_MANIFESTS.audio, AUDIO_CANVAS, `#t=${AUDIO_START}`),
    );
    await open(
        page,
        `?write-url&manifest=${encodeURIComponent(IMAGE_MANIFEST)}&iiif-content=${audio}`,
    );

    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);
    await expect(page.locator(STAGE)).toHaveCount(0);
    const bounds = await settled(page, visibleBounds);
    expect(bounds!.width).toBeGreaterThanOrEqual(1200 - 1);
});

for (const manifest of [false, true]) {
    test(`keeps two viewers in separate content state URL parameters${
        manifest ? ', with manifest-id' : ''
    }`, async ({ page }) => {
        await keepsTwoViewersApart(page, manifest);
    });
}

async function keepsTwoViewersApart(page: Page, manifest: boolean) {
    const primaryParam = 'grid-view';
    const secondaryParam = 'plain-view';
    const primary = encode(
        annotation(IMAGE_MANIFEST, GRID_CANVAS, '#xywh=600,450,300,150'),
    );
    const secondary = encode(
        annotation(IMAGE_MANIFEST, IMAGE_CANVAS, '#xywh=150,130,120,60'),
    );
    const params = new URLSearchParams({
        'write-url': '',
        ...(manifest ? { manifest: IMAGE_MANIFEST } : {}),
        param: primaryParam,
        second: secondaryParam,
        [primaryParam]: primary,
        [secondaryParam]: secondary,
    });
    await page.setViewportSize({ width: 1600, height: 700 });
    await open(page, `?${params}`);

    const primarySurface = `#v ${SURFACE}`;
    const secondarySurface = `#v2 ${SURFACE}`;
    const secondaryBounds = (p: Page) => visibleBounds(p, 'v2');
    await expect(page.locator(primarySurface)).toBeVisible();
    await expect(page.locator(secondarySurface)).toBeVisible();
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);
    expect(await currentCanvas(page, 'v2')).toBe(IMAGE_CANVAS);
    const initialPrimary = await settled(page, visibleBounds);
    const initialSecondary = await settled(page, secondaryBounds);
    expect(initialPrimary!.width).toBeCloseTo(300, 0);
    expect(initialSecondary!.width).toBeCloseTo(120, 0);

    const box = await settledBox(page, primarySurface);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -200);
    const currentParams = () => new URL(page.url()).searchParams;
    await expect
        .poll(() => currentParams().get(primaryParam))
        .not.toBe(primary);
    const zoomedPrimary = await settled(page, visibleBounds);
    expect(zoomedPrimary!.width).toBeLessThan(initialPrimary!.width);
    expect(await settled(page, secondaryBounds)).toEqual(initialSecondary);
    params.set(primaryParam, currentParams().get(primaryParam)!);
    expect(currentParams().toString()).toBe(params.toString());

    const zoomedUrl = page.url();
    await page.reload();
    await expect(page.locator(primarySurface)).toBeVisible();
    await expect(page.locator(secondarySurface)).toBeVisible();
    expect(await currentCanvas(page)).toBe(GRID_CANVAS);
    expect(await currentCanvas(page, 'v2')).toBe(IMAGE_CANVAS);
    const restoredPrimary = await settled(page, visibleBounds);
    const restoredSecondary = await settled(page, secondaryBounds);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(
            Math.abs(restoredPrimary![key] - zoomedPrimary![key]),
        ).toBeLessThan(1);
        expect(
            Math.abs(restoredSecondary![key] - initialSecondary![key]),
        ).toBeLessThan(1);
    }
    expect(page.url()).toBe(zoomedUrl);
}
