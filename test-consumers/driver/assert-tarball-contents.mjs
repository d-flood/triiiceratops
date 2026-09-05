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
//
// One rule needs more than the allowlist: no published package may ship a
// typeface. A font FILE is already excluded by the extension allowlist, but a
// face embedded in a stylesheet as a data URI is ordinary CSS bytes, so the
// stylesheets are read as well — see `assertTarballNoEmbeddedFonts`.

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

// Files the CORE tarball must CONTAIN, not merely be permitted to contain.
// The allowlist above is a ceiling; these are
// the floor. `dist/react.*` and `dist/vue.*` are the precompiled framework
// wrappers `triiiceratops/react` and `triiiceratops/vue` resolve to — the
// subpaths are part of core's published contract, so a build that silently
// stops emitting them must fail the release, not ship a package whose export
// map points at nothing.
//
// The per-file list is deliberately short: `assertCoreExportTargets` derives
// the rest from the PACKED `exports` map, so any subpath added later is checked
// without touching this file.
const REQUIRED_CORE_DIST_FILES = [
    'dist/react.js',
    'dist/react.d.ts',
    'dist/vue.js',
    'dist/vue.d.ts',
    // The Svelte entry. Listed for the same non-vacuity reason as the wrappers:
    // if `svelte-package` ever stops emitting it, `.` would still build and every
    // Svelte-free assertion would still pass — the failure would surface only as
    // Svelte consumers being unable to import the component at all.
    'dist/svelte.js',
    'dist/svelte.d.ts',
];

/**
 * Core's optional framework peers. React and Vue are OPTIONAL peers, never
 * runtime dependencies — a React consumer installs no Vue, a Vue consumer
 * installs no React, and neither installs Svelte.
 */
const CORE_OPTIONAL_PEERS = [
    { name: 'react', range: /^\^19(\.|$)/ },
    { name: 'svelte', range: /^\^5(\.|$)/ },
    { name: 'vue', range: /^\^3\.5(\.|$)/ },
];

/** Never a production dependency of core, whatever else changes. */
const CORE_FORBIDDEN_RUNTIME_DEPS = ['react', 'react-dom', 'svelte', 'vue'];

// Extensions permitted inside `dist/`: JS + Svelte source (core is
// source-distributed), TypeScript declarations, CSS, and source maps. Notably
// ABSENT: `.json` (would admit fixture manifests), `.ico`/images, `.html`.
//
// `dist/react.js`, `dist/react.d.ts`, `dist/vue.js`, and `dist/vue.d.ts` — the
// framework wrapper entries — are admitted by the `.js` / `.d.ts` rules here and
// REQUIRED by `REQUIRED_CORE_DIST_FILES` above.
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
 * Classify one `peerDependencies` value from a PACKED tarball.
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

/** Every `./dist/...` path an `exports`/`main`/`module`/`types`/… field names. */
export function collectExportTargets(pkg) {
    const targets = new Set();
    const visit = (node) => {
        if (typeof node === 'string') {
            if (node.startsWith('./dist/')) targets.add(node.slice(2));
            return;
        }
        if (typeof node !== 'object' || node === null) return;
        for (const value of Object.values(node)) visit(value);
    };
    visit(pkg.exports);
    for (const field of ['main', 'module', 'svelte', 'types', 'style']) {
        visit(pkg[field]);
    }
    return [...targets].sort();
}

/**
 * Assert the CORE tarball actually ships what its export map promises, and that
 * the framework wrapper subpaths are among them.
 *
 * Two failure modes this catches that the allowlist cannot, because the
 * allowlist only says what MAY appear:
 *   · a build stops emitting `dist/react.js` (e.g. `svelte-package` clears
 *     `dist/` and a later step is skipped) — the package publishes with an
 *     export map pointing at a missing file, and every React consumer's install
 *     resolves to nothing;
 *   · a subpath is removed from `exports` — `triiiceratops/react` stops
 *     resolving even though the file is still in the tarball.
 *
 * Returns { ok, checks }.
 */
export function classifyCoreExportTargets(pkg, distRelativeEntries) {
    const present = new Set(distRelativeEntries);

    return {
        missingRequired: REQUIRED_CORE_DIST_FILES.filter(
            (file) => !present.has(file),
        ),
        missingTargets: collectExportTargets(pkg).filter(
            (target) => !present.has(target),
        ),
        // The subpaths themselves, so removing `./react` from the export map
        // fails here rather than silently in a consumer's resolver.
        missingSubpaths: ['./react', './vue'].filter((subpath) => {
            const condition = pkg.exports?.[subpath];
            return (
                typeof condition !== 'object' ||
                condition === null ||
                typeof condition.types !== 'string' ||
                typeof condition.import !== 'string'
            );
        }),
    };
}

