import { assertFrameworkFixture } from '../framework-consumer-assert.mjs';

// framework-react: plain Vite + React 19 app on the packed tarball only. Five routes, one Playwright pass.
export default {
    name: 'framework-react',
    checkScript: 'check',
    buildScript: 'build',
    serveDir: 'dist',
    manifestTarget: 'public/manifest.json',
    browser: true,
    assert: (ctx) =>
        assertFrameworkFixture(ctx, {
            framework: 'react',
            absentPeer: 'vue',
            keepAlive: false,
        }),
};
