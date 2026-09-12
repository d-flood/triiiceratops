/**
 * Time-aware navigation and playlist behavior, in a real browser.
 *
 * What only a browser can settle:
 *
 * - **A temporal offset seeks and does not play.** A chapter click and a
 *   manifest `start` both arrive as the same fact — the media time the
 *   navigation carried — and both leave the viewer as paused as they found it.
 * - **The offset lands even when it arrives first.** On the navigation that
 *   first shows a canvas the element has no metadata yet, so the seek has to
 *   wait for it; nothing in a unit test can prove the wait ends.
 * - **`auto-advance` continues playback across a canvas boundary**, and
 *   `repeat` beside it wraps from the last canvas back to the first. Both need
 *   real playback running off the end of real media.
 * - **A reader's own navigation does not.** Leaving a canvas mid-recording
 *   stops it where it stands, which only two real elements decoding real media
 *   can show: the defect it fixes was two of them sounding at once.
 *
 * As with the other AV specs, both artifacts are the BUILT ones a consumer
 * loads — `pnpm build:all` (or core's `build:lib` plus `build:element`, and the
 * plugin's own `pnpm build`) must have run.
 */

import { expect, test, type Page } from '@playwright/test';

import { AV_MANIFESTS } from './helpers/avMedia';
import { serveAvPluginDist } from './helpers/avPluginDist';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
// The floating panel, not the settings section that carries the same id.
const STRUCTURES_PANEL = '[role="dialog"][data-panel-id="structures"]';
const TOC_TOGGLE = '[data-panel-toggle="structures"]';
const PLAY = '[data-testid="transport-play"]';
const MUTE = '[data-testid="transport-mute"]';

const MANIFEST = AV_MANIFESTS.structures;
const TONE = `${MANIFEST}/canvas/tone`;
const BARS = `${MANIFEST}/canvas/bars`;

/** Both canvases run 2 s; ending one from here takes a fifth of a second. */
const NEAR_THE_END = 1.8;

function mediaOf(canvasId: string): string {
    return `[data-canvas-id="${canvasId}"] [data-testid="av-media"]`;
}

async function openViewer(page: Page): Promise<void> {
    await serveAvPluginDist(page);
    await page.goto(`${FIXTURE}?manifest=${encodeURIComponent(MANIFEST)}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
}

/** The canvas the viewer is on, read off the element's own state. */
function currentCanvas(page: Page): Promise<string> {
    return page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: { canvasId: string };
        };
        return host.viewerState.canvasId;
    });
}

/**
 * Show the table of contents, by the toolbar button a reader presses.
 *
 * A real click, on an audio canvas, over the plugin's overlay layer: the stage
 * clips its projection to the layer and the layer clips itself, so neither
 * reaches the column the toolbar is in. It is the toggle half of the criterion
 * the chapter click completes.
 *
 * The plugin's own panel is dismissed first because THIS fixture opens it
 * (`plugins: { av: { open: true } }`) and the floating toolbar renders over the
 * column it docks into, so every toolbar button is behind it — core chrome over
 * core chrome, nothing to do with the plugin's overlay. Dismissing it is a real
 * gesture on a real control, not a way around the layer.
 */
async function openStructures(page: Page): Promise<void> {
    const panel = page.locator(STRUCTURES_PANEL);
    if (await panel.isVisible()) return;

    const avPanel = page.locator('[role="dialog"][data-panel-id="av:panel"]');
    if (await avPanel.isVisible()) {
        await avPanel.getByRole('button', { name: 'Close' }).click();
        await avPanel.waitFor({ state: 'hidden' });
    }

    // The toolbar is a rail parked off the left edge until its handle is
    // pressed — two real clicks to the table of contents, as for any reader.
    await page.getByRole('button', { name: 'Open Menu' }).click();
    await page.locator(TOC_TOGGLE).click();
    await panel.waitFor({ state: 'visible' });
}

/** Navigate by pressing a chapter in the table of contents, as a reader does. */
async function clickChapter(page: Page, name: string): Promise<void> {
    await page.locator(STRUCTURES_PANEL).getByRole('button', { name }).click();
}

/** One canvas's own element, whichever canvas the viewer is showing. */
function playback(
    page: Page,
    canvasId: string,
): Promise<{ currentTime: number; paused: boolean }> {
    return page.locator(mediaOf(canvasId)).evaluate((el) => {
        const media = el as HTMLMediaElement;
        return { currentTime: media.currentTime, paused: media.paused };
    });
}

/**
 * Start the current canvas playing from `at`, and wait until it really is.
 *
 * Muted first, and the play is a real click, for the reasons
 * {@link playToTheEnd} gives — this is that function's other half, for the
 * tests that need playback running rather than ending.
 */
async function playFrom(page: Page, canvasId: string, at: number) {
    await page.locator(MUTE).click();
    await page.locator(mediaOf(canvasId)).evaluate((el, from) => {
        (el as HTMLMediaElement).currentTime = from;
    }, at);
    await page.locator(PLAY).click();
    await expect
        .poll(async () => (await playback(page, canvasId)).paused)
        .toBe(false);
}

/**
 * Play the current canvas from just before its end.
 *
 * Muted first: a headless browser refuses audible script-initiated playback,
 * and the play itself is a real click because the autoplay policy wants a
 * gesture. Setting `currentTime` is not playback and needs neither.
 */
async function playToTheEnd(page: Page, canvasId: string): Promise<void> {
    await page.locator(MUTE).click();
    await page.locator(mediaOf(canvasId)).evaluate((el, at) => {
        (el as HTMLMediaElement).currentTime = at;
    }, NEAR_THE_END);
    await page.locator(PLAY).click();
    await expect
        .poll(async () => (await playback(page, canvasId)).paused)
        .toBe(false);
}

test.describe('av temporal offsets — a seek, never a play', () => {
    test('a chapter click navigates to its canvas, seeks to the fragment start, and stays paused', async ({
        page,
    }) => {
        await openViewer(page);

        await openStructures(page);

        // `#t=1,2` on the SECOND canvas: navigation and seek in one click.
        await clickChapter(page, 'Colour bars — second half');

        await expect.poll(() => currentCanvas(page)).toBe(BARS);
        await expect
            .poll(async () => (await playback(page, BARS)).currentTime)
            .toBeCloseTo(1, 1);
        // The reader asked to be somewhere, not to be played to.
        expect((await playback(page, BARS)).paused).toBe(true);
    });

    test('a manifest `start` positions the playhead on load without starting playback', async ({
        page,
    }) => {
        // Cookbook 0015's shape: a `SpecificResource` over the canvas with a
        // `PointSelector`. Overlaid on the fixture rather than committed to it,
        // because `start` and the playlist behaviors are independent facts and
        // the fixture is the playlist's.
        await page.route(`**${MANIFEST}`, async (route) => {
            const manifest = await (await route.fetch()).json();
            manifest.start = {
                id: `${MANIFEST}/start`,
                type: 'SpecificResource',
                source: { id: BARS, type: 'Canvas' },
                selector: { type: 'PointSelector', t: 1.5 },
            };
            await route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(manifest),
            });
        });

        await openViewer(page);

        await expect.poll(() => currentCanvas(page)).toBe(BARS);
        await expect
            .poll(async () => (await playback(page, BARS)).currentTime)
            .toBeCloseTo(1.5, 1);
        expect((await playback(page, BARS)).paused).toBe(true);
    });
});

