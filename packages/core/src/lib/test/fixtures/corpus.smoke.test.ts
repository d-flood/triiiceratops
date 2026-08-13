import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { manifestsState } from '../../state/manifests.svelte';
import { ViewerState } from '../../state/viewer.svelte';
import { isCollection, parseCollection } from '../../utils/collections';
import { parseStructures, type StructureNode } from '../../utils/structures';
import { syntheticManifestCorpus } from './syntheticManifests';

/**
 * Corpus smoke test for the manifest parser.
 *
 * Loads EVERY fixture in the corpus through the real seam a consumer uses —
 * `ViewerState.setManifestData`, backed by the real manifest cache, no mocks —
 * and asserts the three things a parser regression is most likely to cause:
 *
 * 1. registration does not throw,
 * 2. canvas enumeration returns an array,
 * 3. that array is non-empty, unless the fixture is named in
 *    {@link EXPECTED_EMPTY} or {@link KNOWN_UNSUPPORTED} with a reason.
 *
 * (3) is the load-bearing one. The dominant failure mode of replacing a parser
 * is the silent empty result: the viewer renders a blank page and logs at debug
 * level. A corpus that merely "does not throw" would not catch it, which is why
 * the empty cases are an explicit allowlist rather than a tolerance — and why a
 * fixture on that list that STARTS enumerating also fails, rather than drifting
 * off the list unnoticed.
 *
 * Fixtures are discovered from disk, so adding a `.json` file under
 * `./manifests/` puts it under test with no edit here.
 *
 * They are read with `fs` rather than `import.meta.glob` on purpose. The glob
 * would make Vite transform 59 JSON files into ES modules on every cold run —
 * seconds of transform for data that is never bundled — and it hands back a
 * PARSED object shared across the module graph, which registration then mutates
 * (the library writes `__jsonld` / `__collection` back-references onto whatever
 * JSON it is given). Reading and parsing here keeps each fixture private to this
 * file, and gives the weight check the raw source to measure.
 */

const CORPUS_DIR = join(import.meta.dirname, 'manifests');

/**
 * Every `.json` under `./manifests/`, as a corpus-relative path.
 *
 * The whole tree, with nothing skipped. `av/` — the Cookbook's audiovisual
 * recipes and one waveform-linked Avalon manifest — was held out of both this
 * file and the behavioral baseline by a `DEFERRED_DIRS` set while it was
 * vendored ahead of the body classifier that reads it; admitting it earlier
 * would have frozen the answer sixteen time-based manifests got from a viewer
 * that could not read them. `plugin-av` ticket 02 landed the classifier and
 * deleted the skip.
 */
function corpusPaths(dir = CORPUS_DIR, prefix = ''): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) => {
            const name = `${prefix}${entry.name}`;
            if (entry.isDirectory()) {
                return corpusPaths(join(dir, entry.name), `${name}/`);
            }
            return entry.name.endsWith('.json') ? [name] : [];
        })
        .sort((a, b) => a.localeCompare(b));
}

const corpusSource = Object.fromEntries(
    corpusPaths().map((path) => [
        path,
        readFileSync(join(CORPUS_DIR, path), 'utf8'),
    ]),
);

/**
 * Fixtures that correctly enumerate zero canvases and always will. Every entry
 * carries its reason; "renders nothing" is never silently acceptable.
 */
const EXPECTED_EMPTY: Record<string, string> = {
    'vendored/empty-collection.json':
        'a IIIF Collection declaring no members at all — the degradation case',
};

/**
 * Fixtures the CURRENT parser cannot read, kept precisely so a later fix can
 * be shown to fix them. A standing debt, not a correct result.
 *
 * When a fix makes one of these enumerate, delete its entry — the assertion
 * below insists on it rather than letting the list rot.
 */
const KNOWN_UNSUPPORTED: Record<string, string> = {
    // `synthetic/v2 sequences as a bare object` lived here until the parser was
    // fixed. `manifesto.js` read `sequences` with an indexed loop, so a bare object
    // yielded length `undefined` and enumerated to nothing, silently. The
    // first-party enumerator guards array access (SPEC, "Failure contract") and
    // the fixture now enumerates its 2 canvases, asserted like any other.
};

const ALLOWED_EMPTY: Record<string, string> = {
    ...EXPECTED_EMPTY,
    ...KNOWN_UNSUPPORTED,
};

interface Fixture {
    /** Test case name — the fixture's path in the corpus, or `synthetic/<case>`. */
    name: string;
    /** Manifest id it is registered under. */
    id: string;
    json: any;
    /** True for IIIF Collections, which have members rather than canvases. */
    isCollection: boolean;
}

const vendored: Fixture[] = Object.entries(corpusSource).map(
    ([path, source]) => {
        const json = JSON.parse(source);
        return {
            name: path,
            id:
                json?.id ||
                json?.['@id'] ||
                `http://example.org/corpus/${path}`,
            json,
            isCollection: isCollection(json),
        };
    },
);

