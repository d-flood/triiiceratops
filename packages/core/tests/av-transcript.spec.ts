/**
 * **The transcript panel**, in a real browser: the only place WebVTT is ever
 * parsed into cues at all.
 *
 * What only a browser can settle:
 *
 * - **A sound recording gets its words.** The transcript is the whole point of
 *   the ticket: an `<audio>` element has no area to paint captions in, so a
 *   list of cues is the only way an oral history's text reaches a reader.
 * - **A cue seeks and never plays** (the epic's standing rule).
 * - **The highlight follows the playhead** during real playback.
 * - **With several languages it follows the caption selection**, which is a
 *   video-only control — so this is where the two features meet.
 * - **axe over the open panel, and a keyboard-only walk to a cue.** The repo's
 *   standing `a11y-axe.spec.ts` scans a demo page with no AV canvas on it, so
 *   the AV chrome has no coverage there; this is the transcript's own.
 * - **The composed-canvas seam**, which is the whole of `transcriptSource`'s
 *   reason to exist and the one thing no unit test can reach: the shift it
 *   reports is the DIFFERENCE between two clocks — AVState's canvas time and
 *   the element's own — and a sampled difference between two clocks is exactly
 *   what goes wrong while a segment is being swapped. It is therefore probed
 *   in motion, across a real seam, and not only at rest on either side of it.
 *
 * As with the other AV specs, both artifacts are the BUILT ones a consumer
 * loads — `pnpm build:all` (or `build:element` plus the plugin's own
 * `pnpm build`) must have run.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import {
    AV_MANIFESTS,
    BARS_MP4,
    BARS_SIZE,
    CAPTIONS_VTT,
    CAPTIONS_VTT_IT,
    TONE_MP3,
} from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const MEDIA = '[data-testid="av-media"]';
const TRANSPORT = '[data-testid="transport"]';
const CAPTIONS = '[data-testid="transport-tracks"]';
const CAPTION_LIST = '[data-testid="transport-track-list"]';
const TRANSCRIPT = '[data-testid="av-transcript"]';
const TRANSCRIPT_TRACK = '[data-testid="av-transcript-track"]';
const CUES = '[data-testid="av-transcript-cues"] button';

/**
 * A canvas captioned the way both cookbook caption recipes do it — a
 * canvas-level `supplementing` annotation — over either medium. The audio half
 * is the shape this ticket exists for and the one no local fixture had: a
 * duration-only Sound canvas whose words can only ever be read, never painted.
 */
