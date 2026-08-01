import { assertFrameworkFixture } from '../framework-consumer-assert.mjs';

// framework-react: a plain Vite + React 19 application consuming ONLY the
// packed `triiiceratops` tarball through `triiiceratops/react`,
// `triiiceratops/testing`, and nothing else. No Svelte, no Svelte Vite plugin,
// no plugin SDK — and no React plugin either, because the app is authored with
// `createElement`.
//
// Five routes, one Playwright pass: the full client contract, a route rendered
// with `react-dom/server` at build time and hydrated in the browser, a route
// that pre-registers a foreign `<triiiceratops-viewer>`, a route that proves
// `config: { debug: true }` reaches the wrapper-side warnings, and a route that
// passes ONE handle to two viewers and must fail loudly.
//
// The fixture also type-checks itself: `typecheck/` compiles under
// `skipLibCheck: false`, `strict`, and `types: []` with NO Svelte installed, so
// a Svelte type leak into `triiiceratops/react` fails this fixture's build.
export default {
    name: 'framework-react',
    // `tsc -p tsconfig.json` over `typecheck/`, before the bundle is built.
    checkScript: 'check',
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
