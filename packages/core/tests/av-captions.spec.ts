/**
 * **Captions and subtitles**, in a real browser: the only place the native text
 * track machinery exists at all.
 *
 * What only a browser can settle:
 *
 * - **A toggle appears only where there are working tracks**, and captions are
 *   off when the viewer opens. Turning them on produces the cue that covers the
 *   playhead; turning them off produces none.
 * - **Several tracks list by label and language**, and the list is operable
 *   from the keyboard alone.
 * - **A track the server refuses cross-origin is not offered.** The fixture
 *   server serves `no-cors-captions.vtt` without `Access-Control-Allow-Origin`,
 *   and it is reached through the `localhost` alias so the browser issues a
 *   genuinely cross-origin request — a CORS refusal, which is a different
 *   failure from a 404 and the one curators actually meet. No toggle renders,
 *   and the console carries one line saying why.
 *
 * As with the other AV specs, both artifacts are the BUILT ones a consumer
 * loads — `pnpm build:all` (or `build:element` plus the plugin's own
 * `pnpm build`) must have run.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import {
    AV_MANIFESTS,
    BARS_MP4,
    BARS_SIZE,
    CAPTIONS_VTT,
    CAPTIONS_VTT_EMPTY,
    CAPTIONS_VTT_IT,
    NO_CORS_CAPTIONS_VTT,
} from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const MEDIA = '[data-testid="av-media"]';
const TRANSPORT = '[data-testid="av-transport"]';
const CAPTIONS = '[data-testid="av-captions"]';
const CAPTION_LIST = '[data-testid="av-caption-list"]';

/**
 * A video canvas carrying its captions the second way — a canvas-level
 * `supplementing` annotation whose body is a Choice of one track per language,
 * which is cookbook 0074's shape. `AV_MANIFESTS.video` carries the first way
 * (the painting body array), so between them both real shapes are driven here.
 */
