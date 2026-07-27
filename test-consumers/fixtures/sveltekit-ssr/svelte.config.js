import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
    preprocess: vitePreprocess(),
    kit: {
        // Prerendering runs the SSR render at build time: a browser-only global
        // touched at import time makes `vite build` fail here — that is the
        // SSR-catch guard the harness relies on.
        adapter: adapter(),
    },
};
