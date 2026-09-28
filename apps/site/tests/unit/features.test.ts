import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FEATURE_GROUPS, FEATURES } from '$lib/features';

const SOURCE = readFileSync(
    fileURLToPath(new URL('../../src/lib/features.ts', import.meta.url)),
    'utf8',
);

function prose(): string[] {
    return FEATURES.flatMap((feature) => [
        feature.name,
        feature.what,
        feature.material,
        feature.source.who,
    ]);
}

describe('the features', () => {
    it('are gathered under the rail’s headings, each of them used', () => {
        const runs = FEATURES.filter(
            (feature, index) => FEATURES[index - 1]?.group !== feature.group,
        ).map((feature) => feature.group);
        expect(runs).toEqual([...new Set(runs)]);
        expect(new Set(runs)).toEqual(new Set(FEATURE_GROUPS));
    });

    it('are named and described in a line each', () => {
        for (const { name, what } of FEATURES) {
            expect(name.length, name).toBeLessThanOrEqual(32);
            expect(what.length, what).toBeLessThanOrEqual(80);
        }
    });

    it('claim no compliance, and cite no recipe', () => {
        for (const text of prose()) {
            expect(text, text).not.toMatch(/\d{4}-[a-z]/);
        }
        expect(SOURCE).not.toMatch(/^import .*@triiiceratops\/cookbook/m);
    });

    it('each describe the whole stage, so a switch closes the last feature', () => {
        for (const { name, config } of FEATURES) {
            expect(config.viewingMode, name).toBeDefined();
            expect(config.toolbarOpen, name).toBeDefined();
            expect(config.gallery?.open, name).toBeDefined();
            expect(config.gallery?.expanded, name).toBeDefined();
            expect(config.information?.open, name).toBeDefined();
            expect(config.structures?.open, name).toBeDefined();
            expect(config.annotations?.open, name).toBeDefined();
            expect(config.search?.open, name).toBeDefined();
            expect(config.collection?.open, name).toBeDefined();
            expect(config.showToggle, name).toBeDefined();
            expect(config.showCanvasNav, name).toBeDefined();
            expect(config.showZoomControls, name).toBeDefined();
            expect(config.locale, name).toBeDefined();
        }
    });

    it('read in the route’s own language', () => {
        const translated = FEATURES.filter(
            (feature) => feature.config.locale !== 'en',
        );
        expect(translated.map((feature) => feature.name)).toEqual([]);
    });

    it('share one chrome, and vary only in the feature shown', () => {
        const chromeless = FEATURES.filter(
            (feature) => feature.config.controls !== 'unified',
        );
        expect(chromeless.map((feature) => feature.name)).toEqual([
            'Deep zoom on a single canvas',
        ]);
        for (const { name, config } of chromeless) {
            expect(config.controls, name).toBe('split');
            expect(config.showToggle, name).toBe(false);
            expect(config.showCanvasNav, name).toBe(false);
            expect(config.showZoomControls, name).toBe(false);
        }
        for (const { name, config } of FEATURES) {
            if (config.controls !== 'unified') continue;
            expect(config.showToggle, name).toBe(true);
            expect(config.showCanvasNav, name).toBe(true);
            expect(config.showZoomControls, name).toBe(true);
            expect(config.toolbar, name).toBeUndefined();
            expect(config.nav, name).toBeUndefined();
            expect(config.leftPanelWidth, name).toBeUndefined();
            expect(config.rightPanelWidth, name).toBeUndefined();
        }
        for (const { name, themeConfig } of FEATURES) {
            expect(themeConfig?.radiusButtons, name).toBeUndefined();
        }
    });

    it('name a canvas wherever they share a manifest', () => {
        const shared = FEATURES.filter(
            (feature) =>
                feature.example.canvases > 1 &&
                FEATURES.filter(
                    (other) =>
                        other.example.manifest === feature.example.manifest,
                ).length > 1,
        );
        expect(shared.length).toBeGreaterThan(1);
        for (const { name, canvasId } of shared) {
            expect(canvasId, name).toBeDefined();
        }
    });

    it('are told apart by their labels, which is what the stage announces', () => {
        const labels = FEATURES.map((feature) => feature.example.label);
        expect(new Set(labels).size).toBe(labels.length);
    });

    it('configure a plugin’s chrome only where that plugin is loaded', () => {
        for (const { name, config, plugin } of FEATURES) {
            if (plugin) continue;
            expect(config.plugins, name).toBeUndefined();
        }
    });

    it('theme only the panel ground, and only where a panel needs one', () => {
        for (const { name, themeConfig, config } of FEATURES) {
            if (!themeConfig) continue;
            expect(Object.keys(themeConfig), name).toEqual(['metadataPanelBg']);
            expect(themeConfig.metadataPanelBg, name).toBe('var(--bench)');
            expect(config.information?.open, name).toBe(true);
        }
    });

    it('each reserve their box from a real opening canvas', () => {
        for (const { name, example } of FEATURES) {
            expect(example.firstCanvas.width, name).toBeGreaterThan(0);
            expect(example.firstCanvas.height, name).toBeGreaterThan(0);
            expect(example.canvases, name).toBeGreaterThan(0);
        }
    });

    it('prerender an image only for the feature the page opens on', () => {
        const prerendered = FEATURES.filter(
            (feature) => feature.example.firstCanvas.prerender,
        );
        expect(prerendered).toEqual([FEATURES[0]]);
        expect(FEATURES[0].example.firstCanvas.prerender?.src).toMatch(/^\//);
        expect(FEATURES[0].example.firstCanvas.prerender?.alt).toBeTruthy();
    });

    it('run on this site’s own material wherever the feature allows it', () => {
        const local = FEATURES.filter((feature) =>
            feature.example.manifest.startsWith('/material/'),
        );
        expect(local.length).toBeGreaterThan(FEATURES.length / 2);
        for (const { name, example } of FEATURES) {
            if (example.manifest.startsWith('/material/')) continue;
            expect(example.manifest, name).toMatch(/^https:\/\//);
        }
    });

    it('offer dragged payloads for the one feature that is a drag', () => {
        const draggable = FEATURES.filter((feature) => feature.dragPayloads);
        expect(draggable).toHaveLength(1);
        const [feature] = draggable;
        const chips = feature.dragPayloads ?? [];
        expect(chips.length).toBeGreaterThan(1);

        for (const chip of chips) {
            expect(chip.state.manifestId, chip.label).toBe(
                chip.carries?.example.manifest ?? feature.example.manifest,
            );
        }

        expect(chips.filter((chip) => !chip.carries)).toHaveLength(1);
        expect(chips.filter((chip) => chip.carries)).toHaveLength(1);
    });
});
