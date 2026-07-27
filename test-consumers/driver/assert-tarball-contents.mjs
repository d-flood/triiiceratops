// Tarball-level content contract (allowlist-oriented).
//
// SPEC "Package Contents And Metadata" / "Testing Decisions": published tarballs
// contain ONLY public entries, their transitive runtime/Svelte modules,
// declarations, CSS, IIFEs, intentional testing exports, README, LICENSE, and
// package metadata. Demo manifests, favicons, internal tests, fixtures, test
// hosts, demo-only components, build tooling, and throwaway entries are excluded.
//
// This inspects the ACTUAL packed `.tgz` (not `dist/`). A file passes only if it
// matches an ALLOW rule AND no REJECT rule — so an allowed extension (`.js`)
// living in a rejected location (`dist/test/…`, `__fixtures__`) still fails.

import { execFileSync } from 'node:child_process';

// Top-level files npm/pnpm may ship alongside `dist/` (always includes package
// metadata, license, and readme regardless of the `files` field).
const TOP_LEVEL_ALLOWED = new Set([
    'package.json',
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'LICENCE',
    'README',
    'README.md',
    'CHANGELOG.md',
]);

// Extensions permitted inside `dist/`: JS + Svelte source (core is
// source-distributed), TypeScript declarations, CSS, and source maps. Notably
// ABSENT: `.json` (would admit fixture manifests), `.ico`/images, `.html`.
const ALLOWED_DIST_SUFFIXES = [
    '.js',
    '.mjs',
    '.cjs',
    '.d.ts',
    '.d.mts',
    '.d.cts',
    '.css',
    '.svelte',
    '.map', // .js.map / .d.ts.map source maps
];

/** Path segments that mark a file as test/fixture/demo/tooling material. */
function isRejectedPath(rel) {
    const segments = rel.split('/');
    const base = segments[segments.length - 1];

    // *.test.* / *.spec.* (compiled or source)
    if (/\.(test|spec)\./.test(base)) return 'test/spec file';
    // Internal test-helper dir (but NOT the intentional `testing/` export).
    if (segments.includes('test')) return 'internal test dir';
    if (segments.includes('__tests__')) return 'test dir';
    if (segments.includes('__fixtures__')) return '__fixtures__';
    if (segments.includes('__mocks__')) return '__mocks__';
    // Demo dev-server static assets.
    if (segments.includes('demo-manifests')) return 'demo manifest fixture';
    if (segments.includes('e2e')) return 'e2e host';
    if (/favicon/i.test(base) || base.endsWith('.ico')) return 'favicon';
    // Test-host / demo-only components.
    if (/TestHost/.test(base)) return 'test-host component';
    // Build tooling.
    if (/^vite\.config\./.test(base) || /\.config\.(js|ts|mjs)$/.test(base))
        return 'build config';
    return null;
}

/** Does `rel` match an allow rule (correct location + permitted kind)? */
function isAllowedPath(rel) {
    if (!rel.includes('/')) return TOP_LEVEL_ALLOWED.has(rel);
    const [first] = rel.split('/');
    if (first !== 'dist') return false;
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    return ALLOWED_DIST_SUFFIXES.some((s) => base.endsWith(s));
}

/**
 * Classify one archive entry (path already stripped of the `package/` prefix).
 * Returns { ok, reason }.
 */
export function classifyEntry(rel) {
    const rejected = isRejectedPath(rel);
    if (rejected) return { ok: false, reason: `forbidden (${rejected})` };
    if (!isAllowedPath(rel)) return { ok: false, reason: 'unexpected file' };
    return { ok: true, reason: '' };
}

/**
 * Validate a list of archive entries (each prefixed with `package/`). Returns
 * { ok, problems: [{ entry, reason }], hasLicense, hasPackageJson }.
 */
export function validateEntries(entries) {
    const problems = [];
    let hasLicense = false;
    let hasPackageJson = false;
    for (const entry of entries) {
        if (!entry.startsWith('package/')) {
            problems.push({ entry, reason: 'outside package/ root' });
            continue;
        }
        const rel = entry.slice('package/'.length);
        if (rel === '') continue;
        if (/^LICEN[SC]E(\.(md|txt))?$/.test(rel)) hasLicense = true;
        if (rel === 'package.json') hasPackageJson = true;
        const { ok, reason } = classifyEntry(rel);
        if (!ok) problems.push({ entry: rel, reason });
    }
    return {
        ok: problems.length === 0 && hasLicense && hasPackageJson,
        problems,
        hasLicense,
        hasPackageJson,
    };
}

/** List the file entries inside a `.tgz` (directories filtered out). */
export function listTarball(tarballPath) {
    const out = execFileSync('tar', ['tzf', tarballPath], {
        encoding: 'utf8',
    });
    return out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.endsWith('/'));
}

