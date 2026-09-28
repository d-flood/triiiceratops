import { assertFrameworkFixture } from '../framework-consumer-assert.mjs';

// framework-vue: plain Vite + Vue 3.5 app on the packed tarball only. Five routes, one Playwright pass.
export default {
    name: 'framework-vue',
    checkScript: 'check',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    assert: (ctx) =>
        assertFrameworkFixture(ctx, {
            framework: 'vue',
            absentPeer: 'react',
            keepAlive: true,
        }),
};
