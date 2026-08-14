/**
 * The **canvas timeline** of a temporally composed canvas, in a real browser.
 *
 * What only a browser can settle:
 *
 * - **The seam is crossed by playing across it.** The first segment's media
 *   runs out, the next one's element is swapped in, and the playhead — in
 *   CANVAS time — carries on past the boundary instead of stopping at it. No
 *   unit test can prove that: it needs a real decoder reaching the end of real
 *   media and a second file being fetched behind it.
 * - **The scrubber spans the whole canvas.** One transport, whose `aria-valuemax`
 *   is the canvas's duration and not the playing segment's — the observable
 *   half of "AVState was built on canvas time all along".
 * - **A seek into the second segment loads the second file.** The two segments
 *   are deliberately different media, so which one is attached is readable off
 *   the element's `src` rather than inferred from the clock.
 * - **Paused stays paused across a seek between segments**, which crosses a
 *   swap that has its own `play()` in it.
 * - **The vendored `0064-opera-one-canvas` recipe loads and plays**, with its
 *   own two-act composition and no developer warnings.
 *
 * Both artifacts are the BUILT ones a consumer loads — `pnpm build:all` (or
 * `build:element` plus the plugin's own `pnpm build`) must have run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { AV_MANIFESTS } from './helpers/avMedia';
import { serveAvPluginDist } from './helpers/avPluginDist';
import { settled } from './helpers/settle';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const PLAY = '[data-testid="av-play"]';
const MUTE = '[data-testid="av-mute"]';
const SCRUBBER = '[data-testid="av-scrubber"]';

/** `av-composed.json`: `#t=0,2` plays the bars, `#t=2,4` plays the tone. */
const COMPOSED_DURATION = 4;
const SEAM_AT = 2;

/**
 * `av-composed-short.json`: the same two clips, but the bars are given only the
 * first four tenths of a second. Their media outruns their window by 1.6s, so
 * the seam is a full 1.6 seconds before the `ended` that would otherwise take
 * it — which is what {@link SHORT_SEAM_BUDGET_MS} is measured against.
 */
const SHORT_DURATION = 2.4;
const SHORT_SEAM_AT = 0.4;

/**
 * How long the swap may take and still prove the FRAME CHECK took the seam.
 *
 * The window closes 0.4s in and the media runs to 2.0s, so `ended` cannot
 * deliver the second body before 2,000ms however fast the machine is. Anything
 * inside this budget was the frame check.
 */
const SHORT_SEAM_BUDGET_MS = 1_500;

/**
 * The vendored opera recipe, served at its own id with its media redirected to
 * the local clip.
 *
 * The recipe is used unmodified — its two `#t=` targets, its 7,278-second
 * canvas and its structures are what is under test. Only the network is stood
 * in for: `fixtures.iiif.io` is not reachable from a hermetic run, and two
 * hours of opera would not be worth fetching if it were.
 */
const OPERA_URL =
    'https://iiif.io/api/cookbook/recipe/0064-opera-one-canvas/manifest.json';
const OPERA_CANVAS =
    'https://iiif.io/api/cookbook/recipe/0064-opera-one-canvas/canvas/1';
const OPERA_DURATION = 7278.422;
const OPERA_ACT_2_AT = 3971.24;
const OPERA_JSON = readFileSync(
    join(
        import.meta.dirname,
        '../src/lib/test/fixtures/manifests/av/0064-opera-one-canvas.json',
    ),
    'utf8',
);

/** The stage's element, whichever segment it is currently playing. */
function media(page: Page) {
    return page.locator(`${STAGE} ${MEDIA}`).first();
}

/** What the element is playing right now, and where it is in its OWN clock. */
function elementState(
    page: Page,
): Promise<{ src: string; currentTime: number; paused: boolean }> {
    return media(page).evaluate((el) => {
        const element = el as HTMLMediaElement;
        return {
            src: element.currentSrc || element.src,
            currentTime: element.currentTime,
            paused: element.paused,
        };
    });
}

/** The playhead in CANVAS time, as AVState publishes it to a host. */
function canvasTime(page: Page): Promise<number> {
    return page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                getPluginState(id: string): { currentTime: number } | null;
            };
        };
        return host.viewerState.getPluginState('av')?.currentTime ?? -1;
    });
}

/** The duration AVState publishes — the canvas's, never the segment's. */
function canvasDuration(page: Page): Promise<number | null> {
    return page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                getPluginState(id: string): { duration: number | null } | null;
            };
        };
        return host.viewerState.getPluginState('av')?.duration ?? null;
    });
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

