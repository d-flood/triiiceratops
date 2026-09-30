import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
    // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
    // for more information about preprocessors
    preprocess: vitePreprocess(),
    // No component is compiled as a custom element: `<triiiceratops-viewer>` is
    // the hand-written element in src/lib/components/viewerElement.svelte.ts.
    // The element builds set `configFile: false` and repeat this rule; their
    // `noCustomElementGuard` fails a build that compiles one anyway.
    compilerOptions: {
        customElement: false,
    },
};
