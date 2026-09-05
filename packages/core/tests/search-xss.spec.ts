import { test, expect } from '@playwright/test';

/**
 * A hostile `SearchProvider` cannot execute script in the host page.
 *
 * The excerpt fields are public API, and before this they reached four raw
 * `{@html}` sinks with nothing but a `&lt;mark&gt;` un-escaper in the way. The
 * claim that they are now plain text is only worth making if it is demonstrated
 * in a real browser, so this drives the built-from-source custom element with a
 * provider that returns a `<script>` and an `onerror` payload in `before`,
 * `match` and `after`, for both the `hit` and `resource` shapes.
 *
 * The fixture is `public/e2e/search-xss.html`.
 */
test.describe('search excerpts are text, not markup', () => {
    test('a hostile search provider executes nothing and loses no text', async ({
        page,
    }) => {
        await page.goto('/e2e/search-xss.html', {
            waitUntil: 'domcontentloaded',
        });

        await page.waitForFunction(
            () => (window as any).__providerReady === true,
            undefined,
            { timeout: 20000 },
        );

        // The provider flag says the fixture ran, not that the element upgraded
        // and published its state — wait for that before dereferencing it.
        await page.waitForFunction(
            () => (document.getElementById('v') as any)?.viewerState,
            undefined,
            { timeout: 20000 },
        );

        // Open the panel and run the real search path through the provider.
        await page.evaluate(async () => {
            const el = document.getElementById('v') as any;
            el.viewerState.showSearchPanel = true;
            await el.viewerState.search('legit');
        });

        const excerpts = page
            .locator('triiiceratops-viewer [data-panel-id="search"] .excerpts')
            .first();
        await expect(excerpts).toBeVisible({ timeout: 20000 });

        // Nothing the payloads would have done, happened.
        expect(await page.evaluate(() => (window as any).__xssFired)).toEqual(
            [],
        );

        const rendered = await excerpts.evaluate((node) => ({
            text: node.textContent ?? '',
            scripts: node.querySelectorAll('script').length,
            images: node.querySelectorAll('img').length,
            marks: Array.from(node.querySelectorAll('mark')).map(
                (mark) => mark.textContent,
            ),
        }));

        // The payload is characters on screen, not elements.
        expect(rendered.scripts).toBe(0);
        expect(rendered.images).toBe(0);
        expect(rendered.text).toContain('<script>');
        expect(rendered.text).toContain('onerror=');

        // …and the legitimate excerpt around it still rendered, in both shapes.
        expect(rendered.text).toContain('legit-before');
        expect(rendered.text).toContain('legit-match');
        expect(rendered.text).toContain('legit-after');
        expect(rendered.text).toContain('legit-resource');

        // Highlighting survives the fix.
        expect(rendered.marks).toEqual(['legit-match']);
    });
});
