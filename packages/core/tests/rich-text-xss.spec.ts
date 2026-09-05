import { test, expect } from '@playwright/test';

/**
 * A hostile manifest cannot execute script in the host page.
 *
 * IIIF rich text — summary, metadata, required statement, canvas summary and
 * metadata, annotation bodies — is publisher-supplied and reaches the viewer
 * through one seam, `renderIiifRichText`. That seam builds a `DocumentFragment`
 * of fresh nodes from IIIF's allowlist and the component inserts it with
 * `replaceChildren`, so no untrusted string is ever assigned to an HTML sink.
 *
 * The claim is only worth making if it is demonstrated in a real browser, so
 * this drives the built-from-source custom element against a manifest whose
 * every rich-text field carries a `<script>`, an `img` `onerror`, a
 * `javascript:` href and a `data:` src.
 *
 * The fixture is `public/e2e/rich-text-xss.html`.
 */
test.describe('IIIF rich text is rebuilt, not filtered', () => {
    test('a hostile manifest executes nothing and loses no legitimate content', async ({
        page,
    }) => {
        await page.goto('/e2e/rich-text-xss.html', {
            waitUntil: 'domcontentloaded',
        });

        await page.waitForFunction(
            () => (document.getElementById('v') as any)?.viewerState,
            undefined,
            { timeout: 20000 },
        );

        // Open every panel that renders rich text.
        await page.evaluate(() => {
            const state = (document.getElementById('v') as any).viewerState;
            state.showMetadataPanel = true;
            state.showAnnotations = true;
        });

        const metadata = page
            .locator('triiiceratops-viewer [data-panel-id="metadata"]')
            .first();
        await expect(metadata).toBeVisible({ timeout: 20000 });

        const annotations = page
            .locator('triiiceratops-viewer [data-panel-id="annotations"]')
            .first();
        await expect(annotations).toBeVisible({ timeout: 20000 });

        // Give an `img` `onerror` every chance to fire before asserting it did
        // not: the payload images resolve (and fail) asynchronously.
        await page.waitForTimeout(1000);

        // Nothing any payload would have done, happened.
        expect(await page.evaluate(() => (window as any).__xssFired)).toEqual(
            [],
        );

        /*
         * `.viewer-html` is where rich text lands, so the style/handler counts
         * are scoped to it — the panel chrome around it legitimately carries
         * inline style, and counting that would make the assertion about the
         * viewer's own markup rather than the manifest's.
         */
        const audit = async (region: typeof metadata) =>
            region.evaluate((node) => {
                const richText = Array.from(
                    node.querySelectorAll('.viewer-html'),
                );
                const within = (selector: string) =>
                    richText.reduce(
                        (total, container) =>
                            total + container.querySelectorAll(selector).length,
                        0,
                    );

                return {
                    text: node.textContent ?? '',
                    richTextContainers: richText.length,
                    scripts: node.querySelectorAll('script').length,
                    styled: within('[style]'),
                    handlers: within('[onerror],[onclick],[onload]'),
                    hrefs: Array.from(node.querySelectorAll('a')).map(
                        (anchor) => anchor.getAttribute('href'),
                    ),
                };
            });

        const metadataAudit = await audit(metadata);

        // No sink was fed: no script element, no inline style, no handler.
        expect(metadataAudit.richTextContainers).toBeGreaterThan(0);
        expect(metadataAudit.scripts).toBe(0);
        expect(metadataAudit.styled).toBe(0);
        expect(metadataAudit.handlers).toBe(0);

        // No anchor kept a `javascript:` URL, in any panel.
        for (const href of metadataAudit.hrefs) {
            expect(href ?? '').not.toContain('javascript:');
        }

        // …and the legitimate content beside each payload still rendered.
        expect(metadataAudit.text).toContain('legit-summary');
        expect(metadataAudit.text).toContain('legit-required');
        expect(metadataAudit.text).toContain('legit-manifest-metadata');
        expect(metadataAudit.hrefs).toContain('https://example.org/ok');

        /*
         * …and the payloads left no readable trace either. Dropping a `<script>`
         * or `<style>` while keeping its text would put attacker-chosen strings
         * into panel chrome the reader trusts as the publisher's — spoofing
         * rather than script execution, but a real surface, and the reason
         * these tags are dropped with their contents.
         */
        expect(metadataAudit.text).not.toContain('__xssFired');
        expect(metadataAudit.text).not.toContain('display:none');

        // The allowlisted formatting survived, so the narrower list did not
        // flatten legitimate markup.
        expect(
            await metadata
                .locator('.viewer-html b', { hasText: 'bold' })
                .count(),
        ).toBeGreaterThan(0);

        const annotationsAudit = await audit(annotations);

        expect(annotationsAudit.richTextContainers).toBeGreaterThan(0);
        expect(annotationsAudit.scripts).toBe(0);
        expect(annotationsAudit.styled).toBe(0);
        expect(annotationsAudit.handlers).toBe(0);
        expect(annotationsAudit.text).toContain('legit-annotation');
        expect(annotationsAudit.text).not.toContain('__xssFired');

        // The `linking` body's `javascript:` URL is bound into an href by hand.
        // It gets the same scheme check, and the text stays visible. Its marker
        // is deliberately not `__xssFired`: this one string is *meant* to be
        // read, so it must not collide with the absence assertions above.
        for (const href of annotationsAudit.hrefs) {
            expect(href ?? '').not.toContain('javascript:');
        }
        expect(annotationsAudit.text).toContain(
            'javascript:window.__xssLinking',
        );
        // The refused body renders as plain text, not as an `<a>` with no
        // `href` — which would look and hover like a link while being neither
        // focusable nor activatable.
        expect(annotationsAudit.hrefs).not.toContain(null);

        // Canvas summary and canvas metadata render in the info popover, which
        // is the third rich-text surface.
        await page.evaluate(() => {
            const state = (document.getElementById('v') as any).viewerState;
            state.showMetadataPanel = false;
            state.showAnnotations = false;
            state.showCanvasInfo = true;
        });

        const popover = page
            .locator('triiiceratops-viewer .popover[role="dialog"]')
            .first();
        await expect(popover).toBeVisible({ timeout: 20000 });
        await page.waitForTimeout(500);

        const popoverAudit = await audit(popover);

        expect(popoverAudit.richTextContainers).toBeGreaterThan(0);
        expect(popoverAudit.scripts).toBe(0);
        expect(popoverAudit.styled).toBe(0);
        expect(popoverAudit.handlers).toBe(0);
        expect(popoverAudit.text).toContain('legit-canvas-summary');
        expect(popoverAudit.text).toContain('legit-canvas-metadata');
        expect(popoverAudit.text).not.toContain('__xssFired');
        for (const href of popoverAudit.hrefs) {
            expect(href ?? '').not.toContain('javascript:');
        }

        expect(await page.evaluate(() => (window as any).__xssFired)).toEqual(
            [],
        );
    });
});
