import { expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A Svelte runtime diagnostic code: present once in every production runtime,
// absent from a plugin build that imports Svelte instead of bundling it.
const RUNTIME_MARKER = 'effect_update_depth_exceeded';
const ELEMENT_CHUNK = /^triiiceratops-element-/;
const PLUGINS = [
    '@triiiceratops/plugin-image-manipulation',
    '@triiiceratops/plugin-image-export',
    '@triiiceratops/plugin-pdf-export',
    '@triiiceratops/plugin-annotation-editor',
];
const AV = '@triiiceratops/plugin-av';
const PANEL_STYLES = [
    { name: 'PDF Export', selector: '.tri-pdf', plugin: 'pdf-export' },
    {
        name: 'Annotation Editor',
        selector: '[data-panel-id="annotation-editor"]',
        plugin: 'annotation-editor',
    },
];

const count = (text) => text.split(RUNTIME_MARKER).length - 1;

function jsFiles(dir) {
    return readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => ({
            name: entry.name,
            text: readFileSync(join(entry.parentPath, entry.name), 'utf8'),
        }));
}

async function assertPluginStyles(host, label) {
    const openToolbar = host.locator('button.handle');
    await expect(openToolbar).toBeVisible({ timeout: 30_000 });
    await openToolbar.click();

    await host
        .locator('[data-flyout-toggle][aria-label="Image Adjustments"]')
        .click();
    await expect
        .poll(
            () =>
                host
                    .locator('.tri-im-cluster')
                    .evaluate((el) => getComputedStyle(el).display),
            { message: `${label}: image-manipulation scoped CSS applies` },
        )
        .toBe('inline-flex');

    await host.locator('[aria-label="Download Image"]').click();
    await expect
        .poll(
            () =>
                host
                    .locator('.tri-id')
                    .evaluate((el) => getComputedStyle(el).display),
            { message: `${label}: image-export stylesheet applies` },
        )
        .toBe('flex');

    for (const { name, selector, plugin } of PANEL_STYLES) {
        await host.getByRole('button', { name, exact: true }).click();
        await expect
            .poll(
                () =>
                    host
                        .locator(selector)
                        .evaluate((el) => getComputedStyle(el).display),
                { message: `${label}: ${plugin} stylesheet applies` },
            )
            .toBe('flex');
    }
}

// plugin-svelte-condition: the plugins' `svelte` builds share the app's runtime in both hosts.
export default {
    name: 'plugin-svelte-condition',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk', ...PLUGINS, AV],
    async assert({ page, baseURL, pageErrors, fixtureDir, serveRoot }) {
        for (const plugin of PLUGINS) {
            const dist = join(fixtureDir, 'node_modules', plugin, 'dist');
            expect(
                count(readFileSync(join(dist, 'index.js'), 'utf8')),
                `${plugin}: default build bundles the marked runtime`,
            ).toBe(1);
            expect(
                count(readFileSync(join(dist, 'svelte/index.js'), 'utf8')),
                `${plugin}: svelte build imports its runtime`,
            ).toBe(0);
        }
        expect(
            count(
                readFileSync(
                    join(fixtureDir, 'node_modules', AV, 'dist/index.js'),
                    'utf8',
                ),
            ),
            `${AV}: ESM imports its runtime`,
        ).toBe(0);

        const files = jsFiles(serveRoot);
        const element = files.filter((f) => ELEMENT_CHUNK.test(f.name));
        expect(element.length, 'element artifact is its own chunk').toBe(1);
        expect(count(element[0].text), 'element bundles its runtime').toBe(1);
        const app = files.filter((f) => !ELEMENT_CHUNK.test(f.name));
        expect(
            app.reduce((sum, f) => sum + count(f.text), 0),
            'one Svelte runtime outside the element artifact',
        ).toBe(1);

        await page.setViewportSize({ width: 1600, height: 900 });
        await page.goto(`${baseURL}/`, { waitUntil: 'load' });

        const component = page.locator('#component-host');
        const custom = page.locator('triiiceratops-viewer');
        for (const host of [component, custom]) {
            await expect(
                host.locator('#triiiceratops-viewer canvas').first(),
            ).toBeVisible({ timeout: 30_000 });
        }

        await assertPluginStyles(component, 'component host');
        await assertPluginStyles(custom, 'element host');

        // AV shows no chrome off an AV canvas; its published state proves it mounted.
        await expect
            .poll(
                () =>
                    page.evaluate(() =>
                        [
                            window.__componentViewerState,
                            document.querySelector('triiiceratops-viewer')
                                .viewerState,
                        ].map((state) => state?.getPluginState('av') != null),
                    ),
                { message: `${AV} mounts in both hosts` },
            )
            .toEqual([true, true]);

        expect(
            pageErrors.map((e) => e.message),
            'no uncaught page errors',
        ).toEqual([]);
    },
};
