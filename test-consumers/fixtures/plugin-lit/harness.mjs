import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-lit: a Vite app whose Lit plugin consumes the packed
// `@triiiceratops/plugin-sdk/lit` adapter against a live packed `ViewerState`.
export default {
    name: 'plugin-lit',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
