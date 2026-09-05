import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import workspaceBoundaries from './eslint.boundaries.js';

export default ts.config(
    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs['flat/recommended'],
    prettier,
    ...svelte.configs['flat/prettier'],
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
        languageOptions: {
            parserOptions: {
                parser: ts.parser,
            },
        },
    },
    {
        ignores: [
            'dist/',
            '.svelte-kit/',
            '.venv/',
            'site/',
            'node_modules/',
            'src/paraglide/',
            'src/lib/paraglide/',
            'src/lib/generated/',
            'docs/',
            // Doc snippets extracted verbatim from docs/*.md by
            // scripts/docs-examples.mjs — generated, never hand-edited, and
            // gated by `tsc` in the packed docs-examples consumer instead. A
            // teaching snippet legitimately declares a function it never calls,
            // which is a lint warning here but correct in the docs. Linting them
            // also made the pre-commit gate order-dependent: adding one example
            // renumbers every later file, re-staging them and surfacing warnings
            // that had nothing to do with the change.
            'test-consumers/fixtures/docs-examples/generated/',
            // Generated e2e media (packages/core/tests/media/). The HLS
            // segments are MPEG-TS bytes in `.ts` files, which every TypeScript
            // tool in the chain tries to parse. The leading `**/` is
            // load-bearing: ESLint resolves ignore patterns against the cwd,
            // and this config is used both from `packages/core` and from the
            // repo root, where `scripts/pre-commit.sh` lints staged paths.
            '**/tests/media/',
        ],
    },
    {
        plugins: {
            '@eslint-community/eslint-comments': eslintComments,
        },
        rules: {
            // Ban wildcard suppressions (ticket 22): any `eslint-disable`,
            // `eslint-disable-line`, or `eslint-disable-next-line` without
            // explicit rule names is an error. Every real suppression must name
            // its rule(s) and be recorded in lint-allowlist.md.
            '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'svelte/no-at-html-tags': 'warn',
            'svelte/require-each-key': 'warn',
            'svelte/prefer-svelte-reactivity': 'warn',
        },
    },
    // The workspace boundary lives here so that every package inherits it: a
    // package's own config is `export default base`, and `**/src/**` matches its
    // `src` tree whether ESLint runs from the repo root (`scripts/pre-commit.sh`
    // lints staged paths from here) or from the package directory. `apps/**`
    // only matches from the root, so `apps/demo` calls the factory again for its
    // own anchor. `**/src/**` also matches `apps/demo/src/**`; see the ordering
    // invariant in eslint.boundaries.js for why that is harmless.
    ...workspaceBoundaries({
        apps: ['apps/**'],
        packageSources: ['**/src/**'],
    }),
    // The marketing site's two exemptions, repeated here against the root
    // anchor. `apps/site/eslint.config.js` declares them for runs started in
    // that directory; the pre-commit hook lints staged paths from the repo root,
    // where those `src/**`-relative globs match nothing. The reasoning for each
    // exemption lives in that file — keep the two in step.
    {
        files: ['apps/site/src/**/*.svelte', 'apps/site/src/**/*.ts'],
        languageOptions: {
            globals: {
                __SITE_VERSION__: 'readonly',
                __SITE_VERSION_DATE__: 'readonly',
            },
        },
        rules: {
            'svelte/no-navigation-without-resolve': 'off',
        },
    },
);
