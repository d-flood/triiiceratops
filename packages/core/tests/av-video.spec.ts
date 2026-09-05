/**
 * `@triiiceratops/plugin-av`, in a real browser: the tracer bullet.
 *
 * Everything here needs a browser and cannot be claimed anywhere else:
 *
 * - **A claimed canvas renders media instead of a placard.** The unsupported
 *   presentation is gone and a `<video>` is in the plugin's overlay layer.
 * - **The stage tracks the canvas rect.** Its box is compared against
 *   `canvasToScreen`'s own projection, at two zoom levels, polled until the
 *   viewport has settled.
 * - **A tap on the picture toggles playback**, the universal convention.
 * - **A dead media URL costs one canvas, not the session**: the localized
 *   "can't play" treatment appears inside that stage, with no unsupported
 *   presentation and no viewer error.
 * - **The shared Svelte runtime is core's, not a second copy.** The plugin
 *   bundles no Svelte; it reads core's off `window.Triiiceratops`, and the
 *   namespace is asserted to hold a curated handful of helpers rather than the
 *   whole `svelte/internal/client` surface.
 * - **A host can command playback through the published state**, driven by a
 *   page script that never imports the plugin: play, seek, mute, and a
 *   currentTime that moves on the finer cadence while playing.
 *
 * Both artifacts are the BUILT ones a consumer loads — `pnpm build:all` (or
 * `build:element` plus the plugin's own `pnpm build`) must have run. The
 * plugin's script URL is served from its `dist/` by the route installed below,
 * because the plugin lives outside the dev server's root.
 */

import { expect, test, type Page } from '@playwright/test';

import { serveAvPluginDist } from './helpers/avPluginDist';
import { AV_MANIFESTS, BARS_SIZE } from './helpers/avMedia';

