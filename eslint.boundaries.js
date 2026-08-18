/*
 * The demo/library boundary in @triiiceratops/core.
 *
 * `src/demo` is the demo page: dev-server and GitHub Pages only, never packaged
 * and never in the element bundle. `src/lib` is the library. Three times now,
 * demo-only chrome has been written inside `src/lib`, and each time its strings
 * and glyphs were enrolled in the shared registries — core's inlang message set
 * and the generated icon manifest. Both are indexed by a runtime string
 * (`createLocalizedMessages`' Proxy, `icons[weight]?.[name]`), so no bundler can
 * tree-shake them: every demo-only key and glyph became bytes in the shipped
 * artifact. These rules keep `src/lib` from depending on `src/demo`, and keep
 * the code that does live in `src/demo` off the shared registries.
 *
 * Flat-config `files` globs resolve against the directory of the config file
 * that declares them, and ESLint picks its config by cwd: `packages/core` when
 * CI runs `pnpm lint` inside the package, the repo root when
 * `scripts/pre-commit.sh` lints staged paths. Both configs call this factory so
 * the rules fire either way and cannot drift apart — a boundary rule spelled
 * differently on both sides is a boundary rule that only half exists. `prefix`
 * is the path from the calling config to `packages/core`, with a trailing slash
 * (`''` from the package itself).
 */
export default function demoBoundary(prefix = '') {
    return [
        {
            files: [`${prefix}src/lib/**`],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        patterns: [
                            {
                                group: ['**/demo/**'],
                                message:
                                    'src/lib is the library; it must not import from src/demo. Move the shared code into src/lib, or keep it demo-only.',
                            },
                        ],
                    },
                ],
            },
        },
        {
            files: [`${prefix}src/demo/**`],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        patterns: [
                            {
                                // `paraglide/runtime.js` is locale plumbing (`locales`,
                                // `getLocale`, `setLocale`) and carries no strings, so
                                // the demo may drive the page locale through it. The
                                // message modules are the registry, and are not.
                                group: [
                                    '**/paraglide/**',
                                    '!**/paraglide/runtime.js',
                                ],
                                message:
                                    "The demo has its own strings in src/demo/i18n.svelte.ts. Core's message set is compiled into a table nothing can tree-shake, so a demo-only key there ships in every element artifact.",
                            },
                            {
                                group: [
                                    '**/lib/state/i18n.svelte',
                                    '**/lib/state/i18n.svelte.ts',
                                ],
                                importNames: ['m', 'getMessages'],
                                message:
                                    "Same reason: these resolve core's message registry. Import `m` from src/demo/i18n.svelte.ts instead (`language` is fine — it is the page locale, not a string table).",
                            },
                            {
                                group: [
                                    '**/lib/generated/icons',
                                    '**/lib/generated/icons.ts',
                                    '**/lib/components/Icon.svelte',
                                ],
                                message:
                                    "The demo has its own glyphs in src/demo/icons.ts, rendered by DemoIcon.svelte. Core's icon table is indexed by a runtime string, so a demo-only glyph in it ships in every element artifact.",
                            },
                        ],
                    },
                ],
            },
        },
    ];
}
