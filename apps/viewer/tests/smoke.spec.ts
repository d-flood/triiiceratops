/**
 * The bare viewer's smoke screens: a content state opens a view, a bare URL
 * offers the fallback input, a failed manifest keeps that input reachable, an
 * audio content state plays, the chrome speaks the reader's language, and a
 * `config` parameter is not public API on the cookbook's URL.
 *
 * Every content state here is a bare IIIF URI naming a manifest, the form a
 * cookbook recipe's link carries; the manifests are fulfilled by `page.route`
 * from `tests/fixtures`. The page never reads `iiif-content` itself, so a passing
 * screen has watched the VIEWER read it (ADR 0006).
 */

import { expect, test, type Page } from '@playwright/test';

import { audioManifest, imageManifest } from './fixtures/manifests';
import { ORIGIN } from './helpers/origin';

const IMAGE_MANIFEST = `${ORIGIN}/test-manifests/image.json`;
const AUDIO_MANIFEST = `${ORIGIN}/test-manifests/audio.json`;
const AUDIO_MEDIA = `${ORIGIN}/test-manifests/tone.wav`;
const MISSING_MANIFEST = `${ORIGIN}/test-manifests/missing.json`;

const SURFACE = '[data-testid="canvas-renderer-surface"]';
const UNSUPPORTED = '[data-testid="canvas-unsupported-placeholder"]';
const FALLBACK_INPUT = '[data-testid="content-state-input"]';
const MEDIA = '[data-testid="av-media"]';

/**
 * A chrome control whose accessible name is a translated message, so the name
 * alone says which locale the viewer resolved. `Open Menu` is `Menü öffnen` in
 * the only other locale the viewer ships.
 */
const OPEN_MENU_EN = 'Open Menu';
const OPEN_MENU_DE = 'Menü öffnen';

function chromeButton(page: Page, name: string) {
    return page.getByRole('button', { name, exact: true });
}

async function expectEnglishChrome(page: Page): Promise<void> {
    await expect(chromeButton(page, OPEN_MENU_EN).first()).toBeAttached();
    await expect(chromeButton(page, OPEN_MENU_DE)).toHaveCount(0);
}

function contentStateUrl(manifest: string, extra = ''): string {
    return `/?iiif-content=${encodeURIComponent(manifest)}${extra}`;
}

function serveJson(page: Page, url: string, body: unknown): Promise<void> {
    return page.route(url, (route) =>
        route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify(body),
        }),
    );
}

test.beforeEach(async ({ page }) => {
    await serveJson(page, IMAGE_MANIFEST, imageManifest(IMAGE_MANIFEST));
    await serveJson(
        page,
        AUDIO_MANIFEST,
        audioManifest(AUDIO_MANIFEST, AUDIO_MEDIA),
    );
    await page.route(MISSING_MANIFEST, (route) =>
        route.fulfill({
            status: 404,
            contentType: 'text/html',
            body: '<!doctype html><title>Not Found</title>',
        }),
    );
});

/**
 * A one-second 440 Hz tone as 16-bit mono PCM in a WAV container.
 *
 * Generated per run and served by `page.route` rather than committed: the media
 * exists only to give the AV plugin something a browser will admit has a
 * duration, and a fixture set with no binaries in it is one nobody has to
 * regenerate.
 */
function toneWav(seconds = 1, sampleRate = 8000): Buffer {
    const sampleCount = seconds * sampleRate;
    const samples = Buffer.alloc(sampleCount * 2);
    for (let i = 0; i < sampleCount; i += 1) {
        const value = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000;
        samples.writeInt16LE(Math.round(value), i * 2);
    }

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + samples.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // byte rate
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample
    header.write('data', 36);
    header.writeUInt32LE(samples.length, 40);

    return Buffer.concat([header, samples]);
}

async function serveTone(page: Page): Promise<void> {
    const body = toneWav();
    await page.route(AUDIO_MEDIA, (route) =>
        route.fulfill({ contentType: 'audio/wav', body }),
    );
}

test('a content-state URL renders a canvas', async ({ page }) => {
    await page.goto(contentStateUrl(IMAGE_MANIFEST));

    await expect(page.locator(SURFACE)).toBeVisible();
    await expect(page.locator(UNSUPPORTED)).toHaveCount(0);
    await expect(page.locator(FALLBACK_INPUT)).toHaveCount(0);
});

test('with no parameters the fallback input renders', async ({ page }) => {
    await page.goto('/');

    const input = page.locator(FALLBACK_INPUT);
    await expect(input).toBeVisible();

    // The input is the whole UI budget, and it works: what it accepts is what
    // the `iiif-content` parameter accepts.
    await input.fill(IMAGE_MANIFEST);
    await page.locator('[data-testid="content-state-open"]').click();

    await expect(page.locator(SURFACE)).toBeVisible();
    await expect(input).toHaveCount(0);
});

test('a content state naming a manifest that 404s keeps the fallback input', async ({
    page,
}) => {
    await page.goto(contentStateUrl(MISSING_MANIFEST));

    // A failed manifest must not be a dead end: the input is the only way back.
    const input = page.locator(FALLBACK_INPUT);
    await expect(input).toBeVisible();

    await input.fill(IMAGE_MANIFEST);
    await page.locator('[data-testid="content-state-open"]').click();

    await expect(page.locator(SURFACE)).toBeVisible();
});

test('an audio content state produces a playable media element', async ({
    page,
}) => {
    await serveTone(page);
    await page.goto(contentStateUrl(AUDIO_MANIFEST));

    const media = page.locator(MEDIA);
    await expect(media).toBeAttached();
    expect(await media.evaluate((el) => el.tagName)).toBe('AUDIO');
    await expect(media).toHaveJSProperty('currentSrc', AUDIO_MEDIA);
    // `readyState >= HAVE_METADATA`: the browser has decoded the header and
    // knows the duration, which is what "playable" means before a play gesture.
    await expect
        .poll(() => media.evaluate((el: HTMLMediaElement) => el.readyState), {
            message: 'the media element loaded its metadata',
        })
        .toBeGreaterThanOrEqual(1);
});

test('the chrome speaks the language the browser asked for', async ({
    page,
}) => {
    // `en-US` is a language the viewer has no messages for by that exact tag;
    // reducing it to `en` is what keeps an English reader out of German.
    await page.goto(contentStateUrl(IMAGE_MANIFEST));

    await expect(page.locator(SURFACE)).toBeVisible();
    await expectEnglishChrome(page);
});

test.describe('a browser asking for German', () => {
    test.use({ locale: 'de-DE' });

    test('gets German chrome', async ({ page }) => {
        await page.goto(contentStateUrl(IMAGE_MANIFEST));

        await expect(page.locator(SURFACE)).toBeVisible();
        await expect(chromeButton(page, OPEN_MENU_DE).first()).toBeAttached();
        await expect(chromeButton(page, OPEN_MENU_EN)).toHaveCount(0);
    });
});

test('a config parameter has no effect on the rendered viewer', async ({
    page,
}) => {
    // A locale is the one configuration key whose effect this application can
    // observe without reaching into the viewer's internals: German chrome is
    // reachable and reads differently. The browser asked for English, so English
    // is what an unhonored `config` leaves behind.
    const config = encodeURIComponent(JSON.stringify({ locale: 'de' }));

    await page.goto(contentStateUrl(IMAGE_MANIFEST, `&config=${config}`));

    await expect(page.locator(SURFACE)).toBeVisible();
    await expectEnglishChrome(page);
});
