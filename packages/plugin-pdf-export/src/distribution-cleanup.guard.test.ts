/// <reference types="vite/client" />
// No bare console in `src/`; allowed only with `triiiceratops-console-allow`.

import { describe, expect, it } from 'vitest';

const ALLOW_MARKER = 'triiiceratops-console-allow';

const CONSOLE_CALL =
    /console\.(log|warn|error|debug|info|trace|group|table|dir|count|assert)\s*\(/;

const sources = import.meta.glob('./**/*.{ts,svelte}', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

function isTestFile(path: string): boolean {
    return /\.(test|spec)\.(ts|svelte)$/.test(path);
}

function lineIsAllowed(lines: string[], index: number): boolean {
    // The marker may sit on the call line or in the immediately-preceding
    // comment block (up to 4 lines above).
    for (let i = index; i >= Math.max(0, index - 4); i--) {
        if (lines[i]?.includes(ALLOW_MARKER)) return true;
    }
    return false;
}

describe('plugin distribution cleanup guard', () => {
    const files = Object.keys(sources).filter((path) => !isTestFile(path));

    it('scans this package source tree', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it('has no bare console call in shipped plugin source', () => {
        const offenders: string[] = [];
        for (const path of files) {
            const lines = (sources[path] ?? '').split('\n');
            lines.forEach((line, i) => {
                if (CONSOLE_CALL.test(line) && !lineIsAllowed(lines, i)) {
                    offenders.push(`${path}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders, offenders.join('\n')).toEqual([]);
    });
});
