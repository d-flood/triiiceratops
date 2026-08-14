/**
 * HLS playback, and the lazy chunk that makes it possible.
 *
 * Everything here needs a real browser and a real network log:
 *
 * - **A local HLS playlist plays through the hls.js chunk** where the platform
 *   decodes no HLS: the chunk is fetched from beside the plugin's own script
 *   and the stream is decoded through Media Source Extensions.
 * - **Seeking crosses a segment boundary.** The fixture is four segments over
 *   two seconds, so a seek from the first into the last is a seek the player
 *   can only satisfy by fetching another segment.
 * - **Native HLS wins where it exists.** The same manifest plays off `src` and
 *   not one byte of hls.js is requested.
 * - **Nothing else pays for it.** An MP4-only manifest fetches no hls.js; an
 *   image-only manifest fetches no plugin chunk at all, only the entry.
 *
 * Which branch a browser takes is decided by `canPlayType`, so which branch a
 * browser takes is what is STUBBED here — in both directions. Playwright's
 * Chromium answers `'maybe'` for `application/vnd.apple.mpegurl` and really
 * does play the playlist off `src`, so left alone it would exercise the native
 * path twice and the chunk path never. The stub is one line of `canPlayType`
 * and nothing else: the manifest, the media, the plugin and the decision rule
 * are all the real ones.
 *
 * Both artifacts are the BUILT ones a consumer loads — `pnpm build:all` (or
 * `build:element` plus the plugin's own `pnpm build`) must have run. The
 * plugin's dist is a DIRECTORY here rather than one file, and
 * `serveAvPluginDist` hosts all of it: the entry resolves its chunks against
 * its own script URL, so a page that hosted only `iife.js` would play no
 * stream at all.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { AV_MANIFESTS, BARS_HLS, BARS_MP4, BARS_SIZE } from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const CANNOT_PLAY = '[data-testid="av-cannot-play"]';

/** The emitted chunk name — the one file that carries hls.js. */
const HLS_CHUNK = 'av-hls.js';

