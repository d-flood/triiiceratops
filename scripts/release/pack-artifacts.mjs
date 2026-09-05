#!/usr/bin/env node
// Build + pack every publishable package (`PUBLISHABLE_PACKAGES`, five today)
// into a single artifact directory, then write a `SHA256SUMS` checksum manifest
// over the produced tarballs.
//
// This is the PRODUCER half of the promotion flow. Required CI runs it once per
// commit and uploads the output directory (one `.tgz` per package + `SHA256SUMS`)
// as a workflow artifact. The publish workflow later downloads that exact
// artifact, re-verifies the checksums, and runs `npm publish <tgz>` per package
// with NO build of its own — it promotes the bytes CI already verified.
//
// Before packing, `workspace:*`/`^`/`~` protocol ranges (e.g. the peerDependency
// `triiiceratops: workspace:^`) are rewritten in-place to real semver ranges
// resolved from the other workspace packages' committed versions, then restored
// after `npm pack` runs. `npm pack` itself never does this rewrite — it packs
// `workspace:` strings verbatim, which aren't installable outside this monorepo
// and make the published tarball fail to resolve for consumers (npm auto-installs
// peer deps and errors with EUNSUPPORTEDPROTOCOL). `pnpm pack` does rewrite them,
// but its rewrite reorders dependency object keys nondeterministically between
// runs, which breaks the reproducibility gate below — so the rewrite is done here
// instead, preserving key order, and packing stays on `npm pack`.
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

/** name -> version for every workspace package (not just the publishable ones). */
function readWorkspaceVersions() {
    const versions = new Map();
    for (const dir of readdirSync(join(REPO_ROOT, 'packages'))) {
        const pkgPath = join(REPO_ROOT, 'packages', dir, 'package.json');
        if (!existsSync(pkgPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        versions.set(pkg.name, pkg.version);
    }
    return versions;
}

/** `workspace:*` -> exact version, `workspace:^`/`~` -> `^`/`~` + version. */
function resolveWorkspaceRange(range, version) {
    const protocol = range.slice('workspace:'.length);
    if (protocol === '*') return version;
    if (protocol === '^' || protocol === '~') return `${protocol}${version}`;
    return protocol; // an explicit workspace:<semver> range, used as-is
}

const DEPENDENCY_FIELDS = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
];

/** Rewrites `workspace:` ranges to real semver, resolved against `versions`. */
function rewriteWorkspaceRanges(pkgJson, versions) {
    for (const field of DEPENDENCY_FIELDS) {
        const deps = pkgJson[field];
        if (!deps) continue;
        for (const [name, range] of Object.entries(deps)) {
            if (typeof range !== 'string' || !range.startsWith('workspace:'))
                continue;
            const version = versions.get(name);
            if (!version)
                throw new Error(`workspace range for unknown package: ${name}`);
            deps[name] = resolveWorkspaceRange(range, version);
        }
    }
    return pkgJson;
}

/**
 * `npm pack` into `outDir`; returns the produced tarball's absolute path.
 *
 * Temporarily rewrites `pkgDir`'s package.json so `workspace:` ranges resolve
 * to real semver before packing, then restores the original file untouched.
 */
function packInto(pkgDir, outDir, versions) {
    const pkgJsonPath = join(pkgDir, 'package.json');
    const original = readFileSync(pkgJsonPath, 'utf8');
    const rewritten = rewriteWorkspaceRanges(JSON.parse(original), versions);
    writeFileSync(pkgJsonPath, JSON.stringify(rewritten, null, 4) + '\n');
    try {
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
        const filename = parsed[0].filename
            .replace(/^@/, '')
            .replace(/\//, '-');
        return join(outDir, filename);
    } finally {
        writeFileSync(pkgJsonPath, original);
    }
}

/** Extract and parse `package/package.json` out of a packed `.tgz`. */
function readTarballPackageJson(tarball) {
    const res = spawnSync('tar', ['xzOf', tarball, 'package/package.json'], {
        encoding: 'utf8',
    });
    if (res.status !== 0) {
        process.stderr.write(res.stderr ?? '');
        throw new Error(`could not read package.json from ${tarball}`);
    }
    return JSON.parse(res.stdout);
}

/**
 * Guard: a packed tarball must carry NO residual `workspace:` protocol in any
 * dependency field. `npm pack` copies `workspace:` strings verbatim (that's why
 * rewriteWorkspaceRanges runs above), so if that rewrite ever misses a field or
 * regresses, the published tarball crashes consumers with EUNSUPPORTEDPROTOCOL
 * the moment npm parses the peer spec.
 *
 * This inspects the ACTUAL shipped bytes (re-read from the `.tgz`), not just our
 * in-memory intent, so a regression fails the release pack in required CI —
 * where `pnpm release:pack` produces the promoted artifact — instead of reaching
 * npm, where a version is immutable. See the 1.0.0-rc.1 @triiiceratops/plugin-sdk
 * incident: it shipped `triiiceratops: workspace:^` from a pipeline that packed
 * with `npm pack` before any rewrite, and nothing asserted the npm-packed output
 * (the packed-consumer harness only ever checked `pnpm pack` tarballs, which
 * rewrite `workspace:` automatically).
 */
function assertNoWorkspaceProtocol(tarball, name) {
    const pkg = readTarballPackageJson(tarball);
    const leaks = [];
    for (const field of DEPENDENCY_FIELDS) {
        const deps = pkg[field];
        if (!deps) continue;
        for (const [dep, range] of Object.entries(deps)) {
            if (typeof range === 'string' && range.startsWith('workspace:')) {
                leaks.push(`${field}.${dep} = ${range}`);
            }
        }
    }
    if (leaks.length > 0) {
        throw new Error(
            `${name}: packed tarball contains residual workspace: protocol ` +
                `(${leaks.join(', ')}). The workspace-range rewrite failed to ` +
                `resolve these; publishing would crash consumers with ` +
                `EUNSUPPORTEDPROTOCOL.`,
        );
    }
}

function sha256(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const outDir = resolve(args.out);
    mkdirSync(outDir, { recursive: true });

    const versions = readWorkspaceVersions();
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
        const tarball = packInto(pkgDir, outDir, versions);
        if (!existsSync(tarball)) {
            throw new Error(`expected tarball not found: ${tarball}`);
        }
        assertNoWorkspaceProtocol(tarball, pkg.name);
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

    // Sanity: exactly one tarball per publishable package, nothing stray. The
    // count comes from PUBLISHABLE_PACKAGES so pausing/adding a package cannot
    // leave a stale literal behind — a package dropped from that list (e.g. the
    // paused annotation-editor plugin) must also vanish from this directory,
    // because whatever lands here is what publish.yml promotes to npm.
    const tgz = readdirSync(outDir).filter((f) => f.endsWith('.tgz'));
    if (tgz.length !== PUBLISHABLE_PACKAGES.length) {
        throw new Error(
            `expected ${PUBLISHABLE_PACKAGES.length} tarballs, found ${tgz.length}: ${tgz.join(', ')}`,
        );
    }
}

main();
