import { assertAdapterFixture } from '../plugin-adapter-assert.mjs';

// plugin-react: React adapter against live packed ViewerState.
export default {
    name: 'plugin-react',
    buildScript: 'build',
    serveDir: 'dist',
    browser: true,
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    assert: assertAdapterFixture,
};
