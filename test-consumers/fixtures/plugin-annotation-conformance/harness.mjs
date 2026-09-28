// plugin-annotation-conformance: conformance suite from the packed `/testing` subpath; `vitest run` is the assertion.
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
    assert: async () => {},
};
