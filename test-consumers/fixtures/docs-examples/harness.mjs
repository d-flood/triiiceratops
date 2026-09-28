// docs-examples: `tsc` over extracted doc samples against packed tarballs. The build is the assertion.
export default {
    name: 'docs-examples',
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-av',
        '@triiiceratops/plugin-image-manipulation',
        '@triiiceratops/plugin-image-export',
        '@triiiceratops/plugin-pdf-export',
        '@triiiceratops/plugin-annotation-editor',
    ],
    buildScript: 'check',
    browser: false,
    serveDir: '.',
    assert: async () => {},
};
