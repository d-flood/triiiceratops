/**
 * The **transport**, in a real browser: canvas-anchored playback chrome over a
 * claimed AV canvas.
 *
 * What only a browser can settle:
 *
 * - **It is anchored, but it does not scale.** Its `x`/`width` follow the
 *   projected canvas rect while its HEIGHT stays the same screen pixels through
 *   a zoom — the whole point of putting it in the overlay layer beside the
 *   stage rather than inside it.
 * - **Every control works and every control is AVState.** Play, a scrubber
 *   drag, arrow and Page seeking, and mute are driven here and read back off
 *   the media element they must have reached.
 * - **Below the threshold there is no transport and there is a glyph.**
 * - **Accessibility**: axe over a viewer with an open AV stage, and a
 *   keyboard-only walk from play through the scrubber to the volume slider.
 *
 * As with `av-video.spec.ts`, both artifacts are the BUILT ones a consumer
 * loads — `pnpm build:all` (or `build:element` plus the plugin's own
 * `pnpm build`) must have run.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { AV_MANIFESTS, BARS_MP4, BARS_SIZE } from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const MEDIA = '[data-testid="av-media"]';
const TRANSPORT = '[data-testid="av-transport"]';
const SCRUBBER = '[data-testid="av-scrubber"]';
const PLAY = '[data-testid="av-play"]';
const MUTE = '[data-testid="av-mute"]';
const VOLUME = '[data-testid="av-volume"]';
const CAPTIONS = '[data-testid="av-captions"]';
const ELAPSED = '[data-testid="av-elapsed"]';
const DURATION = '[data-testid="av-duration"]';
const GLYPH = '[data-testid="av-glyph"]';

const BARS_CANVAS = `${AV_MANIFESTS.video}/canvas/bars`;

/**
 * Two video canvases, built here rather than taken from `AV_MANIFESTS` for the
 * reason `av-video.spec.ts` builds its own: every local multi-canvas manifest
 * pairs a video with an audio canvas, and these assertions want two stages of
 * the same shape.
 */
