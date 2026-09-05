/**
 * The committed content-state fixtures, their provenance and their expected view
 * targets, read from `content-state/index.json`.
 *
 * `scripts/docs-content-state.mjs` generates the published conformance table
 * from that same index, so the documented claim and the tests cannot disagree.
 * The index is JSON rather than TypeScript precisely so a plain `.mjs` script
 * can read it with no build step.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ContentStateTarget } from '../../utils/contentState';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'content-state');

/**
 * How a fixture file becomes the string a caller hands `parseContentState`:
 * `raw` is passed verbatim (a bare URI, or an already-encoded value), `json` is
 * the plain JSON document, `base64url` is that document encoded the way the
 * `iiif-content` parameter delivers it.
 */
export type ContentStateEncoding = 'raw' | 'json' | 'base64url';

export type ContentStateFixture = {
    id: string;
    file: string;
    encoding: ContentStateEncoding;
    /** The resolution-table row this fixture pins. */
    row: string;
    form: string;
    resolvesVia: string;
    source: string;
    /** Cookbook recipe the shape was constructed over, where there is one. */
    recipe: string | null;
    capturedAt: string;
    /** Substring of the dev-mode warning this fixture must provoke, if any. */
    warns?: string;
    expected: ContentStateTarget | null;
    /** The value a caller would hand `parseContentState`. */
    input: string;
};

type FixtureIndex = {
    capturedAt: string;
    fixtures: Omit<ContentStateFixture, 'input'>[];
};

/**
 * The rows of the resolution table in the ADR 0006 specification. Every one must
 * be pinned by at least one fixture; the test suite asserts that.
 */
export const RESOLUTION_TABLE_ROWS = [
    'bare-uri',
    'encoded-annotation',
    'target-string',
    'target-object',
    'partof-array',
    'target-array',
] as const;

function base64url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url').replace(/=+$/, '');
}

function load(): ContentStateFixture[] {
    const index = JSON.parse(
        readFileSync(join(DIR, 'index.json'), 'utf8'),
    ) as FixtureIndex;

    return index.fixtures.map((fixture) => {
        const text = readFileSync(join(DIR, fixture.file), 'utf8').trim();
        return {
            ...fixture,
            input: fixture.encoding === 'base64url' ? base64url(text) : text,
        };
    });
}

export const contentStateFixtures: ContentStateFixture[] = load();
