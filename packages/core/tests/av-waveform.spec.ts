/**
 * The waveform, in a real browser.
 *
 * What only a browser can settle:
 *
 * - **All three linkage shapes resolve and draw.** JSON through `seeAlso`
 *   (Avalon), a binary `.dat` through `seeAlso` with the BBC profile (British
 *   Library), and the same `.dat` through `rendering` — one canvas each in
 *   `av-waveform.json`, against real `audiowaveform` output.
 * - **The viewer's own zoom is temporal zoom.** The drawing surface is the lane
 *   clipped to what is visible, so zooming in narrows the time range it draws —
 *   the observable half of "sharpens only to the data's resolution".
 * - **The lane is still the tap target it was.** A surface nested inside it must
 *   not move the seek origin.
 * - **The playhead is painted each frame**, so the surface changes during
 *   playback and not otherwise.
 * - **A video canvas gets the scrubber strip**, which is how waveform data
 *   reaches a layout with no timeline lane.
 * - **A manifest that links no waveform data fetches none.**
 *
 * Both artifacts are the BUILT ones a consumer loads — `pnpm build:all` (or
 * `build:element` plus the plugin's own `pnpm build`) must have run.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import {
    AV_MANIFESTS,
    BARS_MP4,
    BARS_DURATION,
    BARS_SIZE,
    TONE_DURATION,
    TONE_WAVEFORM_DAT,
    TONE_WAVEFORM_JSON,
} from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const TIMELINE_LANE = '[data-testid="av-timeline-lane"]';
const WAVEFORM = '[data-testid="av-waveform"]';
const PEAKS_STRIP = '[data-testid="av-peaks-strip"]';

/** A video canvas whose `seeAlso` links the same waveform data. */
const VIDEO_URL = '/media/manifests/av-waveform-video.json';
const VIDEO_CANVAS = `${VIDEO_URL}/canvas/bars`;
const VIDEO_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: VIDEO_URL,
    type: 'Manifest',
    label: { en: ['Video with waveform data'] },
    items: [
        {
            id: VIDEO_CANVAS,
            type: 'Canvas',
            ...BARS_SIZE,
            duration: BARS_DURATION,
            seeAlso: [
                {
                    id: TONE_WAVEFORM_DAT,
                    type: 'Dataset',
                    format: 'application/octet-stream',
                    profile: 'http://waveform.prototyping.bbc.co.uk',
                },
            ],
            items: [
                {
                    id: `${VIDEO_CANVAS}/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${VIDEO_CANVAS}/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: BARS_MP4,
                                type: 'Video',
                                format: 'video/mp4',
                                ...BARS_SIZE,
                                duration: BARS_DURATION,
                            },
                            target: VIDEO_CANVAS,
                        },
                    ],
                },
            ],
        },
    ],
};

/**
 * A canvas core paints itself: no claim, no stage, and — the assertion — not one
 * byte of waveform data requested.
 */
const IMAGE_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=';
const IMAGE_URL = '/media/manifests/av-waveform-image-only.json';
const IMAGE_CANVAS = `${IMAGE_URL}/canvas/page`;
const IMAGE_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: IMAGE_URL,
    type: 'Manifest',
    label: { en: ['An image-only manifest'] },
    items: [
        {
            id: IMAGE_CANVAS,
            type: 'Canvas',
            width: 8,
            height: 8,
            items: [
                {
                    id: `${IMAGE_CANVAS}/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${IMAGE_CANVAS}/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: IMAGE_DATA_URL,
                                type: 'Image',
                                format: 'image/png',
                                width: 8,
                                height: 8,
                            },
                            target: IMAGE_CANVAS,
                        },
                    ],
                },
            ],
        },
    ],
};

