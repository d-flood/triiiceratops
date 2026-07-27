import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-svelte: a Vite + Svelte app whose Svelte 5 plugin consumes the packed
// `@triiiceratops/plugin-sdk/svelte` adapter against a live packed `ViewerState`.
export default {
    name: 'plugin-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
