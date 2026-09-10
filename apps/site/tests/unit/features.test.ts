/**
 * What `/handles/` has to be true of as a declaration, before a browser sees it.
 *
 * The page shows one feature at a time on a single running viewer, and the ways
 * it can quietly stop doing that are all invisible in a screenshot: a feature
 * whose arrangement names only its own panel, so the previous feature's panel
 * stays open beside it; two features on one manifest with no canvas named, so
 * the second opens wherever the first left the reader; the page drifting into
 * the compliance claim that is made in exactly one other place. Each is
 * asserted here.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FEATURE_GROUPS, FEATURES } from '$lib/features';

const SOURCE = readFileSync(
    fileURLToPath(new URL('../../src/lib/features.ts', import.meta.url)),
    'utf8',
);

/** Everything on the page a reader reads, per feature. */
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
        // The rail rules itself into headings from this order alone, so a
        // feature filed under a heading it does not sit beside would silently
        // split that heading into two runs further down the rail.
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
        // A recipe id — `0024-book-4-toc` — as a reader would read it. The
        // manifest URLs contain one and that is honest attribution; nothing a
        // reader reads may.
        for (const text of prose()) {
            expect(text, text).not.toMatch(/\d{4}-[a-z]/);
        }
        // Compliance is claimed in the recipe catalog and nowhere else, so this
        // page must not be able to reach it. The catalog is named in this
        // module's own prose, which is why the import rather than the mention
        // is what is asserted.
        expect(SOURCE).not.toMatch(/^import .*@triiiceratops\/cookbook/m);
    });

    it('each describe the whole stage, so a switch closes the last feature', () => {
        // The stage is one viewer instance and the viewer applies the keys a
        // config names: a feature that named only its own panel would leave
        // the previous one's standing open. Every panel and mode the page can
        // open is therefore named by every feature.
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

    it('read in the route’s own language, but for the one feature about that', () => {
        // `locale` is a config leaf the viewer follows until another names a
        // different one, so the feature that asks for German has to be the only
        // one that asks for anything, and every other has to say English out
        // loud rather than leaving it to the page.
        const translated = FEATURES.filter(
            (feature) => feature.config.locale !== 'en',
        );
        expect(translated.map((feature) => feature.name)).toEqual([
            'A viewer in another language',
        ]);
        expect(translated[0].config.locale).toBe('de');
    });

    it('share one chrome, and vary only in the feature shown', () => {
        // Controls, panel widths and the toolbar are the route's, not a
        // feature's: this page demonstrates capability, and configurability is
        // `/configure/`. The one exception is the feature that shows the bare
        // surface, which cannot hide the unified bar because that bar is where
        // the toolbar renders — so it takes the split arrangement and turns
        // every control off, and it is the only feature allowed to.
        const chromeless = FEATURES.filter(
            (feature) => feature.config.controls !== 'unified',
        );
        expect(chromeless.map((feature) => feature.name)).toEqual([
            'Deep zoom on a canvas',
        ]);
        for (const { name, config } of chromeless) {
            expect(config.controls, name).toBe('split');
            expect(config.showToggle, name).toBe(false);
            expect(config.showCanvasNav, name).toBe(false);
            expect(config.showZoomControls, name).toBe(false);
        }
        for (const { name, config } of FEATURES) {
            if (config.controls !== 'unified') continue;
            // Every other feature shows the whole bar: a control left off by
            // one feature would otherwise stay off for the rest of the rail.
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
        // Two features on one manifest is the point of using the front page's
        // material, and the viewer keeps the canvas it is on when the manifest
        // does not change — so a feature that named no canvas would open
        // wherever the previous one left the reader.
        const shared = FEATURES.filter(
            (feature) =>
                // A one-canvas manifest has nowhere else to be left, so naming
                // its only canvas would assert nothing.
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
            // A plugin key over an unmounted plugin is a claim about chrome
            // that is not there.
            expect(config.plugins, name).toBeUndefined();
        }
    });

    it('theme only the panel ground, and only where a panel needs one', () => {
        // The rounded chrome is the route's; a feature's own override exists
        // for the one panel that would otherwise float near-white on cream.
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
        // The prerendered image is on the page's own critical path, so exactly
        // one is served — the feature a reader arrives at — and it has to be
        // this site's own material rather than a request to somebody's server.
        const prerendered = FEATURES.filter(
            (feature) => feature.example.firstCanvas.prerender,
        );
        expect(prerendered).toEqual([FEATURES[0]]);
        expect(FEATURES[0].example.firstCanvas.prerender?.src).toMatch(/^\//);
        expect(FEATURES[0].example.firstCanvas.prerender?.alt).toBeTruthy();
    });

    it('run on this site’s own material wherever the feature allows it', () => {
        // Someone else's endpoint costs a reader seconds this page can spend on
        // material it serves itself, so a feature reaches for another server
        // only where it needs something this site does not have.
        const local = FEATURES.filter((feature) =>
            feature.example.manifest.startsWith('/material/'),
        );
        expect(local.length).toBeGreaterThan(FEATURES.length / 2);
        // And the rest are somebody's real IIIF endpoint, not a fixture.
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
            const state = chip.state as { partOf?: { id?: string } };
            // Every chip has to name a manifest the stage can actually show:
            // the stage resolves the drop itself, and it owes the reader a
            // credit line and a reserved shape for whatever it loads. So a
            // chip names either the feature's own manifest or the one it
            // carries the material for.
            expect(state.partOf?.id, chip.label).toBe(
                chip.carries?.example.manifest ?? feature.example.manifest,
            );
        }

        // One chip that moves the view inside the feature's own material, and
        // one that replaces it — the two sizes of thing a content state names.
        expect(chips.filter((chip) => !chip.carries)).toHaveLength(1);
        expect(chips.filter((chip) => chip.carries)).toHaveLength(1);
    });
});