export function assertCoreExportTargets(tarballPath, pkgName) {
    const pkg = readTarballPackageJson(tarballPath);
    const { missingRequired, missingTargets, missingSubpaths } =
        classifyCoreExportTargets(
            pkg,
            listTarball(tarballPath)
                .filter((entry) => entry.startsWith('package/'))
                .map((entry) => entry.slice('package/'.length)),
        );

    const checks = [
        {
            name: `${pkgName}: framework wrapper JS + declarations present`,
            ok: missingRequired.length === 0,
            detail: missingRequired.join(', '),
        },
        {
            name: `${pkgName}: ./react and ./vue export types + import`,
            ok: missingSubpaths.length === 0,
            detail: missingSubpaths.join(', '),
        },
        {
            name: `${pkgName}: every export target exists in the tarball`,
            ok: missingTargets.length === 0,
            detail: missingTargets.join(', '),
        },
    ];

    return { ok: checks.every((c) => c.ok), checks };
}

/**
 * Assert core's framework peer metadata.
 *
 * `react`, `vue`, and `svelte` must be declared peers, marked OPTIONAL, and must
 * not appear in `dependencies`. Getting this wrong is what turns "install
 * `triiiceratops` and your own framework" into npm pulling Vue into a React app
 * (or Svelte into both). Returns { ok, checks }.
 */
export function assertCoreOptionalPeers(tarballPath, pkgName) {
    const pkg = readTarballPackageJson(tarballPath);
    const peers = pkg.peerDependencies ?? {};
    const meta = pkg.peerDependenciesMeta ?? {};
    const deps = pkg.dependencies ?? {};

    const badRanges = CORE_OPTIONAL_PEERS.filter(
        ({ name, range }) =>
            typeof peers[name] !== 'string' || !range.test(peers[name]),
    ).map(
        ({ name, range }) =>
            `${name}=${peers[name] ?? 'absent'} (want ${range})`,
    );

    const notOptional = CORE_OPTIONAL_PEERS.filter(
        ({ name }) => meta[name]?.optional !== true,
    ).map(({ name }) => name);

    const leaked = CORE_FORBIDDEN_RUNTIME_DEPS.filter((name) => name in deps);

    const checks = [
        {
            name: `${pkgName}: react/vue/svelte peer ranges`,
            ok: badRanges.length === 0,
            detail: badRanges.join(', '),
        },
        {
            name: `${pkgName}: react/vue/svelte peers are optional`,
            ok: notOptional.length === 0,
            detail: notOptional.join(', '),
        },
        {
            name: `${pkgName}: no framework in dependencies`,
            ok: leaked.length === 0,
            detail: leaked.join(', '),
        },
    ];

    return { ok: checks.every((c) => c.ok), checks };
}

/**
 * Every `@font-face` rule declared in a stylesheet, as its own text.
 *
 * A published package may not ship a typeface. The file-extension half of that
 * rule is enforced by the allowlist above — no `.woff2` suffix is admitted
 * anywhere — but the sharper failure is a face EMBEDDED in a stylesheet as a
 * data URI, which arrives as ordinary CSS bytes and no extension rule can see.
 * The comparison's own measurements record a competitor shipping 58% of its
 * stylesheet that way.
 *
 * Any `@font-face` at all is the failure, embedded or linked: the viewer names
 * two font custom properties and falls back to the reader's system faces (see
 * the theming guide at `/docs/theming/`), so a consumer's page carries only the
 * type it chose.
 */
export function findFontFaceRules(css) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    const re = /@font-face\s*\{/gi;
    let m;
    while ((m = re.exec(withoutComments))) {
        let depth = 1;
        let i = m.index + m[0].length;
        for (; i < withoutComments.length && depth; i++) {
            if (withoutComments[i] === '{') depth++;
            else if (withoutComments[i] === '}') depth--;
        }
        rules.push(withoutComments.slice(m.index, i).replace(/\s+/g, ' '));
    }
    return rules;
}

/** The stylesheet entries of a tarball, as `[relative path, contents]`. */
function tarballStylesheets(tarballPath) {
    return listTarball(tarballPath)
        .filter(
            (entry) => entry.startsWith('package/') && entry.endsWith('.css'),
        )
        .map((entry) => [
            entry.slice('package/'.length),
            execFileSync('tar', ['xzOf', tarballPath, entry], {
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
            }),
        ]);
}

