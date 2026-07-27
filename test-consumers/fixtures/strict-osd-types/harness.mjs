// strict-osd-types (ticket 21): a packed strict-TS consumer that type-checks its
// `index.ts` against the PACKED core tarball under `skipLibCheck: false` with
// `types: []`. `buildScript: 'check'` runs `tsc`; a non-zero exit (e.g. an
// unresolved `OpenSeadragon` namespace in core's public `.d.ts`) fails the
// fixture. No browser step — the compile is the proof that `viewerState.osdViewer`
// and `ViewerConfig.openSeadragonConfig` resolve without the consumer manually
// installing `@types/openseadragon`.
export default {
    name: 'strict-osd-types',
    tarballs: ['triiiceratops'],
    buildScript: 'check',
    browser: false,
    serveDir: '.',
    // The `tsc` build step is the assertion; nothing further to check.
    assert: async () => {},
};
