import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end annotation authoring flow against the demo app (F28, ticket 18 §2).
 *
 * Exercises the persistence-critical path through the real plugin, viewer,
 * Annotorious, and the default `LocalStorageAdapter`: enter create mode, pick the
 * point tool, click to author a true `PointSelector`, edit its body, and verify
 * the round-trip to storage — including that a body save no longer deletes the
 * just-saved annotation (the regression this suite caught, fixed in
 * `AnnotationManager`) — then delete it and confirm it stays gone.
 *
 * The point tool is used because a single canvas click deterministically drives
 * the real `canvas-click` → `handlePointClick` path (no drag-based Annotorious
 * interaction to race on). Persistence is asserted directly against
 * `localStorage`, the store the default adapter writes to, so assertions don't
 * depend on overlay paint timing or the annotation-visibility toggle. Rectangle/
 * polygon authoring and the framework-agnostic custom body editor are covered by
 * the unit/component suites (`AnnotationManager.test.ts`,
 * `DefaultBodyEditor.svelte.test.ts`, `AnnotationEditor.lifecycle.test.ts`).
 */

const MANIFEST = '/demo-manifests/e2e/manifest.json';
const STORAGE_PREFIX = 'triiiceratops:annotations:';

// Read every stored annotation across all canvas keys the adapter wrote.
async function storedAnnotations(page: Page): Promise<any[]> {
    return page.evaluate((prefix) => {
        const all: any[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(prefix)) continue;
            try {
                const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
                if (Array.isArray(parsed)) all.push(...parsed);
            } catch {
                /* ignore malformed entries */
            }
        }
        return all;
    }, STORAGE_PREFIX);
}

async function openViewer(page: Page) {
    await page.goto(`/?manifest=${MANIFEST}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#triiiceratops-viewer')).toBeVisible();
    await expect(page.locator('.loading')).not.toBeVisible({ timeout: 20000 });
    await expect(
        page.locator('#triiiceratops-viewer .osd-background'),
    ).toBeVisible({ timeout: 10000 });
    await expect(
        page.locator('#triiiceratops-viewer canvas').first(),
    ).toBeVisible();
}

async function openAnnotationPanel(page: Page) {
    const toggle = page.locator(
        '#triiiceratops-viewer button[aria-label="Annotation Editor"]',
    );
    await expect(toggle).toBeVisible();
    await toggle.click({ force: true });
    await expect(
        page.locator('[data-panel-id="annotation-editor"]'),
    ).toBeVisible();
}

// Author a point annotation on the canvas via create-mode + point tool. The
// created point is auto-selected for body editing.
async function createPointAnnotation(page: Page) {
    const panel = page.locator('[data-panel-id="annotation-editor"]');
    await panel.getByRole('button', { name: 'Create', exact: true }).click();
    await panel.locator('button[aria-label="Point"]').click();

    // Click the canvas toward the right (clear of the left-docked panel) so the
    // point lands on the image.
    const canvas = page.locator('#triiiceratops-viewer canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.5);
}

test.describe('Annotation Editor authoring flow', () => {
    test.beforeEach(async ({ page }) => {
        await openViewer(page);
        // Start from a clean store so runs are idempotent.
        await page.evaluate(() => localStorage.clear());
    });

    test('authors a PointSelector with a body that persists across reload', async ({
        page,
    }) => {
        await openAnnotationPanel(page);
        await createPointAnnotation(page);

        // The created point is auto-opened for body editing. Add a text body.
        const panel = page.locator('[data-panel-id="annotation-editor"]');
        await panel.getByRole('button', { name: 'Add Content' }).click();
        const textarea = panel.locator('textarea.body-textarea').first();
        await expect(textarea).toBeVisible();
        await textarea.fill('an e2e note');
        await panel.getByRole('button', { name: 'Save' }).click();

        // Persisted as a true PointSelector carrying the body — and the body
        // save must NOT delete the annotation (the collision regression).
        await expect
            .poll(async () => (await storedAnnotations(page)).length)
            .toBe(1);
        const [persisted] = await storedAnnotations(page);
        expect(persisted.target.selector.type).toBe('PointSelector');
        expect(typeof persisted.target.selector.x).toBe('number');
        expect(typeof persisted.target.selector.y).toBe('number');
        expect(JSON.stringify(persisted.body)).toContain('an e2e note');

        // --- reload: the annotation (and its body) survives ---
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('.loading')).not.toBeVisible({
            timeout: 20000,
        });
        await expect
            .poll(async () => (await storedAnnotations(page)).length)
            .toBe(1);
        const [reloaded] = await storedAnnotations(page);
        expect(reloaded.target.selector.type).toBe('PointSelector');
        expect(JSON.stringify(reloaded.body)).toContain('an e2e note');
    });

    test('deletes an annotation and it stays gone after reload', async ({
        page,
    }) => {
        await openAnnotationPanel(page);
        await createPointAnnotation(page);

        // The point is created + selected; its delete control is in the panel.
        const panel = page.locator('[data-panel-id="annotation-editor"]');
        await expect
            .poll(async () => (await storedAnnotations(page)).length)
            .toBe(1);

        await panel
            .getByRole('button', { name: 'Delete annotation' })
            .click();
        // Confirm in the dialog.
        await page.getByRole('button', { name: 'Delete', exact: true }).click();

        await expect
            .poll(async () => (await storedAnnotations(page)).length)
            .toBe(0);

        // Gone after a reload too (the deletion persisted).
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('.loading')).not.toBeVisible({
            timeout: 20000,
        });
        expect(await storedAnnotations(page)).toHaveLength(0);
    });
});