function captionedManifest(
    url: string,
    body: { audio: boolean; tracks: unknown },
): unknown {
    const canvas = body.audio
        ? {
              duration: 2,
              painting: {
                  id: TONE_MP3,
                  type: 'Sound',
                  format: 'audio/mpeg',
                  duration: 2,
              },
          }
        : {
              duration: 2,
              width: BARS_SIZE.width,
              height: BARS_SIZE.height,
              painting: {
                  id: BARS_MP4,
                  type: 'Video',
                  format: 'video/mp4',
                  ...BARS_SIZE,
                  duration: 2,
              },
          };

    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: url,
        type: 'Manifest',
        label: { en: ['A captioned recording'] },
        items: [
            {
                id: `${url}/canvas`,
                type: 'Canvas',
                duration: canvas.duration,
                ...(body.audio
                    ? {}
                    : { width: BARS_SIZE.width, height: BARS_SIZE.height }),
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
                                body: canvas.painting,
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
                                body: body.tracks,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

const EN_TRACK = {
    id: CAPTIONS_VTT,
    type: 'Text',
    format: 'text/vtt',
    language: 'en',
    label: { en: ['Captions in WebVTT format'] },
};
const IT_TRACK = {
    id: CAPTIONS_VTT_IT,
    type: 'Text',
    format: 'text/vtt',
    language: 'it',
    label: { it: ['Sottotitoli in formato WebVTT'] },
};

const AUDIO_URL = '/media/manifests/av-transcript-audio.json';
const AUDIO_MANIFEST = captionedManifest(AUDIO_URL, {
    audio: true,
    tracks: EN_TRACK,
});

const MULTI_URL = '/media/manifests/av-transcript-multi.json';
const MULTI_MANIFEST = captionedManifest(MULTI_URL, {
    audio: false,
    tracks: { type: 'Choice', items: [EN_TRACK, IT_TRACK] },
});

async function openViewer(page: Page, manifest: string): Promise<void> {
    await serveAvPluginDist(page);
    for (const [url, json] of [
        [AUDIO_URL, AUDIO_MANIFEST],
        [MULTI_URL, MULTI_MANIFEST],
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

/** Seek through AVState, which is the path the scrubber and a host both take. */
async function seek(page: Page, seconds: number): Promise<void> {
    await page.evaluate((at) => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                getPluginState(id: string): { seek(t: number): void } | null;
            };
        };
        host.viewerState.getPluginState('av')?.seek(at);
    }, seconds);
}

/** The media element's own view of playback. */
async function playback(
    page: Page,
): Promise<{ currentTime: number; paused: boolean }> {
    return page.locator(MEDIA).evaluate((element) => {
        const media = element as HTMLMediaElement;
        return { currentTime: media.currentTime, paused: media.paused };
    });
}

/** The index of the cue currently marked as the playhead's, or `-1`. */
async function activeCue(page: Page): Promise<number> {
    return page
        .locator(CUES)
        .evaluateAll((buttons) =>
            buttons.findIndex(
                (button) => button.getAttribute('aria-current') === 'true',
            ),
        );
}

test.describe('av transcript — VTT cues as readable text', () => {
    test('lists a sound recording’s cues and seeks to one without playing', async ({
        page,
    }) => {
        await openViewer(page, AUDIO_URL);

        // The panel names the track it is reading, because with no captions
        // toggle over a sound recording nothing else could say which it is.
        await expect(page.locator(TRANSCRIPT)).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(TRANSCRIPT_TRACK)).toContainText(
            'Captions in WebVTT format',
        );

        // Real list semantics: an `<ol>` of `<li>`, each with a real button.
        await expect(page.locator(CUES)).toHaveText([
            '0:00Colour bars, first third.',
            '0:00Colour bars, second third.',
            '0:01Colour bars, last third.',
        ]);

        // An audio canvas gets no captions toggle: there is nowhere to paint a
        // cue, so the control would be the dead one user story 46 forbids.
        await expect(page.locator(CAPTIONS)).toHaveCount(0);

        expect((await playback(page)).paused).toBe(true);
        await page.locator(CUES).nth(1).click();

        // Seek, never autoplay — polled, because the element services the seek
        // on its own schedule.
        await expect
            .poll(async () => (await playback(page)).currentTime, {
                timeout: 10_000,
            })
            .toBeGreaterThanOrEqual(0.7);
        expect((await playback(page)).paused).toBe(true);
    });

    test('advances the active cue highlight during playback', async ({
        page,
    }) => {
        await openViewer(page, AUDIO_URL);
        await expect(page.locator(CUES)).toHaveCount(3, { timeout: 30_000 });

        await expect.poll(() => activeCue(page)).toBe(0);

        await page.locator(MEDIA).evaluate((element) => {
            const media = element as HTMLMediaElement;
            media.muted = true;
            return media.play();
        });

        // Polled to settle rather than sampled once: the highlight rides the
        // frame cadence, not the click.
        await expect
            .poll(() => activeCue(page), { timeout: 15_000 })
            .toBeGreaterThan(0);
    });

    test('follows the selected caption track on a multilingual video', async ({
        page,
    }) => {
        await openViewer(page, MULTI_URL);

        // Captions off to begin with, so the transcript reads the first track
        // and says so.
        await expect(page.locator(TRANSCRIPT_TRACK)).toContainText(
            'Captions in WebVTT format',
            { timeout: 30_000 },
        );

        await page.locator(CAPTIONS).click();
        const options = page.locator(`${CAPTION_LIST} [role="radio"]`);
        await options.nth(2).click();

        await expect(page.locator(TRANSCRIPT_TRACK)).toContainText(
            'Sottotitoli in formato WebVTT',
            { timeout: 15_000 },
        );
        await expect(page.locator(CUES).first()).toHaveText(
            '0:00Barre colorate, primo terzo.',
        );
    });

    /* The no-dead-control rule, unchanged from ticket 13. */
    test('offers no transcript for a canvas with no VTT', async ({ page }) => {
        await openViewer(page, AV_MANIFESTS.audio);

        // Attached rather than visible: the panel with no transcript in it is
        // empty, which is the whole of the no-dead-control rule here.
        await expect(page.locator('[data-testid="av-panel"]')).toBeAttached();
        await expect(page.locator(TRANSCRIPT)).toHaveCount(0);
    });

    /**
     * The seam, at rest on each side of it. Each segment's VTT is authored on
     * its own painting annotation, so ticket 18 windows the eligible set down
     * to the playing segment's — and the panel must re-sync to it rather than
     * go on naming the one before.
     */
    test('re-sources the transcript across a composed segment seam', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.composedCaptions);

        // Segment one: the English track, its cues at their own times.
        await expect(page.locator(TRANSCRIPT_TRACK)).toContainText(
            'Captions in English',
            { timeout: 30_000 },
        );
        await expect(page.locator(CUES)).toHaveText([
            '0:00Colour bars, first third.',
            '0:00Colour bars, second third.',
            '0:01Colour bars, last third.',
        ]);

        // Seek across the seam into segment two.
        await seek(page, 3);

        // Segment two: the Italian track — and its cues in CANVAS time, shifted
        // by the 2s the segment starts at. That shift is `transcriptSource`'s
        // whole job, and it is wrong by two seconds if the offset is dropped.
        await expect(page.locator(TRANSCRIPT_TRACK)).toContainText(
            'Sottotitoli in italiano',
            { timeout: 30_000 },
        );
        await expect(page.locator(CUES)).toHaveText([
            '0:02Barre colorate, primo terzo.',
            '0:02Barre colorate, secondo terzo.',
            '0:03Barre colorate, ultimo terzo.',
        ]);
    });

    /**
     * The same seam crossed by PLAYING over it, sampling the panel throughout.
     *
     * The shift is derived as `AVState.currentTime − media.currentTime`, and
     * during a swap those two clocks belong to different media for a moment.
     * A transcript that sampled them mid-swap would show cue times jumping to
     * somewhere else on the timeline. The invariant asserted is therefore not
     * a single settled value but a bound holding over EVERY sample: the first
     * listed cue is only ever at 0:00 (segment one) or 0:02 (segment two), and
     * never anything in between or beyond.
     */
    test('never shows a cue time off the canvas timeline while crossing the seam', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.composedCaptions);
        await expect(page.locator(CUES)).toHaveCount(3, { timeout: 30_000 });

        // Start just before the seam so the swap happens under the sampling.
        await seek(page, 1.4);
        await page.locator(MEDIA).evaluate((element) => {
            const media = element as HTMLMediaElement;
            media.muted = true;
            return media.play();
        });

        const samples: string[] = [];
        const deadline = Date.now() + 20_000;
        let crossed = false;
        while (Date.now() < deadline && !crossed) {
            const first = await page
                .locator(CUES)
                .first()
                .textContent()
                .catch(() => null);
            if (first) {
                samples.push(first);
                crossed = first.startsWith('0:02');
            }
            await page.waitForTimeout(50);
        }

        // The seam really was crossed under the sampling, or this proves nothing.
        expect(crossed).toBe(true);
        expect(samples.length).toBeGreaterThan(3);

        // Every sample is one of the two legitimate states — no third value
        // from a shift read across a half-finished swap.
        const stamps = [...new Set(samples.map((text) => text.slice(0, 4)))];
        expect(stamps.sort()).toEqual(['0:00', '0:02']);
    });

    test('passes axe over the open transcript panel', async ({ page }) => {
        await openViewer(page, AUDIO_URL);
        await expect(page.locator(CUES)).toHaveCount(3, { timeout: 30_000 });

        const results = await new AxeBuilder({ page })
            .include('triiiceratops-viewer')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();

        expect(results.violations).toEqual([]);
    });

    test('reaches and activates a cue by keyboard alone', async ({ page }) => {
        await openViewer(page, AUDIO_URL);
        await expect(page.locator(CUES)).toHaveCount(3, { timeout: 30_000 });

        /** The deeply-focused element's cue index, piercing shadow roots. */
        const focusedCue = () =>
            page.evaluate(() => {
                let element: Element | null = document.activeElement;
                while (element?.shadowRoot?.activeElement)
                    element = element.shadowRoot.activeElement;
                const index = (element as HTMLElement | null)?.dataset.cueIndex;
                return index === undefined ? null : Number(index);
            });

        // Tabbed to from the page rather than focused directly: a control that
        // cannot be REACHED by keyboard is not keyboard-operable.
        let reached: number | null = null;
        for (let step = 0; step < 60 && reached === null; step += 1) {
            await page.keyboard.press('Tab');
            reached = await focusedCue();
        }
        expect(reached).toBe(0);

        await page.keyboard.press('Tab');
        expect(await focusedCue()).toBe(1);
        await page.keyboard.press('Enter');

        await expect
            .poll(async () => (await playback(page)).currentTime, {
                timeout: 10_000,
            })
            .toBeGreaterThanOrEqual(0.7);
        expect((await playback(page)).paused).toBe(true);
    });
});
