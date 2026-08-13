/// <reference types="vite/client" />
// Plugin distribution-cleanup regression guard.
//
// Extends the core guard (`packages/core/src/lib/logging/distribution-cleanup
// .guard.test.ts`) to the extracted plugin packages: production distributions
// are quiet by default. NO bare console call may appear in this package's
// `src/` — diagnostics are dropped or routed through the debug-gated logger,
// and actionable failures surface on the structured `pluginerror` / plugin
// error channels (user stories 12–13).
//
// A console call is allowed ONLY when it carries the documented
// `triiiceratops-console-allow` marker on the call line or in the few comment
// lines directly above it (a last-resort fallback with no structured channel).
// Every marked site is recorded in `lint-allowlist.md`.
//
// The scan reads the package's own source via Vite's `import.meta.glob` (raw),
// so it needs no Node type-roots and runs identically under svelte-check and
// vitest. To verify the guard once: add a bare console call to any scanned file
// in this package's `src/`, run this test, watch it fail, then remove it.

import { describe, expect, it } from 'vitest';

const ALLOW_MARKER = 'triiiceratops-console-allow';

const CONSOLE_CALL =
    /console\.(log|warn|error|debug|info|trace|group|table|dir|count|assert)\s*\(/;

// Eagerly load every `.ts`/`.svelte` source in this package's `src/` as raw
// text. Keys are paths relative to this file's directory.
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

describe('plugin distribution cleanup guard (ticket 28)', () => {
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
