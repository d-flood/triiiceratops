#!/usr/bin/env node
// Release-reproducibility gate (required CI).
//
// Two independent clean builds of the SAME source tree must produce byte-identical
// tarballs for all six publishable packages. This proves publication can safely
// PROMOTE the artifacts required CI verified instead of rebuilding: a rebuild at
// publish time would land on the same bytes anyway.
//
// Method: clean every package `dist/`, build + pack into dir A; clean again,
// build + pack into dir B; compare the two `SHA256SUMS`. Both output dirs are
// temporary and `dist/` is gitignored, so the working tree is untouched.
//
// Excluded variable metadata: NONE. `npm pack` normalises file mtimes to a fixed
// epoch, sorts archive entries, and zeroes the gzip header mtime/OS bytes, so the
// whole `.tgz` is compared — there is no timestamp or environment byte to mask.
// If this ever regresses (e.g. a build embeds a build date), fix the build to be
// deterministic rather than adding an exclusion here.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISHABLE_PACKAGES, REPO_ROOT } from './packages.mjs';

const PACK_SCRIPT = fileURLToPath(
    new URL('./pack-artifacts.mjs', import.meta.url),
);

function run(cmd, args, opts = {}) {
    const res = spawnSync(cmd, args, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        ...opts,
    });
    if (res.status !== 0)
        throw new Error(`${cmd} ${args.join(' ')} exited ${res.status}`);
}

function cleanDist() {
    for (const pkg of PUBLISHABLE_PACKAGES) {
        rmSync(join(REPO_ROOT, 'packages', pkg.dir, 'dist'), {
            recursive: true,
            force: true,
        });
    }
}

/** Clean, build, and pack into a fresh temp dir; return { dir, sums }. */
function buildAndPack(label) {
    console.log(
        `\n=== reproducibility build ${label}: clean + build + pack ===`,
    );
    cleanDist();
    const dir = mkdtempSync(join(tmpdir(), `tri-repro-${label}-`));
    run('node', [PACK_SCRIPT, '--out', dir]);
    const sums = readFileSync(join(dir, 'SHA256SUMS'), 'utf8').trim();
    return { dir, sums };
}

function main() {
    const a = buildAndPack('A');
    const b = buildAndPack('B');

    console.log('\n=== reproducibility: comparing checksums ===');
    console.log('build A:\n' + a.sums);
    console.log('build B:\n' + b.sums);

    // Compare as sorted { tarball -> sha } maps so ordering can't cause a false
    // mismatch (pack order is fixed, but be defensive).
    const parse = (sums) =>
        Object.fromEntries(
            sums.split('\n').map((line) => {
                const [sha, file] = line.trim().split(/\s+/);
                return [file, sha];
            }),
        );
    const mapA = parse(a.sums);
    const mapB = parse(b.sums);

    const mismatches = [];
    const files = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
    for (const file of files) {
        if (mapA[file] !== mapB[file]) {
            mismatches.push(
                `${file}: A=${mapA[file] ?? 'MISSING'} B=${mapB[file] ?? 'MISSING'}`,
            );
        }
    }

    rmSync(a.dir, { recursive: true, force: true });
    rmSync(b.dir, { recursive: true, force: true });

    if (mismatches.length) {
        console.error('\n::error::release artifacts are NOT reproducible:');
        for (const m of mismatches) console.error(`  ${m}`);
        process.exit(1);
    }

    console.log(
        `\nAll ${files.size} tarballs are byte-identical across two clean builds. ` +
            'Release artifacts are reproducible (no excluded metadata).',
    );
}

main();
