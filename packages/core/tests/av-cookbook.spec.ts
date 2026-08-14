/**
 * The demo, against every audiovisual IIIF Cookbook recipe (user story 47).
 *
 * This is the epic's exit criterion, driven where a visitor meets it: the real
 * demo page at `/`, with `@triiiceratops/plugin-av` registered the way
 * `Demo.svelte` registers it, opened on each of the fifteen recipes at their
 * canonical `iiif.io` URLs — the same URLs the manifest picker offers.
 *
 * The network stands in and nothing else does. Each recipe's manifest is served
 * from the VENDORED copy under `src/lib/test/fixtures/manifests/av/` (byte for
 * byte, targets and structures and all), its media from the two-second clips
 * under `tests/media/`, and `iiif.io`'s reference image service from the dev
 * server's own fake one. What is under test is the recipe, not the internet.
 *
 * Two things are asserted for every recipe, and they are the ticket's own
 * words: zero unsupported presentations and zero error chrome. Beyond that each
 * recipe declares what it should put on screen — a claimed AV stage with a
 * media element, or (for `0489-multimedia-canvas`, the one documented
 * exception) a painted image body and a degradation warning.
 *
 * `pnpm build:all` must have run: the demo resolves the plugin to its built
 * `dist/`, as a consumer's bundler would.
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { expect, test, type Page, type Route } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const STAGE = '[data-testid="av-stage"]';
const MEDIA = '[data-testid="av-media"]';
const TRANSPORT = '[data-testid="av-transport"]';
const PLAY = '[data-testid="av-play"]';
const MUTE = '[data-testid="av-mute"]';
const CAPTIONS = '[data-testid="av-captions"]';
const CANNOT_PLAY = '[data-testid="av-cannot-play"]';
const UNSUPPORTED = '[data-testid="canvas-unsupported-placeholder"]';
const ERROR = '[data-testid="canvas-error-placeholder"]';

// The plugin's panel and the chrome that opens it. Core pairs an SDK plugin's
// `<uiId>:toggle` button with its `<uiId>:panel`, and the panel mounts on open
// — so a spec that never presses the toggle sees no panel at all, which is how
// the transcript went unnoticed while every stage assertion passed.
const PANEL_TOGGLE = '[data-plugin-toggle="av"]';
const PANEL = '[data-testid="av-panel"]';
const STAGE_COUNT = '[data-testid="av-stage-count"]';
const TRANSCRIPT = '[data-testid="av-transcript"]';
const TRANSCRIPT_TRACK = '[data-testid="av-transcript-track"]';
const CUES = '[data-testid="av-transcript-cues"] button';

const MEDIA_DIR = join(import.meta.dirname, 'media');
const AV_CORPUS = join(
    import.meta.dirname,
    '../src/lib/test/fixtures/manifests/av',
);

/** A 1x1 opaque PNG — enough for a poster, an album cover or a thumbnail. */
const PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

/**
 * The fifteen recipes, exactly as `PROVENANCE.md` records them.
 *
 * `surface` is what the recipe must put on the current canvas:
 * `'stage'` — the plugin claimed it and a media element is playing position;
 * `'image'` — core painted an image body and the plugin claimed nothing the
 * reader can see. Only `0489` is the second kind, and it is the epic's one
 * documented degradation.
 */
