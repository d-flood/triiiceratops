// strict-dts: strict `tsc` against the packed tarball; the compile is the proof.
export default {
    name: 'strict-dts',
    tarballs: ['triiiceratops'],
    buildScript: 'check',
    browser: false,
    serveDir: '.',
    assert: async () => {},
};
