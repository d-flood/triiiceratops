/**
 * The framework consumer examples' placement into the site's build output.
 *
 * The load-bearing invariant is the plain-HTML example's `../../dist/…` script
 * tag: it is a no-build page, so that relative reference is the only thing
 * pinning where the release bundles are published. It resolves only if the
 * examples' own two-directory layout is placed at the root of the tree, which is
 * why the placement is checked rather than assumed.
 */

import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const SCRIPT = fileURLToPath(
    new URL('../../scripts/place-examples.mjs', import.meta.url),
);

const PLAIN_HTML = readFileSync(
    join(REPO_ROOT, 'apps/examples/src/plain-html/index.html'),
    'utf8',
);

const scratches: string[] = [];

function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'examples-placement-'));
    scratches.push(dir);
    return dir;
}

function write(path: string, contents: string) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
}

/** The shape `apps/examples` builds: the pages beside the release bundles. */
function examplesOutput({ bundles = true } = {}): string {
    const dir = scratch();
    write(join(dir, 'examples/plain-html/index.html'), PLAIN_HTML);
    write(join(dir, 'examples/plain-html/app.css'), 'body { margin: 0 }');
    write(
        join(dir, 'examples/svelte/index.html'),
        '<!doctype html><title>Svelte</title>',
    );
    if (bundles) {
        write(
            join(dir, 'dist/triiiceratops-element.iife.js'),
            'globalThis.Triiiceratops = {};',
        );
    }
    return dir;
}

function place(examples: string, build: string) {
    return spawnSync(
        process.execPath,
        [SCRIPT, '--examples', examples, '--build', build],
        {
            encoding: 'utf8',
        },
    );
}

afterEach(() => {
    for (const dir of scratches.splice(0))
        rmSync(dir, { recursive: true, force: true });
});

describe('placing the consumer examples in the site build', () => {
    it('carries the pages and the release bundles into the build output', () => {
        const build = scratch();

        const result = place(examplesOutput(), build);

        expect(result.status, result.stderr).toBe(0);
        expect(existsSync(join(build, 'examples/plain-html/index.html'))).toBe(
            true,
        );
        expect(existsSync(join(build, 'examples/plain-html/app.css'))).toBe(
            true,
        );
        expect(existsSync(join(build, 'examples/svelte/index.html'))).toBe(
            true,
        );
        expect(
            existsSync(join(build, 'dist/triiiceratops-element.iife.js')),
        ).toBe(true);
    });

    it('replaces a previous placement rather than merging with it', () => {
        const build = scratch();
        write(join(build, 'examples/plain-html/stale.html'), 'gone');

        const result = place(examplesOutput(), build);

        expect(result.status, result.stderr).toBe(0);
        expect(existsSync(join(build, 'examples/plain-html/stale.html'))).toBe(
            false,
        );
    });

    it('leaves the rest of the build output alone', () => {
        const build = scratch();
        write(join(build, 'index.html'), '<!doctype html><title>Site</title>');

        const result = place(examplesOutput(), build);

        expect(result.status, result.stderr).toBe(0);
        expect(existsSync(join(build, 'index.html'))).toBe(true);
    });

    it('fails when a placed page references a bundle the tree does not hold', () => {
        const build = scratch();

        const result = place(examplesOutput({ bundles: false }), build);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('examples/plain-html/index.html');
        expect(result.stderr).toContain(
            '../../dist/triiiceratops-element.iife.js',
        );
    });

    it('fails when the examples have not been built, naming the build that produces them', () => {
        const build = scratch();
        const absent = join(scratch(), 'dist');

        const result = place(absent, build);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('pnpm build:examples');
    });
});
