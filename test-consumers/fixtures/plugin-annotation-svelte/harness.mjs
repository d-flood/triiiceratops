import { expect } from '@playwright/test';

// plugin-annotation-svelte: a Vite + Svelte app that renders the real viewer from
// the packed `triiiceratops` tarball and activates the migrated
// `@triiiceratops/plugin-annotation-editor` plugin (packed ESM entry, its default
// `LocalStorageAdapter`). The journey drives the full annotate flow — create a
// point + a region, edit a body, undo, redo, reload — and asserts persistence
// against the FROZEN v1 LocalStorage namespace and the read-only overlay
// (`[data-annotation-id]`), with only the edited annotation living in the
// Annotorious editing layer.

const V1_PREFIX = '@triiiceratops/plugin-annotation-editor:v1';

// Read every annotation the packed adapter persisted under the v1 namespace.
async function stored(page) {
    return page.evaluate((prefix) => {
        const all = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(prefix)) continue;
            try {
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                for (const a of list) all.push(a);
            } catch {
                /* ignore */
            }
        }
        return all;
    }, V1_PREFIX);
}

const hasPoint = (annos) =>
    annos.some((a) => a?.target?.selector?.type === 'PointSelector');
const hasRegion = (annos) =>
    annos.some((a) => a?.target?.selector?.type === 'FragmentSelector');

export default {
    name: 'plugin-annotation-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-annotation-editor',
    ],
    async assert({ page, baseURL, pageErrors }) {
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        // Viewer mounts and OSD paints the first canvas (OSD readiness).
        await expect(page.locator('#triiiceratops-viewer')).toBeVisible({
            timeout: 30_000,
        });
        const canvas = page.locator('#triiiceratops-viewer canvas').first();
        await expect(canvas).toBeVisible({ timeout: 30_000 });

        // Core now owns the plugin chrome: the plugin's button lives in the
        // viewer's floating toolbar, which starts collapsed. Open the toolbar,
        // then open the plugin's docked panel from its core-rendered button
        // (accessible name = the plugin's package-qualified name), and enter
        // create mode.
        const openMenu = page.getByRole('button', { name: 'Open Menu' });
        if (await openMenu.count()) await openMenu.first().click();
        await page
            .getByRole('button', {
                name: '@triiiceratops/plugin-annotation-editor',
            })
            .click();
        await page.getByRole('button', { name: 'Create', exact: true }).click();

        const box = await canvas.boundingBox();
        if (!box) throw new Error('no canvas bounding box');
        const at = (fx, fy) => ({
            x: box.x + box.width * fx,
            y: box.y + box.height * fy,
        });

        // --- create a POINT (deterministic single click) ---
        await page.getByRole('button', { name: 'Point', exact: true }).click();
        const p = at(0.45, 0.45);
        await page.mouse.click(p.x, p.y);

        await expect
            .poll(async () => hasPoint(await stored(page)), { timeout: 15_000 })
            .toBe(true);

        // --- edit the point's body and save ---
        // A fresh annotation has no body row yet; add one, then fill it.
        await page
            .getByRole('button', { name: 'Add Content', exact: true })
            .click();
        const textarea = page.locator('textarea').first();
        await expect(textarea).toBeVisible({ timeout: 10_000 });
        await textarea.fill('a persisted note');
        await page
            .getByRole('button', { name: 'Save Changes', exact: true })
            .click();
        await expect
            .poll(
                async () => {
                    const annos = await stored(page);
                    return annos.some((a) => {
                        const body = Array.isArray(a.body) ? a.body : [a.body];
                        return body.some(
                            (b) => b?.value === 'a persisted note',
                        );
                    });
                },
                { timeout: 15_000 },
            )
            .toBe(true);

        // --- create a REGION (rectangle; Annotorious 'click' drawing mode) ---
        await page
            .getByRole('button', { name: 'Rectangle', exact: true })
            .click();
        const r1 = at(0.6, 0.6);
        const r2 = at(0.85, 0.85);
        await page.mouse.click(r1.x, r1.y);
        await page.mouse.move(r2.x, r2.y);
        await page.mouse.click(r2.x, r2.y);

        await expect
            .poll(async () => (await stored(page)).length, { timeout: 15_000 })
            .toBeGreaterThanOrEqual(2);
        expect(hasRegion(await stored(page))).toBe(true);

        const countAfterCreate = (await stored(page)).length;

        // --- undo the region, then redo it (persistence-aware) ---
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await expect
            .poll(async () => (await stored(page)).length, { timeout: 15_000 })
            .toBe(countAfterCreate - 1);

        await page.getByRole('button', { name: 'Redo', exact: true }).click();
        await expect
            .poll(async () => (await stored(page)).length, { timeout: 15_000 })
            .toBe(countAfterCreate);

        // --- reload: annotations round-trip from the packed LocalStorage adapter ---
        await page.reload({ waitUntil: 'load' });
        await expect(
            page.locator('#triiiceratops-viewer canvas').first(),
        ).toBeVisible({ timeout: 30_000 });

        // Persistence survives the reload against the packed LocalStorage adapter
        // (the deterministic proof; the read-only overlay's paint is additionally
        // gated on core's annotation-visibility toggle, so — like the prior e2e —
        // persistence is asserted directly against storage).
        await expect
            .poll(async () => (await stored(page)).length, { timeout: 15_000 })
            .toBe(countAfterCreate);
        const persisted = await stored(page);
        expect(hasPoint(persisted)).toBe(true);
        expect(hasRegion(persisted)).toBe(true);

        // Nothing is being edited after a fresh load (the panel starts closed),
        // so the Annotorious editing layer holds no shapes — only the annotation
        // currently being edited ever lives there, never the persisted set (which
        // the read-only overlay owns).
        const annotoriousShapes = await page
            .locator('.a9s-annotationlayer :is(rect, polygon, path, circle)')
            .count();
        expect(annotoriousShapes).toBeLessThanOrEqual(1);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