/**
 * Assert a package tarball's contents against the allowlist. Returns
 * { ok, checks: [{ name, ok, detail }] }.
 */
export function assertTarballContents(tarballPath, pkgName) {
    const entries = listTarball(tarballPath);
    const { ok, problems, hasLicense, hasPackageJson } =
        validateEntries(entries);
    const checks = [];
    checks.push({
        name: `${pkgName}: only allowlisted files`,
        ok: problems.length === 0,
        detail: problems.length
            ? problems
                  .slice(0, 8)
                  .map((p) => `${p.entry} — ${p.reason}`)
                  .join(' | ')
            : '',
    });
    checks.push({
        name: `${pkgName}: LICENSE present in tarball`,
        ok: hasLicense,
        detail: hasLicense ? '' : 'no LICENSE entry',
    });
    checks.push({
        name: `${pkgName}: package.json present`,
        ok: hasPackageJson,
        detail: hasPackageJson ? '' : 'no package.json entry',
    });
    return { ok, checks };
}

/** Read and parse `package/package.json` out of a packed `.tgz`. */
export function readTarballPackageJson(tarballPath) {
    const out = execFileSync(
        'tar',
        ['xzOf', tarballPath, 'package/package.json'],
        { encoding: 'utf8' },
    );
    return JSON.parse(out);
}

/**
 * Classify one `peerDependencies` value from a PACKED tarball (ticket 35).
 *
 * A published peer must be a semver RANGE — never a bare exact pin and never a
 * residual `workspace:` protocol. Workspace-internal peers are declared
 * `workspace:^` in each package manifest, which `pnpm pack` rewrites to
 * `^<current version>` (a CARET range). Caret (not tilde, not the pin that
 * `workspace:*` produces) is deliberate: `^1.0.0-rc.x` admits future compatible
 * minor/patch core releases, so an already-published plugin keeps peer-matching
 * instead of mismatching on every core patch. External peers (svelte/react/…)
 * are already caret ranges and pass the same rule.
 */
export function classifyPeerRange(value) {
    if (typeof value !== 'string' || value === '')
        return { ok: false, reason: 'empty/non-string peer range' };
    if (value.startsWith('workspace:'))
        return { ok: false, reason: `residual workspace: protocol (${value})` };
    if (value.startsWith('^') || value.startsWith('~'))
        return { ok: true, reason: '' };
    return { ok: false, reason: `not a range — exact pin (${value})` };
}

/**
 * Assert every `peerDependencies` value in a packed tarball is a range.
 * Packages with no `peerDependencies` pass trivially. Returns { ok, checks }.
 */
export function assertTarballPeerRanges(tarballPath, pkgName) {
    const pkg = readTarballPackageJson(tarballPath);
    const peers = pkg.peerDependencies ?? {};
    const problems = [];
    for (const [name, range] of Object.entries(peers)) {
        const { ok, reason } = classifyPeerRange(range);
        if (!ok) problems.push(`${name} — ${reason}`);
    }
    return {
        ok: problems.length === 0,
        checks: [
            {
                name: `${pkgName}: peerDependencies are ranges (no pins / no workspace:)`,
                ok: problems.length === 0,
                detail: problems.join(' | '),
            },
        ],
    };
}

/**
 * One-time self-check: prove the peer-range classifier REJECTS an exact pin and
 * a residual `workspace:*`, and ACCEPTS a caret range — a permanent guard so the
 * assertion can't silently degrade to a no-op. Returns { ok, detail }.
 */
export function selfCheckPeerRangeRejectsPin() {
    const exactPin = classifyPeerRange('1.0.0-rc.25');
    const workspacePin = classifyPeerRange('workspace:*');
    const caret = classifyPeerRange('^1.0.0-rc.25');
    const tilde = classifyPeerRange('~1.0.0');
    const ok = !exactPin.ok && !workspacePin.ok && caret.ok && tilde.ok;
    return {
        ok,
        detail: ok ? '' : 'peer-range classifier misclassified a sample value',
    };
}

/**
 * One-time self-check: prove the validator REJECTS a planted `foo.test.js` in a
 * `dist/` (AC: "must fail if a planted foo.test.js lands in a dist/"). Kept as a
 * permanent regression guard instead of mutating a real tarball. Returns
 * { ok, detail }.
 */
export function selfCheckPlantedTest() {
    const planted = [
        'package/package.json',
        'package/LICENSE',
        'package/dist/index.js',
        'package/dist/foo.test.js', // the plant
    ];
    const { ok, problems } = validateEntries(planted);
    const caught = problems.some((p) => p.entry === 'dist/foo.test.js');
    return {
        ok: !ok && caught,
        detail: caught
            ? ''
            : 'validator failed to reject a planted dist/foo.test.js',
    };
}
