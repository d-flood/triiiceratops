// strict-dts: a packed strict-TS consumer that type-checks its `index.ts`
// against the PACKED core tarball under `skipLibCheck: false` with `types: []`.
// `buildScript: 'check'` runs `tsc`; a non-zero exit — an ambient global, or a
// third-party type in core's public `.d.ts` that the consumer has not installed
// — fails the fixture. No browser step: the compile is the proof.
export default {
    name: 'strict-dts',
    tarballs: ['triiiceratops'],
    buildScript: 'check',
    browser: false,
    serveDir: '.',
    // The `tsc` build step is the assertion; nothing further to check.
    assert: async () => {},
};
