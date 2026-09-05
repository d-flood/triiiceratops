/**
 * The comparison page's derivation, which is the whole of the page's drift
 * protection.
 *
 * The deleted documentation page needed a `--check` gate because its prose
 * transcribed measurements. Here every figure is computed from one of the two
 * committed sources, so what is worth asserting is that the computation reads
 * those sources rather than a constant beside them: each expectation recomputes
 * its figure from `MEASURED_COMPARISON` or `COOKBOOK_RECIPES` directly, so a
 * hand-typed number anywhere in the module fails here the moment the data moves.
 */

import { MEASURED_COMPARISON } from '@triiiceratops/comparison';
import { COOKBOOK_RECIPES } from '@triiiceratops/cookbook';
import { describe, expect, it } from 'vitest';

import {
    AV_ROWS,
    CAPABILITY_ROWS,
    COUNTED,
    HEADROOM,
    LAZY_CHUNKS,
    MEASURED_AT,
    RECIPES,
    SCATTER,
    SIZE_BARS,
    SIZE_ROWS,
} from '$lib/comparison';

const { viewers } = MEASURED_COMPARISON;

/** One viewer's session of one kind, straight from the committed measurement. */
function gzipOf(id: string, kind: 'image' | 'audiovisual'): number {
    const session = viewers
        .find((viewer) => viewer.id === id)
        ?.sessions.find((entry) => entry.kind === kind);
    if (session === undefined) throw new Error(`no ${kind} session for ${id}`);
    return session.gzip;
}

describe('the size bars', () => {
    it('carries one bar per measured viewer, smallest first', () => {
        expect(SIZE_BARS.map((bar) => bar.id)).toHaveLength(viewers.length);
        const gzips = SIZE_BARS.map((bar) => bar.gzip);
        expect([...gzips].sort((a, b) => a - b)).toEqual(gzips);
    });

    it('takes every bar from the image session of its own viewer', () => {
        for (const bar of SIZE_BARS) {
            expect(bar.gzip, bar.id).toBe(gzipOf(bar.id, 'image'));
        }
    });

    it('lengthens each bar to its share of the largest', () => {
        const largest = Math.max(...SIZE_BARS.map((bar) => bar.gzip));
        for (const bar of SIZE_BARS) {
            expect(bar.widthPercent, bar.id).toBeCloseTo(
                (bar.gzip / largest) * 100,
                1,
            );
        }
        expect(SIZE_BARS.at(-1)?.widthPercent).toBe(100);
    });
});

describe('the data table', () => {
    it('states every compression level the measurement recorded', () => {
        for (const row of SIZE_ROWS) {
            const measured = viewers.find((viewer) => viewer.id === row.id);
            const image = measured?.sessions.find((s) => s.kind === 'image');
            expect({ raw: row.raw, gzip: row.gzip, brotli: row.brotli }).toEqual(
                { raw: image?.raw, gzip: image?.gzip, brotli: image?.brotli },
            );
            expect(row.version, row.id).toBe(measured?.version);
        }
    });

    it('measures every other row against the core row, which has no ratio', () => {
        const core = gzipOf('triiiceratops', 'image');
        for (const row of SIZE_ROWS) {
            if (row.id === 'triiiceratops') {
                expect(row.timesCore).toBeNull();
                continue;
            }
            expect(row.timesCore, row.id).toBeCloseTo(row.gzip / core, 2);
        }
    });

    it('states the pair’s headroom over the next row up', () => {
        const pair = gzipOf('triiiceratops-av', 'image');
        const above = SIZE_BARS.filter((bar) => bar.gzip > pair);
        expect(HEADROOM.competitor).toBe(above[0].name);
        expect(HEADROOM.bytes).toBe(above[0].gzip - pair);
    });
});

describe('the capability axis', () => {
    it('counts recipes from the catalog, not from a constant', () => {
        expect(RECIPES.total).toBe(COOKBOOK_RECIPES.length);
        expect(RECIPES.withPlugin).toBe(
            COOKBOOK_RECIPES.filter((r) => r.support === 'supported').length,
        );
        expect(RECIPES.core).toBe(
            COOKBOOK_RECIPES.filter(
                (r) => r.support === 'supported' && !r.requiresPluginAv,
            ).length,
        );
        expect(RECIPES.core + RECIPES.pluginOnly).toBe(RECIPES.withPlugin);
        expect(RECIPES.partial.map((r) => r.id)).toEqual(
            COOKBOOK_RECIPES.filter((r) => r.support === 'partial').map(
                (r) => r.id,
            ),
        );
    });

    it('gives every partial recipe the reason it is partial', () => {
        for (const recipe of RECIPES.partial) {
            expect(recipe.reason?.trim(), recipe.id).toBeTruthy();
        }
    });

    it('plots our own point at the catalog’s count', () => {
        const self = SCATTER.points.find((p) => p.id === 'triiiceratops-av');
        expect(self?.recipes).toBe(RECIPES.withPlugin);
    });
});

