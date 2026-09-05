/**
 * The type, in a browser: what only a browser can see.
 *
 * Two facts, and configuration proves neither. That no page reaches a third
 * party for a face is a statement about the requests a real page makes, so it is
 * asserted by watching them — a stylesheet that still names a font host, or a
 * preload that 404s into a system fallback, both read as correct in source. And
 * that the faces actually arrive is read off `document.fonts`, which is the
 * browser's own account of which families it loaded rather than which ones the
 * cascade asked for.
 *
 * Which files exist and which surfaces name them is `tests/unit/type.test.ts`.
 */

import { expect, test, type Page } from '@playwright/test';

import { ROUTES } from '../src/lib/routes';

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const FACES = [
    'SourceSerif4Variable-Roman.woff2',
    'SourceSerif4Variable-Italic.woff2',
    'SourceCodeVariable-Roman.woff2',
];

/** A file name that is one of the full faces rather than a slice of one. */
function isFullFace(url: string): boolean {
    return FACES.some((face) => url.endsWith(`/${face}`));
}

/** Every request URL the page issued, in order. */
function recordRequests(page: Page): string[] {
    const seen: string[] = [];
    page.on('request', (request) => seen.push(request.url()));
    return seen;
}

test.describe('no third-party font request', () => {
    for (const route of ROUTES) {
        test(`on ${route.path}`, async ({ page }) => {
            const requests = recordRequests(page);
            await page.goto(route.path);
            // The faces are requested by the head's preloads, so waiting for
            // the network to settle is what makes an empty list meaningful.
            await page.waitForLoadState('networkidle');

            const offsite = requests.filter((url) =>
                FONT_HOSTS.some((host) => url.includes(host)),
            );
            expect(offsite).toEqual([]);
        });
    }
});

test.describe('the unicode-range split', () => {
    /**
     * The split's two halves, and neither is worth anything without the other.
     *
     * A page of western text must fetch slices only: the full roman is 419 KB
     * against the slice's 192 KB, and one glyph outside the slice's range
     * fetches the whole thing to paint it. That already happened once — the
     * rail's rightwards arrow, U+2192, which Google's own `latin` range omits
     * while carrying U+2191 and U+2193 either side of it. It cost the front
     * page four points and read as entirely correct in the stylesheet.
     *
     * And a page that needs a glyph the slices do not carry must still get it,
     * because that is what makes this a split rather than a subsetting. No
     * coverage may be lost for anyone; it is only deferred for everyone else.
     */
    for (const route of ROUTES) {
        test(`${route.path} fetches slices only`, async ({ page }) => {
            const requests = recordRequests(page);
            await page.goto(route.path);
            /*
             * `/handles/` is the one route whose content is other people's
             * material, and a collection that needs this viewer is exactly the
             * one whose labels are in Ge'ez, Japanese or Arabic — so an embed
             * that has loaded reaches past the slices to the full face,
             * correctly, and that is the deferral working rather than a defect.
             * What must stay true there is that the page itself costs slices
             * only, so it is measured at load rather than at network idle: the
             * embeds start only once the page has loaded, so everything
             * recorded by then is what a reader pays for before scrolling to
             * one. That also holds the deferral itself — an embed that started
             * during load would show up here as a full face.
             */
            if (route.path !== '/handles/')
                await page.waitForLoadState('networkidle');

            expect(
                requests.filter(isFullFace),
                'a full face was fetched, so this route paints a glyph outside the slices',
            ).toEqual([]);
            // Vacuously true if no face is fetched at all, which would mean the
            // page lost its type rather than passing this.
            expect(
                requests.filter((url) => url.includes('-Latin.woff2')),
            ).not.toEqual([]);
        });
    }

    test('a glyph outside the slices still renders, from the full face', async ({
        page,
    }) => {
        const requests = recordRequests(page);
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        expect(requests.filter(isFullFace)).toEqual([]);

        /*
         * Greek, Cyrillic, Hebrew and CJK, put on the page the way a pasted
         * manifest's label would put them there. Every one is outside both
         * slices, so the family has to reach past them to the full face.
         */
        await page.evaluate(() => {
            const probe = document.createElement('p');
            probe.id = 'probe';
            probe.textContent = 'Ἰλιάς Толстой מגילה 源氏物語';
            document.body.append(probe);
        });

        const loaded = await page.evaluate(() =>
            document.fonts
                .load(
                    '400 1rem "Source Serif 4"',
                    'Ἰλιάς Толстой מגילה 源氏物語',
                )
                .then((faces) => faces.length),
        );
        expect(
            loaded,
            'the family answers for these codepoints',
        ).toBeGreaterThan(0);

        await page.waitForLoadState('networkidle');
        expect(
            requests.filter(isFullFace),
            'the full face is fetched on demand for a glyph the slices lack',
        ).not.toEqual([]);
    });
});

