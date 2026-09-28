import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-svelte: Svelte adapter against live packed ViewerState.
export default {
    name: 'plugin-svelte',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
