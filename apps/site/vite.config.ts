import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sveltekit } from '@sveltejs/kit/vite';
import { bundledCss } from '@triiiceratops/ui/vite';
import { createLocalVitePlugin } from 'uncial-cms/local';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import { workspaceSourceAliases } from './scripts/workspace-source-aliases.mjs';

const CONTENT_DIR = fileURLToPath(new URL('./content', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
// The write endpoint addresses paths from the repo root, so the content dir is declared relative to it.
const CONTENT_DIR_FROM_ROOT = relative(REPO_ROOT, CONTENT_DIR);
const CORE_PACKAGE_JSON = 'packages/core/package.json';

/** Serve only: in a build the same plugin strips standalone `.css` assets. */
function pluginBundledCss(): Plugin {
    return { ...bundledCss(), apply: 'serve' };
}

/** Serve-only aliases to workspace source; dev never exercises package exports. */
function workspaceSource(): Plugin {
    return {
        name: 'triiiceratops:workspace-source',
        apply: 'serve',
        config: () => ({
            resolve: { alias: workspaceSourceAliases(REPO_ROOT) },
        }),
    };
}

/** Fail a build that resolved a workspace package to source. */
function assertPublishedResolution(): Plugin {
    const sources = new Set(
        workspaceSourceAliases(REPO_ROOT).map((alias) => alias.replacement),
    );
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

/** Subprocess: esbuild chokes on that script's shebang. */
function publishedVersion(): string {
    return execFileSync('node', ['scripts/package-version.mjs'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    }).trim();
}

/** Version and its commit date; no git history falls back to the build date. */
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
        workspaceSource(),
        assertPublishedResolution(),
        pluginBundledCss(),
        /* Serve-only loopback write endpoint, confined to the content dir. */
        createLocalVitePlugin({
            root: REPO_ROOT,
            permittedRoots: [CONTENT_DIR_FROM_ROOT],
        }),
        sveltekit(),
    ],
    define: {
        __SITE_VERSION__: JSON.stringify(stamp.version),
        __SITE_VERSION_DATE__: JSON.stringify(stamp.date),
    },
    server: {
        /* Watching build output or committed tiles exhausts inotify (ENOSPC). */
        watch: { ignored: ['**/build/**', '**/static/material/**'] },
    },
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    resolve: {
        /* SSR build has no `mount()`; force the browser condition under Vitest. */
        conditions: process.env.VITEST ? ['browser'] : undefined,
    },
    test: {
        /* Node specs use file URLs; `.dom.test.ts` mounts and needs jsdom. */
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
