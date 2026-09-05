/**
 * Audio as a first-class canvas, in a real browser: the **stage layout**.
 *
 * What only a browser can settle:
 *
 * - **A duration-only canvas is claimed, laid out and playable.** It declares no
 *   width or height, so its rect is core's geometry ladder's answer rather than
 *   the manifest's — and the stage has to sit exactly on it.
 * - **A canvas core paints a companion into gets no lanes at all.** The rect is
 *   the renderer's; what the plugin leaves over it is a transparent tap target,
 *   which must not cost the reader the drag, the wheel or the zoom keys.
 * - **A tap on the timeline lane seeks proportionally**, through AVState, to the
 *   fraction of the lane the pointer landed on.
 * - **The placeholder is core's painting until the first play.** The media
 *   element is invisible for exactly that long, and the rect it hands back is
 *   the one it had.
 *
 * As with `av-video.spec.ts`, both artifacts are the BUILT ones a consumer
 * loads — `pnpm build:all` (or `build:element` plus the plugin's own
 * `pnpm build`) must have run.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { E2E_ORIGIN } from './helpers/origin';
import { settledBox } from './helpers/settle';
import {
    AV_MANIFESTS,
    BARS_MP4,
    TONE_MP3,
    TONE_DURATION,
} from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
/** The focusable renderer root — where the zoom and pan keys are bound. */
const RENDERER_ROOT = '[data-testid="canvas-renderer-root"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const TRANSPORT = '[data-testid="transport"]';
const PLAY = '[data-testid="transport-play"]';
const VISUAL_LANE = '[data-testid="av-visual-lane"]';
const TIMELINE_LANE = '[data-testid="av-timeline-lane"]';
const TAP_TARGET = '[data-testid="av-tap"]';
const UNSUPPORTED = '[data-testid="canvas-unsupported-placeholder"]';

const AUDIO_CANVAS = `${AV_MANIFESTS.audio}/canvas/tone`;

/**
 * A committed 8x8 PNG, inline.
 *
 * The AV suite runs with no network, and the media fixture directory holds
 * generated audio and video rather than stills. A `data:` URL is same-origin
 * with everything and needs no image service, which is what a companion
 * asserted on for geometry rather than for resolution wants.
 */
const IMAGE_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4YWODFTEMLQkAZZlQAVIPr1MAAAAASUVORK5CYII=';

