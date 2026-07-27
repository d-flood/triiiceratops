/**
 * Public-API guards (ticket 21), run by CI after a build:
 *
 *   1. No `any` in PUBLIC `.d.ts` output. Scans every package's reachable public
 *      declaration graph (see `api-report/dts.mjs`) for the `any` type token.
 *      Pre-existing, structural exceptions live in
 *      `api-reports/dts-any-allowlist.txt` (each with the untyped-IIIF /
 *      manifesto.js boundary rationale in the file header). A NEW, non-allowlisted
 *      `any` on any public declaration fails the build. Per ticket 21 these
 *      entries should migrate into ticket 22's `lint-allowlist.md` when it lands.
 *
 * Usage:
 *   node scripts/check-public-api.mjs                 # enforce (CI)
 *   node scripts/check-public-api.mjs --write-allowlist   # regenerate baseline
 *
 * Requires the packages' `dist` `.d.ts` to be built first (CI builds, then runs
 * this; `pnpm api:report` builds as a side effect too).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPublicAny } from './api-report/dts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const ALLOWLIST = resolve(REPO, 'api-reports', 'dts-any-allowlist.txt');

const PACKAGES = [
    { name: 'triiiceratops', dir: 'core' },
    { name: '@triiiceratops/plugin-sdk', dir: 'plugin-sdk' },
    {
        name: '@triiiceratops/plugin-image-manipulation',
        dir: 'plugin-image-manipulation',
    },
    {
        name: '@triiiceratops/plugin-image-download',
        dir: 'plugin-image-download',
    },
    { name: '@triiiceratops/plugin-pdf-export', dir: 'plugin-pdf-export' },
    {
        name: '@triiiceratops/plugin-annotation-editor',
        dir: 'plugin-annotation-editor',
    },
];

/** Normalized, stable key for one `any` occurrence. */
function keyFor(pkgName, hit) {
    return `${pkgName} :: ${hit.file} :: ${hit.line}`;
}

function collectHits() {
    const hits = [];
    for (const pkg of PACKAGES) {
        const dir = resolve(REPO, 'packages', pkg.dir);
        for (const hit of scanPublicAny(dir)) hits.push(keyFor(pkg.name, hit));
    }
    return [...new Set(hits)].sort();
}

const HEADER = `# Public-declaration \`any\` allowlist (ticket 21)
#
# Each line is a normalized \`any\`-bearing declaration line reachable from a
# package's public export entry points. These are PRE-EXISTING, STRUCTURAL
# exceptions: the viewer models fetched IIIF resources (manifest / canvas /
# annotation) as \`any\` because its \`manifesto.js\` boundary is untyped. They are
# a single documented boundary, not accidental leakage, so they are accounted for
# here rather than refactored (out of scope for ticket 21 — "snapshots record
# what exists"). The SDK ABI itself is \`any\`-clean.
#
# The gate (\`scripts/check-public-api.mjs\`) FAILS on any NEW public \`any\` not
# listed here, so a planted \`any\` on a public type is caught. This boundary is
# registered as a single sanctioned exception in \`lint-allowlist.md\` (section
# "IIIF resources crossing the manifesto.js boundary are \`any\`"): that entry
# carries the human-facing rationale / owner / review-date, and THIS file is the
# machine-readable line list the gate actually reads.
#
# Update protocol: adding or removing an entry here requires regenerating this
# file via \`node scripts/check-public-api.mjs --write-allowlist\` AND updating the
# \`lint-allowlist.md\` entry's rationale and date in the SAME commit. Regenerate
# ONLY after a reviewed, intentional change.
#
# Blank lines and \`#\` comments are ignored.
`;

function readAllowlist() {
    if (!existsSync(ALLOWLIST)) return new Set();
    return new Set(
        readFileSync(ALLOWLIST, 'utf8')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#')),
    );
}

function main() {
    const hits = collectHits();

    if (process.argv.includes('--write-allowlist')) {
        writeFileSync(ALLOWLIST, HEADER + '\n' + hits.join('\n') + '\n');
        console.log(`Wrote ${hits.length} allowlisted entries to ${ALLOWLIST}`);
        return;
    }

    const allowed = readAllowlist();
    const violations = hits.filter((h) => !allowed.has(h));
    const stale = [...allowed].filter((a) => !hits.includes(a));

    if (stale.length) {
        console.warn(
            `\n[check-public-api] ${stale.length} stale allowlist entr${stale.length === 1 ? 'y' : 'ies'} (no longer present — safe to prune):`,
        );
        for (const s of stale) console.warn(`  - ${s}`);
    }

    if (violations.length) {
        console.error(
            `\n[check-public-api] ${violations.length} NEW \`any\` in public .d.ts (not allowlisted):`,
        );
        for (const v of violations) console.error(`  ✗ ${v}`);
        console.error(
            `\nEliminate the \`any\` from the public declaration, or — if it is an` +
                ` intentional, reviewed exception — add it via` +
                ` \`node scripts/check-public-api.mjs --write-allowlist\`.`,
        );
        process.exit(1);
    }

    console.log(
        `[check-public-api] OK — ${hits.length} public \`any\` occurrence(s), all allowlisted; no new leakage.`,
    );
}

main();