async function openViewer(
    page: Page,
    manifest: string,
    options: { expectStage?: boolean } = {},
): Promise<void> {
    await serveAvPluginDist(page);
    for (const [url, json] of [
        [VIDEO_URL, VIDEO_MANIFEST],
        [IMAGE_URL, IMAGE_MANIFEST],
    ] as const) {
        await page.route(`**${url}`, (route) =>
            route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(json),
            }),
        );
    }

    await page.goto(`${FIXTURE}?manifest=${encodeURIComponent(manifest)}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    if (options.expectStage !== false)
        await page
            .locator(STAGE)
            .first()
            .waitFor({ state: 'visible', timeout: 30_000 });
}

/** Zoom to an absolute scale in screen pixels per canvas-space unit. */
async function zoomTo(page: Page, scale: number): Promise<void> {
    await page.evaluate((value) => {
        const host = document.getElementById('v') as unknown as {
            viewerState: { zoomTo(scale: number): void };
        };
        host.viewerState.zoomTo(value);
    }, scale);
}

/** The time range one waveform surface is currently drawing, in seconds. */
async function drawnRange(
    page: Page,
    index = 0,
): Promise<{ start: number; end: number } | null> {
    const surface = page.locator(WAVEFORM).nth(index);
    if ((await surface.count()) === 0) return null;
    const start = await surface.getAttribute('data-range-start');
    const end = await surface.getAttribute('data-range-end');
    if (start === null || end === null) return null;
    return { start: Number(start), end: Number(end) };
}

test.describe('av waveform — linked peaks fill the timeline lane', () => {
    test('draws a waveform for every linkage shape a real publisher uses', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.waveform);

        // One canvas per shape: JSON via seeAlso, .dat via seeAlso with the BBC
        // profile, and .dat via rendering. Every one of them draws.
        await expect(page.locator(WAVEFORM)).toHaveCount(3, {
            timeout: 30_000,
        });
        await expect(page.locator(WAVEFORM).first()).toBeVisible();

        // The surface is inside the lane it decorates, which is what keeps the
        // lane the tap target and the seek origin.
        expect(
            await page
                .locator(WAVEFORM)
                .first()
                .evaluate((el) =>
                    Boolean(el.parentElement?.matches('.tri-av-lane-timeline')),
                ),
        ).toBe(true);

        // Most of the recording, at the fit the viewer opened on: the surface
        // draws the part of the lane that is on screen, and how much that is
        // depends on how three canvases in a row are centred.
        await expect
            .poll(async () => (await drawnRange(page))?.end, {
                timeout: 20_000,
            })
            .toBeGreaterThan(TONE_DURATION * 0.5);
    });

    test('zooms temporally: the drawn range narrows as the viewer zooms in', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.waveform);
        await expect(page.locator(WAVEFORM).first()).toBeVisible({
            timeout: 30_000,
        });

        // The initial fit animates and the surface is written per frame, so
        // both readings poll until they stop moving rather than being taken
        // once (CONTEXT.md — direct manipulation is never animated, but the
        // opening fit is).
        const settledSpan = async (): Promise<number> => {
            let last = -1;
            await expect
                .poll(
                    async () => {
                        const range = await drawnRange(page);
                        if (!range) return false;
                        const span = range.end - range.start;
                        const settled = Math.abs(span - last) < 0.001;
                        last = span;
                        return settled;
                    },
                    { timeout: 20_000 },
                )
                .toBe(true);
            return last;
        };

        const whole = await settledSpan();
        // How much of the lane the opening fit leaves on screen depends on how
        // three canvases in a row are centred, so the assertion is that most of
        // the recording is drawn — not a pinned fraction of it.
        expect(whole).toBeGreaterThan(TONE_DURATION * 0.5);

        await zoomTo(page, 8);
        const zoomed = await settledSpan();

        // Sharper by a wide margin, and still a real window rather than nothing.
        expect(zoomed).toBeLessThan(whole / 2);
        expect(zoomed).toBeGreaterThan(0);
    });

    test('still seeks from the lane, with a drawing surface nested in it', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.waveform);
        await expect(page.locator(WAVEFORM).first()).toBeVisible({
            timeout: 30_000,
        });

        const media = page.locator(MEDIA).first();
        await expect
            .poll(
                () =>
                    media.evaluate(
                        (el) => (el as HTMLMediaElement).readyState > 0,
                    ),
                { timeout: 30_000 },
            )
            .toBe(true);

        const lane = (await page.locator(TIMELINE_LANE).first().boundingBox())!;
        // The pointer lands on the WAVEFORM, not on bare lane — which is the
        // regression this asserts against: the seek origin is the lane's box.
        await page
            .locator(TIMELINE_LANE)
            .first()
            .click({
                position: { x: lane.width * 0.75, y: lane.height / 2 },
            });

        await expect
            .poll(
                () =>
                    media.evaluate(
                        (el) => (el as HTMLMediaElement).currentTime,
                    ),
                { timeout: 20_000 },
            )
            .toBeCloseTo(TONE_DURATION * 0.75, 1);
    });

    test('repaints the playhead while the recording plays', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.waveform);
        await expect(page.locator(WAVEFORM).first()).toBeVisible({
            timeout: 30_000,
        });

        const surface = page.locator(WAVEFORM).first();
        const snapshot = (): Promise<string> =>
            surface.evaluate((el) =>
                (el as HTMLCanvasElement).toDataURL('image/png'),
            );

        const media = page.locator(MEDIA).first();
        await expect
            .poll(
                () =>
                    media.evaluate(
                        (el) => (el as HTMLMediaElement).readyState > 0,
                    ),
                { timeout: 30_000 },
            )
            .toBe(true);

        const before = await snapshot();
        await page.evaluate(() => {
            const host = document.getElementById('v') as unknown as {
                shadowRoot: ShadowRoot;
            };
            const element = host.shadowRoot.querySelector<HTMLMediaElement>(
                '[data-testid="av-media"]',
            );
            element?.play().catch(() => {});
        });

        // The playhead is the only thing that moves, so the surface's own
        // pixels are the evidence that it is being painted each frame.
        await expect
            .poll(async () => (await snapshot()) !== before, {
                timeout: 20_000,
            })
            .toBe(true);
    });

    test('gives a video canvas a scrubber strip and no timeline lane', async ({
        page,
    }) => {
        await openViewer(page, VIDEO_URL);

        // Video keeps the whole rect for the picture; the waveform reaches the
        // reader through the transport instead.
        await expect(page.locator(TIMELINE_LANE)).toBeHidden();
        await expect(page.locator(WAVEFORM)).toHaveCount(0);

        const strip = page.locator(PEAKS_STRIP);
        await expect(strip).toHaveCount(1, { timeout: 30_000 });
        expect(
            await strip.evaluate((el) => getComputedStyle(el).backgroundImage),
        ).toContain('data:image/png');
    });

    test('fetches no waveform data for a manifest that links none', async ({
        page,
    }) => {
        const requested: string[] = [];
        page.on('request', (request) => requested.push(request.url()));

        await openViewer(page, IMAGE_URL, { expectStage: false });
        // Let anything the activation would have kicked off actually go out.
        await page.waitForTimeout(1000);

        expect(
            requested.filter(
                (url) =>
                    url.includes(TONE_WAVEFORM_JSON) ||
                    url.includes(TONE_WAVEFORM_DAT),
            ),
        ).toEqual([]);
    });
});