function captionedManifest(url: string, tracks: unknown): unknown {
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: url,
        type: 'Manifest',
        label: { en: ['Colour bars with supplementing captions'] },
        items: [
            {
                id: `${url}/canvas`,
                type: 'Canvas',
                width: BARS_SIZE.width,
                height: BARS_SIZE.height,
                duration: 2,
                items: [
                    {
                        id: `${url}/page`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${url}/annotation`,
                                type: 'Annotation',
                                motivation: 'painting',
                                target: `${url}/canvas`,
                                body: {
                                    id: BARS_MP4,
                                    type: 'Video',
                                    format: 'video/mp4',
                                    width: BARS_SIZE.width,
                                    height: BARS_SIZE.height,
                                    duration: 2,
                                },
                            },
                        ],
                    },
                ],
                annotations: [
                    {
                        id: `${url}/annopage`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${url}/captions`,
                                type: 'Annotation',
                                motivation: 'supplementing',
                                target: `${url}/canvas`,
                                body: tracks,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

const MULTI_URL = '/media/manifests/av-captions-multi.json';
const MULTI_MANIFEST = captionedManifest(MULTI_URL, {
    type: 'Choice',
    items: [
        {
            id: CAPTIONS_VTT,
            type: 'Text',
            format: 'text/vtt',
            language: 'en',
            label: { en: ['Captions in WebVTT format'] },
        },
        {
            id: CAPTIONS_VTT_IT,
            type: 'Text',
            format: 'text/vtt',
            language: 'it',
            label: { it: ['Sottotitoli in formato WebVTT'] },
        },
    ],
});

/**
 * The same canvas, captioned from a server that grants no CORS.
 *
 * The dev server is bound to `127.0.0.1` and `localhost` is an alias for it, so
 * a page loaded from one and a track fetched from the other is a real
 * cross-origin fetch of a real file. Text tracks are always fetched with CORS,
 * so the refusal is the browser's own and not something staged in JavaScript.
 */
const NO_CORS_URL = '/media/manifests/av-captions-no-cors.json';
const NO_CORS_MANIFEST = captionedManifest(NO_CORS_URL, {
    id: `http://localhost:5175${NO_CORS_CAPTIONS_VTT}`,
    type: 'Text',
    format: 'text/vtt',
    language: 'en',
    label: { en: ['Captions from a server that grants no CORS'] },
});

/**
 * The same canvas again, captioned by a file that is valid WebVTT and carries
 * no cues. It LOADS: the failure is not the browser's to report, and a toggle
 * over it would select a track that draws nothing.
 */
const EMPTY_URL = '/media/manifests/av-captions-empty.json';
const EMPTY_MANIFEST = captionedManifest(EMPTY_URL, {
    id: CAPTIONS_VTT_EMPTY,
    type: 'Text',
    format: 'text/vtt',
    language: 'en',
    label: { en: ['Captions that were never written'] },
});

async function openViewer(page: Page, manifest: string): Promise<void> {
    await serveAvPluginDist(page);
    for (const [url, json] of [
        [MULTI_URL, MULTI_MANIFEST],
        [NO_CORS_URL, NO_CORS_MANIFEST],
        [EMPTY_URL, EMPTY_MANIFEST],
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
    await page
        .locator(TRANSPORT)
        .waitFor({ state: 'visible', timeout: 30_000 });
}

/** The text of the cue covering the playhead on the showing track, or `null`. */
async function showingCue(page: Page): Promise<string | null> {
    return page.locator(MEDIA).evaluate((element) => {
        const media = element as HTMLMediaElement;
        for (const track of media.textTracks) {
            if (track.mode !== 'showing') continue;
            const cue = track.activeCues?.[0] as VTTCue | undefined;
            return cue?.text ?? null;
        }
        return null;
    });
}

/** Which track is showing, by `srclang`, or `null` for none. */
async function showingLanguage(page: Page): Promise<string | null> {
    return page.locator(MEDIA).evaluate((element) => {
        const media = element as HTMLMediaElement;
        for (const track of media.textTracks) {
            if (track.mode === 'showing') return track.language || null;
        }
        return null;
    });
}

/** Put the playhead inside the second cue's window (0.7 s – 1.4 s). */
async function seekIntoSecondCue(page: Page): Promise<void> {
    await page.locator(MEDIA).evaluate((element) => {
        (element as HTMLMediaElement).currentTime = 1;
    });
}

test.describe('av captions — VTT text tracks', () => {
    test('offers a toggle, off to begin with, that shows and hides cues', async ({
        page,
    }) => {
        // `AV_MANIFESTS.video` carries the VTT in the painting annotation's
        // body array, beside the video it captions.
        await openViewer(page, AV_MANIFESTS.video);

        const toggle = page.locator(CAPTIONS);
        await expect(toggle).toBeVisible();
        // One track, so a plain toggle rather than a list.
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        expect(await showingCue(page)).toBeNull();

        await seekIntoSecondCue(page);
        await toggle.click();

        await expect(toggle).toHaveAttribute('aria-pressed', 'true');
        // Polled: the track is parsed and the cue activated on the browser's
        // own schedule, not on the click's.
        await expect
            .poll(() => showingCue(page), { timeout: 10_000 })
            .toBe('Colour bars, second third.');

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(() => showingCue(page)).toBeNull();
    });

    test('lists several tracks and switches between them by keyboard', async ({
        page,
    }) => {
        await openViewer(page, MULTI_URL);

        const toggle = page.locator(CAPTIONS);
        await expect(toggle).toBeVisible();
        await expect(page.locator(CAPTION_LIST)).toHaveCount(0);

        await toggle.click();
        const options = page.locator(`${CAPTION_LIST} [role="radio"]`);
        await expect(options).toHaveText([
            'Off',
            'Captions in WebVTT format (en)',
            'Sottotitoli in formato WebVTT (it)',
        ]);
        // Off is where it starts, and opening puts the keyboard on it.
        await expect(options.nth(0)).toHaveAttribute('aria-checked', 'true');
        await expect(options.nth(0)).toBeFocused();

        await seekIntoSecondCue(page);

        // Selection follows focus, as it does in every other radio group.
        await page.keyboard.press('ArrowDown');
        await expect(options.nth(1)).toHaveAttribute('aria-checked', 'true');
        await expect.poll(() => showingLanguage(page)).toBe('en');
        await expect
            .poll(() => showingCue(page), { timeout: 10_000 })
            .toBe('Colour bars, second third.');

        await page.keyboard.press('ArrowDown');
        await expect(options.nth(2)).toHaveAttribute('aria-checked', 'true');
        await expect.poll(() => showingLanguage(page)).toBe('it');
        await expect
            .poll(() => showingCue(page), { timeout: 10_000 })
            .toBe('Barre colorate, secondo terzo.');

        // Escape leaves the list rather than trapping the keyboard in it.
        await page.keyboard.press('Escape');
        await expect(page.locator(CAPTION_LIST)).toHaveCount(0);
        await expect(toggle).toBeFocused();
    });

    test('renders no toggle for a track the server refuses cross-origin', async ({
        page,
    }) => {
        const warnings: string[] = [];
        page.on('console', (message) => {
            const text = message.text();
            if (text.includes('[triiiceratops]') && text.includes('caption'))
                warnings.push(text);
        });

        await openViewer(page, NO_CORS_URL);

        // The transport is up and the track has had its chance to load; the
        // control that would select it is simply never rendered.
        await expect
            .poll(() => warnings.length, { timeout: 15_000 })
            .toBeGreaterThan(0);
        await expect(page.locator(CAPTIONS)).toHaveCount(0);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Access-Control-Allow-Origin');

        // What makes this fixture a CORS refusal rather than a 404 or a dead
        // host: the file is THERE, answered 200, and carries no
        // `Access-Control-Allow-Origin`. Pinned here because the plugin's
        // warning names CORS for every load failure alike and so cannot tell
        // the three apart, and because the browser refuses the response without
        // ever exposing it to the page. Fetched through Playwright's own
        // request context, which is not subject to the page's CORS rules and
        // therefore reports the headers as the server actually sent them.
        const served = await page.request.get(
            `http://localhost:5175${NO_CORS_CAPTIONS_VTT}`,
        );
        expect(served.status()).toBe(200);
        expect(served.headers()['access-control-allow-origin']).toBeUndefined();
        // And the ordinary one differs in exactly that header.
        const granted = await page.request.get(
            `http://localhost:5175${CAPTIONS_VTT}`,
        );
        expect(granted.status()).toBe(200);
        expect(granted.headers()['access-control-allow-origin']).toBe('*');
    });

    /*
        The other way to a dead toggle, and the one no `error` event reports: a
        file that is valid WebVTT and has no cues in it loads perfectly.
    */
    test('renders no toggle for a track that loads with no cues', async ({
        page,
    }) => {
        const warnings: string[] = [];
        page.on('console', (message) => {
            const text = message.text();
            if (text.includes('[triiiceratops]') && text.includes('caption'))
                warnings.push(text);
        });

        await openViewer(page, EMPTY_URL);

        await expect
            .poll(() => warnings.length, { timeout: 15_000 })
            .toBeGreaterThan(0);
        await expect(page.locator(CAPTIONS)).toHaveCount(0);
        expect(warnings).toHaveLength(1);
    });

    /*
        A track settles on the network's schedule, long after the transport has
        rendered and — the viewer being paused — after every playback cadence
        that would refresh it has gone quiet. The stage telling the transport a
        track arrived is the only thing that can bring the toggle in.
    */
    test('brings in the toggle for a track that loads long after the transport', async ({
        page,
    }) => {
        await page.route(`**${CAPTIONS_VTT}`, async (route) => {
            const response = await route.fetch();
            await new Promise((resolve) => setTimeout(resolve, 3_000));
            await route.fulfill({ response });
        });

        await openViewer(page, AV_MANIFESTS.video);

        // Nothing yet: the file is still in flight.
        await expect(page.locator(CAPTIONS)).toHaveCount(0);
        await expect(page.locator(CAPTIONS)).toBeVisible({ timeout: 15_000 });
    });

    /*
        A 208px panel over the picture must not need a second visit to the
        control that opened it, or a key nothing tells the reader about, to go
        away again.
    */
    test('dismisses the track list when focus leaves it', async ({ page }) => {
        await openViewer(page, MULTI_URL);

        await page.locator(CAPTIONS).click();
        await expect(page.locator(CAPTION_LIST)).toBeVisible();

        // A press on anything outside the control takes focus off the list —
        // here the transport's own total-time readout, which is not itself
        // focusable and so does nothing but blur what was. The readout at the
        // OTHER end of the row is unreachable: the docked left panel stack
        // covers the transport's leading controls, a core defect this ticket
        // did not introduce and does not fix.
        await page.locator('[data-testid="av-duration"]').click();
        await expect(page.locator(CAPTION_LIST)).toHaveCount(0);
    });
});
