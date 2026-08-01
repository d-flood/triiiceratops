import { assertFrameworkFixture } from '../framework-consumer-assert.mjs';

// framework-vue: a plain Vite + Vue 3.5 application consuming ONLY the packed
// `triiiceratops` tarball through `triiiceratops/vue`, `triiiceratops/testing`,
// and nothing else. No Svelte, no Svelte Vite plugin, no plugin SDK — and, on
// the client route, real single-file components compiled by Vue's own template
// compiler with NO `compilerOptions.isCustomElement` configured anywhere.
//
// Three routes, one Playwright pass: the full client contract (including a
// `<KeepAlive>` round trip), a route rendered with `vue/server-renderer` at
// build time and hydrated in the browser, and a route that pre-registers a
// foreign `<triiiceratops-viewer>`.
export default {
    name: 'framework-vue',
    buildScript: 'build',
    serveDir: 'dist',
    // Viewer 2 loads this over HTTP, which is what dispatches `manifestchange`.
    manifestTarget: 'public/manifest.json',
    browser: true,
    assert: (ctx) =>
        assertFrameworkFixture(ctx, {
            framework: 'vue',
            absentPeer: 'react',
            keepAlive: true,
        }),
};
