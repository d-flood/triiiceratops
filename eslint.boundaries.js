/* The workspace boundary: apps may import packages only via published entrypoints. */

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

// `no-restricted-imports` misses `import()`; each direction needs both rules.
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
    // Order matters: app-facing rule must be last (last-match-wins).
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