/** A companion Canvas painting one plain image. */
function companionCanvas(id: string) {
    return {
        id,
        type: 'Canvas',
        width: 8,
        height: 8,
        items: [
            {
                id: `${id}/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${id}/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: IMAGE_DATA_URL,
                            type: 'Image',
                            format: 'image/png',
                            width: 8,
                            height: 8,
                        },
                        target: id,
                    },
                ],
            },
        ],
    };
}

/** A duration-only audio canvas, optionally carrying a companion canvas. */
function audioManifest(
    url: string,
    companions: Record<string, unknown> = {},
    body: Record<string, unknown> = {
        id: TONE_MP3,
        type: 'Sound',
        format: 'audio/mpeg',
        duration: TONE_DURATION,
    },
) {
    const canvasId = `${url}/canvas/tone`;
    return {
        '@context': 'http://iiif.io/api/presentation/3/context.json',
        id: url,
        type: 'Manifest',
        label: { en: ['Audio canvas'] },
        items: [
            {
                id: canvasId,
                type: 'Canvas',
                duration: TONE_DURATION,
                ...companions,
                items: [
                    {
                        id: `${canvasId}/page`,
                        type: 'AnnotationPage',
                        items: [
                            {
                                id: `${canvasId}/annotation`,
                                type: 'Annotation',
                                motivation: 'painting',
                                body,
                                target: canvasId,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

const COMPANION_URL = '/media/manifests/av-companion.json';
const COMPANION_MANIFEST = audioManifest(COMPANION_URL, {
    accompanyingCanvas: companionCanvas(`${COMPANION_URL}/canvas/score`),
});

/**
 * The `0014-accompanyingcanvas` shape: a duration-only canvas whose body is a
 * `Sound` formatted `video/mp4`. Only a `<video>` will play it, but the picture
 * is still the accompanying canvas rather than the element.
 */
const MP4_SOUND_URL = '/media/manifests/av-companion-mp4.json';
const MP4_SOUND_MANIFEST = audioManifest(
    MP4_SOUND_URL,
    { accompanyingCanvas: companionCanvas(`${MP4_SOUND_URL}/canvas/score`) },
    {
        id: BARS_MP4,
        type: 'Sound',
        format: 'video/mp4',
        duration: TONE_DURATION,
    },
);

/**
 * The dev server's fake level 2 Image API service (`scripts/iiifFixturePlugin`),
 * at an absolute id because it goes into a manifest body rather than into a
 * page-relative fetch. Any name under the mount is the same 1200×900 picture.
 */
const FIXTURE_SERVICE = `${E2E_ORIGIN}/iiif-fixture/av-still`;

/**
 * A companion Canvas painting one image through that service — the tier ladder
 * a plain image URL cannot offer, and the whole of what makes a placeholder
 * worth publishing with a service behind it (user story 11).
 *
 * Parameterized by service id so a manifest can put its two companions behind
 * two DIFFERENT services and fail exactly one of them.
 */
function servedCompanion(service: string) {
    return {
        id: `${service}/canvas`,
        type: 'Canvas',
        width: 1200,
        height: 900,
        items: [
            {
                id: `${service}/canvas/page`,
                type: 'AnnotationPage',
                items: [
                    {
                        id: `${service}/canvas/annotation`,
                        type: 'Annotation',
                        motivation: 'painting',
                        body: {
                            id: `${service}/full/max/0/default.png`,
                            type: 'Image',
                            format: 'image/png',
                            width: 1200,
                            height: 900,
                            service: [
                                {
                                    id: service,
                                    type: 'ImageService3',
                                    profile: 'level2',
                                },
                            ],
                        },
                        target: `${service}/canvas`,
                    },
                ],
            },
        ],
    };
}

const SERVED_COMPANION = servedCompanion(FIXTURE_SERVICE);

/**
 * The `0013-placeholderCanvas` shape: a video canvas that declares its own
 * dimensions and carries a still to show until playback begins. The element is
 * the picture here, so it is what has to keep out of core's way until then.
 */
const PLACEHOLDER_URL = '/media/manifests/av-placeholder.json';
const PLACEHOLDER_CANVAS = `${PLACEHOLDER_URL}/canvas/tone`;
const PLACEHOLDER_MANIFEST = audioManifest(
    PLACEHOLDER_URL,
    { width: 640, height: 360, placeholderCanvas: SERVED_COMPANION },
    {
        id: BARS_MP4,
        type: 'Video',
        format: 'video/mp4',
        width: 640,
        height: 360,
        duration: TONE_DURATION,
    },
);

/**
 * A duration-only canvas carrying BOTH companions, at deliberately different
 * aspects: the rect is the accompanying canvas's in every phase, so the
 * handover on first play must not move anything (user story 10).
 */
const BOTH_URL = '/media/manifests/av-both.json';
const BOTH_MANIFEST = audioManifest(BOTH_URL, {
    accompanyingCanvas: companionCanvas(`${BOTH_URL}/canvas/score`),
    placeholderCanvas: {
        ...companionCanvas(`${BOTH_URL}/canvas/still`),
        width: 32,
        height: 8,
    },
});

/**
 * The same pair, with the ACCOMPANYING canvas behind the dev server's fake
 * image service and the placeholder a plain data URL.
 *
 * That split is the whole instrument: while the placeholder is the picture,
 * every request to `/iiif-fixture/` can only be the accompanying canvas being
 * made resident ahead of the phase that names it (user story 41).
 */
const BOTH_SERVED_URL = '/media/manifests/av-both-served.json';
const BOTH_SERVED_MANIFEST = audioManifest(BOTH_SERVED_URL, {
    accompanyingCanvas: SERVED_COMPANION,
    placeholderCanvas: companionCanvas(`${BOTH_SERVED_URL}/canvas/still`),
});

/**
 * The mirror image: the PLACEHOLDER behind the fixture service and the
 * accompanying canvas behind a second one.
 *
 * What it isolates is which service owns the canvas's error state. Failing the
 * one the canvas actually paints from must be visible to the reader, and the
 * warmed one succeeding must not talk it away.
 */
const SCORE_SERVICE = `${E2E_ORIGIN}/iiif-fixture/av-score`;
const SERVED_STILL_URL = '/media/manifests/av-both-served-still.json';
const SERVED_STILL_MANIFEST = audioManifest(SERVED_STILL_URL, {
    accompanyingCanvas: servedCompanion(SCORE_SERVICE),
    placeholderCanvas: SERVED_COMPANION,
});

/**
 * A canvas nothing can paint and this plugin does not want: a PDF body is
 * neither an image nor time-based media.
 */
const FOREIGN_URL = '/media/manifests/av-foreign.json';
const FOREIGN_CANVAS = `${FOREIGN_URL}/canvas/pdf`;
const FOREIGN_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: FOREIGN_URL,
    type: 'Manifest',
    label: { en: ['A canvas nobody claims'] },
    items: [
        {
            id: FOREIGN_CANVAS,
            type: 'Canvas',
            width: 600,
            height: 800,
            items: [
                {
                    id: `${FOREIGN_CANVAS}/page`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${FOREIGN_CANVAS}/annotation`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: '/media/nothing.pdf',
                                type: 'Text',
                                format: 'application/pdf',
                            },
                            target: FOREIGN_CANVAS,
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
    options: { expectStage?: boolean; expectSurface?: boolean } = {},
): Promise<void> {
    await serveAvPluginDist(page);
    for (const [url, json] of [
        [COMPANION_URL, COMPANION_MANIFEST],
        [MP4_SOUND_URL, MP4_SOUND_MANIFEST],
        [PLACEHOLDER_URL, PLACEHOLDER_MANIFEST],
        [BOTH_URL, BOTH_MANIFEST],
        [BOTH_SERVED_URL, BOTH_SERVED_MANIFEST],
        [SERVED_STILL_URL, SERVED_STILL_MANIFEST],
        [FOREIGN_URL, FOREIGN_MANIFEST],
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
    // Not awaited when the viewer is expected to raise full-cover error chrome
    // instead of a rendering surface.
    if (options.expectSurface !== false)
        await page
            .locator(SURFACE)
            .waitFor({ state: 'visible', timeout: 30_000 });
    if (options.expectStage !== false)
        await page
            .locator(STAGE)
            .waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * Whether core is painting a companion into this canvas right now — the host's
 * own read of the companion phase, and the only observable there is: what the
 * phase produces is painted onto the renderer's canvas, not into the DOM.
 */
function paintingCompanion(page: Page, canvasId: string): Promise<boolean> {
    return page.evaluate((id) => {
        const host = document.getElementById('v') as unknown as {
            viewerState: { isPaintingCompanion(canvasId: string): boolean };
        };
        return host.viewerState.isPaintingCompanion(id);
    }, canvasId);
}

/** The viewer-level error condition, which raises full-cover error chrome. */
function tileSourceError(page: Page): Promise<{ type: string } | null> {
    return page.evaluate(() => {
        const host = document.getElementById('v') as unknown as {
            viewerState?: { tileSourceError: { type: string } | null };
        };
        // `null` before the element has upgraded, which is what a poll for the
        // error appearing has to be able to see.
        return host?.viewerState?.tileSourceError ?? null;
    });
}

/** Answer every `info.json` under one fixture service with a status. */
function failService(page: Page, service: string, status: number) {
    return page.route(`**${new URL(service).pathname}/info.json`, (route) =>
        route.fulfill({
            status,
            contentType: 'application/json',
            body: '{}',
        }),
    );
}

/** Which companion the claimant is asking core to paint, if either. */
function companionPhase(
    page: Page,
    canvasId: string,
): Promise<string | undefined> {
    return page.evaluate((id) => {
        const host = document.getElementById('v') as unknown as {
            viewerState: {
                companionPhaseFor(canvasId: string): string | undefined;
            };
        };
        return host.viewerState.companionPhaseFor(id);
    }, canvasId);
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
 * The stage box beside the projection of the canvas core laid out — both in the
 * overlay container's coordinates, whose origin IS `canvasToScreen`'s, so the
 * two must agree with no correction.
 */
async function stageVersusProjection(page: Page, canvasId: string) {
    return page.evaluate((id) => {
        const host = document.getElementById('v') as unknown as {
            shadowRoot: ShadowRoot;
            viewerState: {
                canvasSize(canvasId?: string): {
                    width: number;
                    height: number;
                } | null;
                canvasToScreen(
                    point: { x: number; y: number },
                    canvasId?: string,
                ): { x: number; y: number } | null;
            };
        };
        const stage = host.shadowRoot.querySelector<HTMLElement>(
            '[data-testid="av-stage"]',
        );
        // The wrapper, not `parentElement`: the mount host between them is
        // `display: contents` and has no box of its own.
        const layer = stage?.closest('.plugin-overlay-layer') ?? null;
        if (!stage || !layer) return null;

        const size = host.viewerState.canvasSize(id);
        const topLeft = host.viewerState.canvasToScreen({ x: 0, y: 0 }, id);
        if (!size || !topLeft) return null;
        const bottomRight = host.viewerState.canvasToScreen(
            { x: size.width, y: size.height },
            id,
        );
        if (!bottomRight) return null;

        const box = stage.getBoundingClientRect();
        const layerBox = layer.getBoundingClientRect();
        return {
            offsetX: box.left - layerBox.left,
            offsetY: box.top - layerBox.top,
            width: box.width,
            height: box.height,
            predictedX: topLeft.x,
            predictedY: topLeft.y,
            predictedWidth: bottomRight.x - topLeft.x,
            predictedHeight: bottomRight.y - topLeft.y,
        };
    }, canvasId);
}

test.describe('av audio — a duration-only canvas is claimed and laid out', () => {
    test('stages the audio canvas over the rect core laid out for it', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.audio);

        // The claim suppresses core's unsupported presentation, and what
        // replaces it is a real stage rather than a blank box.
        await expect(page.locator(UNSUPPORTED)).toHaveCount(0);
        await expect(page.locator(MEDIA)).toHaveCount(1);
        expect(await page.locator(MEDIA).evaluate((el) => el.tagName)).toBe(
            'AUDIO',
        );

        // Poll: the initial fit animates, and a synchronous read lands
        // mid-transition.
        await expect
            .poll(
                async () => {
                    const seen = await stageVersusProjection(
                        page,
                        AUDIO_CANVAS,
                    );
                    if (!seen || seen.width < 1) return null;
                    return (
                        Math.abs(seen.offsetX - seen.predictedX) < 1.5 &&
                        Math.abs(seen.offsetY - seen.predictedY) < 1.5 &&
                        Math.abs(seen.width - seen.predictedWidth) < 1.5 &&
                        Math.abs(seen.height - seen.predictedHeight) < 1.5
                    );
                },
                { timeout: 20_000 },
            )
            .toBe(true);
    });

    test('gives the whole rect to the timeline lane when there is no image', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.audio);

        await expect(page.locator(VISUAL_LANE)).toBeHidden();
        await expect(page.locator(TIMELINE_LANE)).toBeVisible();

        await expect
            .poll(async () => {
                const lane = await page.locator(TIMELINE_LANE).boundingBox();
                const stage = await page.locator(STAGE).boundingBox();
                if (!lane || !stage || stage.height < 1) return null;
                return (
                    Math.abs(lane.height - stage.height) < 1.5 &&
                    Math.abs(lane.width - stage.width) < 1.5
                );
            })
            .toBe(true);
    });

    test('plays through the transport', async ({ page }) => {
        await openViewer(page, AV_MANIFESTS.audio);
        await page
            .locator(TRANSPORT)
            .waitFor({ state: 'visible', timeout: 30_000 });

        await page.locator(PLAY).click();

        await expect
            .poll(
                () =>
                    page
                        .locator(MEDIA)
                        .evaluate(
                            (el) => (el as HTMLMediaElement).currentTime > 0,
                        ),
                { timeout: 20_000 },
            )
            .toBe(true);
    });

    test('seeks to the tapped fraction of the timeline lane', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.audio);
        // The seek is clamped against a duration, and the element only reports
        // one after metadata — the canvas's declared duration covers the window
        // before that, but waiting makes the assertion about the projection
        // rather than about which duration won.
        await expect
            .poll(
                () =>
                    page
                        .locator(MEDIA)
                        .evaluate(
                            (el) => (el as HTMLMediaElement).readyState > 0,
                        ),
                { timeout: 30_000 },
            )
            .toBe(true);

        // The lane's box has to have STOPPED moving before a fraction of it
        // means anything: a viewer opening beside a docked panel column re-fits
        // the canvas as the column slides out, so a width read mid-slide and a
        // click taken against the settled one are two different fractions.
        const lane = await settledBox(page, TIMELINE_LANE);

        // Three quarters across the lane is three quarters through the piece.
        await page.locator(TIMELINE_LANE).click({
            position: { x: lane.width * 0.75, y: lane.height / 2 },
        });

        await expect
            .poll(
                () =>
                    page
                        .locator(MEDIA)
                        .evaluate((el) => (el as HTMLMediaElement).currentTime),
                { timeout: 20_000 },
            )
            .toBeCloseTo(TONE_DURATION * 0.75, 1);
    });

    /*
        The timeline lane is the whole rect of a plain-audio canvas, so if it
        swallowed every gesture the canvas would be undraggable and every pan
        attempt would seek. Only a tap is the lane's.
    */
    test('pans rather than seeking when the lane is dragged', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.audio);
        // Zoomed in, so there is somewhere to pan TO: at the initial fit the
        // whole canvas is on screen and a pan is clamped to no movement.
        const fitted = await page.locator(STAGE).boundingBox();
        await zoomTo(page, (fitted!.width / 100) * 4);

        // Poll: the zoom animates, and the drag must start from a settled box.
        await expect
            .poll(async () => {
                const first = await page.locator(STAGE).boundingBox();
                await page.waitForTimeout(150);
                const second = await page.locator(STAGE).boundingBox();
                return first && second && Math.abs(first.x - second.x) < 0.5;
            })
            .toBe(true);

        const lane = (await page.locator(TIMELINE_LANE).boundingBox())!;
        const startX = lane.x + lane.width * 0.5;
        const y = lane.y + lane.height / 2;
        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(startX - 80, y, { steps: 8 });
        await page.mouse.up();

        // The drag moved the image, and left the playhead where it was.
        await expect
            .poll(async () => {
                const seen = await page.locator(STAGE).boundingBox();
                return seen ? seen.x : null;
            })
            .toBeLessThan(lane.x - 10);
        expect(
            await page
                .locator(MEDIA)
                .evaluate((el) => (el as HTMLMediaElement).currentTime),
        ).toBe(0);
    });
});

