import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * The build's identity, which Kit writes to `_app/version.json` and threads into
 * every module hash.
 *
 * Kit's default is a timestamp, so two builds of one commit emit different
 * bytes for every page. Deploy is build-and-upload with nothing carried
 * forward, and the commit is its only input — so the tree must be a function of
 * the commit alone, or "redeploy this ref" cannot be checked against
 * "what is served". A checkout without git history falls back to the published
 * version, which is stable for the same reason.
 */
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
    kit: {
        // Every route prerenders (see src/routes/+layout.ts), so the output is a
        // plain static tree with no fallback shell: `strict` fails the build if
        // any route escapes prerendering rather than silently emitting one.
        adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
        paths: {
            base: '',
            // Absolute asset paths, not page-relative ones. The site is served
            // from the domain root, and `scripts/finish-build.mjs` relocates the
            // prerendered `/404/` page to `/404.html` — page-relative asset
            // paths would be computed for the depth it was rendered at and
            // resolve outside the tree once moved.
            relative: false,
        },
        version: { name: buildVersion() },
        prerender: {
            /**
             * The development-only editor variants. Their prerender entries
             * resolve to an empty list outside development and nothing links to
             * them, so the build emits none — which Kit reports as a
             * prerenderable route it never saw. That is the arrangement working,
             * not a route escaping the build, and it is the one route allowed to
             * go unseen: anything else here is a page that should have been
             * emitted and was not.
             */
            handleUnseenRoutes: ({ routes, message }) => {
                const unexpected = routes.filter(
                    (route) => route !== '/(chrome)/[...path]/edit',
                );
                if (unexpected.length > 0) throw new Error(message);
            },
            /**
             * `/examples/` is the one path a page may link that this build
             * cannot resolve. The framework consumer examples are built by their
             * own application and copied into this build afterwards by
             * `scripts/place-examples.mjs`, so they are absent while the pages
             * that link them are being rendered; that script's own link check is
             * what asserts they land.
             *
             * Anything else that 404s is a real broken link. One build emits the
             * whole published tree, so there is no sibling subtree a
             * link could legitimately fail to reach.
             */
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
