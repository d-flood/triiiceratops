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

import {
    COMPETITORS,
    COOKBOOK_MATRIX,
    MEASURED_COMPARISON,
} from '@triiiceratops/comparison';
import { COOKBOOK_RECIPES } from '@triiiceratops/cookbook';
import { describe, expect, it } from 'vitest';

import {
    AV_COVERAGE,
    AV_PREMIUM,
    BUNDLES,
    AV_ROWS,
    COUNTED,
    COVERAGE,
    HEADROOM,
    LAZY_CHUNKS,
    LEAD,
    MATRIX_LAG,
    MATRIX_UNMEASURED,
    MEASURED_AT,
    RANKED,
    RECIPES,
    SIZE_ONLY,
    SIZE_ROWS,
    kilobytes,
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

describe('the data table', () => {
    it('states every compression level the measurement recorded', () => {
        for (const row of SIZE_ROWS) {
            const measured = viewers.find((viewer) => viewer.id === row.id);
            const image = measured?.sessions.find((s) => s.kind === 'image');
            expect({
                raw: row.raw,
                gzip: row.gzip,
                brotli: row.brotli,
            }).toEqual({
                raw: image?.raw,
                gzip: image?.gzip,
                brotli: image?.brotli,
            });
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

    it('states the pair’s headroom over the next row up, in bytes and percent', () => {
        const pair = gzipOf('triiiceratops-av', 'image');
        const above = SIZE_ROWS.filter((row) => row.gzip > pair);
        expect(HEADROOM.competitor).toBe(above[0].name);
        expect(HEADROOM.bytes).toBe(above[0].gzip - pair);
        expect(HEADROOM.percent).toBeCloseTo(
            ((above[0].gzip - pair) / above[0].gzip) * 100,
            1,
        );
    });
});

describe('the recipe counts', () => {
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
    });
});

describe('the coverage grid', () => {
    it('is as wide as the catalog, and every row is', () => {
        expect(COVERAGE.total).toBe(COOKBOOK_RECIPES.length);
        for (const row of COVERAGE.rows) {
            expect(row.cells.length, row.id).toBe(COVERAGE.total);
        }
    });

    it('fills every row from the left, worked before partial before not', () => {
        const rank = { on: 0, partial: 1, off: 2 } as const;
        for (const row of COVERAGE.rows) {
            const order = row.cells.map((cell) => rank[cell]);
            expect(
                [...order].sort((a, b) => a - b),
                row.id,
            ).toEqual(order);
        }
    });

    it('counts what its own cells say', () => {
        for (const row of COVERAGE.rows) {
            expect(row.recipes, row.id).toBe(
                row.cells.filter((cell) => cell === 'on').length,
            );
            expect(row.partial, row.id).toBe(
                row.cells.filter((cell) => cell === 'partial').length,
            );
        }
    });

    it('sizes every row from the session it actually has', () => {
        for (const row of COVERAGE.rows) {
            const sessions = viewers.find(
                (viewer) => viewer.id === row.id,
            )!.sessions;
            const av = sessions.find((s) => s.kind === 'audiovisual');
            const expected = av ?? sessions.find((s) => s.kind === 'image')!;
            expect(row.sessionKind, row.id).toBe(expected.kind);
            expect(row.gzip, row.id).toBe(expected.gzip);
        }
    });

    it('draws our own cells from the catalog and a rival’s from the matrix', () => {
        const self = COVERAGE.rows.find((row) => row.isSelf);
        expect(self?.source).toBe('catalog');
        expect(self?.recipes).toBe(RECIPES.withPlugin);
        // Binary by policy in the catalog, so our row cannot carry a partial.
        expect(self?.partial).toBe(0);

        for (const row of COVERAGE.rows.filter((r) => !r.isSelf)) {
            expect(row.source, row.id).toBe('matrix');
            const column = COMPETITORS.find(
                (c) => c.id === row.id,
            )?.matrixColumn;
            expect(column, row.id).toBeDefined();
            const marks = (mark: string) =>
                COOKBOOK_RECIPES.filter(
                    (recipe) =>
                        COOKBOOK_MATRIX.recipes.find((r) => r.id === recipe.id)
                            ?.marks[column!] === mark,
                ).length;
            expect(row.recipes, row.id).toBe(marks('yes'));
            expect(row.partial, row.id).toBe(marks('partial'));
        }
    });

    it('leaves out only a viewer nothing can speak for', () => {
        const drawn = new Set(COVERAGE.rows.map((row) => row.id));
        for (const viewer of viewers) {
            const column = COMPETITORS.find(
                (c) => c.id === viewer.id,
            )?.matrixColumn;
            // A rival with no matrix column has no coverage to draw; our own
            // rows come from the catalog, so both of ours are always drawable.
            expect(drawn.has(viewer.id), viewer.id).toBe(
                viewer.isSelf || column !== undefined,
            );
        }
    });

    it('draws core alone without the recipes that need the plugin', () => {
        const core = COVERAGE.rows.find((row) => row.id === 'triiiceratops');
        const pair = COVERAGE.rows.find((row) => row.id === 'triiiceratops-av');
        expect(core?.recipes).toBe(RECIPES.core);
        expect(pair?.recipes).toBe(RECIPES.withPlugin);
        expect(core!.recipes).toBeLessThan(pair!.recipes);
    });

    it('orders the coverage figure by coverage, most first', () => {
        const rows = COVERAGE.rows;
        for (const [at, row] of rows.slice(1).entries()) {
            const previous = rows[at];
            expect(
                previous.recipes > row.recipes ||
                    (previous.recipes === row.recipes &&
                        previous.gzip <= row.gzip),
                `${previous.id} before ${row.id}`,
            ).toBe(true);
        }
        expect(rows[0].id).toBe('triiiceratops-av');
    });

    it('orders the bundle figure by size, smallest first', () => {
        // Each figure sorts by the axis it draws, so neither row order can be
        // read across into the other.
        for (const [at, row] of BUNDLES.slice(1).entries()) {
            const previous = BUNDLES[at];
            expect(
                previous.gzip <= row.gzip,
                `${previous.id} before ${row.id}`,
            ).toBe(true);
        }
        expect(BUNDLES[0].id).toBe('triiiceratops');
    });

    it('weighs every measured viewer, including those with no cells', () => {
        expect([...BUNDLES].map((row) => row.id).sort()).toEqual(
            [...MEASURED_COMPARISON.viewers].map((row) => row.id).sort(),
        );
        const covered = new Set(COVERAGE.rows.map((row) => row.id));
        for (const row of BUNDLES) {
            expect(row.covered, row.id).toBe(covered.has(row.id));
        }
        expect(SIZE_ONLY).toEqual(
            BUNDLES.filter((row) => !row.covered).map((row) => row.name),
        );
        expect(SIZE_ONLY).toContain('Canvas Panel');
    });

    it('lengthens each size bar to its share of the largest row', () => {
        const largest = Math.max(...BUNDLES.map((row) => row.gzip));
        for (const row of BUNDLES) {
            expect(row.sizePercent, row.id).toBeCloseTo(
                (row.gzip / largest) * 100,
                1,
            );
        }
    });

    it('joins every catalog recipe to a matrix row', () => {
        // The grid draws one cell per catalog recipe and fills a rival's from
        // the matrix, so a catalog recipe the matrix has never listed would be
        // a cell no rival row can answer for.
        const listed = new Set(COOKBOOK_MATRIX.recipes.map((r) => r.id));
        const absent = COOKBOOK_RECIPES.filter(
            (recipe) => !listed.has(recipe.id),
        ).map((recipe) => recipe.id);
        expect(absent).toEqual([]);
    });

    it('states audiovisual coverage from the catalog’s own group', () => {
        const audiovisual = COOKBOOK_RECIPES.filter(
            (recipe) => recipe.group === 'audiovisual',
        );
        expect(AV_COVERAGE.total).toBe(audiovisual.length);
        expect(AV_COVERAGE.self).toBe(
            audiovisual.filter((recipe) => recipe.support === 'supported')
                .length,
        );
        // The best rival, counted off the matrix over the same recipes.
        const best = Math.max(
            ...COVERAGE.rows
                .filter((row) => !row.isSelf)
                .map((row) => {
                    const column = COMPETITORS.find(
                        (c) => c.id === row.id,
                    )?.matrixColumn;
                    return audiovisual.filter(
                        (recipe) =>
                            COOKBOOK_MATRIX.recipes.find(
                                (r) => r.id === recipe.id,
                            )?.marks[column!] === 'yes',
                    ).length;
                }),
        );
        expect(AV_COVERAGE.rivalBest).toBe(best);
        expect(AV_COVERAGE.self).toBeGreaterThan(AV_COVERAGE.rivalBest);
    });
});

describe('the grid’s own claim', () => {
    it('states the field’s ceiling rather than a nominated rival', () => {
        const self = COVERAGE.rows.find((row) => row.id === 'triiiceratops-av');
        const rivals = COVERAGE.rows.filter((row) => !row.isSelf);
        const ceiling = Math.max(...rivals.map((row) => row.recipes));
        const tied = rivals.filter((row) => row.recipes === ceiling);

        expect(LEAD.rows).toBe(COVERAGE.rows.length);
        expect(LEAD.selfRecipes).toBe(self?.recipes);
        expect(LEAD.ceiling).toBe(ceiling);
        expect(LEAD.atCeiling).toEqual(tied.map((row) => row.name));
        // Every row at the ceiling is named, not the convenient one: a tie
        // whose members span five times the bytes must not be represented by
        // whichever member makes the comparison look best.
        expect(LEAD.atCeiling.length).toBe(tied.length);
        expect(LEAD.ceilingFromKb).toBe(
            kilobytes(Math.min(...tied.map((row) => row.gzip))),
        );
        expect(LEAD.ceilingToKb).toBe(
            kilobytes(Math.max(...tied.map((row) => row.gzip))),
        );
    });

    it('claims to be the smallest only while it is', () => {
        // Against every measured row and not only the ones with cells: the
        // sentence sits under the size figure, which draws all of them.
        const self = BUNDLES.find((row) => row.id === 'triiiceratops-av');
        const rivals = BUNDLES.filter((row) => !row.isSelf);
        expect(LEAD.smallestOfAll).toBe(
            rivals.every((row) => row.gzip > self!.gzip),
        );
    });

    it('clears the ceiling it names', () => {
        expect(LEAD.selfRecipes).toBeGreaterThan(LEAD.ceiling);
    });
});

describe('what the matrix says that the grid does not', () => {
    it('reads the lag off the matrix, not off the catalog’s own flags', () => {
        expect(COOKBOOK_MATRIX.viewers).toContain(MATRIX_LAG.column);
        expect(MATRIX_LAG.readAt).toBe(COOKBOOK_MATRIX.readAt);
        expect(MATRIX_LAG.ours).toBe(RECIPES.withPlugin);
        expect(MATRIX_LAG.credits).toBe(
            COOKBOOK_RECIPES.filter(
                (recipe) =>
                    COOKBOOK_MATRIX.recipes.find((r) => r.id === recipe.id)
                        ?.marks[MATRIX_LAG.column] === 'yes',
            ).length,
        );
    });

    it('names every matrix column this comparison does not measure', () => {
        const measured = new Set(
            COMPETITORS.flatMap((c) =>
                c.matrixColumn === undefined ? [] : [c.matrixColumn],
            ),
        );
        measured.add(MATRIX_LAG.column);
        expect(MATRIX_UNMEASURED.map((v) => v.name).sort()).toEqual(
            COOKBOOK_MATRIX.viewers.filter((v) => !measured.has(v)).sort(),
        );
        const counts = MATRIX_UNMEASURED.map((v) => v.recipes);
        expect([...counts].sort((a, b) => b - a)).toEqual(counts);
        for (const viewer of MATRIX_UNMEASURED) {
            expect(viewer.of, viewer.name).toBe(COOKBOOK_MATRIX.recipes.length);
        }
    });
});

describe('the ranked table', () => {
    it('carries every measured viewer, smallest image session first', () => {
        expect(RANKED).toHaveLength(viewers.length);
        const sessions = RANKED.map((row) => row.image);
        expect([...sessions].sort((a, b) => a - b)).toEqual(sessions);
    });

    it('states each session from the measurement it came from', () => {
        for (const row of RANKED) {
            expect(row.image, row.id).toBe(gzipOf(row.id, 'image'));
            const av = viewers
                .find((viewer) => viewer.id === row.id)
                ?.sessions.find((session) => session.kind === 'audiovisual');
            expect(row.audiovisual, row.id).toBe(av?.gzip ?? null);
        }
    });

    it('leaves recipes and bytes per recipe blank without a count to divide', () => {
        for (const row of RANKED) {
            const column = COMPETITORS.find(
                (c) => c.id === row.id,
            )?.matrixColumn;
            if (!row.isSelf && column === undefined) {
                expect(row.recipes, row.id).toBeNull();
                expect(row.bytesPerRecipe, row.id).toBeNull();
                continue;
            }
            expect(row.recipes, row.id).not.toBeNull();
            expect(row.bytesPerRecipe, row.id).toBe(
                Math.round((row.audiovisual ?? row.image) / row.recipes!),
            );
        }
    });
});

describe('the audiovisual disclosure', () => {
    it('states both sessions for every viewer that has both', () => {
        for (const row of AV_ROWS) {
            expect(row.image, row.id).toBe(gzipOf(row.id, 'image'));
            expect(row.audiovisual, row.id).toBe(gzipOf(row.id, 'audiovisual'));
        }
    });

    it('names a viewer whose audiovisual session costs it more', () => {
        const splits = AV_ROWS.filter((row) => row.image !== row.audiovisual);
        expect(splits.length).toBeGreaterThan(0);
        for (const row of splits) {
            expect(row.split, row.id).toMatch(/\d+ files for an image canvas/);
        }
    });

    it('names what code-splitting costs the viewer it costs most', () => {
        const extras = viewers.flatMap((viewer) => {
            const image = viewer.sessions.find((s) => s.kind === 'image')?.gzip;
            const audiovisual = viewer.sessions.find(
                (s) => s.kind === 'audiovisual',
            )?.gzip;
            return image !== undefined &&
                audiovisual !== undefined &&
                audiovisual > image
                ? [{ name: viewer.name, extra: audiovisual - image }]
                : [];
        });
        const costliest = extras.sort((a, b) => b.extra - a.extra)[0];
        expect(AV_PREMIUM.name).toBe(costliest.name);
        expect(AV_PREMIUM.extra).toBe(costliest.extra);
    });

    it('costs our own pair the same either way', () => {
        expect(gzipOf('triiiceratops-av', 'audiovisual')).toBe(
            gzipOf('triiiceratops-av', 'image'),
        );
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
                expect(
                    file.url.trim(),
                    `${entry.id}/${file.name}`,
                ).toBeTruthy();
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
