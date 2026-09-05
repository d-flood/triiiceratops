/**
 * A Choice of renditions, in a real browser.
 *
 * Three things only a browser can settle:
 *
 * - **The rendition the engine can decode is the one attached.** The fixture's
 *   first alternative declares a format nothing plays, which is the everyday
 *   shape of a vendored recipe (`0434-choice-av` leads with Apple Lossless);
 *   first-item-wins would hand the reader a canvas that cannot play.
 * - **A host swapping the selection keeps the reader's place.** `selectChoice`
 *   is core's existing command for an image Choice and a media Choice answers to
 *   the same one; the playhead and the paused state survive the swap.
 * - **An explicit selection wins even when it cannot play.** The host asked for
 *   that rendition, and the stage says so rather than quietly playing another.
 *
 * Both artifacts are the BUILT ones a consumer loads — `pnpm build:all` must
 * have run — and the plugin's dist is served as a DIRECTORY (`serveAvPluginDist`).
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import {
    AV_MANIFESTS,
    CHOICE_CANVAS,
    CHOICE_HIGH,
    CHOICE_LOW,
    CHOICE_UNPLAYABLE,
} from './helpers/avMedia';
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
const CANNOT_PLAY = '[data-testid="av-cannot-play"]';

async function openViewer(page: Page): Promise<void> {
    await serveAvPluginDist(page);
    await page.goto(
        `${FIXTURE}?manifest=${encodeURIComponent(AV_MANIFESTS.choice)}`,
        { waitUntil: 'domcontentloaded' },
    );
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(STAGE).first().waitFor({ state: 'visible' });
}

/** Drive core's own selection command, exactly as a host script would. */
function selectChoice(page: Page, choiceId: string): Promise<void> {
    return page.evaluate(
        ([canvasId, id]) => {
            const host = document.getElementById('v') as unknown as {
                viewerState: {
                    selectChoice(canvasId: string, choiceId: string): void;
                };
            };
            host.viewerState.selectChoice(canvasId!, id!);
        },
        [CHOICE_CANVAS, choiceId],
    );
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

/** Start playback from a real gesture: a headless autoplay policy refuses script. */
async function playMuted(page: Page): Promise<void> {
    await page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                getPluginState(id: string): {
                    setMuted(muted: boolean): void;
                    play(): void;
                } | null;
            };
        };
        const av = host.viewerState.getPluginState('av')!;
        av.setMuted(true);
        av.play();
    });
}

test.describe('av choice — renditions of one canvas', () => {
    test('plays the first rendition this browser can decode', async ({
        page,
    }) => {
        const requested: string[] = [];
        page.on('request', (request) => requested.push(request.url()));

        await openViewer(page);
        const media = await readyMedia(page);

        expect(await media.getAttribute('src')).toContain(CHOICE_HIGH);
        await expect(page.locator(CANNOT_PLAY)).toBeHidden();
        await expect
            .poll(() =>
                media.evaluate((el) => (el as HTMLMediaElement).duration),
            )
            .toBeGreaterThan(1.5);

        // The alternative nothing can decode was never even requested.
        expect(requested.some((url) => url.includes(CHOICE_UNPLAYABLE))).toBe(
            false,
        );
    });

    test('swaps the source on a host selection, keeping the playhead', async ({
        page,
    }) => {
        await openViewer(page);
        const media = await readyMedia(page);

        await media.evaluate((el) => {
            (el as HTMLMediaElement).currentTime = 1.2;
        });
        // Settled, because a seek lands over several frames and the assertion
        // after the swap is a comparison against this reading.
        const before = await settled(page, () =>
            media.evaluate((el) =>
                Number((el as HTMLMediaElement).currentTime.toFixed(2)),
            ),
        );
        expect(before).toBeCloseTo(1.2, 1);

        await selectChoice(page, CHOICE_LOW);

        await expect
            .poll(() => media.getAttribute('src'))
            .toContain(CHOICE_LOW);
        const after = await settled(page, () =>
            media.evaluate((el) =>
                Number((el as HTMLMediaElement).currentTime.toFixed(2)),
            ),
        );
        expect(after).toBeCloseTo(before, 1);
        expect(
            await media.evaluate((el) => (el as HTMLMediaElement).paused),
        ).toBe(true);
    });

    test('resumes playing across the swap', async ({ page }) => {
        await openViewer(page);
        const media = await readyMedia(page);

        await playMuted(page);
        await expect
            .poll(() =>
                media.evaluate((el) => (el as HTMLMediaElement).currentTime),
            )
            .toBeGreaterThan(0.2);

        await selectChoice(page, CHOICE_LOW);

        await expect
            .poll(() => media.getAttribute('src'))
            .toContain(CHOICE_LOW);
        // Playing again, and somewhere in the clip rather than back at the top.
        await expect
            .poll(
                () => media.evaluate((el) => (el as HTMLMediaElement).paused),
                { timeout: 20_000 },
            )
            .toBe(false);
        expect(
            await media.evaluate((el) => (el as HTMLMediaElement).currentTime),
        ).toBeGreaterThan(0.1);
    });

    test('honours a selection this browser cannot play', async ({ page }) => {
        await openViewer(page);
        await readyMedia(page);

        await selectChoice(page, CHOICE_UNPLAYABLE);

        // The host asked for the master; the stage says it cannot play it
        // rather than quietly substituting a rendition nobody chose.
        await expect(page.locator(CANNOT_PLAY).first()).toBeVisible({
            timeout: 20_000,
        });
        expect(await page.locator(MEDIA).first().getAttribute('src')).toContain(
            CHOICE_UNPLAYABLE,
        );
    });
});
