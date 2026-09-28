import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-lit: Lit adapter against live packed ViewerState.
export default {
    name: 'plugin-lit',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
