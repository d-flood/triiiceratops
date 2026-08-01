import { assertFrameworkFixture } from '../framework-consumer-assert.mjs';

// framework-react: a plain Vite + React 19 application consuming ONLY the
// packed `triiiceratops` tarball through `triiiceratops/react`,
// `triiiceratops/testing`, and nothing else. No Svelte, no Svelte Vite plugin,
// no plugin SDK — and no React plugin either, because the app is authored with
// `createElement`.
//
// Three routes, one Playwright pass: the full client contract, a route rendered
// with `react-dom/server` at build time and hydrated in the browser, and a
// route that pre-registers a foreign `<triiiceratops-viewer>`.
export default {
    name: 'framework-react',
    buildScript: 'build',
    serveDir: 'dist',
    // Viewer 2 loads this over HTTP, which is what dispatches `manifestchange`.
    manifestTarget: 'public/manifest.json',
    browser: true,
    assert: (ctx) =>
        assertFrameworkFixture(ctx, {
            framework: 'react',
            absentPeer: 'vue',
            keepAlive: false,
        }),
};
