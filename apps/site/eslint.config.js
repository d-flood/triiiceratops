// The marketing site extends the workspace-shared flat config at the repo root.
// ESLint resolves this file first when run from `apps/site`, so the base
// config's root-anchored `apps/**` glob matches nothing from here and the
// boundary has to be re-declared against this app's own anchor.
//
// The call must stay *after* `...base`: the base config policies `**/src/**` as
// package source, which also matches `src/**` here, and flat config resolves the
// overlap last-match-wins. See the ordering invariant in eslint.boundaries.js.
import base from '../../eslint.config.js';
import workspaceBoundaries from '../../eslint.boundaries.js';

export default [
    ...base,
    ...workspaceBoundaries({ apps: ['**/*'] }),
    {
        // The build output and Kit's generated types are not source.
        ignores: ['build/', '.svelte-kit/'],
    },
    {
        files: ['src/**/*.svelte', 'src/**/*.ts'],
        languageOptions: {
            globals: {
                // Substituted by Vite at build time; see vite.config.ts.
                __SITE_VERSION__: 'readonly',
                __SITE_VERSION_DATE__: 'readonly',
            },
        },
        rules: {
            // The rule guards against a hardcoded path breaking under a
            // non-empty `paths.base`. This application's base is empty and
            // fixed: it is published at the domain root, and site-urls.json
            // promises these paths verbatim, so a base could not change without
            // breaking the URL contract first.
            'svelte/no-navigation-without-resolve': 'off',
        },
    },
];