/**
 * Assert no stylesheet in a packed tarball declares a face. Returns
 * { ok, checks }. Every offending rule is named with its file and its own text
 * truncated, so the failure says which package and which rule rather than that
 * something somewhere ships a font.
 */
export function assertTarballNoEmbeddedFonts(tarballPath, pkgName) {
    const problems = [];
    for (const [rel, css] of tarballStylesheets(tarballPath)) {
        for (const rule of findFontFaceRules(css)) {
            problems.push(`${rel}: ${rule.slice(0, 120)}`);
        }
    }
    return {
        ok: problems.length === 0,
        checks: [
            {
                name: `${pkgName}: no @font-face in any published stylesheet`,
                ok: problems.length === 0,
                detail: problems.slice(0, 4).join(' | '),
            },
        ],
    };
}

/**
 * One-time self-check: prove the no-font rule bites on both halves — a planted
 * `.woff2` in a `dist/`, and a face embedded in a stylesheet as a data URI.
 * Kept as a permanent guard rather than mutating a real tarball, and paired with
 * a clean stylesheet so the detector cannot pass by flagging everything.
 * Returns { ok, detail }.
 */
export function selfCheckNoFonts() {
    const planted = validateEntries([
        'package/package.json',
        'package/LICENSE',
        'package/dist/index.js',
        'package/dist/fonts/GenericSans-Variable.woff2', // the plant
    ]);
    const caughtFile = planted.problems.some(
        (p) => p.entry === 'dist/fonts/GenericSans-Variable.woff2',
    );

    const embedded = findFontFaceRules(
        '.viewer-root{color:red}' +
            "@font-face{font-family:'X';src:url(data:font/woff2;base64,AA) format('woff2')}",
    );
    const commentedOut = findFontFaceRules(
        '/* @font-face{font-family:"X"} */ .viewer-root{color:red}',
    );

    const ok =
        caughtFile &&
        embedded.length === 1 &&
        embedded[0].includes('data:font/woff2') &&
        commentedOut.length === 0;
    return {
        ok,
        detail: ok
            ? ''
            : 'the no-font rule failed to reject a planted .woff2 or an embedded data-URI face',
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
 * One-time self-check: prove the framework-subpath assertions actually bite —
 * a tarball missing `dist/react.js`, an export map whose `./vue` lost its
 * `types` condition, and an export target no archive entry backs must all be
 * reported. Kept as a permanent guard rather than mutating a real tarball.
 * Returns { ok, detail }.
 */
export function selfCheckFrameworkSubpathAssertions() {
    const healthy = {
        exports: {
            '.': { types: './dist/index.d.ts', import: './dist/index.js' },
            './react': {
                types: './dist/react.d.ts',
                import: './dist/react.js',
            },
            './vue': { types: './dist/vue.d.ts', import: './dist/vue.js' },
            './svelte': {
                types: './dist/svelte.d.ts',
                svelte: './dist/svelte.js',
                import: './dist/svelte.js',
            },
        },
    };
    const entries = [
        'dist/index.d.ts',
        'dist/index.js',
        'dist/react.d.ts',
        'dist/react.js',
        'dist/vue.d.ts',
        'dist/vue.js',
        'dist/svelte.d.ts',
        'dist/svelte.js',
    ];

    const clean = classifyCoreExportTargets(healthy, entries);
    const droppedFile = classifyCoreExportTargets(
        healthy,
        entries.filter((e) => e !== 'dist/react.js'),
    );
    // The Svelte entry is required for the same non-vacuity reason: losing it
    // breaks every Svelte consumer while leaving all Svelte-free checks green.
    const droppedSvelte = classifyCoreExportTargets(
        healthy,
        entries.filter((e) => e !== 'dist/svelte.js'),
    );
    const droppedTypes = classifyCoreExportTargets(
        {
            exports: {
                ...healthy.exports,
                './vue': { import: './dist/vue.js' },
            },
        },
        entries,
    );

    const ok =
        clean.missingRequired.length === 0 &&
        clean.missingTargets.length === 0 &&
        clean.missingSubpaths.length === 0 &&
        droppedFile.missingRequired.includes('dist/react.js') &&
        droppedFile.missingTargets.includes('dist/react.js') &&
        droppedSvelte.missingRequired.includes('dist/svelte.js') &&
        droppedSvelte.missingTargets.includes('dist/svelte.js') &&
        droppedTypes.missingSubpaths.includes('./vue');

    return {
        ok,
        detail: ok
            ? ''
            : 'framework-subpath tarball assertions misclassified a sample package',
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
