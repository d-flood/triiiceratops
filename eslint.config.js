import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';

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
);
