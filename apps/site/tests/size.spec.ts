/**
 * The comparison page, in a browser: that what a reader sees is what the
 * committed data says.
 *
 * `tests/unit/comparison.test.ts` asserts the derivation; this asserts the
 * markup carries it — a bar whose length is the figure beside it, a scatter
 * point at the coordinate computed for it, a table row per measured viewer. The
 * page states no figure this spec does not trace back to a data source, so
 * editing the comparison package or the recipe catalog and rebuilding is enough
 * to move the page, and nothing here can pass against a stale transcription.
 */

import { expect, test } from '@playwright/test';

import {
    AV_ROWS,
    CAPABILITY_ROWS,
    HEADROOM,
    LAZY_CHUNKS,
    MATRIX_URL,
    MEASURED_ON,
    RECIPES,
    SCATTER,
    SIZE_BARS,
    SIZE_ROWS,
    grouped,
    kilobytes,
} from '../src/lib/comparison';

const PATH = '/size/';

test.beforeEach(async ({ page }) => {
    await page.goto(PATH);
});

test.describe('the size bars', () => {
    test('draws one bar per measured viewer, at its share of the largest', async ({
        page,
    }) => {
        const rows = page.locator('.chart .chart__row');
        await expect(rows).toHaveCount(SIZE_BARS.length);

        for (const [index, bar] of SIZE_BARS.entries()) {
            const row = rows.nth(index);
            await expect(row.locator('.chart__label')).toHaveText(bar.name);
            await expect(row.locator('.chart__value')).toHaveText(
                `${kilobytes(bar.gzip)} KB`,
            );
            const width = await row
                .locator('.chart__fill')
                .evaluate((node) => (node as HTMLElement).style.width);
            expect(width, bar.id).toBe(`${bar.widthPercent}%`);
        }
    });

    test('marks our own bars and no others', async ({ page }) => {
        const emphasised = page.locator('.chart .chart__fill.self');
        await expect(emphasised).toHaveCount(
            SIZE_BARS.filter((bar) => bar.isSelf).length,
        );
    });

    test('states the headroom the paired size gate protects', async ({
        page,
    }) => {
        await expect(
            page.locator('.band', { has: page.locator('.chart') }),
        ).toContainText(`${grouped(HEADROOM.bytes)} gzip bytes`);
    });
});

test.describe('the scatter', () => {
    test('places every point at the coordinate computed for it', async ({
        page,
    }) => {
        const points = page.locator('.scatter circle');
        await expect(points).toHaveCount(SCATTER.points.length);

        for (const [index, point] of SCATTER.points.entries()) {
            const circle = points.nth(index);
            await expect(circle, point.id).toHaveAttribute(
                'cx',
                String(point.x),
            );
            await expect(circle, point.id).toHaveAttribute(
                'cy',
                String(point.y),
            );
        }
    });

    test('labels every point with the viewer it is', async ({ page }) => {
        const labels = page.locator('.scatter .scatter__label');
        await expect(labels).toHaveText(
            SCATTER.points.map((point) => point.name),
        );
    });

    test('defines what the capability axis counts, and links the detail', async ({
        page,
    }) => {
        const definition = page.locator('.band', {
            has: page.locator('.scatter'),
        });
        await expect(definition).toContainText(
            `${RECIPES.total}\ndistinct recipes, ${RECIPES.audiovisual} of them audiovisual`.replace(
                '\n',
                ' ',
            ),
        );
        await expect(
            definition.getByRole('link', { name: 'official support matrix' }),
        ).toHaveAttribute('href', MATRIX_URL);
    });

    test('tabulates the same points beneath it', async ({ page }) => {
        const rows = page.locator('table', { hasText: 'Bytes per recipe' }).locator('tbody tr');
        await expect(rows).toHaveCount(CAPABILITY_ROWS.length);
        for (const [index, row] of CAPABILITY_ROWS.entries()) {
            await expect(rows.nth(index)).toContainText(
                grouped(row.bytesPerRecipe),
            );
        }
    });
});

test.describe('the data table', () => {
    test('carries every viewer, its version and all three compression levels', async ({
        page,
    }) => {
        const rows = page.locator('table', { hasText: 'vs. core' }).locator('tbody tr');
        await expect(rows).toHaveCount(SIZE_ROWS.length);

        for (const [index, expected] of SIZE_ROWS.entries()) {
            const cells = await rows.nth(index).locator('th, td').allInnerTexts();
            expect(cells.slice(0, 5), expected.id).toEqual([
                expected.name,
                expected.version,
                grouped(expected.raw),
                grouped(expected.gzip),
                grouped(expected.brotli),
            ]);
        }
    });
});

test.describe('the method statement', () => {
    test('names the measurement date and the compression settings', async ({
        page,
    }) => {
        const method = page.locator('.band', {
            has: page.getByRole('heading', { name: 'Method' }),
        });
        await expect(method).toContainText(`Measured ${MEASURED_ON}`);
        await expect(method).toContainText('gzip level 9');
        await expect(method).toContainText('dated snapshot');
    });
});

test.describe('the checking material', () => {
    test('is present, collapsed, and adds no heading to the page above it', async ({
        page,
    }) => {
        const detail = page.locator('details.disclose');
        await expect(detail).toHaveCount(1);
        await expect(detail).not.toHaveAttribute('open', /.*/);
        await expect(detail.locator('table').first()).toBeHidden();

        // The rail is route-based, but the argument above the fold is not: the
        // checking material contributes no section heading to it.
        const headings = await page.getByRole('heading', { level: 2 }).allInnerTexts();
        expect(headings).toEqual([
            'Capability against size',
            'Size',
            'Every figure',
            'Method',
        ]);
    });

    test('opens onto both sessions per viewer and our deferred chunks', async ({
        page,
    }) => {
        const detail = page.locator('details.disclose');
        await detail.locator('summary').click();

        const avRows = detail
            .locator('table', { hasText: 'What the two are made of' })
            .locator('tbody tr');
        await expect(avRows).toHaveCount(AV_ROWS.length);
        for (const [index, row] of AV_ROWS.entries()) {
            await expect(avRows.nth(index), row.id).toContainText(
                grouped(row.audiovisual),
            );
        }

        for (const chunk of LAZY_CHUNKS) {
            await expect(detail).toContainText(chunk.name);
            await expect(detail).toContainText(grouped(chunk.gzip));
        }
    });
});
