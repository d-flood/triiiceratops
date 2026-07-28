// docs-examples: compiles every fenced `ts` / `tsx` / `js` example that imports
// package code (extracted from `docs/**/*.md` into `generated/` by
// `scripts/docs-examples.mjs`) against the PACKED tarballs of all six published
// packages. `buildScript: 'check'` runs `tsc --noEmit`; a non-zero exit (a
// broken import path or a wrong public-API/plugin-config shape in the docs)
// fails the fixture. No browser step — this is a pure type-check seam that
// proves published guidance matches what users can install (ticket 26).
export default {
    name: 'docs-examples',
    tarballs: [
        'triiiceratops',
        '@triiiceratops/plugin-sdk',
        '@triiiceratops/plugin-image-manipulation',
        '@triiiceratops/plugin-image-export',
        '@triiiceratops/plugin-pdf-export',
        '@triiiceratops/plugin-annotation-editor',
    ],
    buildScript: 'check',
    browser: false,
    serveDir: '.',
    // The `tsc` build step is the assertion; nothing further to check.
    assert: async () => {},
};
