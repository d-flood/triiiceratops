/*
 * The workspace boundary between the applications and the packages.
 *
 * `apps/*` are the site's applications — the site itself, which owns the whole
 * published tree, and the framework consumer examples carried into it. They are
 * private, never published, and they may see exactly what an external consumer
 * sees: a package's published entrypoints. Reaching across into a package's
 * `src` tree is forbidden in both directions.
 *
 * WHY THIS EXISTS. Three incidents put demo-only strings and glyphs into
 * registries that no bundler can tree-shake, and so into the shipped element
 * artifact; the "Workspace boundary" entry in `CONTEXT.md` records them. That
 * history is the reason this rule may not be relaxed.
 *
 * Flat-config `files` globs resolve against the directory of the config file
 * that declares them, and ESLint picks its config by cwd: the package or app
 * directory when its own `lint` script runs, the repo root when
 * `scripts/pre-commit.sh` lints staged paths. The root config is the single
 * caller for every package: its `packageSources` glob is written so that it
 * matches a package's `src` tree from the repo root and from that package's own
 * directory alike, so all nine packages are policed without restating the rule
 * and cannot drift apart — a boundary rule spelled differently on both sides is
 * a boundary rule that only half exists. Each app calls the factory a second
 * time from its own config, because a root-anchored `apps/**` glob does not
 * match anything when ESLint runs from inside the app. The forbidden import
 * patterns are path-shaped and therefore anchor-independent.
 *
 * ORDERING INVARIANT. The configs returned here declare `packageSources` first
 * and `apps` last, and each app's `eslint.config.js` spreads its own call after
 * the base config. An app's source matches both globs: the package-source glob
 * is deliberately unanchored so that it matches from either cwd, which also
 * makes it match an app's own `src` tree. Flat config resolves such an overlap
 * last-match-wins, so the app-facing rule has to be the later one. Reversed, an
 * app's source would be policed as package source and could import a package's
 * internals unchallenged.
 *
 * (Globs are written without their trailing wildcards in this comment: a literal
 * double-star-slash-star-star inside a block comment closes it.)
 *
 * Both directions are spelled twice: `no-restricted-imports` for static
 * imports, and `no-restricted-syntax` for `import()`, which
 * `no-restricted-imports` does not inspect. The boundary is meant to be
 * unreachable by construction, and a hole a two-line probe can walk through is
 * how the incidents above happened.
 */

const NO_PACKAGE_SOURCES = {
    group: ['**/packages/*/src/**'],
    message:
        'An app may import a package only through its published entrypoints (`triiiceratops`, `triiiceratops/svelte`, `triiiceratops/element`, `triiiceratops/style.css`, `@triiiceratops/plugin-*`). If something you need is not exported, widen the package export deliberately — do not reach into its source.',
};

const NO_APPS = {
    group: ['**/apps/**'],
    message:
        'A package is the library; it must not import from an app. Move the shared code into the package, or keep it app-only.',
};

// `no-restricted-imports` inspects static import/export declarations and
// `require`, never an `import()` expression, so each direction needs a syntax
// selector as well. The specifiers are the glob patterns above rewritten as
// regexes over the literal request string.
const NO_PACKAGE_SOURCES_EXPRESSION = {
    selector:
        'ImportExpression > Literal[value=/(^|\\/)packages\\/[^\\/]+\\/src\\//]',
    message: NO_PACKAGE_SOURCES.message,
};

const NO_APPS_EXPRESSION = {
    selector: 'ImportExpression > Literal[value=/(^|\\/)apps\\//]',
    message: NO_APPS.message,
};

/**
 * @param {object} globs
 * @param {string[]} [globs.apps] Files that are application code.
 * @param {string[]} [globs.packageSources] Files that are package source.
 * @returns {import('eslint').Linter.Config[]}
 */
export default function workspaceBoundaries({ apps, packageSources } = {}) {
    // Order matters; see the ORDERING INVARIANT above.
    const configs = [];
    if (packageSources?.length) {
        configs.push({
            files: packageSources,
            rules: {
                'no-restricted-imports': ['error', { patterns: [NO_APPS] }],
                'no-restricted-syntax': ['error', NO_APPS_EXPRESSION],
            },
        });
    }
    if (apps?.length) {
        configs.push({
            files: apps,
            rules: {
                'no-restricted-imports': [
                    'error',
                    { patterns: [NO_PACKAGE_SOURCES] },
                ],
                'no-restricted-syntax': [
                    'error',
                    NO_PACKAGE_SOURCES_EXPRESSION,
                ],
            },
        });
    }
    return configs;
}