const RECIPES: {
    id: string;
    file: string;
    label: string;
    surface: 'stage' | 'image';
}[] = [
    {
        id: '0002-mvm-audio',
        file: '0002-mvm-audio.json',
        label: 'audio',
        surface: 'stage',
    },
    {
        id: '0003-mvm-video',
        file: '0003-mvm-video.json',
        label: 'video',
        surface: 'stage',
    },
    {
        id: '0013-placeholderCanvas',
        file: '0013-placeholderCanvas.json',
        label: 'placeholder canvas',
        surface: 'stage',
    },
    {
        id: '0014-accompanyingcanvas',
        file: '0014-accompanyingcanvas.json',
        label: 'accompanying canvas',
        surface: 'stage',
    },
    {
        id: '0015-start',
        file: '0015-start.json',
        label: 'start',
        surface: 'stage',
    },
    {
        id: '0017-transcription-av',
        file: '0017-transcription-av.json',
        label: 'transcript rendering',
        surface: 'stage',
    },
    {
        id: '0026-toc-opera',
        file: '0026-toc-opera.json',
        label: 'ranges as chapters',
        surface: 'stage',
    },
    {
        id: '0064-opera-one-canvas',
        file: '0064-opera-one-canvas.json',
        label: 'temporal composition',
        surface: 'stage',
    },
    {
        id: '0065-opera-multiple-canvases',
        file: '0065-opera-multiple-canvases.json',
        label: 'multi-canvas opera',
        surface: 'stage',
    },
    {
        id: '0074-multiple-language-captions',
        file: '0074-multiple-language-captions.json',
        label: 'multi-language captions',
        surface: 'stage',
    },
    {
        id: '0103-poetry-reading-annotations',
        file: '0103-poetry-reading-annotations.json',
        label: 'time-based annotations',
        surface: 'stage',
    },
    {
        id: '0219-using-caption-file',
        file: '0219-using-caption-file.json',
        label: 'captions',
        surface: 'stage',
    },
    {
        id: '0229-behavior-ranges',
        file: '0229-behavior-ranges.json',
        label: 'range thumbnails',
        surface: 'stage',
    },
    {
        id: '0434-choice-av',
        file: '0434-choice-av.json',
        label: 'format Choice',
        surface: 'stage',
    },
    {
        id: '0489-multimedia-canvas',
        file: '0489-multimedia-canvas.json',
        label: 'multimedia canvas — documented degradation',
        surface: 'image',
    },
];

/** What one recipe's page told us while it loaded. */
interface Log {
    warnings: string[];
    errors: string[];
    /** Requests into an Image API service — the proof that a body painted. */
    imageRequests: number;
}

const newLog = (): Log => ({ warnings: [], errors: [], imageRequests: 0 });

const recipeUrl = (id: string) =>
    `https://iiif.io/api/cookbook/recipe/${id}/manifest.json`;

/** Local bytes for a remote media URL, chosen by extension. */
function standIn(url: string): { contentType: string; body: Buffer } | null {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith('.mp4') || path.endsWith('.m4a'))
        return {
            contentType: 'video/mp4',
            body: readFileSync(join(MEDIA_DIR, 'bars.mp4')),
        };
    if (path.endsWith('.mp3') || path.endsWith('.mpeg'))
        return {
            contentType: 'audio/mpeg',
            body: readFileSync(join(MEDIA_DIR, 'tone.mp3')),
        };
    if (path.endsWith('.vtt'))
        return {
            contentType: 'text/vtt',
            body: readFileSync(join(MEDIA_DIR, 'captions.vtt')),
        };
    if (path.endsWith('.png') || path.endsWith('.jpg'))
        return { contentType: 'image/png', body: PIXEL_PNG };
    if (path.endsWith('.txt'))
        return { contentType: 'text/plain', body: Buffer.from('transcript') };
    return null;
}

/**
 * A response for one stand-in, honouring a `Range` request.
 *
 * Chromium will not seek a media resource it fetched as an opaque stream: it
 * needs `Accept-Ranges` and a real `206`, or `currentTime` assignments are
 * silently dropped. A plain `route.fulfill` of the whole file provides neither,
 * which is why the transcript's seek can only be proved once the stand-in
 * serves ranges the way a media host does.
 */
