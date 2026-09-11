/**
 * The development server's source resolution, tested against the real
 * `exports` maps in the workspace.
 *
 * The point of deriving the aliases rather than writing them down is that a new
 * package or a new export subpath cannot silently keep resolving to a stale
 * `dist/`. A fixture would defeat that: these assertions read the same
 * package.json files the dev server reads, so a subpath that stops mapping to
 * source fails here.
 */

import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { workspaceSourceAliases } from '../../scripts/workspace-source-aliases.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const aliases = workspaceSourceAliases(REPO_ROOT);

/** The source file a specifier resolves to, or undefined for no alias. */
function resolved(specifier: string): string | undefined {
    const hit = aliases.find((alias) => alias.find.test(specifier));
    return hit && relative(REPO_ROOT, hit.replacement);
}

describe('the derived source aliases', () => {
    it('maps the viewer core, every subpath and its nested ones', () => {
        expect(resolved('triiiceratops')).toBe(
            'packages/core/src/lib/index.ts',
        );
        expect(resolved('triiiceratops/svelte')).toBe(
            'packages/core/src/lib/svelte.ts',
        );
        expect(resolved('triiiceratops/selectors')).toBe(
            'packages/core/src/lib/state/selectors/index.ts',
        );
        expect(resolved('triiiceratops/testing')).toBe(
            'packages/core/src/lib/testing/index.ts',
        );
    });

    it('maps a package whose source is flat rather than under src/lib', () => {
        expect(resolved('@triiiceratops/plugin-av')).toBe(
            'packages/plugin-av/src/index.ts',
        );
        expect(resolved('@triiiceratops/plugin-av/iife')).toBe(
            'packages/plugin-av/src/iife.ts',
        );
        expect(resolved('@triiiceratops/plugin-sdk/register')).toBe(
            'packages/plugin-sdk/src/register.ts',
        );
    });

    it('leaves a published dependency to resolve from node_modules', () => {
        expect(resolved('uncial')).toBeUndefined();
        expect(resolved('uncial/styles')).toBeUndefined();
        expect(resolved('uncial-cms/sveltekit')).toBeUndefined();
    });

    it('leaves a package whose exports already name source alone', () => {
        expect(resolved('@triiiceratops/config')).toBeUndefined();
        expect(resolved('@triiiceratops/shell')).toBeUndefined();
    });

    it('matches a specifier exactly, never as a prefix', () => {
        // `triiiceratops` aliased as a bare prefix would claim every subpath
        // under it, so `triiiceratops/element` would resolve to a path inside
        // the core entry module.
        expect(resolved('triiiceratops/element')).toBeUndefined();
        expect(resolved('triiiceratops/no-such-subpath')).toBeUndefined();
    });

    it('points every alias at a file that exists', () => {
        const missing = aliases
            .map((alias) => alias.replacement)
            .filter((path) => !existsSync(path));
        expect(missing).toEqual([]);
    });
});
