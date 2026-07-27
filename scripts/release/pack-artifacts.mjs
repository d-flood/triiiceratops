#!/usr/bin/env node
// Build + pack the six publishable packages into a single artifact directory,
// then write a `SHA256SUMS` checksum manifest over the produced tarballs.
//
// This is the PRODUCER half of the promotion flow. Required CI runs it once per
// commit and uploads the output directory (six `.tgz` + `SHA256SUMS`) as a
// workflow artifact. The publish workflow later downloads that exact artifact,
// re-verifies the checksums, and runs `npm publish <tgz>` per package with NO
// build of its own — it promotes the bytes CI already verified.
//
// Determinism: `npm pack` normalises file mtimes to a fixed epoch, sorts entries,
// and zeroes the gzip header mtime/OS bytes, so a byte-identical `dist/` yields a
// byte-identical `.tgz`. There is therefore no variable metadata to exclude from
// the checksum (see verify-reproducible.mjs, which proves this across two clean
// builds of the same SHA).
//
// Usage:
//   node scripts/release/pack-artifacts.mjs --out <dir> [--no-build]
//     --out <dir>   destination for the tarballs + SHA256SUMS (required)
//     --no-build    skip the per-package build steps (dist must already exist)

import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
    PUBLISHABLE_PACKAGES,
    REPO_ROOT,
    distTagFor,
    readVersion,
} from './packages.mjs';

function parseArgs(argv) {
    const args = { build: true, out: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--out') args.out = argv[++i];
        else if (argv[i] === '--no-build') args.build = false;
        else throw new Error(`unknown argument: ${argv[i]}`);
    }
    if (!args.out) throw new Error('missing required --out <dir>');
    return args;
}

function run(cmd, cmdArgs, cwd) {
    const res = spawnSync(cmd, cmdArgs, { cwd, stdio: 'inherit' });
    if (res.status !== 0) {
        throw new Error(`${cmd} ${cmdArgs.join(' ')} exited ${res.status}`);
    }
}

/** `npm pack` into `outDir`; returns the produced tarball's absolute path. */
function packInto(pkgDir, outDir) {
    const res = spawnSync(
        'npm',
        ['pack', '--pack-destination', outDir, '--json'],
        { cwd: pkgDir, encoding: 'utf8' },
    );
    if (res.status !== 0) {
        process.stderr.write(res.stderr ?? '');
        throw new Error(`npm pack failed in ${pkgDir}`);
    }
    const parsed = JSON.parse(res.stdout);
    const filename = parsed[0].filename.replace(/^@/, '').replace(/\//, '-');
    return join(outDir, filename);
}

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const outDir = resolve(args.out);
    mkdirSync(outDir, { recursive: true });

    const summary = [];
    for (const pkg of PUBLISHABLE_PACKAGES) {
        const pkgDir = join(REPO_ROOT, 'packages', pkg.dir);
        if (args.build) {
            for (const script of pkg.build) {
                console.log(
                    `\n[pack] ${pkg.name}: pnpm --filter ${pkg.name} run ${script}`,
                );
                run('pnpm', ['--filter', pkg.name, 'run', script], REPO_ROOT);
            }
        }
        console.log(`[pack] ${pkg.name}: npm pack`);
        const tarball = packInto(pkgDir, outDir);
        if (!existsSync(tarball)) {
            throw new Error(`expected tarball not found: ${tarball}`);
        }
        const version = readVersion(pkg);
        summary.push({
            name: pkg.name,
            version,
            distTag: distTagFor(version),
            tarball: tarball.slice(outDir.length + 1),
            sha256: sha256(tarball),
        });
    }

    // SHA256SUMS: standard `sha256sum -c` format so the publish job can verify
    // integrity with a single `sha256sum -c SHA256SUMS`.
    const sums =
        summary.map((s) => `${s.sha256}  ${s.tarball}`).join('\n') + '\n';
    writeFileSync(join(outDir, 'SHA256SUMS'), sums);

    // release-manifest.json: machine-readable name/version/dist-tag/checksum map
    // the publish + smoke jobs consume (so they publish and install the EXACT
    // versions these tarballs carry).
    writeFileSync(
        join(outDir, 'release-manifest.json'),
        JSON.stringify({ packages: summary }, null, 2) + '\n',
    );

    console.log(
        `\n[pack] wrote ${summary.length} tarballs + SHA256SUMS to ${outDir}`,
    );
    for (const s of summary) {
        console.log(
            `  ${s.name}@${s.version} (${s.distTag})  ${s.sha256.slice(0, 12)}…  ${s.tarball}`,
        );
    }

    // Sanity: exactly the six expected tarballs, nothing stray.
    const tgz = readdirSync(outDir).filter((f) => f.endsWith('.tgz'));
    if (tgz.length !== PUBLISHABLE_PACKAGES.length) {
        throw new Error(
            `expected ${PUBLISHABLE_PACKAGES.length} tarballs, found ${tgz.length}: ${tgz.join(', ')}`,
        );
    }
}

main();
