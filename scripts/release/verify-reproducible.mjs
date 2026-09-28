#!/usr/bin/env node
// Two clean builds of the same tree must yield byte-identical tarballs.

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

/** Clean, build, and pack into a fresh temp dir. */
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

    // Compare as maps so ordering cannot false-mismatch.
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
