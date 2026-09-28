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
            'node_modules/',
            'src/lib/generated/',
            'docs/',
            'test-consumers/fixtures/docs-examples/generated/',
            '**/tests/media/',
        ],
    },
    {
        plugins: {
            '@eslint-community/eslint-comments': eslintComments,
        },
        rules: {
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
    ...workspaceBoundaries({
        apps: ['apps/**'],
        packageSources: ['**/src/**'],
    }),
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
