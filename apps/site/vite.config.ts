import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sveltekit } from '@sveltejs/kit/vite';
import { bundledCss } from '@triiiceratops/ui/vite';
import { createLocalVitePlugin } from 'uncial-cms/local';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const CONTENT_DIR = fileURLToPath(new URL('./content', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CORE_PACKAGE_JSON = 'packages/core/package.json';

type ExportTarget = string | { [condition: string]: ExportTarget };

type PackageManifest = {
    name?: string;
    exports?: Record<string, ExportTarget>;
};

type SourceAlias = {
    find: string | RegExp;
    replacement: string;
    specificity: number;
};

/** The conditions that can identify a module Vite can load while serving. */
const MODULE_CONDITIONS = ['svelte', 'import', 'default', 'require'] as const;

function workspacePackageDirectories(): string[] {
    return ['packages', 'vendor/uncial/packages'].flatMap((directory) =>
        readdirSync(resolve(REPO_ROOT, directory), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => resolve(REPO_ROOT, directory, entry.name)),
    );
}

function runtimeTarget(target: ExportTarget): string | undefined {
    if (typeof target === 'string') return target;
    for (const condition of MODULE_CONDITIONS) {
        const candidate = target[condition];
        if (candidate === undefined) continue;
        const resolved = runtimeTarget(candidate);
        if (resolved !== undefined) return resolved;
    }
    return undefined;
}

function sourceTarget(
    packageDirectory: string,
    target: string,
): string | undefined {
    if (!target.startsWith('./dist/')) return undefined;

    const output = target
        .slice('./dist/'.length)
        .replace(/\.d\.ts$/, '')
        .replace(/\.m?js$/, '');
    const extension = target.endsWith('.css') ? '.css' : undefined;
    const extensions =
        extension === undefined
            ? ['.ts', '.svelte', '.svelte.ts', '.js']
            : [extension];

    for (const sourceDirectory of ['src', 'src/lib']) {
        for (const sourceExtension of extensions) {
            const source = resolve(
                packageDirectory,
                sourceDirectory,
                `${output}${sourceExtension}`,
            );
            if (existsSync(source)) return source;
        }
    }
    return undefined;
}

function sourceAliases(): { find: string | RegExp; replacement: string }[] {
    const aliases: SourceAlias[] = [];
    for (const packageDirectory of workspacePackageDirectories()) {
        const manifest = JSON.parse(
            readFileSync(resolve(packageDirectory, 'package.json'), 'utf8'),
        ) as PackageManifest;
        if (manifest.name === undefined || manifest.exports === undefined)
            continue;

        for (const [subpath, target] of Object.entries(manifest.exports)) {
            const runtime = runtimeTarget(target);
            if (runtime === undefined) continue;
            const source = sourceTarget(packageDirectory, runtime);
            if (source === undefined) continue;
            const specifier =
                subpath === '.'
                    ? manifest.name
                    : `${manifest.name}${subpath.slice(1)}`;
            aliases.push({
                find:
                    subpath === '.'
                        ? new RegExp(
                              `^${manifest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                          )
                        : specifier,
                replacement: source,
                specificity: specifier.length,
            });
        }
    }
    return aliases
        .sort((left, right) => right.specificity - left.specificity)
        .map(({ specificity: _specificity, ...alias }) => alias);
}

/**
 * Resolve the plugin packages' bundled-CSS virtual module while serving.
 *
 * A first-party plugin's entry imports its own extracted CSS from a virtual
 * module its production build supplies, and the aliases below resolve those
 * packages to source. `bundledCss` answers that module with an empty string
 * outside a build, which is the right answer here: while serving, Vite's own CSS
 * pipeline injects each component's styles directly.
 *
 * Serve only, and that is load bearing: in a build the same plugin strips every
 * standalone `.css` asset from the bundle, which is what a plugin shipping one
 * self-contained file wants and what this application's build must never do.
 */
function pluginBundledCss(): Plugin {
    return { ...bundledCss(), apply: 'serve' };
}

/**
 * Develop against workspace source while leaving production resolution alone.
 *
 * The development server therefore does not exercise package exports; production
 * builds, consumer examples and the packed-consumer test do.
 */
function workspaceSourceAliases(): Plugin {
    return {
        name: 'triiiceratops:workspace-source-aliases',
        apply(_config, { command }) {
            return command === 'serve';
        },
        config() {
            return { resolve: { alias: sourceAliases() } };
        },
    };
}

/**
 * Fail a build that resolved a workspace package to source.
 *
 * The aliases above are the only thing that can put a package's `src/` in this
 * application's module graph, and they are declared serve-only. That is a claim
 * about a plugin's configuration; this is the assertion, taken against the graph
 * a build actually produced. Without it, a serve-only plugin quietly becoming
 * unconditional would ship an application whose sizes, whose CSS scoping and
 * whose exports-map coverage all silently differ from what every gate measures.
 *
 * A package whose `exports` already point at source — `@triiiceratops/config` —
 * is not in the alias set and so is not in the set this rejects.
 */
function assertPublishedResolution(): Plugin {
    const sources = new Set(sourceAliases().map((alias) => alias.replacement));
    return {
        name: 'triiiceratops:assert-published-resolution',
        apply: 'build',
        buildEnd() {
            const resolvedToSource = [...this.getModuleIds()].filter((id) =>
                sources.has(id.split('?')[0]),
            );
            if (resolvedToSource.length > 0) {
                this.error(
                    `the build resolved ${resolvedToSource.length} module(s) to workspace source rather than through the packages' exports maps:\n${resolvedToSource
                        .map((id) => `  ${id}`)
                        .join('\n')}`,
                );
            }
        },
    };
}

/**
 * The published version, from the repository's single source for it.
 *
 * Invoked as a subprocess rather than imported: Vite bundles this config with
 * esbuild, which chokes on that script's shebang.
 */
function publishedVersion(): string {
    return execFileSync('node', ['scripts/package-version.mjs'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    }).trim();
}

/**
 * The version in the site's footer, and the date that version carries.
 *
 * The date is the commit date of the last change to the core package's version,
 * which is what "1.0.0, three weeks ago" actually means. A checkout without git
 * history falls back to the build date rather than failing the build.
 */
function versionStamp(): { version: string; date: string } {
    let date: string;
    try {
        date = execFileSync(
            'git',
            ['log', '-1', '--format=%cs', '--', CORE_PACKAGE_JSON],
            {
                cwd: REPO_ROOT,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            },
        ).trim();
    } catch {
        date = '';
    }
    return {
        version: publishedVersion(),
        date: date || new Date().toISOString().slice(0, 10),
    };
}

const stamp = versionStamp();

export default defineConfig({
    plugins: [
        workspaceSourceAliases(),
        assertPublishedResolution(),
        pluginBundledCss(),
        /*
         * The write endpoint the edit variants save through. Serve-only, bound to
         * loopback, and confined to the content directory, so the one endpoint
         * that writes files from a URL path exists nowhere but a development
         * server and cannot be walked out of its tree.
         */
        createLocalVitePlugin({ contentDir: CONTENT_DIR }),
        sveltekit(),
    ],
    define: {
        __SITE_VERSION__: JSON.stringify(stamp.version),
        __SITE_VERSION_DATE__: JSON.stringify(stamp.date),
    },
    server: {
        /*
         * The build tree is output, not source, and the landing page's tile
         * pyramids under static/material are tens of thousands of committed
         * files that never need HMR — watching either exhausts the platform's
         * inotify budget and the server dies on ENOSPC before it serves
         * anything.
         */
        watch: { ignored: ['**/build/**', '**/static/material/**'] },
    },
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    resolve: {
        /*
         * Vitest resolves through Vite's SSR pipeline, which would hand the
         * specs Svelte's server build — where `mount()` throws, and the
         * playground's component screens mount.
         */
        conditions: process.env.VITEST ? ['browser'] : undefined,
    },
    test: {
        /*
         * Two projects, split by whether a spec needs a document.
         *
         * Most of the unit suite reads files and spawns scripts, which needs
         * Node: under jsdom `import.meta.url` is an http URL and every
         * `fileURLToPath` in the suite throws. The playground's component
         * screens mount a component, which needs a document. A `.dom.test.ts`
         * name says which a spec is, so the split is visible in the file list
         * rather than in this config alone.
         */
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    include: ['tests/unit/**/*.test.ts'],
                    exclude: ['tests/unit/**/*.dom.test.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'dom',
                    include: ['tests/unit/**/*.dom.test.ts'],
                    environment: 'jsdom',
                },
            },
        ],
    },
});
