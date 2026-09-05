import { describe, expect, it } from 'vitest';

import { COMPETITORS, MEASURED_COMPARISON, SESSION_MANIFESTS } from './index';
import type { MeasuredFile, MeasuredViewer } from './index';

const { compression, measuredAt, sessionManifests, viewers } =
    MEASURED_COMPARISON;

/** Every measurement in the committed output, labelled by where it came from. */
function everyMeasurement(): Array<{
    where: string;
    of: MeasuredFile | MeasuredViewer['sessions'][number];
}> {
    const all = [];
    for (const viewer of viewers) {
        for (const session of viewer.sessions) {
            all.push({ where: `${viewer.id}/${session.kind}`, of: session });
            for (const file of session.files) {
                all.push({
                    where: `${viewer.id}/${session.kind}/${file.name}`,
                    of: file,
                });
            }
        }
        for (const file of viewer.lazyArtifacts ?? []) {
            all.push({ where: `${viewer.id}/lazy/${file.name}`, of: file });
        }
    }
    return all;
}

describe('the pinned competitor list', () => {
    it('gives every entry an id, a name and a version', () => {
        const incomplete = COMPETITORS.filter(
            (c) => !c.id.trim() || !c.name.trim() || !c.version.trim(),
        ).map((c) => c.id || c.name);
        expect(incomplete).toEqual([]);
    });

    it('has one entry per id', () => {
        const ids = COMPETITORS.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('drives every entry through a real page against a real manifest', () => {
        const unusable = COMPETITORS.filter(
            (c) =>
                !c.embed.includes('{{MANIFEST}}') ||
                c.assetBases.length === 0 ||
                c.sessions.length === 0,
        ).map((c) => c.id);
        expect(unusable).toEqual([]);
    });

    it('serves a Triiiceratops row from this repository and nothing else', () => {
        for (const competitor of COMPETITORS) {
            const templated =
                competitor.embed.includes('{{BASE}}') ||
                competitor.assetBases.some((base) => base.includes('{{BASE}}'));
            expect(templated, competitor.id).toBe(competitor.local === true);
        }
    });

    it('records no matrix recipe count for a Triiiceratops entry', () => {
        // Its capability figure comes from the recipe catalog instead, so a
        // count here would be a second, drifting copy of the same claim.
        const doubled = COMPETITORS.filter(
            (c) => c.local && c.matrixRecipes !== undefined,
        ).map((c) => c.id);
        expect(doubled).toEqual([]);
    });

    it('keeps every matrix recipe count within the deduplicated matrix', () => {
        const DISTINCT_RECIPES = 67;
        for (const { id, matrixRecipes } of COMPETITORS) {
            if (matrixRecipes === undefined) continue;
            const { supported, partial } = matrixRecipes;
            expect(Number.isInteger(supported), id).toBe(true);
            expect(Number.isInteger(partial), id).toBe(true);
            expect(supported, id).toBeGreaterThan(0);
            expect(partial, id).toBeGreaterThanOrEqual(0);
            expect(supported + partial, id).toBeLessThanOrEqual(
                DISTINCT_RECIPES,
            );
        }
    });

    it('names a manifest for every session kind any entry declares', () => {
        for (const competitor of COMPETITORS) {
            for (const kind of competitor.sessions) {
                expect(
                    SESSION_MANIFESTS[kind],
                    `${competitor.id}/${kind}`,
                ).toMatch(/^https:\/\/iiif\.io\/api\/cookbook\/recipe\//);
            }
        }
    });
});

describe('the committed measured output', () => {
    it('records the date and the compression settings its figures were made with', () => {
        expect(measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(compression).toEqual({ gzipLevel: 9, brotliQuality: 11 });
        expect(sessionManifests).toEqual(SESSION_MANIFESTS);
    });

    it('measures every pinned viewer, and only pinned viewers', () => {
        expect(viewers.map((v) => v.id)).toEqual(COMPETITORS.map((c) => c.id));
    });

    it('carries a name and a version for every viewer', () => {
        const unversioned = viewers
            .filter((v) => !v.name?.trim() || !v.version?.trim())
            .map((v) => v.id);
        expect(unversioned).toEqual([]);
    });

    it('measures exactly the session kinds each viewer declares', () => {
        for (const competitor of COMPETITORS) {
            const viewer = viewers.find((v) => v.id === competitor.id);
            expect(
                viewer?.sessions.map((s) => s.kind),
                competitor.id,
            ).toEqual(competitor.sessions);
        }
    });

    it('gives every figure a positive size at all three compression levels', () => {
        const unusable = everyMeasurement()
            .filter(
                ({ of }) =>
                    !Number.isInteger(of.raw) ||
                    !Number.isInteger(of.gzip) ||
                    !Number.isInteger(of.brotli) ||
                    of.raw <= 0 ||
                    of.gzip <= 0 ||
                    of.brotli <= 0,
            )
            .map(({ where }) => where);
        expect(unusable).toEqual([]);
    });

    it('compresses monotonically — brotli no larger than gzip, gzip no larger than raw', () => {
        const impossible = everyMeasurement()
            .filter(({ of }) => of.brotli > of.gzip || of.gzip > of.raw)
            .map(({ where }) => where);
        expect(impossible).toEqual([]);
    });

    it('names a source for every file it counted', () => {
        const anonymous = everyMeasurement()
            .filter(
                ({ of }) => 'url' in of && (!of.url.trim() || !of.name.trim()),
            )
            .map(({ where }) => where);
        expect(anonymous).toEqual([]);
    });

    it('totals each session from the files that session fetched', () => {
        for (const viewer of viewers) {
            for (const session of viewer.sessions) {
                const where = `${viewer.id}/${session.kind}`;
                expect(session.files.length, where).toBeGreaterThan(0);
                for (const level of ['raw', 'gzip', 'brotli'] as const) {
                    const summed = session.files.reduce(
                        (total, file) => total + file[level],
                        0,
                    );
                    expect(session[level], `${where}/${level}`).toBe(summed);
                }
            }
        }
    });

    it('keeps a lazy artifact out of every session that did not fetch it', () => {
        for (const viewer of viewers) {
            const fetched = new Set(
                viewer.sessions.flatMap((s) => s.files.map((f) => f.url)),
            );
            for (const lazy of viewer.lazyArtifacts ?? []) {
                expect(fetched.has(lazy.url), `${viewer.id}/${lazy.name}`).toBe(
                    false,
                );
            }
        }
    });

    it('measures every lazy artifact the pinned list declares', () => {
        for (const competitor of COMPETITORS) {
            const viewer = viewers.find((v) => v.id === competitor.id);
            expect(
                viewer?.lazyArtifacts?.map((f) => f.name) ?? [],
                competitor.id,
            ).toEqual(
                (competitor.lazyArtifacts ?? []).map((path) =>
                    path.slice(path.lastIndexOf('/') + 1),
                ),
            );
        }
    });
});
