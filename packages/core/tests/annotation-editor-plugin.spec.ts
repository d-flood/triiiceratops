/**
 * The annotation editor, in a real browser: it **activates against a current
 * viewer**, and the drawing layer it owns is a container in the stage.
 *
 * These claims can only be made here. Activation is what broke when the
 * renderer became first-party, and it fails silently in the UI by design
 * (ADR 0010) — nothing in the plugin's own unit suite mounts it against a real
 * viewer, so nothing there would notice the plugin going inert again.
 *
 * What is pinned here is that seam, not the drawing itself. The tools'
 * interaction specs are `annotation-editor-drawing.spec.ts`, on a fixture that
 * loads core from SOURCE because its claims are geometric — which is why the
 * fixture and the dist route are helpers rather than inline setup.
 *
 * Both artifacts are the BUILT ones a consumer loads — `pnpm build:all` (or
 * `build:element` plus the plugin's own `pnpm build`) must have run.
 */

import { existsSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
    PLUGIN_IIFE,
    serveAnnotationEditorDist,
} from './helpers/annotationEditorDist';

test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Canvas2D renderer slice is Chromium-only (see canvas-renderer.spec.ts).',
);

const FIXTURE = '/e2e/annotation-editor-plugin.html';
const SURFACE = '[data-testid="canvas-renderer-surface"]';
const TOOLBAR_BUTTON = '[data-plugin-toggle="annotation-editor"]';
/** Core's wrapper around one registered overlay layer's container. */
const LAYER_WRAPPER = '.plugin-overlay-layer';
/** The class the plugin's own layer mount puts on the container it is handed. */
const DRAWING_LAYER = '.tri-annotation-drawing-layer';
/** A control the panel content always renders, so its presence means it mounted. */
const PANEL_UNDO = 'Undo';

async function openFixture(page: Page): Promise<void> {
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    await page.locator(SURFACE).waitFor({ state: 'visible', timeout: 30_000 });
}

test.describe('annotation editor plugin', () => {
    test.beforeEach(async ({ page }) => {
        expect(
            existsSync(PLUGIN_IIFE),
            `built plugin missing at ${PLUGIN_IIFE} — run \`pnpm --filter @triiiceratops/plugin-annotation-editor build\``,
        ).toBe(true);
        await serveAnnotationEditorDist(page);
    });

    test('activates against a current viewer and owns a drawing layer in the stage', async ({
        page,
    }) => {
        await openFixture(page);

        // Activation. The toolbar button is the visible half; the plugin-error
        // channel is the only place a refusal would show, so it is read too —
        // without it a plugin that never activated looks like a slow one.
        await expect(page.locator(TOOLBAR_BUTTON)).toBeVisible();
        expect(
            await page.evaluate(
                () =>
                    (window as unknown as { __pluginErrors: unknown[] })
                        .__pluginErrors,
            ),
        ).toEqual([]);

        // The layer: core created the container, placed it in the stage beside
        // the renderer, and the plugin's mount claimed it.
        const layer = page.locator(`${LAYER_WRAPPER} ${DRAWING_LAYER}`);
        await expect(layer).toHaveCount(1);

        // A sibling of the render surface, not a descendant of it — that is what
        // makes it stack above the image without covering the renderer's own
        // event target (ADR 0016).
        expect(
            await layer.evaluate(
                (node, surface) => node.closest(surface) === null,
                SURFACE,
            ),
        ).toBe(true);

        // The plugin adds no box of its own: core's wrapper is the positioned,
        // click-through one, so with no tool armed a drag over the layer still
        // reaches the renderer underneath.
        await expect(layer).toHaveCSS('display', 'contents');
        await expect(page.locator(LAYER_WRAPPER)).toHaveCSS(
            'pointer-events',
            'none',
        );

        // Core's panel carries the plugin's content. That it renders at all is
        // what says the plugin is not the dead UI the pause produced: the panel
        // opens from `config.plugins['annotation-editor'].open`, which only a
        // plugin core actually activated has.
        await expect(
            page.getByRole('button', { name: PANEL_UNDO, exact: true }),
        ).toBeVisible();
    });
});
