import { expect, test } from '@playwright/test';

for (const name of ['Whichever format will play', 'Sound, with its waveform']) {
    test(`lane vs bar: ${name}`, async ({ page }) => {
        await page.setViewportSize({ width: 1500, height: 950 });
        await page.goto('/handles/');
        await expect(
            page.locator('.featstage .vw .viewer-root'),
        ).toBeAttached();
        await page.locator('.featstage__opt', { hasText: name }).click();
        await page.waitForTimeout(8000);
        const lane = page
            .locator('.featstage .vw [data-testid="av-timeline-lane"]')
            .first();
        const bar = page.locator('.featstage .vw [data-testid="control-bar"]');
        const [lb, bb] = await Promise.all([
            lane.boundingBox(),
            bar.boundingBox(),
        ]);
        console.log(
            `${name}: lane=${JSON.stringify(lb)} bar=${JSON.stringify(bb)}`,
        );
        if (lb && bb) {
            console.log(
                `  lane bottom ${lb.y + lb.height}, bar top ${bb.y} -> overlap ${lb.y + lb.height - bb.y}px`,
            );
        }
        await page.locator('.featstage__viewer').screenshot({
            path: `/tmp/claude-1000/-home-dflood-repos-triiiceratops/8d66a198-18dd-4a09-8657-6aea7a6ce1d9/scratchpad/lane-${name.slice(0, 8).replace(/\W/g, '')}.png`,
        });
    });
}