test.describe.configure({ timeout: 120_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/av-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const UNSUPPORTED = '[data-testid="canvas-unsupported-placeholder"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const CANNOT_PLAY = '[data-testid="av-cannot-play"]';

const BARS_CANVAS = `${AV_MANIFESTS.video}/canvas/bars`;

/** A manifest whose media URL resolves to nothing, served at its own id. */
const DEAD_MANIFEST_URL = '/media/manifests/av-dead.json';
const DEAD_MANIFEST = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: DEAD_MANIFEST_URL,
    type: 'Manifest',
    label: { en: ['Video canvas whose media URL is dead'] },
    items: [
        {
            id: `${DEAD_MANIFEST_URL}/canvas/gone`,
            type: 'Canvas',
            width: 320,
            height: 180,
            duration: 2,
            items: [
                {
                    id: `${DEAD_MANIFEST_URL}/page/gone`,
                    type: 'AnnotationPage',
                    items: [
                        {
                            id: `${DEAD_MANIFEST_URL}/annotation/gone`,
                            type: 'Annotation',
                            motivation: 'painting',
                            body: {
                                id: '/media/no-such-clip.mp4',
                                type: 'Video',
                                format: 'video/mp4',
                                width: 320,
                                height: 180,
                                duration: 2,
                            },
                            target: `${DEAD_MANIFEST_URL}/canvas/gone`,
                        },
                    ],
                },
            ],
        },
    ],
};

/**
 * Open the fixture with the plugin's built IIFE served, and wait until the
 * renderer has a surface.
 */
async function openViewer(page: Page, manifest: string): Promise<void> {
    await serveAvPluginDist(page);
    await page.route(`**${DEAD_MANIFEST_URL}`, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(DEAD_MANIFEST),
        }),
    );
    await page.goto(`${FIXTURE}?manifest=${encodeURIComponent(manifest)}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * The stage's offset inside the overlay container, beside `canvasToScreen`'s
 * own projection of the same canvas corners. The container's origin IS
 * `canvasToScreen`'s origin, so the two must agree without any correction —
 * which is exactly the claim worth testing.
 */
async function stageVersusProjection(
    page: Page,
    canvasId: string,
    size: { width: number; height: number },
) {
    return page.evaluate(
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
            const stage = host.shadowRoot.querySelector(
                '[data-testid="av-stage"]',
            ) as HTMLElement | null;
            // The wrapper, not `parentElement`: the mount host between them is
            // `display: contents` and has no box of its own.
            const layer = stage?.closest('.plugin-overlay-layer') ?? null;
            if (!stage || !layer) return null;

            const topLeft = host.viewerState.canvasToScreen({ x: 0, y: 0 }, id);
            const bottomRight = host.viewerState.canvasToScreen(
                { x: width as number, y: height as number },
                id,
            );
            if (!topLeft || !bottomRight) return null;

            const stageBox = stage.getBoundingClientRect();
            const layerBox = layer.getBoundingClientRect();
            return {
                offsetX: stageBox.left - layerBox.left,
                offsetY: stageBox.top - layerBox.top,
                width: stageBox.width,
                predictedX: topLeft.x,
                predictedY: topLeft.y,
                predictedWidth: bottomRight.x - topLeft.x,
            };
        },
        [canvasId, size.width, size.height] as const,
    );
}

test.describe('av video — a claimed canvas plays its video', () => {
    test('replaces the unsupported presentation with a video element', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.video);

        await expect(page.locator(MEDIA)).toHaveCount(1, { timeout: 30_000 });
        await expect(page.locator(MEDIA)).toHaveJSProperty('tagName', 'VIDEO');

        // The claim's whole effect: no placard over a canvas the plugin owns.
        await expect(page.locator(UNSUPPORTED)).toHaveCount(0);
        // Never the native controls — the transport is the viewer's.
        expect(
            await page.locator(MEDIA).evaluate((el) => ({
                controls: (el as HTMLVideoElement).controls,
                playsinline: el.hasAttribute('playsinline'),
                preload: (el as HTMLVideoElement).preload,
            })),
        ).toEqual({ controls: false, playsinline: true, preload: 'metadata' });
    });

    test('sits over the canvas rect, and stays there through a zoom', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.video);
        await expect(page.locator(STAGE)).toBeVisible({ timeout: 30_000 });

        // Poll rather than read once: the initial fit animates, and a
        // synchronous read lands mid-transition.
        await expect
            .poll(
                async () => {
                    const seen = await stageVersusProjection(
                        page,
                        BARS_CANVAS,
                        BARS_SIZE,
                    );
                    if (!seen || seen.width < 1) return null;
                    return (
                        Math.abs(seen.offsetX - seen.predictedX) < 1.5 &&
                        Math.abs(seen.offsetY - seen.predictedY) < 1.5 &&
                        Math.abs(seen.width - seen.predictedWidth) < 1.5
                    );
                },
                { timeout: 20_000 },
            )
            .toBe(true);

        const before = await stageVersusProjection(
            page,
            BARS_CANVAS,
            BARS_SIZE,
        );

        await page.evaluate(() => {
            const host = document.getElementById('v') as unknown as {
                viewerState: { zoomIn(): void };
            };
            host.viewerState.zoomIn();
            host.viewerState.zoomIn();
        });

        // Settled means: bigger than before AND still agreeing with the
        // projection. Both, or a stage that simply never moved would pass.
        await expect
            .poll(
                async () => {
                    const seen = await stageVersusProjection(
                        page,
                        BARS_CANVAS,
                        BARS_SIZE,
                    );
                    if (!seen || !before) return null;
                    return (
                        seen.width > before.width + 1 &&
                        Math.abs(seen.offsetX - seen.predictedX) < 1.5 &&
                        Math.abs(seen.offsetY - seen.predictedY) < 1.5 &&
                        Math.abs(seen.width - seen.predictedWidth) < 1.5
                    );
                },
                { timeout: 20_000 },
            )
            .toBe(true);
    });

    test('toggles playback when the picture is tapped', async ({ page }) => {
        await openViewer(page, AV_MANIFESTS.video);
        const media = page.locator(MEDIA);
        await expect(media).toBeVisible({ timeout: 30_000 });

        await expect
            .poll(() => media.evaluate((el) => (el as HTMLVideoElement).paused))
            .toBe(true);

        // At the centre, not at a corner: the projection overhangs the
        // viewer's centre column and is clipped to it, so a corner of a
        // fitted-to-height video is behind the chrome docked beside it.
        await media.click();
        await expect
            .poll(() => media.evaluate((el) => (el as HTMLVideoElement).paused))
            .toBe(false);

        await media.click();
        await expect
            .poll(() => media.evaluate((el) => (el as HTMLVideoElement).paused))
            .toBe(true);
    });

    test('shows a localized "can’t play" treatment for a dead media URL', async ({
        page,
    }) => {
        await openViewer(page, DEAD_MANIFEST_URL);

        const notice = page.locator(CANNOT_PLAY);
        await expect(notice).toBeVisible({ timeout: 30_000 });
        await expect(notice).toHaveText(/.+/);

        // …and the picture it replaces is gone. Asserted on what a reader would
        // see, not on the `hidden` attribute: the stage's own `display` rules
        // decide whether setting it has any effect.
        await expect(page.locator(MEDIA)).toBeHidden();

        // A failed stream is not an unsupported canvas and not a viewer error:
        // the canvas is supported, this one stream is not.
        await expect(page.locator(UNSUPPORTED)).toHaveCount(0);
        await expect(page.locator(STAGE)).toHaveCount(1);
    });
});

test.describe('av video — the shared Svelte runtime', () => {
    test('exposes core’s runtime on the namespace and bundles none of its own', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.video);

        const runtime = await page.evaluate(
            () =>
                (
                    window as unknown as {
                        __avRuntime: {
                            hasSvelte: boolean;
                            internalKeys: string[];
                        };
                    }
                ).__avRuntime,
        );

        expect(runtime.hasSvelte).toBe(true);
        // Curated, never `export *`: the whole namespace is ~200 exports and
        // costs core 8.8 KB gzip.
        expect(runtime.internalKeys.length).toBeGreaterThan(0);
        expect(runtime.internalKeys.length).toBeLessThan(60);
    });
});

/**
 * External control (the parity rule): the same commands the plugin's own UI
 * issues, driven by a page script that never imports the plugin — it asks the
 * viewer for the published state, exactly as a host application would.
 */
test.describe('av state — a host commands playback through getPluginState', () => {
    test('plays, seeks and mutes the current canvas’s media', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.video);
        const media = page.locator(MEDIA);
        await expect(media).toBeVisible({ timeout: 30_000 });

        // The state is published under the id the viewer knows the plugin by,
        // and it knows which canvas it is addressing.
        expect(
            await page.evaluate((canvasId) => {
                const host = document.getElementById('v') as unknown as {
                    viewerState: {
                        getPluginState(id: string): {
                            activeMediaCanvasId: string | null;
                            paused: boolean;
                        } | null;
                    };
                };
                const av = host.viewerState.getPluginState('av');
                return av
                    ? {
                          active: av.activeMediaCanvasId === canvasId,
                          paused: av.paused,
                      }
                    : null;
            }, BARS_CANVAS),
        ).toEqual({ active: true, paused: true });

        // Muted first: a headless browser's autoplay policy refuses audible
        // script-initiated playback, and a refusal is state, not an error — so
        // an unmuted `play()` here would assert nothing about the command.
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

        await expect
            .poll(() => media.evaluate((el) => (el as HTMLVideoElement).muted))
            .toBe(true);
        await expect
            .poll(() => media.evaluate((el) => (el as HTMLVideoElement).paused))
            .toBe(false);

        // A seek is canvas time, and it is clamped to the canvas's duration:
        // 999 s into a 2 s clip lands at the end, never past it.
        await page.evaluate(() => {
            const host = document.getElementById('v') as unknown as {
                viewerState: {
                    getPluginState(
                        id: string,
                    ): { seek(t: number): void } | null;
                };
            };
            host.viewerState.getPluginState('av')!.seek(999);
        });
        await expect
            .poll(() =>
                media.evaluate(
                    (el) =>
                        (el as HTMLVideoElement).currentTime <=
                        (el as HTMLVideoElement).duration + 0.001,
                ),
            )
            .toBe(true);

        await page.evaluate(() => {
            const host = document.getElementById('v') as unknown as {
                viewerState: {
                    getPluginState(id: string): {
                        seek(t: number): void;
                        pause(): void;
                    } | null;
                };
            };
            const av = host.viewerState.getPluginState('av')!;
            av.pause();
            av.seek(0.5);
        });
        await expect
            .poll(() =>
                media.evaluate((el) => (el as HTMLVideoElement).currentTime),
            )
            .toBeCloseTo(0.5, 1);
        await expect
            .poll(() => media.evaluate((el) => (el as HTMLVideoElement).paused))
            .toBe(true);
    });

    test('reports a moving currentTime on the finer cadence during playback', async ({
        page,
    }) => {
        await openViewer(page, AV_MANIFESTS.video);
        await expect(page.locator(MEDIA)).toBeVisible({ timeout: 30_000 });

        // What a host scrubber is: a projection of the query-only `currentTime`
        // woken by `subscribeFrame`. Read off the published state, never off the
        // media element, so a stalled cadence is a failure here even while the
        // element plays on.
        await page.evaluate(() => {
            const host = document.getElementById('v') as unknown as {
                viewerState: {
                    getPluginState(id: string): {
                        setMuted(m: boolean): void;
                        play(): void;
                        readonly currentTime: number;
                        subscribeFrame(cb: () => void): () => void;
                    } | null;
                };
            };
            const av = host.viewerState.getPluginState('av')!;
            const seen = { ticks: 0, last: 0 };
            (window as unknown as { __avCadence: typeof seen }).__avCadence =
                seen;
            av.subscribeFrame(() => {
                seen.ticks += 1;
                seen.last = av.currentTime;
            });
            av.setMuted(true);
            av.play();
        });

        await expect
            .poll(
                async () => {
                    const seen = await page.evaluate(
                        () =>
                            (
                                window as unknown as {
                                    __avCadence: {
                                        ticks: number;
                                        last: number;
                                    };
                                }
                            ).__avCadence,
                    );
                    // Many ticks, and a playhead that actually advanced: a
                    // cadence that fires while `currentTime` stays at 0 is the
                    // frozen-scrubber failure this exists to catch.
                    return seen.ticks > 10 && seen.last > 0.1;
                },
                { timeout: 20_000 },
            )
            .toBe(true);
    });
});
