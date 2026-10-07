import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Commit hash so redeploys of one ref are byte-identical; falls back to the published version. */
function buildVersion() {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return JSON.parse(
            readFileSync(
                new URL('../../packages/core/package.json', import.meta.url),
                'utf8',
            ),
        ).version;
    }
}

/** @type {import('@sveltejs/kit').Config} */
export default {
    preprocess: vitePreprocess(),
    compilerOptions: {
        experimental: { async: true },
    },
    kit: {
        adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
        paths: {
            base: '',
            relative: false,
        },
        version: { name: buildVersion() },
        prerender: {
            /* Only the dev-only edit route may go unseen. */
            handleUnseenRoutes: ({ routes, message }) => {
                const unexpected = routes.filter(
                    (route) => route !== '/(chrome)/[...path]/edit',
                );
                if (unexpected.length > 0) throw new Error(message);
            },
            /* `/examples/` lands after prerender via place-examples.mjs. */
            handleHttpError: ({ path, referrer, message }) => {
                if (path.replace(/^\/+/, '').split('/')[0] === 'examples')
                    return;
                throw new Error(
                    `${message} (linked from ${referrer ?? 'an entry point'})`,
                );
            },
        },
    },
};