async function openViewer(
    page: Page,
    manifest: string,
    warnings?: string[],
): Promise<void> {
    await serveAvPluginDist(page);
    if (warnings)
        page.on('console', (message) => {
            if (message.type() === 'warning') warnings.push(message.text());
        });

    await page.route(`**${OPERA_URL}`, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: OPERA_JSON,
        }),
    );
    // Both acts stand in as the same two-second clip, served as bytes rather
    // than as a redirect — a `Location` relative to `fixtures.iiif.io` would
    // resolve back onto this same route. What is under test is the
    // composition, not the opera.
    await page.route('https://fixtures.iiif.io/**', (route) =>
        route.fulfill({
            contentType: 'video/mp4',
            body: readFileSync(join(import.meta.dirname, 'media/bars.mp4')),
        }),
    );

    await page.goto(`${FIXTURE}?manifest=${encodeURIComponent(manifest)}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    await page
        .locator(STAGE)
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 });
    // The sequencer arrives with its chunk, a few frames after the stage.
    await expect.poll(() => canvasDuration(page)).not.toBeNull();
}

/**
 * Start playback from just before a canvas time, as a reader would.
 *
 * Muted first — a headless browser refuses audible script-initiated playback —
 * and the play itself is a real click, because the autoplay policy wants a
 * gesture. The seek is not playback and needs neither.
 */
async function playFrom(page: Page, at: number): Promise<void> {
    await page.locator(MUTE).click();
    await seek(page, at);
    await page.locator(PLAY).click();
    await expect
        .poll(async () => (await elementState(page)).paused)
        .toBe(false);
}

test.describe('av composed canvas — one timeline over several bodies', () => {
    test('publishes the canvas duration on a scrubber that spans the whole work', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.composed);

        // Not 2 — the first segment's media is two seconds long, and the
        // canvas is four.
        expect(await canvasDuration(page)).toBe(COMPOSED_DURATION);
        expect(await page.locator(SCRUBBER).getAttribute('aria-valuemax')).toBe(
            String(COMPOSED_DURATION),
        );
        // One transport for the canvas, not one per body.
        expect(await page.locator(SCRUBBER).count()).toBe(1);
    });

    test('plays across the seam, and the playhead carries on past it', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.composed);

        expect((await elementState(page)).src).toContain('bars.mp4');

        await playFrom(page, SEAM_AT - 0.5);

        // The canvas clock passes the boundary. Polled until it settles rather
        // than sampled once: the swap costs a request and a decoder handshake,
        // and the documented v1 contract is a brief gap at the seam, not a
        // gapless stitch.
        await expect
            .poll(() => canvasTime(page), { timeout: 30_000 })
            .toBeGreaterThan(SEAM_AT + 0.2);

        // The second body is what is playing now, and it is a DIFFERENT file.
        expect((await elementState(page)).src).toContain('tone.mp3');

        // Monotonic, in canvas time, across the seam: the second segment's own
        // clock restarted at zero and the canvas timeline did not.
        const first = await canvasTime(page);
        await expect.poll(() => canvasTime(page)).toBeGreaterThan(first);
    });

    test('a seek into the second segment loads the second file', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.composed);

        await seek(page, 3);
        await expect
            .poll(async () => (await elementState(page)).src)
            .toContain('tone.mp3');

        // Canvas time in, segment time out: three seconds into a four-second
        // canvas is one second into the second body.
        await expect
            .poll(async () => (await elementState(page)).currentTime)
            .toBeCloseTo(1, 1);
        expect(await canvasTime(page)).toBeCloseTo(3, 1);

        // And back, which swaps the other way.
        await seek(page, 0.5);
        await expect
            .poll(async () => (await elementState(page)).src)
            .toContain('bars.mp4');
    });

    test('a paused viewer stays paused across a seek between segments', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.composed);

        expect((await elementState(page)).paused).toBe(true);

        await seek(page, 3);
        await expect
            .poll(async () => (await elementState(page)).src)
            .toContain('tone.mp3');

        // The swap has a `play()` of its own for the case it interrupts
        // playback. It must not run here.
        const state = await settled(page, async () => {
            const { paused, src } = await elementState(page);
            return { paused, segment: src.includes('tone.mp3') };
        });
        expect(state).toEqual({ paused: true, segment: true });
    });
});

/*
    A window can close before its media does — a curator tiles a canvas with
    one-second excerpts of two-second files, and nothing in the media says so.
    `ended` never fires at that seam; only the sequencer's per-frame check
    takes it, and only a real decoder playing real media can prove it does.
*/
test.describe('av composed canvas — a window shorter than its media', () => {
    test('crosses a seam the media never reaches the end of', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.composedShort);

        expect(await canvasDuration(page)).toBe(SHORT_DURATION);
        expect((await elementState(page)).src).toContain('bars.mp4');

        await playFrom(page, 0);

        // The second body arrives too soon to have come from the first one's
        // `ended`: the bars still have 1.6 seconds of media left at the seam.
        await expect
            .poll(async () => (await elementState(page)).src, {
                timeout: SHORT_SEAM_BUDGET_MS,
                intervals: [50],
            })
            .toContain('tone.mp3');

        // And the playhead carries on in canvas time rather than resting at
        // the window it just left.
        await expect
            .poll(() => canvasTime(page), { timeout: 10_000 })
            .toBeGreaterThan(SHORT_SEAM_AT + 0.2);
    });
});

test.describe('av composed canvas — the vendored opera recipe', () => {
    test('loads, spans both acts, and plays with no developer warnings', async ({
        page,
    }) => {
        const warnings: string[] = [];
        await openViewer(page, OPERA_URL, warnings);

        // The canvas is claimed and staged rather than shown as unsupported.
        expect(
            await page.locator(`[data-canvas-id="${OPERA_CANVAS}"]`).count(),
        ).toBe(1);

        // The scrubber spans both acts, not the first act's file.
        expect(await canvasDuration(page)).toBe(OPERA_DURATION);
        expect(await page.locator(SCRUBBER).getAttribute('aria-valuemax')).toBe(
            String(OPERA_DURATION),
        );

        // Act II is a second body on the same canvas, reached in canvas time.
        await seek(page, OPERA_ACT_2_AT + 10);
        await expect
            .poll(async () => (await elementState(page)).src)
            .toContain('act_2');

        await seek(page, 0);
        await playFrom(page, 0);
        await expect.poll(() => canvasTime(page)).toBeGreaterThan(0.2);

        // Nothing about this recipe is degraded any more: the interim
        // "plays the first of them" warning is gone with the behaviour.
        expect(warnings).toEqual([]);
    });
});