describe('the scatter', () => {
    it('plots the audiovisual session of every viewer it plots', () => {
        for (const point of SCATTER.points) {
            expect(point.gzip, point.id).toBe(gzipOf(point.id, 'audiovisual'));
        }
    });

    it('leaves out a viewer with no recipe count and one with no audiovisual session', () => {
        const plotted = SCATTER.points.map((point) => point.id);
        // Canvas Panel plays time-based media but has no matrix column; Diva.js
        // has a matrix column's worth of nothing because it has no A/V session.
        expect(plotted).not.toContain('canvas-panel');
        expect(plotted).not.toContain('diva');
    });

    it('interpolates every coordinate into the plot frame', () => {
        const { plot, xTicks, yTicks } = SCATTER;
        const yMaxKb = SCATTER.yMaxKb;
        for (const point of SCATTER.points) {
            expect(point.x, point.id).toBeCloseTo(
                plot.left + (point.recipes / RECIPES.total) * (plot.right - plot.left),
                1,
            );
            expect(point.y, point.id).toBeCloseTo(
                plot.bottom -
                    (point.gzip / 1000 / yMaxKb) * (plot.bottom - plot.top),
                1,
            );
            expect(point.x).toBeLessThanOrEqual(plot.right);
            expect(point.x).toBeGreaterThanOrEqual(plot.left);
            expect(point.y).toBeLessThanOrEqual(plot.bottom);
            expect(point.y).toBeGreaterThanOrEqual(plot.top);
        }
        // Both axes are scaled to a maximum the data cannot exceed: the x axis
        // to the whole catalog, the y axis to a round figure above the largest
        // viewer. The last tick sits at or below that maximum, not on it.
        expect(xTicks.at(-1)!.value).toBeLessThanOrEqual(RECIPES.total);
        expect(yMaxKb * 1000).toBeGreaterThanOrEqual(
            Math.max(...SCATTER.points.map((point) => point.gzip)),
        );
        expect(yTicks.at(-1)!.value).toBeLessThanOrEqual(yMaxKb);
    });

    it('tabulates the same points, with bytes per recipe', () => {
        expect(CAPABILITY_ROWS.map((row) => row.id).sort()).toEqual(
            SCATTER.points.map((point) => point.id).sort(),
        );
        for (const row of CAPABILITY_ROWS) {
            expect(row.bytesPerRecipe, row.id).toBe(
                Math.round(row.gzip / row.recipes),
            );
        }
    });
});

describe('the audiovisual disclosure', () => {
    it('states both sessions for every viewer that has both', () => {
        for (const row of AV_ROWS) {
            expect(row.image, row.id).toBe(gzipOf(row.id, 'image'));
            expect(row.audiovisual, row.id).toBe(
                gzipOf(row.id, 'audiovisual'),
            );
        }
    });

    it('names a viewer whose audiovisual session costs it more', () => {
        const splits = AV_ROWS.filter((row) => row.image !== row.audiovisual);
        expect(splits.length).toBeGreaterThan(0);
        for (const row of splits) {
            expect(row.split, row.id).toMatch(/\d+ files for an image canvas/);
        }
    });

    it('lists our deferred chunks at their measured size', () => {
        const lazy =
            viewers.find((viewer) => viewer.id === 'triiiceratops-av')
                ?.lazyArtifacts ?? [];
        expect(LAZY_CHUNKS).toEqual(
            lazy.map((file) => ({ name: file.name, gzip: file.gzip })),
        );
        expect(LAZY_CHUNKS.length).toBeGreaterThan(0);
    });

    it('discloses the files every row counted, with their sources', () => {
        expect(COUNTED.map((entry) => entry.id).sort()).toEqual(
            viewers.map((viewer) => viewer.id).sort(),
        );
        for (const entry of COUNTED) {
            expect(entry.files.length, entry.id).toBeGreaterThan(0);
            for (const file of entry.files) {
                expect(file.url.trim(), `${entry.id}/${file.name}`).toBeTruthy();
            }
        }
    });
});

describe('the method statement', () => {
    it('dates itself from the measurement rather than from the build', () => {
        expect(MEASURED_AT).toBe(MEASURED_COMPARISON.measuredAt);
        expect(MEASURED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
