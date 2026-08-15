/**
 * The **transport**, in a real browser: playback chrome in the viewer's control
 * bar, driving a claimed AV canvas.
 *
 * What only a browser can settle:
 *
 * - **It is chrome, not a projection.** It sits beside the zoom and canvas
 *   navigation, takes none of their clicks, and neither moves nor resizes
 *   through a zoom.
 * - **Every control works and every control is AVState.** Play, a scrubber
 *   drag, arrow and Page seeking, and mute are driven here and read back off
 *   the media element they must have reached.
 * - **The glyph marks the claimed canvases the bar is not driving.**
 * - **Accessibility**: axe over a viewer with an open AV stage, and a
 *   keyboard-only walk from play through the scrubber to the volume slider.
 *
 * As with `av-video.spec.ts`, both artifacts are the BUILT ones a consumer
 * loads — `pnpm build:all` (or `build:element` plus the plugin's own
 * `pnpm build`) must have run.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { IDLE_CHROME_DELAY_MS } from '../src/lib/components/viewerControls';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { settled, settledBox } from './helpers/settle';
import {
    AV_MANIFESTS,
    BARS_MP4,
    BARS_SIZE,
    CAPTIONS_VTT,
    CAPTIONS_VTT_IT,
} from './helpers/avMedia';
import { GRID_MANIFEST } from './helpers/numberedGrid';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const TRANSPORT = '[data-testid="transport"]';
const SCRUBBER = '[data-testid="transport-scrubber"]';
const PLAY = '[data-testid="transport-play"]';
const MUTE = '[data-testid="transport-mute"]';
const VOLUME = '[data-testid="transport-volume"]';
const CAPTIONS = '[data-testid="transport-tracks"]';
const TRACK_LIST = '[data-testid="transport-track-list"]';
const BAR = '[data-testid="control-bar"]';
const ELAPSED = '[data-testid="transport-elapsed"]';
const DURATION = '[data-testid="transport-duration"]';
const GLYPH = '[data-testid="av-glyph"]';
const NAV_INDEX = '.nav-index';

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
        // A summary is what makes the canvas-info button render at all — it is
        // the bar's other popover, and so the other thing the idle timer waits
        // for.
        summary: { en: ['Colour bars, two seconds.'] },
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

/**
 * One video canvas with a CHOICE of two caption tracks, which is what makes the
 * captions control open a list rather than toggle — the bar's own popover, and
 * so a thing the idle timer has to wait for.
 */
