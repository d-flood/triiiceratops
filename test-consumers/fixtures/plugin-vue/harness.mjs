import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-vue: a Vite app whose Vue plugin consumes the packed
// `@triiiceratops/plugin-sdk/vue` adapter against a live packed `ViewerState`.
export default {
    name: 'plugin-vue',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