test.describe('the faces themselves', () => {
    test('are served from this origin, and all three arrive', async ({
        page,
    }) => {
        const failed: string[] = [];
        page.on('response', (response) => {
            if (
                /\.woff2$/.test(new URL(response.url()).pathname) &&
                // A 304 is a face that arrived: the browser revalidated a copy
                // it already had and reused it. The development server sends
                // `no-cache`, so a second consumer of a face on one page — the
                // embedded viewer inheriting the site's own — revalidates
                // rather than refetching. What this is watching for is a face
                // that is not there at all.
                !response.ok() &&
                response.status() !== 304
            ) {
                failed.push(`${response.status()} ${response.url()}`);
            }
        });
        const requests = recordRequests(page);
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        /*
         * The browser's own account of what it can load, not what the cascade
         * asked for. Each face is loaded by the shorthand a rule would match;
         * an empty result means the family resolved to nothing.
         *
         * The count is per family-and-style rather than per file, and it is no
         * longer 1: each of the three faces is now declared three times, as the
         * full file and its two `unicode-range` slices, and `document.fonts`
         * reports every declaration that can serve the request. What matters is
         * that each of the three answers at all.
         *
         * This runs before the request assertions below because only the
         * roman's `latin` slice is preloaded — the rest are fetched when
         * something first needs them, and on this route that something is this
         * call.
         */
        const loaded = await page.evaluate(() =>
            Promise.all(
                [
                    '400 1rem "Source Serif 4"',
                    'italic 400 1rem "Source Serif 4"',
                    '400 1rem "Source Code Pro"',
                ].map(async (spec) => [
                    spec,
                    (await document.fonts.load(spec)).length > 0,
                ]),
            ),
        );
        expect(loaded).toEqual([
            ['400 1rem "Source Serif 4"', true],
            ['italic 400 1rem "Source Serif 4"', true],
            ['400 1rem "Source Code Pro"', true],
        ]);

        const origin = new URL(page.url()).origin;
        const woff2 = requests.filter((url) =>
            new URL(url).pathname.endsWith('.woff2'),
        );
        expect(woff2, 'some face was fetched').not.toEqual([]);
        for (const url of woff2) {
            expect(new URL(url).origin, `${url} is same-origin`).toBe(origin);
        }
        expect(failed).toEqual([]);
    });

    test('set the prose, and the mono token is reserved for code', async ({
        page,
    }) => {
        await page.goto('/');
        const type = await page.evaluate(() => {
            const styles = getComputedStyle(document.body);
            return {
                body: styles.fontFamily,
                mono: styles.getPropertyValue('--mono').trim(),
            };
        });
        // The declared family first, a system serif behind it: the fallback has
        // to be a serif, because a sans one is a visibly different page.
        expect(type.body).toMatch(/^["']Source Serif 4["'],/);
        expect(type.body).toContain('serif');
        expect(type.mono).toMatch(/^["']Source Code Pro["'],/);
        expect(type.mono).toContain('monospace');
    });
});
