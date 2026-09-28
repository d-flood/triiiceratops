// Boundary re-declared against this app's anchor; must stay after `...base` (last-match-wins).
import base from '../../eslint.config.js';
import workspaceBoundaries from '../../eslint.boundaries.js';

export default [
    ...base,
    ...workspaceBoundaries({ apps: ['**/*'] }),
    {
        ignores: ['build/', '.svelte-kit/'],
    },
    {
        files: ['src/**/*.svelte', 'src/**/*.ts'],
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
];
