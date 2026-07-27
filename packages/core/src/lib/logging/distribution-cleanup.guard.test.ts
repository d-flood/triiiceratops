// Distribution-cleanup regression guard (ticket 18).
//
// The published Svelte source must stay bundler-neutral and quiet:
//   1. ZERO `import.meta.env` in `src/lib` — a consumer bundler without a
//      Vite-style `define` must be able to compile the source (user story 4).
//   2. NO bare `console.*` in `src/lib` outside the sanctioned logger module —
//      production distributions are quiet by default; diagnostics route through
//      the debug-gated logger and actionable failures through the structured
//      `viewererror`/`pluginerror` channels (user stories 12–13).
//
// This test fails if either pattern reappears. It replaces a bundler-specific
// lint rule so the guarantee holds regardless of the consumer's toolchain.
//
// To verify the guard once (per the ticket): add `console.log('x')` to any
// scanned file (e.g. `state/viewer.svelte.ts`) or an `import.meta.env.DEV`
// reference, run this test, watch it fail, then remove it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

// This file lives at `src/lib/logging/`; the lib root is two levels up.
const LIB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Files/dirs excluded from the bare-`console.*` scan, each with a reason:
 * - the logger module is the ONE sanctioned console sink;
 * - `plugins/` is owned by the plugin migration tickets (extracted to their own
 *   packages, cleaned there);
 * - `browser-runtime.ts` is ticket 10's page-level namespace, which reports a
 *   structured first-wins conflict before any viewer/config exists;
 * - test and demo-only files are not shipped production source.
 */
const CONSOLE_EXCLUDED = [
    'logging/logger.ts',
    'browser-runtime.ts',
    'components/DemoHeader.svelte',
];

// `import.meta.env` is banned everywhere in shipped source; only demo-only files
// (pruned from the tarball) may use it.
const IMPORT_META_ENV_EXCLUDED = ['components/DemoHeader.svelte'];

// A narrow, documented allow marker for a bare console call that must remain
// (e.g. a last-resort isolation fallback with no structured channel). The marker
// must appear on the console line or in the preceding few comment lines.
const ALLOW_MARKER = 'triiiceratops-console-allow';

const CONSOLE_CALL =
    /console\.(log|warn|error|debug|info|trace|group|table|dir|count|assert)\s*\(/;
const IMPORT_META_ENV = /import\.meta\.env/;

function collectSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules') continue;
            out.push(...collectSourceFiles(full));
            continue;
        }
        if (!/\.(ts|svelte)$/.test(entry)) continue;
        // Skip test/spec files — they legitimately assert on console behavior.
        if (/\.(test|spec)\.(ts|svelte)$/.test(entry)) continue;
        out.push(full);
    }
    return out;
}

function relPath(full: string): string {
    return relative(LIB_ROOT, full).split('\\').join('/');
}

function isConsoleExcluded(rel: string): boolean {
    return (
        CONSOLE_EXCLUDED.includes(rel) ||
        rel.startsWith('plugins/') ||
        rel.includes('/plugins/')
    );
}

function lineIsAllowed(lines: string[], index: number): boolean {
    // The marker may sit on the call line or in the immediately-preceding
    // comment block (up to 4 lines above).
    for (let i = index; i >= Math.max(0, index - 4); i--) {
        if (lines[i].includes(ALLOW_MARKER)) return true;
    }
    return false;
}

describe('core distribution cleanup guard (ticket 18)', () => {
    const files = collectSourceFiles(LIB_ROOT);

    it('scans a non-trivial number of lib source files', () => {
        // Sanity check the walker actually found the tree.
        expect(files.length).toBeGreaterThan(20);
    });

    it('has no `import.meta.env` in shipped lib source', () => {
        const offenders: string[] = [];
        for (const full of files) {
            const rel = relPath(full);
            if (IMPORT_META_ENV_EXCLUDED.includes(rel)) continue;
            const lines = readFileSync(full, 'utf8').split('\n');
            lines.forEach((line, i) => {
                if (IMPORT_META_ENV.test(line)) {
                    offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders, offenders.join('\n')).toEqual([]);
    });

    it('has no bare `console.*` in shipped lib source outside the logger', () => {
        const offenders: string[] = [];
        for (const full of files) {
            const rel = relPath(full);
            if (isConsoleExcluded(rel)) continue;
            const lines = readFileSync(full, 'utf8').split('\n');
            lines.forEach((line, i) => {
                if (CONSOLE_CALL.test(line) && !lineIsAllowed(lines, i)) {
                    offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
                }
            });
        }
        expect(offenders, offenders.join('\n')).toEqual([]);
    });
});
