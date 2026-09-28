// Tarball content contract: packed `.tgz` holds only public entries, declarations, CSS, IIFEs, and metadata.

import { execFileSync } from 'node:child_process';

// Top-level files npm/pnpm may ship alongside `dist/`.
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

// Files the core tarball must contain. The rest of the export map is derived, not listed.
const REQUIRED_CORE_DIST_FILES = [
    'dist/react.js',
    'dist/react.d.ts',
    'dist/vue.js',
    'dist/vue.d.ts',
    // The Svelte entry: losing it breaks Svelte consumers while Svelte-free checks stay green.
    'dist/svelte.js',
    'dist/svelte.d.ts',
    // The German catalog behind the `./locales/*` wildcard, which cannot be derived from the export map.
    'dist/locales/de.json',
    // Imported by the shipped chrome itself, so its absence fails every consumer at runtime.
    'dist/messages/en.json',
];

/** Core's optional framework peers: never runtime dependencies. */
const CORE_OPTIONAL_PEERS = [
    { name: 'react', range: /^\^19(\.|$)/ },
    { name: 'svelte', range: /^\^5(\.|$)/ },
    { name: 'vue', range: /^\^3\.5(\.|$)/ },
];

/** Never a production dependency of core, whatever else changes. */
const CORE_FORBIDDEN_RUNTIME_DEPS = ['react', 'react-dom', 'svelte', 'vue'];

// Extensions permitted in `dist/`. `.json` admitted only for locale catalogs below.
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

/** Path segments marking test/fixture/demo/tooling material. */
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

/** Directories under `dist/` whose `.json` files are locale catalogs. */
const LOCALE_DIRS = ['messages', 'locales'];

function isAllowedPath(rel) {
    if (!rel.includes('/')) return TOP_LEVEL_ALLOWED.has(rel);
    const segments = rel.split('/');
    if (segments[0] !== 'dist') return false;
    const base = segments[segments.length - 1];
    if (base.endsWith('.json')) {
        return segments.length === 3 && LOCALE_DIRS.includes(segments[1]);
    }
    return ALLOWED_DIST_SUFFIXES.some((s) => base.endsWith(s));
}

export function classifyEntry(rel) {
    const rejected = isRejectedPath(rel);
    if (rejected) return { ok: false, reason: `forbidden (${rejected})` };
    if (!isAllowedPath(rel)) return { ok: false, reason: 'unexpected file' };
    return { ok: true, reason: '' };
}

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

/** List the file entries inside a `.tgz`. */
export function listTarball(tarballPath) {
    const out = execFileSync('tar', ['tzf', tarballPath], {
        encoding: 'utf8',
    });
    return out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.endsWith('/'));
}

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

/** A published peer must be a range, never a pin or `workspace:`. */
export function classifyPeerRange(value) {
    if (typeof value !== 'string' || value === '')
        return { ok: false, reason: 'empty/non-string peer range' };
    if (value.startsWith('workspace:'))
        return { ok: false, reason: `residual workspace: protocol (${value})` };
    if (value.startsWith('^') || value.startsWith('~'))
        return { ok: true, reason: '' };
    return { ok: false, reason: `not a range — exact pin (${value})` };
}

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

/** Every `./dist/...` path an export field names. */
export function collectExportTargets(pkg) {
    const targets = new Set();
    const visit = (node) => {
        if (typeof node === 'string') {
            // Wildcards name a pattern, asserted via REQUIRED_CORE_DIST_FILES.
            if (node.includes('*')) return;
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

/** Core tarball ships what its export map promises, including framework subpaths. */
export function classifyCoreExportTargets(pkg, distRelativeEntries) {
    const present = new Set(distRelativeEntries);

    return {
        missingRequired: REQUIRED_CORE_DIST_FILES.filter(
            (file) => !present.has(file),
        ),
        missingTargets: collectExportTargets(pkg).filter(
            (target) => !present.has(target),
        ),
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

/** Framework peers must be optional and absent from dependencies. */
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

/** Every `@font-face` rule in a stylesheet. Any match fails: no shipped typefaces. */
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

/** The stylesheet entries of a tarball. */
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
            './locales/*': './dist/locales/*',
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
        'dist/locales/de.json',
        'dist/messages/en.json',
    ];

    const clean = classifyCoreExportTargets(healthy, entries);
    const droppedFile = classifyCoreExportTargets(
        healthy,
        entries.filter((e) => e !== 'dist/react.js'),
    );
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
    const droppedLocale = classifyCoreExportTargets(
        healthy,
        entries.filter((e) => e !== 'dist/locales/de.json'),
    );

    const ok =
        clean.missingRequired.length === 0 &&
        clean.missingTargets.length === 0 &&
        clean.missingSubpaths.length === 0 &&
        droppedLocale.missingRequired.includes('dist/locales/de.json') &&
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

export function selfCheckPlantedTest() {
    const planted = [
        'package/package.json',
        'package/LICENSE',
        'package/dist/index.js',
        'package/dist/messages/en.json',
        'package/dist/locales/de.json',
        'package/dist/foo.test.js', // the plant
        'package/dist/demo/manifest.json', // the second plant
    ];
    const { ok, problems } = validateEntries(planted);
    const missed = ['dist/foo.test.js', 'dist/demo/manifest.json'].filter(
        (entry) => !problems.some((p) => p.entry === entry),
    );
    const overreached = problems
        .map((p) => p.entry)
        .filter(
            (entry) =>
                entry.startsWith('dist/locales/') ||
                entry.startsWith('dist/messages/'),
        );
    return {
        ok: !ok && missed.length === 0 && overreached.length === 0,
        detail:
            missed.length > 0
                ? `validator failed to reject planted ${missed.join(', ')}`
                : overreached.length > 0
                  ? `validator rejected the locale catalog(s) ${overreached.join(', ')}`
                  : '',
    };
}
