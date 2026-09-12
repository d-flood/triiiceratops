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
 *   reaches a layout with no timeline lane — and so does a sound canvas
 *   published with cover art, which is the same layout by a different route.
 * - **A manifest that links no waveform data fetches none.**
 *
 * Both artifacts are the BUILT ones a consumer loads — `pnpm build:all` (or
 * `build:element` plus the plugin's own `pnpm build`) must have run.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { settled, settledBox } from './helpers/settle';
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
const PEAKS_STRIP = '[data-testid="transport-strip"]';

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

/**
 * Move the viewport centre in canvas space. A `null` axis keeps the centre
 * where it already is, read back through `screenToCanvas` — which is what makes
 * "pan vertically and only vertically" expressible without guessing the x a
 * zoom happened to leave behind.
 */
async function panTo(
    page: Page,
    x: number | null,
    y: number | null,
): Promise<void> {
    // The surface's own box, measured through a locator: it lives in the
    // element's shadow root, which `page.evaluate` cannot query into.
    const box = await page.locator(SURFACE).boundingBox();
    if (!box) throw new Error('no renderer surface');

    await page.evaluate(
        (to) => {
            const host = document.getElementById('v') as unknown as {
                viewerState: {
                    panTo(point: { x: number; y: number }): void;
                    screenToCanvas(point: { x: number; y: number }): {
                        x: number;
                        y: number;
                    } | null;
                };
            };
            // `screenToCanvas` takes a point WITHIN the viewport element, so
            // the surface's own midpoint is the current centre.
            const centre = host.viewerState.screenToCanvas({
                x: to.width / 2,
                y: to.height / 2,
            });
            if (!centre) return;
            host.viewerState.panTo({
                x: to.x ?? centre.x,
                y: to.y ?? centre.y,
            });
        },
        { x, y, width: box.width, height: box.height },
    );
}

/**
 * The drawn range, once it has stopped moving.
 *
 * Every viewport change here eases (CONTEXT.md — the opening fit and every
 * programmatic zoom are animated), and the surface is rewritten per frame while
 * it does. The BOX settles long before the scale does, because past the fit the
 * lane is clipped to the container and stops changing size, so settling the box
 * is not enough to settle the window it draws.
 */
async function settledRange(
    page: Page,
): Promise<{ start: number; end: number }> {
    return await settled(page, async (p) => {
        const range = await drawnRange(p);
        if (!range) throw new Error('no drawn range');
        return {
            start: Number(range.start.toFixed(3)),
            end: Number(range.end.toFixed(3)),
        };
    });
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

    test('opens as a lane: the whole recording, filling the viewer top to bottom', async ({
        page,
    }) => {
        // A manifest whose only canvas is a recording has no vertical axis to
        // look along, so its rect takes the SURFACE's shape and the fit lands on
        // the whole of it (`planScene.laneWorld`). What the reader gets is a
        // timeline: the entire recording across the full width, full height.
        await openViewer(page, AV_MANIFESTS.waveform);
        await expect(page.locator(WAVEFORM).first()).toBeVisible({
            timeout: 30_000,
        });

        const surface = await settledBox(page, SURFACE);
        const lane = await settledBox(page, WAVEFORM);

        expect(lane.height).toBeCloseTo(surface.height, 0);
        expect(lane.width).toBeCloseTo(surface.width, 0);

        const whole = await drawnRange(page);
        expect(whole?.start).toBeCloseTo(0, 1);
        expect(whole?.end).toBeCloseTo(TONE_DURATION, 1);
    });

    test('a lane cannot be zoomed out of, nor panned off vertically', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.waveform);
        await expect(page.locator(WAVEFORM).first()).toBeVisible({
            timeout: 30_000,
        });

        // The opening view is the reference for every reading below: the lane
        // fills the container at the fit (asserted against the renderer's own
        // surface in the test above), so "unchanged from home" is "still filling
        // the viewer" without re-deriving the container's box.
        const home = await settledBox(page, WAVEFORM);

        // The floor is the fit itself rather than half of it: there is nothing
        // else in this world to reveal by shrinking the timeline away from the
        // edges. A scale far below it is clamped back to the opening view.
        await zoomTo(page, 0.001);
        const floored = await settledBox(page, WAVEFORM);
        expect(floored).toEqual(home);

        // Zoomed in, the rect overhangs top and bottom — and the centre is
        // pinned, so what the reader sees is still the full height. Only the
        // time window narrows.
        await zoomTo(page, 8);
        const before = await settledRange(page);
        const zoomed = await settledBox(page, WAVEFORM);
        expect(zoomed.height).toBeCloseTo(home.height, 0);
        expect(zoomed.y).toBeCloseTo(home.y, 0);
        expect(before.end - before.start).toBeLessThan(TONE_DURATION / 2);

        // A vertical pan has nowhere to go: the centre is pinned, so neither the
        // box nor the window it draws moves. Far outside the rect, so nothing
        // but the pin could be holding it.
        await panTo(page, null, -4000);
        const afterVertical = await settledBox(page, WAVEFORM);
        expect(afterVertical.y).toBeCloseTo(home.y, 0);
        expect(afterVertical.height).toBeCloseTo(home.height, 0);
        expect(await settledRange(page)).toEqual(before);

        // A horizontal one does, and moving the window is the whole point of
        // having zoomed in.
        await panTo(page, 900, null);
        expect((await settledRange(page)).start).toBeGreaterThan(before.start);
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

        // Settled, not sampled: the opening fit animates and the image moves
        // again as the docked panel column slides out — compensated for the
        // narrower surface, not re-fitted — so a fraction taken off a moving box
        // seeks to the wrong moment.
        const lane = await settledBox(page, TIMELINE_LANE);
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

    test('gives a cover-art canvas a scrubber strip and no timeline lane', async ({
        page,
    }) => {
        // All three on ONE canvas: the recording, an `accompanyingCanvas` core
        // paints in the rect, and linked waveform data. The companion is what
        // decides where the peaks go — the rect belongs to the renderer, so the
        // stage draws no lanes and the waveform reaches the reader through the
        // transport, exactly as it does on video.
        await openViewer(page, AV_MANIFESTS.cover);

        await expect(page.locator(TIMELINE_LANE)).toBeHidden();
        await expect(page.locator(WAVEFORM)).toHaveCount(0);

        const strip = page.locator(PEAKS_STRIP);
        await expect(strip).toHaveCount(1, { timeout: 30_000 });
        expect(
            await strip.evaluate((el) => getComputedStyle(el).backgroundImage),
        ).toContain('data:image/png');

        // And the cover is core's to paint, so the canvas took the companion's
        // real dimensions rather than the duration-only rung: it is not a lane
        // world, and zoom and pan are an image's, not a timeline's.
        const media = page.locator(MEDIA).first();
        await expect(media).toHaveCount(1);
        expect(
            await media.evaluate((el) => (el as HTMLMediaElement).duration > 0),
        ).toBe(true);
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