test.describe('av playlist behaviors — auto-advance and repeat', () => {
    test('auto-advance carries playback across a canvas boundary', async ({
        page,
    }) => {
        await openViewer(page);
        expect(await currentCanvas(page)).toBe(TONE);

        await playToTheEnd(page, TONE);

        // The next canvas, playing — the reader pressed play once, and the
        // manifest said to keep going.
        await expect.poll(() => currentCanvas(page)).toBe(BARS);
        await expect
            .poll(async () => (await playback(page, BARS)).paused)
            .toBe(false);
    });

    test('navigating away mid-recording stops it, and starts nothing on arrival', async ({
        page,
    }) => {
        await openViewer(page);
        expect(await currentCanvas(page)).toBe(TONE);

        // The table of contents is opened BEFORE playback starts: it dismisses
        // a panel and unparks the toolbar rail, and every second of that is a
        // second of a two-second recording running towards `auto-advance`.
        await openStructures(page);
        await playFrom(page, TONE, 0);

        await clickChapter(page, 'Colour bars — second half');
        await expect.poll(() => currentCanvas(page)).toBe(BARS);

        const left = await playback(page, TONE);
        // Guards the assertion below against passing for the wrong reason: had
        // the recording run off its own end, `auto-advance` would have navigated
        // and paused it, and "stopped" would prove nothing about navigation.
        expect(left.currentTime).toBeLessThan(1.9);
        expect(left.paused).toBe(true);
        // …and where it stood, so returning resumes rather than restarts.
        expect(left.currentTime).toBeGreaterThan(0);

        // The other half of the rule, already pinned for the offset path: a
        // canvas arrived at is seeked, never started.
        expect((await playback(page, BARS)).paused).toBe(true);
    });

    test('repeat returns to the first canvas after the last one ends, still playing', async ({
        page,
    }) => {
        await openViewer(page);

        await openStructures(page);
        await clickChapter(page, 'Colour bars — second half');
        await expect.poll(() => currentCanvas(page)).toBe(BARS);

        await playToTheEnd(page, BARS);

        await expect.poll(() => currentCanvas(page)).toBe(TONE);
        await expect
            .poll(async () => (await playback(page, TONE)).paused)
            .toBe(false);
        // From the top, not from wherever the first pass left it.
        expect((await playback(page, TONE)).currentTime).toBeLessThan(1);
    });
});
