import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

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
            'src/lib/paraglide/',
            'docs/',
        ],
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_' },
            ],
            'svelte/no-at-html-tags': 'warn',
            'svelte/require-each-key': 'warn',
            'svelte/prefer-svelte-reactivity': 'warn',
        },
    },
);