const PAIR_MANIFEST_URL = '/media/manifests/av-transport-pair.json';
const PAIR_CANVAS_IDS = [
    `${PAIR_MANIFEST_URL}/canvas/one`,
    `${PAIR_MANIFEST_URL}/canvas/two`,
];
const PAIR_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: PAIR_MANIFEST_URL,
    type: 'Manifest',
    label: { en: ['Two video canvases'] },
    items: PAIR_CANVAS_IDS.map((canvasId) => ({
        id: canvasId,
        type: 'Canvas',
        width: BARS_SIZE.width,
        height: BARS_SIZE.height,
        duration: 2,
        items: [
            {
                id: `${canvasId}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${canvasId}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: BARS_MP4,
                            type: 'Video',
                            format: 'video/mp4',
                            width: BARS_SIZE.width,
                            height: BARS_SIZE.height,
                            duration: 2,
                        },
                        target: canvasId,
                    },
                ],
            },
        ],
    })),
};

async function openViewer(
    page: Page,
    manifest: string = AV_MANIFESTS.video,
    // A canvas that projects under the width threshold has no transport, which
    // is a state a caller may want to open into deliberately.
    awaitTransport = true,
): Promise<void> {
    await serveAvPluginDist(page);
    await page.route(`**${PAIR_MANIFEST_URL}`, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(PAIR_MANIFEST),
        }),
    );
    await page.goto(`${FIXTURE}?manifest=${encodeURIComponent(manifest)}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    if (awaitTransport)
        await page
            .locator(TRANSPORT)
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

/** The media element's own playback facts, read back after a command. */
async function playback(page: Page) {
    return page.locator(MEDIA).evaluate((el) => {
        const media = el as HTMLMediaElement;
        return {
            currentTime: media.currentTime,
            paused: media.paused,
            muted: media.muted,
            volume: media.volume,
        };
    });
}

test.describe('av transport — anchored chrome at constant screen size', () => {
    test('tracks the canvas rect in x and width, and keeps its height through a zoom', async ({
        page,
    }) => {
        await openViewer(page);

        /**
         * The transport's box beside the projection of the canvas's own bottom
         * edge. The overlay container's origin IS `canvasToScreen`'s origin, so
         * the two agree without correction.
         */
        const measure = async () =>
            page.evaluate(
                ([id, width, height]) => {
                    const host = document.getElementById('v') as unknown as {
                        shadowRoot: ShadowRoot;
                        viewerState: {
                            canvasToScreen(
                                point: { x: number; y: number },
                                canvasId?: string,
                            ): { x: number; y: number } | null;
                        };
                    };
                    const chrome = host.shadowRoot.querySelector(
                        '[data-testid="av-transport"]',
                    ) as HTMLElement | null;
                    // The ANCHOR is what tracks the projection; the chrome
                    // inside it is what must not change size.
                    const anchor = host.shadowRoot.querySelector(
                        '[data-testid="av-transport-anchor"]',
                    ) as HTMLElement | null;
                    const layer =
                        anchor?.closest('.plugin-overlay-layer') ?? null;
                    if (!chrome || !anchor || !layer) return null;

                    const topLeft = host.viewerState.canvasToScreen(
                        { x: 0, y: 0 },
                        id,
                    );
                    const bottomRight = host.viewerState.canvasToScreen(
                        { x: width as number, y: height as number },
                        id,
                    );
                    if (!topLeft || !bottomRight) return null;

                    const box = anchor.getBoundingClientRect();
                    const layerBox = layer.getBoundingClientRect();
                    return {
                        left: box.left - layerBox.left,
                        bottom: box.bottom - layerBox.top,
                        width: box.width,
                        height: chrome.getBoundingClientRect().height,
                        canvasLeft: topLeft.x,
                        canvasBottom: bottomRight.y,
                        canvasWidth: bottomRight.x - topLeft.x,
                    };
                },
                [BARS_CANVAS, BARS_SIZE.width, BARS_SIZE.height] as const,
            );

        // Poll rather than read once: the initial fit animates, and a
        // synchronous read lands mid-transition.
        await expect
            .poll(
                async () => {
                    const seen = await measure();
                    if (!seen || seen.height < 1) return null;
                    return (
                        Math.abs(seen.left - seen.canvasLeft) < 1.5 &&
                        // Anchored to the rect's bottom edge.
                        Math.abs(seen.bottom - seen.canvasBottom) < 1.5 &&
                        Math.abs(seen.width - seen.canvasWidth) < 1.5
                    );
                },
                { timeout: 20_000 },
            )
            .toBe(true);

        const before = await measure();
        expect(before).not.toBeNull();

        await zoomTo(page, 3);

        // Settled means: the canvas got wider, the transport followed it in x
        // and width, and its HEIGHT did not move a pixel. All three, or a
        // transport that simply never moved would pass.
        await expect
            .poll(
                async () => {
                    const seen = await measure();
                    if (!seen || !before) return null;
                    return {
                        wider: seen.canvasWidth > before.canvasWidth + 1,
                        follows:
                            Math.abs(seen.left - seen.canvasLeft) < 1.5 &&
                            Math.abs(seen.width - seen.canvasWidth) < 1.5 &&
                            seen.width > before.width + 1,
                        sameHeight: Math.abs(seen.height - before.height) < 0.5,
                    };
                },
                { timeout: 20_000 },
            )
            .toEqual({ wider: true, follows: true, sameHeight: true });
    });

    test('shows a glyph and no transport below the width threshold', async ({
        page,
    }) => {
        await openViewer(page);
        await expect(page.locator(GLYPH)).toBeHidden();

        // A phone-width viewer, because the reader's zoom floor is half the
        // scale at which the world fits: on the fixture's 800px-wide viewer
        // even a fully zoomed-out 320-unit canvas still projects wider than the
        // 240px threshold, so no zoom argument could reach the glyph. The
        // narrow viewer is also the case the threshold exists for.
        await page.evaluate(() => {
            const host = document.getElementById('v') as HTMLElement;
            host.style.width = '360px';
            host.style.height = '480px';
        });
        // The renderer re-fits and re-clamps the scale when it observes the new
        // surface, so wait for that to land: a zoom issued into the old range is
        // undone by the resize that arrives after it.
        await expect
            .poll(
                async () =>
                    (await page.locator(SURFACE).boundingBox())?.width ?? null,
                { timeout: 20_000 },
            )
            .toBeLessThan(400);

        // Far enough out that a 320-unit-wide canvas projects under the
        // 240-screen-pixel threshold.
        await zoomTo(page, 0.2);

        await expect(page.locator(TRANSPORT)).toBeHidden({ timeout: 20_000 });
        await expect(page.locator(GLYPH)).toBeVisible();
        // Decorative: the play state it depicts is announced by the transport
        // and by AVState, and a second announcement is noise.
        await expect(page.locator(GLYPH)).toHaveAttribute(
            'aria-hidden',
            'true',
        );

        // …and it comes back on the way in, so the threshold is a threshold
        // rather than a one-way trapdoor.
        await zoomTo(page, 3);
        await expect(page.locator(TRANSPORT)).toBeVisible({ timeout: 20_000 });
        await expect(page.locator(GLYPH)).toBeHidden();
    });
});

test.describe('av transport — every control commands playback', () => {
    test('shows both clock readings before a byte of media has loaded', async ({
        page,
    }) => {
        await openViewer(page);

        // The total comes from the CANVAS's declared duration, not from the
        // element, so the scrubber has a range from the first frame rather than
        // from `loadedmetadata`.
        await expect(page.locator(ELAPSED)).toHaveText(/0:00/);
        await expect(page.locator(DURATION)).toHaveText(/0:0[12]/);
        await expect(page.locator(SCRUBBER)).toHaveAttribute(
            'aria-valuemax',
            /^[12](\.\d+)?$/,
        );
    });

    test('plays, mutes and sets volume', async ({ page }) => {
        await openViewer(page);

        // Muted first: a headless browser refuses audible script-initiated
        // playback, and a refusal is state rather than an error.
        await page.locator(MUTE).click();
        await expect.poll(async () => (await playback(page)).muted).toBe(true);
        await expect(page.locator(MUTE)).toHaveAttribute(
            'aria-pressed',
            'true',
        );

        await page.locator(PLAY).click();
        await expect
            .poll(async () => (await playback(page)).paused)
            .toBe(false);

        await page.locator(PLAY).click();
        await expect.poll(async () => (await playback(page)).paused).toBe(true);

        // The slider off zero also unmutes — the universal convention.
        await page.locator(VOLUME).fill('0.4');
        await expect
            .poll(async () => {
                const seen = await playback(page);
                return {
                    volume: Math.round(seen.volume * 100),
                    muted: seen.muted,
                };
            })
            .toEqual({ volume: 40, muted: false });
    });

    test('seeks by drag and by keyboard', async ({ page }) => {
        await openViewer(page);
        const scrubber = page.locator(SCRUBBER);
        await expect(scrubber).toBeVisible();

        // A drag to the middle of the track lands near the middle of the clip.
        const box = (await scrubber.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.up();
        await expect
            .poll(async () => (await playback(page)).currentTime)
            .toBeGreaterThan(0.5);

        // Home is the accessible way back to the start.
        await scrubber.press('Home');
        await expect
            .poll(async () => (await playback(page)).currentTime)
            .toBeLessThan(0.01);

        // An arrow step is clamped by the clip's 2 s duration, so the assertion
        // is that it MOVED, not by how much.
        await scrubber.press('ArrowRight');
        await expect
            .poll(async () => (await playback(page)).currentTime)
            .toBeGreaterThan(0.5);

        await scrubber.press('PageDown');
        await expect
            .poll(async () => (await playback(page)).currentTime)
            .toBeLessThan(0.01);

        // And the position is announced as a clock reading, not as a number
        // nobody can place.
        await expect(scrubber).toHaveAttribute('aria-valuetext', /0:00 of 0:0/);

        // A mouse drag must leave the slider focused, or the arrow keys a
        // reader reaches for next would move nothing: the pointerdown handler
        // suppresses the default action, so it has to take focus itself.
        expect(
            await page.evaluate(() => {
                let element: Element | null = document.activeElement;
                while (element?.shadowRoot?.activeElement)
                    element = element.shadowRoot.activeElement;
                return (element as HTMLElement | null)?.dataset.testid ?? null;
            }),
        ).toBe('av-scrubber');
    });

    test('keeps volume and mute across a canvas switch', async ({ page }) => {
        // Two AV canvases, so the second element exists — built up front, as
        // every stage is — before the reader has touched the first.
        await openViewer(page, PAIR_MANIFEST_URL, false);
        // Two canvases share the viewport, so each may project too narrow for a
        // transport until the view comes in.
        await zoomTo(page, 3);
        await page
            .locator(TRANSPORT)
            .waitFor({ state: 'visible', timeout: 30_000 });

        /** One named canvas's own element facts. */
        const mediaOn = (canvasId: string) =>
            page
                .locator(`[data-canvas-id="${canvasId}"] ${MEDIA}`)
                .evaluate((el) => {
                    const media = el as HTMLMediaElement;
                    return {
                        muted: media.muted,
                        volume: Math.round(media.volume * 100),
                    };
                });

        const [first, second] = PAIR_CANVAS_IDS;

        await page.locator(VOLUME).fill('0.4');
        await page.locator(MUTE).click();
        await expect
            .poll(async () => mediaOn(first))
            .toEqual({ muted: true, volume: 40 });

        await page.evaluate(() => {
            const host = document.getElementById('v') as unknown as {
                viewerState: { nextCanvas(): void };
            };
            host.viewerState.nextCanvas();
        });

        // Volume and mute are per ACTIVATION, not per canvas: the reader turned
        // the recording down, not that one canvas.
        await expect
            .poll(async () => mediaOn(second), { timeout: 20_000 })
            .toEqual({ muted: true, volume: 40 });
        // …and the transport is not left announcing a state the element is not in.
        await expect(page.locator(MUTE)).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });
});

test.describe('av transport a11y — the keyboard and the a11y tree', () => {
    test('passes axe over a viewer with an open AV stage', async ({ page }) => {
        await openViewer(page);

        const results = await new AxeBuilder({ page })
            .include('triiiceratops-viewer')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();

        expect(results.violations).toEqual([]);
    });

    test('walks play → scrubber → mute → volume → captions by keyboard alone', async ({
        page,
    }) => {
        await openViewer(page);

        /** The deeply-focused element's test id, piercing shadow roots. */
        const focused = () =>
            page.evaluate(() => {
                let element: Element | null = document.activeElement;
                while (element?.shadowRoot?.activeElement)
                    element = element.shadowRoot.activeElement;
                return (element as HTMLElement | null)?.dataset.testid ?? null;
            });

        // Tab in from the page, rather than focusing the control directly: a
        // control that cannot be REACHED by keyboard is not keyboard-operable,
        // however well it responds once focused.
        let reached = false;
        for (let step = 0; step < 40 && !reached; step += 1) {
            await page.keyboard.press('Tab');
            reached = (await focused()) === 'av-play';
        }
        expect(reached).toBe(true);

        await page.keyboard.press('Enter');
        await expect
            .poll(async () => (await playback(page)).paused)
            .toBe(false);
        await page.keyboard.press(' ');
        await expect.poll(async () => (await playback(page)).paused).toBe(true);

        await page.keyboard.press('Tab');
        expect(await focused()).toBe('av-scrubber');
        // A real slider: it announces its range and its position.
        const scrubber = page.locator(SCRUBBER);
        await expect(scrubber).toHaveAttribute('role', 'slider');
        await expect(scrubber).toHaveAttribute('aria-valuemin', '0');
        await expect(scrubber).toHaveAttribute('aria-valuenow', /\d/);
        await page.keyboard.press('ArrowRight');
        await expect
            .poll(async () => (await playback(page)).currentTime)
            .toBeGreaterThan(0);

        await page.keyboard.press('Tab');
        expect(await focused()).toBe('av-mute');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await playback(page)).muted).toBe(true);

        await page.keyboard.press('Tab');
        expect(await focused()).toBe('av-volume');
        // Up from the muted slider's zero, which is also how a reader unmutes
        // without going back to the button.
        await page.keyboard.press('ArrowRight');
        await expect
            .poll(async () => {
                const seen = await playback(page);
                return seen.volume > 0 && seen.volume < 1 && !seen.muted;
            })
            .toBe(true);

        // Captions last, which is where the SPEC's v1 inventory puts them.
        // `av-video.json` carries a VTT track in its painting body array, so
        // the control is rendered and is the row's final tab stop.
        await expect(page.locator(CAPTIONS)).toBeVisible({ timeout: 15_000 });
        await page.keyboard.press('Tab');
        expect(await focused()).toBe('av-captions');
        await page.keyboard.press('Enter');
        await expect(page.locator(CAPTIONS)).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });
});
