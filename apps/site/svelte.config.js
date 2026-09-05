import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

import {
    isReservedTopLevel,
    topLevelSegment,
} from '../../scripts/reserved-paths.mjs';

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
        prerender: {
            /**
             * A link into a sibling subtree — the playground, the documentation
             * alias, the hosted viewer — cannot resolve while prerendering: the
             * publish job assembles those subtrees, and they are absent from
             * this application's own build. They are the reserved names, so the
             * one set that says "not ours to place" also says "not ours to
             * crawl". Anything else that 404s is a real broken link.
             */
            handleHttpError: ({ path, referrer, message }) => {
                if (isReservedTopLevel(topLevelSegment(path))) return;
                throw new Error(
                    `${message} (linked from ${referrer ?? 'an entry point'})`,
                );
            },
        },
    },
};