const synthetic: Fixture[] = syntheticManifestCorpus.map((fixture) => ({
    name: `synthetic/${fixture.name}`,
    id: fixture.id,
    json: fixture.json,
    isCollection: false,
}));

const fixtures = [...vendored, ...synthetic];
const manifestFixtures = fixtures.filter((fixture) => !fixture.isCollection);
const collectionFixtures = fixtures.filter((fixture) => fixture.isCollection);

const canvasIdOf = (canvas: any): string | undefined =>
    canvas?.id ?? canvas?.['@id'] ?? canvas?.getCanvasId?.();

const asCase = (fixture: Fixture) => [fixture.name, fixture] as const;

describe('manifest corpus smoke test', () => {
    const registeredIds: string[] = [];

    afterEach(() => {
        for (const id of registeredIds.splice(0)) {
            manifestsState.clearManifest(id);
        }
    });

    it('discovered the corpus', () => {
        // Guards against a directory walk that silently finds nothing, which
        // would turn this whole file into a green no-op. Floored per source
        // directory, not just in total: a single total would still pass with
        // the entire `vendored/` tree deleted, since the cookbook and demo
        // files alone clear any global floor.
        const paths = Object.keys(corpusSource);
        expect(paths.length).toBeGreaterThan(40);
        expect(
            paths.filter((p) => p.startsWith('cookbook/')).length,
        ).toBeGreaterThan(30);
        expect(
            paths.filter((p) => p.startsWith('vendored/')).length,
        ).toBeGreaterThan(10);
        expect(
            paths.filter((p) => p.startsWith('demo/')).length,
        ).toBeGreaterThan(4);
        // The audiovisual set, floored like the others. It replaces the
        // `DEFERRED_DIRS` guard that used to assert the skip still named
        // something: the directory is in the corpus now, so what has to be
        // asserted is that it is still being walked.
        expect(paths.filter((p) => p.startsWith('av/')).length).toBeGreaterThan(
            10,
        );
        expect(vendored.length).toBe(Object.keys(corpusSource).length);
        expect(syntheticManifestCorpus.length).toBeGreaterThan(0);
        expect(collectionFixtures.length).toBeGreaterThan(0);
    });

    it.each(manifestFixtures.map(asCase))(
        '%s registers and enumerates',
        async (name, fixture) => {
            const state = new ViewerState();
            registeredIds.push(fixture.id);

            // Registration is reached from a public method with no error
            // handling; a throw here leaves the viewer half-initialised.
            await state.setManifestData(fixture.id, fixture.json);

            const canvases = state.canvases;
            expect(Array.isArray(canvases)).toBe(true);
            expect(typeof state.sequenceCount).toBe('number');
            expect(state.sequenceCount).toBeGreaterThanOrEqual(0);

            const allowedEmptyReason = ALLOWED_EMPTY[name];
            if (allowedEmptyReason) {
                expect(
                    canvases.length,
                    `${name} is listed as enumerating nothing (${allowedEmptyReason}) but enumerated ${canvases.length} canvases — remove it from EXPECTED_EMPTY / KNOWN_UNSUPPORTED`,
                ).toBe(0);
                return;
            }

            expect(
                canvases.length,
                `${name} enumerated no canvases. Either the parser regressed, or this fixture belongs on EXPECTED_EMPTY / KNOWN_UNSUPPORTED with a reason.`,
            ).toBeGreaterThan(0);

            // A canvas nobody can identify is as useless as no canvas.
            expect(
                canvases.filter((canvas: any) => canvasIdOf(canvas)).length,
                `${name} enumerated ${canvases.length} canvases, none of which had an id`,
            ).toBe(canvases.length);

            // Canvases crossing the viewer boundary are RAW IIIF Canvas JSON —
            // v2 or v3 as the manifest authored it, with no library wrapper
            // and no accessors. Integrators and plugins are
            // told to read them with ordinary property access, so this holds
            // that contract across the whole corpus rather than on one fixture.
            for (const canvas of canvases as any[]) {
                expect(canvas.__jsonld, `${name}: canvas is wrapped`).toBe(
                    undefined,
                );
                for (const accessor of [
                    'getCanvasId',
                    'getImages',
                    'getContent',
                    'getWidth',
                    'getHeight',
                    'getLabel',
                    'getThumbnail',
                ]) {
                    expect(
                        typeof canvas[accessor],
                        `${name}: canvas still carries ${accessor}()`,
                    ).not.toBe('function');
                }
            }
        },
    );

    it.each(collectionFixtures.map(asCase))(
        '%s registers and enumerates its members',
        async (name, fixture) => {
            // A Collection is not a manifest: it has members, and the viewer
            // resolves one to a child manifest before there is anything to
            // enumerate.
            //
            // This does NOT enter through `ViewerState.setManifest`, which is
            // the real collection path — that path fetches the child manifest,
            // and driving it offline would need a fetch seam this file does not
            // have. `parseCollection` is the one line lifted out of it, so this
            // asserts a parsing internal rather than viewer behaviour, against
            // the SPEC's usual rule. Narrower than the manifest cases above:
            // `registerManifest` is still real, but `sortCollectionItems`,
            // `collectionItems`, and auto-loading the first member are not
            // covered here.
            registeredIds.push(fixture.id);
            await manifestsState.registerManifest(fixture.id, fixture.json);

            const members = parseCollection(fixture.json);
            expect(Array.isArray(members)).toBe(true);

            const allowedEmptyReason = ALLOWED_EMPTY[name];
            if (allowedEmptyReason) {
                expect(
                    members.length,
                    `${name} is listed as enumerating nothing (${allowedEmptyReason}) but enumerated ${members.length} members`,
                ).toBe(0);
                return;
            }

            expect(
                members.length,
                `${name} is a Collection that enumerated no members.`,
            ).toBeGreaterThan(0);
        },
    );

    it.each(collectionFixtures.map(asCase))(
        '%s degrades rather than crashing when enumerated as a manifest',
        async (_name, collection) => {
            // This asserted the opposite before the parser was fixed:
            // `getCanvases` called `getSequences()` on whatever the library
            // parsed, and a Collection has no such method, so the manifest
            // path threw a TypeError rather than returning an empty array —
            // a direct violation of the failure contract ("every enumerator
            // is total: it never throws and always returns an array").
            //
            // A v3 Collection's `items` are its member *Manifests*, so "total"
            // here means empty rather than a canvas list: enumerating those
            // members as canvases would be the same defect wearing a green
            // test.
            registeredIds.push(collection.id);
            await manifestsState.registerManifest(
                collection.id,
                collection.json,
            );

            expect(manifestsState.getCanvases(collection.id)).toEqual([]);
            expect(manifestsState.getSequenceCount(collection.id)).toBe(0);
        },
    );

    it('parses a v2 range written in all three content spellings', async () => {
        // Not a behaviour assertion — a fixture assertion. The three-spelling
        // fixture is worthless if it is subtly malformed, and nothing else in
        // the corpus would notice.
        const fixture = synthetic.find((f) =>
            f.name.includes('v2 ranges'),
        ) as Fixture;
        registeredIds.push(fixture.id);
        await manifestsState.registerManifest(fixture.id, fixture.json);

        const flatten = (nodes: StructureNode[]): StructureNode[] =>
            nodes.flatMap((node) => [node, ...flatten(node.children)]);
        const canvasIds = new Set(
            flatten(parseStructures(fixture.json)).flatMap(
                (node) => node.canvasIds,
            ),
        );

        // canvas/1 is reached via `canvases`, canvas/2 via `members`,
        // canvas/3 via a `ranges` string reference, canvas/4 via an embedded
        // `ranges` object.
        for (const n of [1, 2, 3, 4]) {
            expect(
                canvasIds.has(
                    `http://example.org/synthetic/v2-ranges-all-spellings/canvas/${n}`,
                ),
                `canvas/${n} was not reached through the range tree`,
            ).toBe(true);
        }
    });

    it('enumerates both sequences of the multi-sequence v2 fixture', async () => {
        const fixture = synthetic.find((f) =>
            f.name.includes('two sequences'),
        ) as Fixture;
        const state = new ViewerState();
        registeredIds.push(fixture.id);
        await state.setManifestData(fixture.id, fixture.json);

        expect(state.sequenceCount).toBe(2);
        expect(state.canvases.length).toBe(3);
        state.selectedSequenceIndex = 1;
        expect(state.canvases.length).toBe(2);
    });

    it('names every allowed-empty entry against a fixture that exists', () => {
        // A stale key silently exempts nothing while looking like it exempts
        // something.
        const known = new Set(fixtures.map((fixture) => fixture.name));
        for (const key of Object.keys(ALLOWED_EMPTY)) {
            expect(known.has(key), `${key} matches no fixture`).toBe(true);
        }
    });

    it('keeps every vendored fixture trimmed', () => {
        // The 2 MB corpus budget is checked by `du -sh` separately; what a
        // test usefully holds is that nobody drops an untrimmed manifest in.
        // The largest fixture today is `demo/zavicajna-digitalna-manifest.json`
        // — a 244 KB, 109-canvas institutional manifest, deliberately kept
        // whole and recorded in PROVENANCE.md. (`production/` is empty until
        // the deployment URLs are supplied; see its README.)
        //
        // Measured in bytes rather than `String.length`, which counts UTF-16
        // code units — the Arabic and Swedish fixtures differ between the two.
        const bytesOf = (source: string) => Buffer.byteLength(source, 'utf8');

        for (const [path, source] of Object.entries(corpusSource)) {
            expect(
                bytesOf(source),
                `${path} is ${Math.round(bytesOf(source) / 1024)} KB — trim it, or record in PROVENANCE.md why it is kept whole`,
            ).toBeLessThan(300_000);
        }

        const total = Object.values(corpusSource).reduce(
            (sum, source) => sum + bytesOf(source),
            0,
        );
        expect(
            total,
            `the vendored corpus is ${Math.round(total / 1024)} KB, over its 2 MB budget`,
        ).toBeLessThan(2_000_000);
    });
});
