// plugin-annotation-conformance: a PLAIN vitest project that runs the adapter
// conformance suite from the packed `@triiiceratops/plugin-annotation-editor/testing`
// subpath. `buildScript: 'test'` runs `vitest run`; a non-zero exit
// (any failing contract case) fails the fixture. No browser step — this proves
// the acceptance criterion "the conformance suite runs from the new `/testing`
// subpath in a packed consumer".
export default {
    name: 'plugin-annotation-conformance',
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-annotation-editor',
    ],
    buildScript: 'test',
    browser: false,
    serveDir: '.',
    // The `vitest run` build step is the assertion; nothing further to check.
    assert: async () => {},
};