const TRACKS_MANIFEST_URL = '/media/manifests/av-transport-tracks.json';
const TRACKS_CANVAS_ID = `${TRACKS_MANIFEST_URL}/canvas`;
const TRACKS_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: TRACKS_MANIFEST_URL,
    type: 'Manifest',
    label: { en: ['Colour bars with two caption tracks'] },
    items: [
        {
            id: TRACKS_CANVAS_ID,
            type: 'Canvas',
            width: BARS_SIZE.width,
            height: BARS_SIZE.height,
            duration: 2,
            items: [
                {
                    id: `${TRACKS_CANVAS_ID}/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${TRACKS_CANVAS_ID}/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            target: TRACKS_CANVAS_ID,
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
                    id: `${TRACKS_CANVAS_ID}/annopage`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${TRACKS_CANVAS_ID}/captions`,
                            type: 'Annotation',
                            motivation: 'supplementing',
                            target: TRACKS_CANVAS_ID,
                            body: {
                                type: 'Choice',
                                items: [
                                    {
                                        id: CAPTIONS_VTT,
                                        type: 'Text',
                                        format: 'text/vtt',
                                        language: 'en',
                                        label: { en: ['English'] },
                                    },
                                    {
                                        id: CAPTIONS_VTT_IT,
                                        type: 'Text',
                                        format: 'text/vtt',
                                        language: 'it',
                                        label: { it: ['Italiano'] },
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        },
    ],
};

async function openViewer(
    page: Page,
    manifest: string = AV_MANIFESTS.video,
): Promise<void> {
    await serveAvPluginDist(page);
    for (const [url, json] of [
        [PAIR_MANIFEST_URL, PAIR_MANIFEST],
        [TRACKS_MANIFEST_URL, TRACKS_MANIFEST],
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

/*
    The regression group for the bug this epic exists for. It replaces the
    "anchored chrome at constant screen size" group, whose behaviour — chrome
    projected onto the canvas rect, and a width threshold that swapped it for a
    glyph — was deleted with the anchoring decision that created it.

    Written to FAIL against a build where the transport is still anchored: there
    the transport is painted over the navigation and opts back into pointer
    events, so the nav and zoom buttons below fail the click.
*/
test.describe('av transport — chrome in the bar leaves the navigation reachable', () => {
    test('the navigation and zoom stay clickable, and the transport does not move, through a zoom', async ({
        page,
    }) => {
        // The PAIR manifest, because canvas navigation is only rendered for a
        // manifest with more than one canvas — and the navigation being
        // reachable is what this test is about.
        await openViewer(page, PAIR_MANIFEST_URL);

        const zoomIn = page.getByRole('button', { name: 'Zoom In' });
        const nextCanvas = page.getByRole('button', { name: 'Next Canvas' });
        const transport = page.locator(TRANSPORT);

        // Settled, not merely present: the fixture's docked panel is still
        // re-fitting the canvas as it slides out, so a single early read lands
        // mid-transition (the reason the deleted group polled too).
        const before = await settled(page, async (p) =>
            p.locator(TRANSPORT).boundingBox(),
        );
        expect(before).not.toBeNull();

        // The bug, stated as the reader states it: with a recording open, the
        // controls that move through the work are still there and still take a
        // click. No `force` — chrome painted over them fails here.
        await expect(zoomIn).toBeVisible();
        await expect(nextCanvas).toBeVisible();
        await expect(page.locator(NAV_INDEX)).toBeVisible();

        await zoomIn.click({ timeout: 20_000 });
        await zoomTo(page, 3);

        // The transport is a group of the bar now, so a zoom cannot move or
        // resize it: same place, same size, whatever the picture is doing.
        const after = await settled(page, async (p) =>
            p.locator(TRANSPORT).boundingBox(),
        );
        expect(after).not.toBeNull();
        expect(Math.abs(after!.x - before!.x)).toBeLessThan(1.5);
        expect(Math.abs(after!.y - before!.y)).toBeLessThan(1.5);
        expect(Math.abs(after!.width - before!.width)).toBeLessThan(1.5);
        expect(Math.abs(after!.height - before!.height)).toBeLessThan(1.5);

        // Still operable at the far zoom, which is user story 6: a reader deep
        // into a waveform keeps the full controls rather than losing them to a
        // width test.
        await expect(transport).toBeVisible();
        await expect(zoomIn).toBeVisible();
        await zoomIn.click({ timeout: 20_000 });
    });

    // The narrow-viewport case the deleted width threshold existed for. There
    // is no threshold now: the controls are the bar's and the bar is the
    // viewer's, so they survive a viewport no canvas could project a transport
    // into.
    test('keeps the full controls on a viewer too narrow for the old threshold', async ({
        page,
    }) => {
        await openViewer(page);
        await settled(
            page,
            async (p) =>
                (await p.locator(TRANSPORT).boundingBox())?.width ?? null,
        );

        await page.evaluate(() => {
            const host = document.getElementById('v') as HTMLElement;
            host.style.width = '360px';
            host.style.height = '480px';
        });
        await expect
            .poll(
                async () =>
                    (await page.locator(SURFACE).boundingBox())?.width ?? null,
                { timeout: 20_000 },
            )
            .toBeLessThan(400);

        // Zoomed far enough out that the canvas projects under the 240px the
        // old threshold used, which is where the transport used to vanish.
        await zoomTo(page, 0.2);

        await expect(page.locator(TRANSPORT)).toBeVisible({ timeout: 20_000 });
        await expect(page.locator(PLAY)).toBeVisible();
        await expect(page.locator(SCRUBBER)).toBeVisible();
    });
});

test.describe('av transport — the glyph says which canvas the bar drives', () => {
    // The narrowed rule (plugin-av user story 26): the glyph is no longer a
    // fallback for a canvas too small for chrome, it is what marks the claimed
    // canvases the bar is NOT driving.
    test('marks the claimed canvas the bar is not driving, and only that one', async ({
        page,
    }) => {
        await openViewer(page, PAIR_MANIFEST_URL);
        await page.evaluate(() => {
            const host = document.getElementById('v') as unknown as {
                viewerState: { setViewingMode(mode: string): void };
            };
            host.viewerState.setViewingMode('continuous');
        });
        // Far enough out that BOTH canvases project into the viewer at once.
        // Continuous mode lays the second one outside the viewport at the
        // opening fit, and a stage the renderer never places has no box for the
        // glyph to be seen in.
        //
        // The zoom is re-issued on every poll rather than once: switching the
        // viewing mode re-fits the scene asynchronously, and a zoom that lands
        // before that fit is simply undone by it.
        await expect
            .poll(
                async () => {
                    await zoomTo(page, 0.4);
                    const stages = page.locator(STAGE);
                    const total = await stages.count();
                    let placed = 0;
                    for (let index = 0; index < total; index += 1) {
                        const box = await stages.nth(index).boundingBox();
                        if (box && box.width > 0) placed += 1;
                    }
                    return placed;
                },
                { timeout: 20_000 },
            )
            .toBe(2);

        // Two claimed canvases on screen, one current. Exactly one glyph shows,
        // and it is the one belonging to the canvas the bar is not driving.
        await expect
            .poll(async () => page.locator(GLYPH).count(), { timeout: 20_000 })
            .toBe(2);
        await expect
            .poll(
                async () => {
                    const glyphs = page.locator(GLYPH);
                    const total = await glyphs.count();
                    let visible = 0;
                    for (let index = 0; index < total; index += 1) {
                        if (await glyphs.nth(index).isVisible()) visible += 1;
                    }
                    return visible;
                },
                { timeout: 20_000 },
            )
            .toBe(1);

        // One bar, driving the current canvas — never one transport per stage.
        await expect(page.locator(TRANSPORT)).toHaveCount(1);
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
        ).toBe('transport-scrubber');
    });

    test('keeps volume and mute across a canvas switch', async ({ page }) => {
        // Two AV canvases, so the second element exists — built up front, as
        // every stage is — before the reader has touched the first.
        await openViewer(page, PAIR_MANIFEST_URL);

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
            reached = (await focused()) === 'transport-play';
        }
        expect(reached).toBe(true);

        await page.keyboard.press('Enter');
        await expect
            .poll(async () => (await playback(page)).paused)
            .toBe(false);
        await page.keyboard.press(' ');
        await expect.poll(async () => (await playback(page)).paused).toBe(true);

        await page.keyboard.press('Tab');
        expect(await focused()).toBe('transport-scrubber');
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
        expect(await focused()).toBe('transport-mute');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await playback(page)).muted).toBe(true);

        await page.keyboard.press('Tab');
        expect(await focused()).toBe('transport-volume');
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
        expect(await focused()).toBe('transport-tracks');
        await page.keyboard.press('Enter');
        await expect(page.locator(CAPTIONS)).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });
});

/*
    Idle chrome: the bar getting out of the way while a recording plays.

    Only a browser can settle this — it is a computed opacity, a hit test, and a
    timer, none of which exist in jsdom. Every opacity read here polls until it
    has stopped moving rather than sampling the fade partway through.
*/
test.describe('av transport — the bar gets out of the way while it plays', () => {
    /** The bar's opacity right now, as a string, for polling and settling. */
    const opacity = (page: Page) =>
        page.locator(BAR).evaluate((el) => getComputedStyle(el).opacity);

    async function expectHidden(page: Page): Promise<void> {
        await expect.poll(() => opacity(page), { timeout: 20_000 }).toBe('0');
        // Settled, not merely arrived: a fade passing through a value is not
        // the same as a fade that has finished on it.
        expect(await settled(page, opacity)).toBe('0');
    }

    async function expectRevealed(page: Page): Promise<void> {
        await expect.poll(() => opacity(page), { timeout: 20_000 }).toBe('1');
        expect(await settled(page, opacity)).toBe('1');
    }

    /**
     * Play, then take the pointer off the bar.
     *
     * Both halves matter. Muted, because a headless browser refuses audible
     * script-initiated playback; looping, because the clip is shorter than the
     * idle delay and a recording that ended is a recording that is paused.
     * And the pointer has to leave, because a pointer resting on the bar pins
     * it visible — which is the behaviour under test two tests down.
     */
    async function playAndStandBack(page: Page): Promise<void> {
        // `.first()`: the pair manifest has a stage per canvas, and the bar
        // drives the current one.
        await page
            .locator(MEDIA)
            .first()
            .evaluate((el) => {
                const media = el as HTMLMediaElement;
                media.loop = true;
                media.muted = true;
            });
        await page.locator(PLAY).click();
        await expect
            .poll(async () => (await playbackOf(page)).paused)
            .toBe(false);
        await page.mouse.move(4, 4);
    }

    /** `playback()` restricted to the stage the bar is driving. */
    const playbackOf = (page: Page) =>
        page
            .locator(MEDIA)
            .first()
            .evaluate((el) => ({ paused: (el as HTMLMediaElement).paused }));

    test('hides the bar, and the hidden bar takes no clicks', async ({
        page,
    }) => {
        await openViewer(page);
        await playAndStandBack(page);
        await expectHidden(page);

        // Both halves of hidden. The hit test is read rather than clicked: a
        // synthetic click would move the pointer, which reveals the bar first
        // — correctly, and uselessly for this assertion.
        const hit = await page.evaluate(() => {
            const root = document.querySelector(
                'triiiceratops-viewer',
            )!.shadowRoot!;
            const bar = root.querySelector('[data-testid="control-bar"]')!;
            const box = bar.getBoundingClientRect();
            const under = root.elementFromPoint(
                box.x + box.width / 2,
                box.y + box.height / 2,
            );
            return {
                pointerEvents: getComputedStyle(bar).pointerEvents,
                inBar: !!under && bar.contains(under),
            };
        });
        expect(hit.pointerEvents).toBe('none');
        expect(hit.inBar).toBe(false);
    });

    test('stays in the accessibility tree while hidden', async ({ page }) => {
        await openViewer(page);
        await playAndStandBack(page);
        await expectHidden(page);

        // Not `visibility: hidden` and not `display: none`: a screen-reader
        // reader tabbing in must find the controls and reveal them.
        await expect(page.locator(PLAY)).toHaveCount(1);
        const boxed = await page.locator(PLAY).evaluate((el) => {
            const style = getComputedStyle(el);
            return {
                display: style.display,
                visibility: style.visibility,
                width: el.getBoundingClientRect().width,
            };
        });
        expect(boxed.display).not.toBe('none');
        expect(boxed.visibility).toBe('visible');
        expect(boxed.width).toBeGreaterThan(0);
    });

    test('a pointer move anywhere over the viewer brings it back', async ({
        page,
    }) => {
        await openViewer(page);
        await playAndStandBack(page);
        await expectHidden(page);

        // Over the picture, nowhere near the chrome — story 10 is that a reader
        // never has to learn where to move.
        const surface = (await page.locator(SURFACE).boundingBox())!;
        await page.mouse.move(
            surface.x + surface.width / 2,
            surface.y + surface.height / 4,
        );
        await expectRevealed(page);

        // And it goes away again once the reader stops.
        await expectHidden(page);
    });

    test('a key press brings it back', async ({ page }) => {
        await openViewer(page);
        await playAndStandBack(page);
        await expectHidden(page);

        await page.locator(SURFACE).press('ArrowRight');
        await expectRevealed(page);
    });

    test('focus arriving by tab reveals it, and pins it while it holds it', async ({
        page,
    }) => {
        await openViewer(page);
        await playAndStandBack(page);
        await expectHidden(page);

        /** The deeply-focused element's test id, piercing shadow roots. */
        const focused = () =>
            page.evaluate(() => {
                let element: Element | null = document.activeElement;
                while (element?.shadowRoot?.activeElement)
                    element = element.shadowRoot.activeElement;
                return (element as HTMLElement | null)?.dataset.testid ?? null;
            });

        // Tabbed to, not focused by script: keyboard focus is the focus the
        // absolute rule is about, and it is the one a browser marks
        // `:focus-visible`.
        let reached = false;
        for (let step = 0; step < 40 && !reached; step += 1) {
            await page.keyboard.press('Tab');
            reached = (await focused()) === 'transport-play';
        }
        expect(reached).toBe(true);
        await expectRevealed(page);

        // Twice the delay with keyboard focus inside, and it is still there —
        // a reader must never be walking controls they cannot see.
        await page.waitForTimeout(IDLE_CHROME_DELAY_MS * 2);
        expect(await settled(page, opacity)).toBe('1');
    });

    test('a click on a control does not pin it open the way a tab does', async ({
        page,
    }) => {
        await openViewer(page);
        await playAndStandBack(page);

        // Focus left on the play button by the click that started playback is
        // exactly how every mouse reader arrives here. If that counted as the
        // focus the absolute rule protects, the chrome would never once get out
        // of the way — so it is `:focus-visible` that is asked for, and a
        // mouse click does not set it.
        expect(
            await page.locator(PLAY).evaluate((el) => el.matches(':focus')),
        ).toBe(true);
        await expectHidden(page);
    });

    test('never hides while paused, however long the reader waits', async ({
        page,
    }) => {
        await openViewer(page);
        await page.mouse.move(4, 4);

        await page.waitForTimeout(IDLE_CHROME_DELAY_MS * 2);
        expect(await settled(page, opacity)).toBe('1');

        // And a pause after playing is a resting state, not a postponement:
        // the bar comes back and stays back.
        await playAndStandBack(page);
        await expectHidden(page);
        await page
            .locator(MEDIA)
            .first()
            .evaluate((el) => {
                (el as HTMLMediaElement).pause();
            });
        await expectRevealed(page);
        await page.waitForTimeout(IDLE_CHROME_DELAY_MS * 2);
        expect(await settled(page, opacity)).toBe('1');
    });

    test('never hides while the pointer rests on it', async ({ page }) => {
        await openViewer(page);
        await playAndStandBack(page);
        await expectHidden(page);

        const bar = await settledBox(page, BAR);
        await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
        await expectRevealed(page);

        await page.waitForTimeout(IDLE_CHROME_DELAY_MS * 2);
        expect(await settled(page, opacity)).toBe('1');

        // Off the bar, and the clock starts again.
        await page.mouse.move(4, 4);
        await expectHidden(page);
    });

    test('never hides while the track list is open', async ({ page }) => {
        await openViewer(page, TRACKS_MANIFEST_URL);
        await page.locator(CAPTIONS).waitFor({ timeout: 20_000 });
        await playAndStandBack(page);

        await page.locator(CAPTIONS).click();
        await expect(page.locator(TRACK_LIST)).toBeVisible();
        await page.mouse.move(4, 4);

        await page.waitForTimeout(IDLE_CHROME_DELAY_MS * 2);
        expect(await settled(page, opacity)).toBe('1');
    });

    test('never hides while the canvas-info popover is open', async ({
        page,
    }) => {
        await openViewer(page, PAIR_MANIFEST_URL);
        await playAndStandBack(page);

        await page.getByRole('button', { name: 'Canvas Information' }).click();
        await page.mouse.move(4, 4);

        await page.waitForTimeout(IDLE_CHROME_DELAY_MS * 2);
        expect(await settled(page, opacity)).toBe('1');
    });

    test('under reduced motion it still hides and reveals, with no fade', async ({
        page,
    }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await openViewer(page);

        // The preference removes the animation, not the behaviour. The fade is
        // gone by base.css's global reduced-motion guard, which reports the
        // ~zero duration the rest of the a11y suite asserts rather than a
        // literal `0s`.
        const durations = await page
            .locator(BAR)
            .evaluate((el) => getComputedStyle(el).transitionDuration);
        for (const duration of durations.split(', '))
            expect(parseFloat(duration)).toBeLessThan(0.01);

        await playAndStandBack(page);
        await expectHidden(page);

        const surface = (await page.locator(SURFACE).boundingBox())!;
        await page.mouse.move(
            surface.x + surface.width / 2,
            surface.y + surface.height / 4,
        );
        await expectRevealed(page);
    });

    test('never hides on a manifest with no claimed canvas', async ({
        page,
    }) => {
        await serveAvPluginDist(page);
        await page.goto(
            `${FIXTURE}?manifest=${encodeURIComponent(GRID_MANIFEST)}`,
            { waitUntil: 'domcontentloaded' },
        );
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });

        // Nothing claimed, so no chrome registered — and with no chrome
        // registered there is no idle behaviour at all.
        await expect(page.locator(TRANSPORT)).toHaveCount(0);
        await page.mouse.move(4, 4);
        await page.waitForTimeout(IDLE_CHROME_DELAY_MS * 2);
        expect(await settled(page, opacity)).toBe('1');
    });

    test('passes axe with the chrome hidden as well as revealed', async ({
        page,
    }) => {
        await openViewer(page);
        await playAndStandBack(page);
        await expectHidden(page);

        const results = await new AxeBuilder({ page })
            .include('triiiceratops-viewer')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();

        expect(results.violations).toEqual([]);
    });
});