function rangeAware(
    local: { contentType: string; body: Buffer },
    range: string | undefined,
): Parameters<Route['fulfill']>[0] {
    const headers: Record<string, string> = {
        'access-control-allow-origin': '*',
        'accept-ranges': 'bytes',
    };
    const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    if (!match)
        return { contentType: local.contentType, body: local.body, headers };

    const total = local.body.length;
    const start = match[1] === '' ? total - Number(match[2]) : Number(match[1]);
    const end =
        match[1] === '' || match[2] === '' ? total - 1 : Number(match[2]);
    return {
        status: 206,
        contentType: local.contentType,
        body: local.body.subarray(start, end + 1),
        headers: {
            ...headers,
            'content-range': `bytes ${start}-${end}/${total}`,
        },
    };
}

/**
 * Stand the network up, then open the demo on one recipe.
 *
 * Routes are registered generic-first: Playwright matches the most recently
 * added first, so the recipe manifests and the reference image service win over
 * the by-extension media fallback.
 */
async function installRoutes(page: Page, log: Log): Promise<void> {
    page.on('console', (message) => {
        if (message.type() === 'warning') log.warnings.push(message.text());
        if (message.type() === 'error') log.errors.push(message.text());
    });
    page.on('request', (request) => {
        if (/\/iiif-fixture\/|\/api\/image\//.test(request.url()))
            log.imageRequests += 1;
    });

    // Everything remote, by extension. Anything with no stand-in is a 404, the
    // same as it would be on a page whose media has gone away.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
        const local = standIn(route.request().url());
        if (!local) return route.fulfill({ status: 404, body: '' });
        return route.fulfill(
            rangeAware(local, route.request().headers().range),
        );
    });

    // `iiif.io`'s reference Image API service becomes the dev server's own fake
    // one, so `0489`'s and `0014`'s image bodies paint through the real tile
    // pipeline rather than from a stubbed JPEG.
    await page.route('https://iiif.io/api/image/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const rest = path.replace('/api/image/3.0/example/reference/', '');
        const response = await route.fetch({
            url: `http://127.0.0.1:5175/iiif-fixture/${rest}`,
        });
        return route.fulfill({ response });
    });

    // Every recipe manifest, from the vendored copy at its own id.
    for (const recipe of RECIPES) {
        await page.route(`**${recipeUrl(recipe.id)}`, (route) =>
            route.fulfill({
                contentType: 'application/json',
                body: readFileSync(join(AV_CORPUS, recipe.file)),
            }),
        );
    }
}

/** The demo, opened on one recipe. */
async function openRecipe(page: Page, id: string, log: Log): Promise<void> {
    await installRoutes(page, log);
    await page.goto(`/?manifest=${encodeURIComponent(recipeUrl(id))}`, {
        waitUntil: 'domcontentloaded',
    });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 60_000 });
}

/** Open the plugin's panel through the demo's toolbar, as a reader would. */
async function openAvPanel(page: Page): Promise<void> {
    await page.locator(PANEL_TOGGLE).click();
    await page.locator(PANEL).waitFor({ state: 'visible', timeout: 30_000 });
}

/** The media element's own view of playback. */
async function playback(
    page: Page,
): Promise<{ currentTime: number; paused: boolean }> {
    return page
        .locator(MEDIA)
        .first()
        .evaluate((element) => {
            const media = element as HTMLMediaElement;
            return { currentTime: media.currentTime, paused: media.paused };
        });
}