/** An MP4-only manifest: the same pictures, delivered progressively. */
const MP4_URL = '/media/manifests/av-hls-mp4-only.json';
const MP4_CANVAS = `${MP4_URL}/canvas/bars`;
const MP4_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: MP4_URL,
    type: 'Manifest',
    label: { en: ['The colour bars, progressive'] },
    items: [
        {
            id: MP4_CANVAS,
            type: 'Canvas',
            ...BARS_SIZE,
            duration: 2.0,
            items: [
                {
                    id: `${MP4_CANVAS}/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${MP4_CANVAS}/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: BARS_MP4,
                                type: 'Video',
                                format: 'video/mp4',
                                ...BARS_SIZE,
                                duration: 2.0,
                            },
                            target: MP4_CANVAS,
                        },
                    ],
                },
            ],
        },
    ],
};

/** A canvas core paints itself: no claim, no stage, and no plugin chunk. */
const IMAGE_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=';
const IMAGE_URL = '/media/manifests/av-hls-image-only.json';
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

/**
 * Every URL the page requested, recorded from before navigation so the plugin's
 * own script and chunks are all in it.
 */
function recordRequests(page: Page): string[] {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    return requested;
}

async function openViewer(
    page: Page,
    manifest: string,
    options: { nativeHls?: boolean; expectStage?: boolean } = {},
): Promise<void> {
    if (options.nativeHls !== undefined) {
        // `'maybe'` is what Safari and every iOS browser answer; `''` is what a
        // browser with no HLS pipeline answers. Installed before any page
        // script runs, because the plugin asks the element the moment it builds
        // a stage.
        await page.addInitScript(
            (answer) => {
                const original = HTMLMediaElement.prototype.canPlayType;
                HTMLMediaElement.prototype.canPlayType = function (
                    type: string,
                ) {
                    return /mpegurl/i.test(type)
                        ? (answer as CanPlayTypeResult)
                        : original.call(this, type);
                };
            },
            options.nativeHls ? 'maybe' : '',
        );
    }

    await serveAvPluginDist(page);
    for (const [url, json] of [
        [MP4_URL, MP4_MANIFEST],
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

/** The stage's media element, once it has decoded enough to report a duration. */
async function readyMedia(page: Page) {
    const media = page.locator(MEDIA).first();
    await expect
        .poll(
            () =>
                media.evaluate((el) => (el as HTMLMediaElement).readyState > 0),
            { timeout: 30_000 },
        )
        .toBe(true);
    return media;
}

test.describe('av hls — streaming through a lazily loaded chunk', () => {
    test('plays the local HLS manifest, fetching hls.js on demand', async ({
        page,
    }) => {
        const requested = recordRequests(page);
        await openViewer(page, AV_MANIFESTS.hls, { nativeHls: false });

        const media = await readyMedia(page);

        // With no native HLS, the only way a duration exists at all is that
        // hls.js was fetched and attached a MediaSource.
        expect(requested.some((url) => url.endsWith(HLS_CHUNK))).toBe(true);
        // The playlist URL is nowhere on the element: what `src` carries is the
        // `blob:` MediaSource hls.js attached, which is the observable
        // difference between this branch and the native one.
        expect(
            await media.evaluate((el) => el.getAttribute('src')),
        ).not.toContain('m3u8');
        await expect(page.locator(CANNOT_PLAY)).toBeHidden();

        await expect
            .poll(
                () => media.evaluate((el) => (el as HTMLMediaElement).duration),
                { timeout: 30_000 },
            )
            .toBeGreaterThan(1.5);

        // The playlist itself was fetched, which is what tells this apart from
        // a browser that quietly fell back to something else.
        expect(requested.some((url) => url.includes(BARS_HLS))).toBe(true);
    });

    test('seeks across a segment boundary', async ({ page }) => {
        await openViewer(page, AV_MANIFESTS.hls, { nativeHls: false });
        const media = await readyMedia(page);

        // Four segments over two seconds, so 0.2 s and 1.7 s are in different
        // ones: only a player that fetched another segment can arrive there
        // with data to show.
        await media.evaluate((el) => {
            (el as HTMLMediaElement).currentTime = 0.2;
        });
        await expect
            .poll(
                () =>
                    media.evaluate(
                        (el) => (el as HTMLMediaElement).currentTime,
                    ),
                { timeout: 20_000 },
            )
            .toBeCloseTo(0.2, 1);

        await media.evaluate((el) => {
            (el as HTMLMediaElement).currentTime = 1.7;
        });
        await expect
            .poll(
                () =>
                    media.evaluate(
                        (el) => (el as HTMLMediaElement).currentTime,
                    ),
                { timeout: 20_000 },
            )
            .toBeCloseTo(1.7, 1);
        await expect
            .poll(
                () =>
                    media.evaluate((el) => (el as HTMLMediaElement).readyState),
                { timeout: 20_000 },
            )
            .toBeGreaterThanOrEqual(2);
    });

    test('plays natively, and fetches no hls.js, where the platform decodes HLS', async ({
        page,
    }) => {
        const requested = recordRequests(page);
        await openViewer(page, AV_MANIFESTS.hls, { nativeHls: true });

        // The playlist goes straight onto `src` and the chunk is never asked
        // for. Playwright's Chromium then really does decode it, but the
        // assertion is the ROUTE rather than the playback: a browser that
        // answers `canPlayType` and then fails is the platform's problem, and
        // the media element reports it through the same `error` path a dead MP4
        // takes.
        await expect
            .poll(() => page.locator(MEDIA).first().getAttribute('src'), {
                timeout: 30_000,
            })
            .toContain('bars.m3u8');

        await page.waitForTimeout(1000);
        expect(requested.filter((url) => url.endsWith(HLS_CHUNK))).toEqual([]);
    });

    test('fetches no hls.js for an MP4-only manifest', async ({ page }) => {
        const requested = recordRequests(page);
        await openViewer(page, MP4_URL);

        const media = await readyMedia(page);
        expect(await media.evaluate((el) => el.getAttribute('src'))).toContain(
            'bars.mp4',
        );

        await page.waitForTimeout(1000);
        expect(requested.filter((url) => url.endsWith(HLS_CHUNK))).toEqual([]);
    });

    test('fetches no plugin chunk at all for an image-only manifest', async ({
        page,
    }) => {
        const requested = recordRequests(page);
        await openViewer(page, IMAGE_URL, { expectStage: false });
        // Let anything the activation would have kicked off actually go out.
        await page.waitForTimeout(1000);

        const pluginRequests = requested.filter((url) =>
            url.includes('/plugin-av/'),
        );
        // The entry, and nothing beside it.
        expect(pluginRequests.map((url) => url.split('/').pop())).toEqual([
            'iife.js',
        ]);
    });
});
