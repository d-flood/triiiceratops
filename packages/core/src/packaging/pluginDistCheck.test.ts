import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { RUNTIME_MARKER, checkPluginDist } from './pluginDistCheck';

const RUNTIME = `function e(){throw new Error("https://svelte.dev/e/${RUNTIME_MARKER}")}`;
const CLEAN = {
    'index.js': `${RUNTIME}export const a=1;`,
    'iife.js': `(function(){${RUNTIME}})();`,
    'svelte/index.js':
        'import{mount as m}from"svelte";import*as $ from"svelte/internal/client";export{m};',
};

let packageDir: string;

function writeDist(files: Record<string, string>): void {
    for (const [name, text] of Object.entries(files)) {
        const path = join(packageDir, 'dist', name);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
    }
}

beforeEach(() => {
    packageDir = mkdtempSync(join(tmpdir(), 'plugin-dist-'));
});

afterEach(() => {
    rmSync(packageDir, { recursive: true, force: true });
});

describe('checkPluginDist', () => {
    it('passes a bundled default build beside an importing svelte build', () => {
        writeDist(CLEAN);
        expect(checkPluginDist(packageDir)).toEqual([]);
    });

    it('fails a svelte build that bundles the runtime', () => {
        writeDist({
            ...CLEAN,
            'svelte/index.js': `${RUNTIME}export const a=1;`,
        });
        expect(checkPluginDist(packageDir)).toEqual([
            'svelte/index.js bundles the Svelte runtime',
            'the svelte/ build imports no svelte module',
        ]);
    });

    it('fails a default build that imports svelte/internal', () => {
        writeDist({
            ...CLEAN,
            'chunks/a.js': 'import*as $ from "svelte/internal/client";',
            'iife.js': `${RUNTIME}import("svelte/internal")`,
        });
        expect(checkPluginDist(packageDir)).toEqual([
            'chunks/a.js imports svelte/internal',
            'iife.js imports svelte/internal',
        ]);
    });

    it('fails when the marker is gone from the default builds', () => {
        writeDist({ ...CLEAN, 'index.js': 'export const a=1;', 'iife.js': '' });
        expect(checkPluginDist(packageDir)).toEqual([
            `no default build contains the runtime marker \`${RUNTIME_MARKER}\`; Svelte renamed it, so pick a new one`,
        ]);
    });

    it('fails when there is no svelte build', () => {
        writeDist({ 'index.js': CLEAN['index.js'] });
        expect(checkPluginDist(packageDir)).toEqual([
            'dist/svelte holds no build',
        ]);
    });
});