test.describe('demo av cookbook coverage', () => {
    test('the picker lists every audiovisual recipe in one group', async ({
        page,
    }) => {
        await page.goto('/?manifest=', { waitUntil: 'domcontentloaded' });
        const group = page.locator('optgroup[data-testid="av-recipes"]');
        await expect(group).toHaveAttribute('label', 'Audio & Video');

        const urls = await group
            .locator('option')
            .evaluateAll((options) =>
                options.map((option) => (option as HTMLOptionElement).value),
            );
        expect(urls).toEqual(RECIPES.map((recipe) => recipeUrl(recipe.id)));
    });

    for (const recipe of RECIPES) {
        test(`${recipe.id} — ${recipe.label}`, async ({ page }) => {
            const log = newLog();
            await openRecipe(page, recipe.id, log);

            if (recipe.surface === 'stage') {
                await page
                    .locator(STAGE)
                    .first()
                    .waitFor({ state: 'visible', timeout: 60_000 });
                await expect(page.locator(MEDIA).first()).toBeAttached();
                await expect(page.locator(TRANSPORT).first()).toBeVisible();
                await expect(page.locator(CANNOT_PLAY).first()).toBeHidden();

                // The plugin's own panel is reachable from the demo's chrome
                // and reports the canvases it claimed.
                await openAvPanel(page);
                await expect(page.locator(STAGE_COUNT)).toContainText(
                    /[1-9]\d* media canvas\(es\) claimed/,
                );
            } else {
                // The documented degradation: the image body paints and the
                // developer is told, in the console, what was not rendered.
                await expect
                    .poll(
                        () =>
                            log.warnings.filter((w) => /xywh/i.test(w)).length,
                        {
                            timeout: 30_000,
                        },
                    )
                    .toBeGreaterThan(0);
                // Nothing is claimed and no media element is built: core
                // paints the image body through the ordinary tile pipeline and
                // the video and text bodies are ignored, which is what SPEC's
                // "Out of Scope" entry describes.
                await expect(page.locator(STAGE)).toHaveCount(0);
                await expect(page.locator(MEDIA)).toHaveCount(0);
                await expect
                    .poll(() => log.imageRequests, { timeout: 30_000 })
                    .toBeGreaterThan(0);
            }

            await expect(page.locator(UNSUPPORTED)).toHaveCount(0);
            await expect(page.locator(ERROR)).toHaveCount(0);
        });
    }

    test('an audio recipe plays end to end', async ({ page }) => {
        const log = newLog();
        await openRecipe(page, '0002-mvm-audio', log);
        await page.locator(STAGE).first().waitFor({ state: 'visible' });
        await page.locator(MUTE).click();
        await page.locator(PLAY).click();
        await expect
            .poll(() => currentTime(page), { timeout: 30_000 })
            .toBeGreaterThan(0.2);
    });

    test('a video recipe plays end to end', async ({ page }) => {
        const log = newLog();
        await openRecipe(page, '0003-mvm-video', log);
        await page.locator(STAGE).first().waitFor({ state: 'visible' });
        await page.locator(MUTE).click();
        await page.locator(PLAY).click();
        await expect
            .poll(() => currentTime(page), { timeout: 30_000 })
            .toBeGreaterThan(0.2);
    });

    test('a captions recipe plays end to end', async ({ page }) => {
        const log = newLog();
        await openRecipe(page, '0219-using-caption-file', log);
        await page.locator(STAGE).first().waitFor({ state: 'visible' });
        await page.locator(MUTE).click();
        await page.locator(PLAY).click();
        await expect
            .poll(() => currentTime(page), { timeout: 30_000 })
            .toBeGreaterThan(0.2);

        // The cross-origin VTT loads rather than being refused, so the toggle
        // is a live control and no track is dropped.
        await expect(page.locator(CAPTIONS).first()).toBeVisible();
        expect(log.warnings.some((w) => /caption track/i.test(w))).toBe(false);
    });

    /**
     * The script-tag half of user story 30, on the page that ships it.
     *
     * The BUILT `docs/demo/webcomponent/index.html` is served verbatim from a
     * depth where its own relative `../../dist/…` URLs land on the dev server's
     * `/dist/` — core's real element IIFE — and on a route mapping
     * `/dist/plugin-av/` onto the plugin's real dist DIRECTORY, chunks and all.
     * Nothing here is a fixture page: a change to the demo's markup or to the
     * build step that copies the plugin beside core is what this catches.
     */
    test('the webcomponent demo plays an AV manifest from the IIFE dist', async ({
        page,
    }) => {
        const log = newLog();
        await installRoutes(page, log);

        const built = join(
            import.meta.dirname,
            '../../../docs/demo/webcomponent',
        );
        await page.route('**/e2e/wc-demo/*', (route) => {
            const name = basename(new URL(route.request().url()).pathname);
            return route.fulfill({
                contentType: name.endsWith('.css')
                    ? 'text/css'
                    : 'text/html; charset=utf-8',
                body: readFileSync(join(built, name)),
            });
        });
        await page.route('**/plugin-av/*.js', (route) => {
            const name = basename(new URL(route.request().url()).pathname);
            return route.fulfill({
                contentType: 'text/javascript',
                body: readFileSync(
                    join(import.meta.dirname, '../../plugin-av/dist', name),
                ),
            });
        });

        await page.goto('/e2e/wc-demo/index.html', {
            waitUntil: 'domcontentloaded',
        });

        const viewer = page.locator('#av');
        await viewer
            .locator(STAGE)
            .first()
            .waitFor({ state: 'visible', timeout: 60_000 });
        await expect(viewer.locator(MEDIA).first()).toBeAttached();

        await viewer.locator(MUTE).click();
        await viewer.locator(PLAY).click();
        await expect
            .poll(() => currentTime(page, '#av'), { timeout: 30_000 })
            .toBeGreaterThan(0.2);
    });

    /**
     * User story 12a on the corpus the epic is judged by: a reader following a
     * recording's words, in the demo, through the panel the toolbar opens.
     */
    test('a caption recipe offers its transcript, and a cue seeks without playing', async ({
        page,
    }) => {
        const log = newLog();
        await openRecipe(page, '0219-using-caption-file', log);
        await page.locator(STAGE).first().waitFor({ state: 'visible' });
        await openAvPanel(page);

        await expect(page.locator(TRANSCRIPT)).toBeVisible({ timeout: 30_000 });
        await expect(page.locator(TRANSCRIPT_TRACK)).toContainText(
            'Captions in WebVTT format',
        );
        await expect(page.locator(CUES)).toHaveText([
            '0:00Colour bars, first third.',
            '0:00Colour bars, second third.',
            '0:01Colour bars, last third.',
        ]);

        expect((await playback(page)).paused).toBe(true);
        await page.locator(CUES).nth(1).click();
        await expect
            .poll(async () => (await playback(page)).currentTime, {
                timeout: 10_000,
            })
            .toBeGreaterThanOrEqual(0.7);
        expect((await playback(page)).paused).toBe(true);
    });

    /** No VTT, no transcript — ticket 13's no-dead-control rule, in the demo. */
    test('a recipe with no captions offers no transcript', async ({ page }) => {
        const log = newLog();
        await openRecipe(page, '0002-mvm-audio', log);
        await page.locator(STAGE).first().waitFor({ state: 'visible' });
        await openAvPanel(page);

        await expect(page.locator(STAGE_COUNT)).toBeVisible();
        await expect(page.locator(TRANSCRIPT)).toHaveCount(0);
    });

    /** The captions half of user story 12, on the corpus the epic is judged by. */
    test('a cross-origin caption recipe offers its track', async ({ page }) => {
        const log = newLog();
        await openRecipe(page, '0219-using-caption-file', log);
        await page.locator(STAGE).first().waitFor({ state: 'visible' });
        await expect(page.locator(CAPTIONS).first()).toBeVisible();
    });
});

/** The playhead, read off the plugin's published state — the host's own path. */
function currentTime(
    page: Page,
    selector = 'triiiceratops-viewer',
): Promise<number> {
    return page.evaluate((sel) => {
        const host = document.querySelector(sel) as unknown as {
            viewerState: {
                getPluginState(id: string): { currentTime: number } | null;
            };
        };
        return host?.viewerState?.getPluginState('av')?.currentTime ?? 0;
    }, selector);
}
