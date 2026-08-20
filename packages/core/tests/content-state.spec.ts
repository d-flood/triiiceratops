/**
 * Content-state ingestion in a real browser, on the web-component surface
 * (ADR 0006, user stories 13–17).
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

/** The canvas the viewer is on, read off the element's own state. */
function currentCanvas(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState?: { canvasId: string | null };
        } | null;
        return host?.viewerState?.canvasId ?? null;
    });
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
