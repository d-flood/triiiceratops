import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-vue: Vue adapter against live packed ViewerState.
export default {
    name: 'plugin-vue',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
