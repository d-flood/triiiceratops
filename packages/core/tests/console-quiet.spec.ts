import { test, expect, type ConsoleMessage } from '@playwright/test';

// Ticket 18 — quiet production + opt-in debug.
//
// A default-config viewer must mount and operate without emitting any
// triiiceratops console output (user story 12). Enabling `debug` opts into the
// core logger, whose records are prefixed `[triiiceratops]`.

const MANIFEST = '/demo-manifests/e2e/manifest.json';
const VIEWER_PREFIX = '[triiiceratops]';

function collectViewerMessages(
    page: import('@playwright/test').Page,
): string[] {
    const messages: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
        const text = msg.text();
        // Only attribute core-viewer output; plugin/demo output is out of scope.
        if (text.includes(VIEWER_PREFIX)) messages.push(text);
    });
    return messages;
}

async function runJourney(page: import('@playwright/test').Page) {
    await expect(page.locator('#triiiceratops-viewer')).toBeVisible();
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 20000 });
    await expect(
        page.locator(
            '#triiiceratops-viewer [data-testid="canvas-renderer-root"]',
        ),
    ).toBeVisible({ timeout: 10000 });

    // Exercise a state change (drives dispatch + derived recomputation).
    const annotationsButton = page
        .locator('#triiiceratops-viewer button[aria-label*="annotations" i]')
        .first();
    if (await annotationsButton.isVisible()) {
        await annotationsButton.click({ force: true });
        await page.waitForTimeout(200);
        await annotationsButton.click({ force: true });
    }
    await page.waitForTimeout(200);
}

test.describe('quiet production console (ticket 18)', () => {
    test('default-config viewer produces no triiiceratops console output', async ({
        page,
    }) => {
        const messages = collectViewerMessages(page);

        await page.goto(`/?manifest=${MANIFEST}`, {
            waitUntil: 'domcontentloaded',
        });
        await runJourney(page);

        expect(messages, messages.join('\n')).toEqual([]);
    });

    test('debug:true opts into logging', async ({ page }) => {
        const messages = collectViewerMessages(page);

        const config = encodeURIComponent(JSON.stringify({ debug: true }));
        await page.goto(`/?manifest=${MANIFEST}&config=${config}`, {
            waitUntil: 'domcontentloaded',
        });
        await runJourney(page);

        expect(messages.length).toBeGreaterThan(0);
    });
});
