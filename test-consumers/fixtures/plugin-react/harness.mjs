import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-react: a Vite app whose React plugin consumes the packed
// `@triiiceratops/plugin-sdk/react` adapter against a live packed `ViewerState`.
export default {
    name: 'plugin-react',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
