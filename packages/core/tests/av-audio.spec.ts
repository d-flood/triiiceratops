/**
 * Audio as a first-class canvas, in a real browser: the **stage layout**.
 *
 * What only a browser can settle:
 *
 * - **A duration-only canvas is claimed, laid out and playable.** It declares no
 *   width or height, so its rect is core's geometry ladder's answer rather than
 *   the manifest's — and the stage has to sit exactly on it.
 * - **The lanes divide that rect and track it through a zoom.** The split is in
 *   canvas space, so the accompanying image and the timeline strip keep their
 *   share of the projection at any scale.
 * - **A tap on the timeline lane seeks proportionally**, through AVState, to the
 *   fraction of the lane the pointer landed on.
 * - **The placeholder is there before playback and gone after it.**
 *
 * As with `av-video.spec.ts`, both artifacts are the BUILT ones a consumer
 * loads — `pnpm build:all` (or `build:element` plus the plugin's own
 * `pnpm build`) must have run.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { AV_MANIFESTS, TONE_MP3, TONE_DURATION } from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const TRANSPORT = '[data-testid="av-transport"]';
const PLAY = '[data-testid="av-play"]';
const VISUAL_LANE = '[data-testid="av-visual-lane"]';
const TIMELINE_LANE = '[data-testid="av-timeline-lane"]';
const ACCOMPANYING = '[data-testid="av-accompanying"]';
const PLACEHOLDER = '[data-testid="av-placeholder"]';
const UNSUPPORTED = '[data-testid="canvas-unsupported-placeholder"]';

const AUDIO_CANVAS = `${AV_MANIFESTS.audio}/canvas/tone`;

/**
 * A committed 8x8 PNG, inline.
 *
 * The AV suite runs with no network, and the media fixture directory holds
 * generated audio and video rather than stills. A `data:` URL is same-origin
 * with everything and is a plain image URL — which is also the branch the
 * placeholder contract cares about, since that is what becomes a `poster`.
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
function audioManifest(url: string, companions: Record<string, unknown> = {}) {
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
                                body: {
                                    id: TONE_MP3,
                                    type: 'Sound',
                                    format: 'audio/mpeg',
                                    duration: TONE_DURATION,
                                },
                                target: canvasId,
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

const ACCOMPANYING_URL = '/media/manifests/av-accompanying.json';
const ACCOMPANYING_MANIFEST = audioManifest(ACCOMPANYING_URL, {
    accompanyingCanvas: companionCanvas(`${ACCOMPANYING_URL}/canvas/score`),
});

const PLACEHOLDER_URL = '/media/manifests/av-placeholder.json';
const PLACEHOLDER_MANIFEST = audioManifest(PLACEHOLDER_URL, {
    placeholderCanvas: companionCanvas(`${PLACEHOLDER_URL}/canvas/poster`),
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
    options: { expectStage?: boolean } = {},
): Promise<void> {
    await serveAvPluginDist(page);
    for (const [url, json] of [
        [ACCOMPANYING_URL, ACCOMPANYING_MANIFEST],
        [PLACEHOLDER_URL, PLACEHOLDER_MANIFEST],
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
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
    if (options.expectStage !== false)
        await page
            .locator(STAGE)
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

        const lane = await page.locator(TIMELINE_LANE).boundingBox();
        expect(lane).not.toBeNull();

        // Three quarters across the lane is three quarters through the piece.
        await page.locator(TIMELINE_LANE).click({
            position: { x: lane!.width * 0.75, y: lane!.height / 2 },
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

test.describe('av audio — accompanying and placeholder canvases', () => {
    test('shows the accompanying image above the strip, both tracking the rect', async ({
        page,
    }) => {
        await openViewer(page, ACCOMPANYING_URL);

        await expect(page.locator(ACCOMPANYING)).toBeVisible();

        /** The two lanes, as fractions of the stage box. */
        const lanes = async () => {
            const stage = await page.locator(STAGE).boundingBox();
            const visual = await page.locator(VISUAL_LANE).boundingBox();
            const timeline = await page.locator(TIMELINE_LANE).boundingBox();
            if (!stage || !visual || !timeline || stage.height < 1) return null;
            return {
                stageWidth: stage.width,
                imageAbove: visual.y + visual.height <= timeline.y + 1.5,
                timelineShare: timeline.height / stage.height,
                covered:
                    Math.abs(visual.height + timeline.height - stage.height) <
                    1.5,
            };
        };

        await expect
            .poll(async () => {
                const seen = await lanes();
                if (!seen) return null;
                return (
                    seen.imageAbove &&
                    seen.covered &&
                    Math.abs(seen.timelineShare - 0.25) < 0.01
                );
            })
            .toBe(true);

        const before = await lanes();
        await zoomTo(page, (before!.stageWidth / 100) * 3);

        // The split is in canvas space, so the strip keeps its share of a rect
        // that got bigger — it does not become a fixed band of pixels.
        await expect
            .poll(async () => {
                const seen = await lanes();
                if (!seen || !before) return null;
                return {
                    bigger: seen.stageWidth > before.stageWidth + 1,
                    share: Math.abs(seen.timelineShare - 0.25) < 0.01,
                    stacked: seen.imageAbove && seen.covered,
                };
            })
            .toEqual({ bigger: true, share: true, stacked: true });
    });

    // User story 6: the picture is the tap target. For a sound recording that
    // picture is the accompanying still, which is not the media element.
    test('toggles playback when the accompanying image is tapped', async ({
        page,
    }) => {
        await openViewer(page, ACCOMPANYING_URL);
        await expect(page.locator(ACCOMPANYING)).toBeVisible();

        await page.locator(ACCOMPANYING).click();

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

    test('shows the placeholder until playback begins, and not after', async ({
        page,
    }) => {
        await openViewer(page, PLACEHOLDER_URL);

        // An audio canvas has no element to hang a `poster` on, so its
        // placeholder is the overlay.
        await expect(page.locator(PLACEHOLDER)).toBeVisible();

        await page
            .locator(TRANSPORT)
            .waitFor({ state: 'visible', timeout: 30_000 });
        await page.locator(PLAY).click();

        await expect(page.locator(PLACEHOLDER)).toHaveCount(0, {
            timeout: 20_000,
        });
    });
});
