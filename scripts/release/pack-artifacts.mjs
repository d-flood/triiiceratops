#!/usr/bin/env node
// Build + pack every publishable package into one artifact directory with SHA256SUMS.

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

/** name -> version for every workspace package. */
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

/** Rewrites `workspace:` ranges to real semver. */
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

/** `npm pack` into `outDir`; restores package.json afterwards. */
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

/** Extract `package/package.json` out of a packed `.tgz`. */
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

/** Guard: a packed tarball must carry no residual `workspace:` protocol. */
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

    // SHA256SUMS in `sha256sum -c` format; release-manifest.json maps what to publish.
    const sums =
        summary.map((s) => `${s.sha256}  ${s.tarball}`).join('\n') + '\n';
    writeFileSync(join(outDir, 'SHA256SUMS'), sums);

    // release-manifest.json: what the publish + smoke jobs consume.
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

    // Exactly one tarball per publishable package.
    const tgz = readdirSync(outDir).filter((f) => f.endsWith('.tgz'));
    if (tgz.length !== PUBLISHABLE_PACKAGES.length) {
        throw new Error(
            `expected ${PUBLISHABLE_PACKAGES.length} tarballs, found ${tgz.length}: ${tgz.join(', ')}`,
        );
    }
}

main();