/*
    User story 28. The claim suppresses the unsupported presentation for the
    canvas it names and for no other: a canvas this plugin does not claim keeps
    core's honest placard even with the plugin loaded and claiming elsewhere.
*/
test.describe('av audio — a canvas the plugin does not claim', () => {
    test('keeps core’s unsupported treatment while the plugin is loaded', async ({
        page,
    }) => {
        await openViewer(page, FOREIGN_URL, { expectStage: false });

        await expect(page.locator(UNSUPPORTED)).toBeVisible();
        await expect(page.locator(STAGE)).toHaveCount(0);
    });
});

test.describe('av audio — companion and placeholder canvases', () => {
    /*
        User stories 1 and 9. The canvas declares no dimensions of its own, so
        it adopts its companion's — a square companion here — and the whole rect
        is the picture's. The plugin draws neither lane over it and no still of
        its own: what a reader sees is core's painting.
    */
    test('gives the whole rect to the companion, at the companion’s aspect', async ({
        page,
    }) => {
        await openViewer(page, COMPANION_URL);

        await expect(page.locator(TIMELINE_LANE)).toBeHidden();
        await expect(page.locator(VISUAL_LANE)).toBeHidden();
        await expect(page.locator(`${STAGE} img`)).toHaveCount(0);
        await expect(page.locator(TAP_TARGET)).toBeVisible();

        await expect
            .poll(async () => {
                const stage = await page.locator(STAGE).boundingBox();
                const tap = await page.locator(TAP_TARGET).boundingBox();
                if (!stage || !tap || stage.height < 1) return null;
                return {
                    square: Math.abs(stage.width - stage.height) < 1.5,
                    covered:
                        Math.abs(tap.width - stage.width) < 1.5 &&
                        Math.abs(tap.height - stage.height) < 1.5,
                };
            })
            .toEqual({ square: true, covered: true });
    });

    /*
        `0014-accompanyingcanvas`: which ELEMENT plays the body is not what is
        drawn in the rect. A `Sound` formatted `video/mp4` needs a `<video>`,
        but the canvas is duration-only and core is painting its companion — so
        the element must not cover that painting with a black rect.
    */
    test('keeps a Sound body’s video element off a painted rect', async ({
        page,
    }) => {
        await openViewer(page, MP4_SOUND_URL);

        await expect(page.locator(TIMELINE_LANE)).toBeHidden();
        await expect(page.locator(`${VISUAL_LANE} ${MEDIA}`)).toHaveCount(0);
        // Laid out and decoding, but painting nothing over the companion.
        await expect(page.locator(MEDIA)).toBeAttached();
        expect(
            await page
                .locator(MEDIA)
                .evaluate((el) => getComputedStyle(el).visibility),
        ).toBe('hidden');
        expect(
            await page
                .locator(STAGE)
                .evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe('rgba(0, 0, 0, 0)');
    });

    // User story 6: the picture is the tap target. Where core paints the
    // picture, the plugin's transparent target is what carries the toggle.
    test('toggles playback when the companion is tapped', async ({ page }) => {
        await openViewer(page, COMPANION_URL);
        await expect(page.locator(TAP_TARGET)).toBeVisible();

        await page.locator(TAP_TARGET).click();

        await expect
            .poll(
                () =>
                    page
                        .locator(MEDIA)
                        .evaluate(
                            (el) => (el as HTMLMediaElement).currentTime > 0,
                        ),
                { timeout: 20_000 },
            )
            .toBe(true);
    });

    /*
        User story 7. The target fills the rect, so if it swallowed every
        gesture the score would be the one canvas in the viewer a reader could
        not drag — and every attempt to pan it would toggle playback instead.
    */
    test('pans rather than toggling when the companion is dragged', async ({
        page,
    }) => {
        await openViewer(page, COMPANION_URL);
        const fitted = await settledBox(page, STAGE);
        await zoomTo(page, (fitted.width / 8) * 4);

        const target = await settledBox(page, TAP_TARGET);
        const startX = target.x + target.width * 0.5;
        const y = target.y + target.height / 2;
        await page.mouse.move(startX, y);
        await page.mouse.down();
        await page.mouse.move(startX - 80, y, { steps: 8 });
        await page.mouse.up();

        await expect
            .poll(async () => {
                const seen = await page.locator(STAGE).boundingBox();
                return seen ? seen.x : null;
            })
            .toBeLessThan(target.x - 10);
        expect(
            await page
                .locator(MEDIA)
                .evaluate((el) => (el as HTMLMediaElement).currentTime),
        ).toBe(0);
    });

    /*
        Half of user story 36: the zoom keys are bound on the renderer's root,
        and with the focus there they magnify the companion like any canvas. The
        rest of the suite zooms programmatically, so this is the one place the
        keys themselves are pressed.

        The focus is placed here rather than reached, because the reader's own
        route to it is the half this epic does not close — see the skipped test
        below.
    */
    test('zooms from the keyboard while the renderer holds focus', async ({
        page,
    }) => {
        await openViewer(page, COMPANION_URL);
        const fitted = await settledBox(page, STAGE);

        await page.locator(RENDERER_ROOT).focus();
        await page.keyboard.press('+');

        await expect
            .poll(async () => (await page.locator(STAGE).boundingBox())?.width)
            .toBeGreaterThan(fitted.width + 1);
    });

    /*
        The other half of user story 36, and the reader's own route to it: tap
        the score to start playback, then press a zoom key. The tap target has
        no focusable ancestor of its own — the plugin's overlay layer is a
        SIBLING of the render surface — so without core putting focus back on
        `.renderer-root[tabindex="0"]` the mousedown would move it to the body
        and the keys would reach nothing from then on. A genuine click, never a
        programmatic `.focus()`: placing the focus is what the test above does,
        and it is exactly the step this one must not skip.
    */
    test('zooms from the keyboard after the score has been tapped', async ({
        page,
    }) => {
        await openViewer(page, COMPANION_URL);
        const fitted = await settledBox(page, STAGE);

        await page.locator(TAP_TARGET).click();
        await page.keyboard.press('+');

        await expect
            .poll(async () => (await page.locator(STAGE).boundingBox())?.width)
            .toBeGreaterThan(fitted.width + 1);
    });

    /*
        The other half of user story 3. The plugin's overlay layer is a SIBLING
        of the render surface, so a wheel over any part of a stage that takes
        pointer events cannot reach the surface by bubbling; core binds it on
        the box both sit in instead, which is why this passes without the plugin
        forwarding anything.
    */
    test('zooms from the wheel over the companion', async ({ page }) => {
        await openViewer(page, COMPANION_URL);
        const fitted = await settledBox(page, STAGE);

        await page.mouse.move(
            fitted.x + fitted.width / 2,
            fitted.y + fitted.height / 2,
        );
        await page.mouse.wheel(0, -400);

        await expect
            .poll(async () => (await page.locator(STAGE).boundingBox())?.width)
            .toBeGreaterThan(fitted.width + 1);
    });

    /*
        User story 15. Painting a companion is opt-in, by a claimant that asked
        for it: with no plugin registered nothing claims the canvas, nothing
        sets a phase, and the honest placard stands. A viewer that painted the
        score and said nothing about the recording would be the silent
        falsification the placard exists to prevent.
    */
    test('keeps the unsupported placard where no plugin claims the canvas', async ({
        page,
    }) => {
        await page.route(`**${COMPANION_URL}`, (route) =>
            route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(COMPANION_MANIFEST),
            }),
        );
        await page.goto('/e2e/canvas-renderer-wc.html', {
            waitUntil: 'domcontentloaded',
        });
        await page.evaluate((manifest) => {
            document.getElementById('v')?.setAttribute('manifest-id', manifest);
        }, COMPANION_URL);

        await expect(page.locator(UNSUPPORTED)).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator(STAGE)).toHaveCount(0);
    });

    /*
        User stories 11 and 12. Core cannot paint behind an opaque video
        element, so the element is invisible — laid out and decoding, but
        drawing nothing — until the first play reveals it and hands the rect
        back. The plugin puts no still of its own over the picture at all.
    */
    test('shows the placeholder until playback begins, and not after', async ({
        page,
    }) => {
        await openViewer(page, PLACEHOLDER_URL);

        expect(await paintingCompanion(page, PLACEHOLDER_CANVAS)).toBe(true);
        await expect(page.locator(MEDIA)).toBeAttached();
        await expect(page.locator(MEDIA)).not.toBeVisible();
        await expect(page.locator(`${STAGE} img`)).toHaveCount(0);
        expect(
            await page
                .locator(STAGE)
                .evaluate((el) => getComputedStyle(el).backgroundColor),
        ).toBe('rgba(0, 0, 0, 0)');

        await page
            .locator(TRANSPORT)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page.locator(PLAY).click();

        // Revealed first, then the phase handed back — so there is no frame in
        // which neither picture is drawn.
        await expect(page.locator(MEDIA)).toBeVisible({ timeout: 20_000 });
        await expect
            .poll(() => paintingCompanion(page, PLACEHOLDER_CANVAS), {
                timeout: 20_000,
            })
            .toBe(false);
    });

    /*
        The point of retiring the single fixed-size still: a placeholder is on
        core's own tier ladder now, so zooming into one asks its image service
        for more resolution. The dev server's fake level 2 service is what makes
        that observable, exactly as `av-cookbook.spec.ts` does for the score.
    */
    test('sharpens the placeholder as the reader zooms into it', async ({
        page,
    }) => {
        let requests = 0;
        page.on('request', (request) => {
            if (request.url().includes('/iiif-fixture/')) requests += 1;
        });

        await openViewer(page, PLACEHOLDER_URL);
        await expect
            .poll(() => requests, { timeout: 30_000 })
            .toBeGreaterThan(0);

        // Settled: the opening fit animates, and tiers arriving for it are not
        // the zoom's doing.
        const fitted = await settledBox(page, STAGE);
        await page.waitForTimeout(1_000);
        const before = requests;

        await zoomTo(page, (fitted.width / 640) * 8);
        await expect
            .poll(async () => (await page.locator(STAGE).boundingBox())?.width)
            .toBeGreaterThan(fitted.width * 2);

        await expect
            .poll(() => requests, { timeout: 30_000 })
            .toBeGreaterThan(before);
    });

    /*
        User story 10. The rect is decided once, from the accompanying canvas
        ahead of the placeholder, so a canvas carrying both keeps the same box
        across the handover — a 32×8 still giving way to a square score must not
        reflow the page the instant the reader presses play.
    */
    test('keeps the canvas rect when a canvas carrying both companions plays', async ({
        page,
    }) => {
        await openViewer(page, BOTH_URL);
        const canvasId = `${BOTH_URL}/canvas/tone`;

        expect(await paintingCompanion(page, canvasId)).toBe(true);
        const before = await settledBox(page, STAGE);
        // The accompanying canvas is square, and it is what the rect came from
        // even while the 32×8 placeholder is the picture.
        expect(Math.abs(before.width - before.height)).toBeLessThan(1.5);

        await page.locator(TAP_TARGET).click();
        await expect
            .poll(
                () =>
                    page
                        .locator(MEDIA)
                        .evaluate(
                            (el) => (el as HTMLMediaElement).currentTime > 0,
                        ),
                { timeout: 20_000 },
            )
            .toBe(true);

        const after = await settledBox(page, STAGE);
        expect(Math.abs(after.width - before.width)).toBeLessThan(1.5);
        expect(Math.abs(after.height - before.height)).toBeLessThan(1.5);
        // Still painting — the accompanying canvas took the placeholder's place
        // rather than the rect being handed back to nothing.
        expect(await paintingCompanion(page, canvasId)).toBe(true);
    });

    /*
        User story 41. The accompanying canvas is requestable BEFORE the phase
        names it, so pressing play selects between two pictures already in hand
        rather than starting a fetch. The placeholder here is a data URL and the
        accompanying canvas is the only thing behind the fixture service, so a
        picture request to it before play can only be the warming.
    */
    test('makes the accompanying canvas resident while the placeholder paints', async ({
        page,
    }) => {
        let pictures = 0;
        page.on('request', (request) => {
            const url = request.url();
            // The picture, not the `info.json` that describes it: the criterion
            // is that the bytes are on their way, not that the service was
            // asked about.
            if (url.includes('/iiif-fixture/') && !url.endsWith('/info.json'))
                pictures += 1;
        });

        await openViewer(page, BOTH_SERVED_URL);
        const canvasId = `${BOTH_SERVED_URL}/canvas/tone`;

        // Still the placeholder's phase: nothing has played.
        expect(await companionPhase(page, canvasId)).toBe('placeholder');

        await expect
            .poll(() => pictures, { timeout: 30_000 })
            .toBeGreaterThan(0);
    });

    /*
        Warming is best-effort and invisible. The canvas's error state is a
        statement about what the READER can see on it, so a service the canvas
        does not paint from may neither raise it nor clear it. The two tests
        below are the two directions of that, and both are viewer-level rather
        than inline: `viewerLevelErrorKind` is not painting-gated, so on a
        single-canvas audio manifest a raised error is FULL-COVER chrome over a
        rect that is painting perfectly.
    */
    test('a warmed service failing leaves the painting placeholder alone', async ({
        page,
    }) => {
        // The score is behind auth; the still is a public data URL and paints.
        await failService(page, FIXTURE_SERVICE, 401);
        await openViewer(page, BOTH_SERVED_URL);
        const canvasId = `${BOTH_SERVED_URL}/canvas/tone`;

        expect(await paintingCompanion(page, canvasId)).toBe(true);
        // Held rather than sampled once: the warm failure arrives a frame or
        // two after the placeholder, and "no login prompt over a picture the
        // reader is looking at" is a claim about every frame.
        await expect
            .poll(() => tileSourceError(page), { timeout: 10_000 })
            .toBeNull();
        expect(await paintingCompanion(page, canvasId)).toBe(true);
    });

    test('a warmed service succeeding does not talk away the painting one’s failure', async ({
        page,
    }) => {
        // The inverse: the still the canvas actually paints from is behind
        // auth, and the score warmed behind it answers perfectly. Silently
        // clearing the error would leave the reader a blank rect and no
        // explanation.
        await failService(page, FIXTURE_SERVICE, 401);
        await openViewer(page, SERVED_STILL_URL, {
            expectStage: false,
            expectSurface: false,
        });

        await expect
            .poll(() => tileSourceError(page), { timeout: 30_000 })
            .toEqual({ type: 'auth' });
        // Still there after the warmed service has had every chance to answer.
        await page.waitForTimeout(2000);
        expect(await tileSourceError(page)).toEqual({ type: 'auth' });
    });

    /*
        A canvas with no placeholder shows its element from the start: there is
        nothing behind it to let through, and hiding it would cost a reader the
        first frame the browser decoded.
    */
    test('shows the video element from the start where there is no placeholder', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.video);

        await expect(page.locator(MEDIA)).toBeVisible();
    });
});
