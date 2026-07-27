// vitest-kit: a PLAIN vitest project (no Svelte tooling) that tests a plugin
// through `@triiiceratops/plugin-sdk/testing` against the compiled headless
// `ViewerState` from `triiiceratops/testing`. It consumes ONLY the packed
// tarballs plus vitest + jsdom.
//
// `buildScript: 'test'` runs `vitest run`; a non-zero exit (any failing kit
// assertion or conformance case) fails the fixture. There is no browser step —
// this proves the acceptance criterion "the compiled entry imports and operates
// in a plain vitest project with no Svelte tooling".
export default {
    name: 'vitest-kit',
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    buildScript: 'test',
    browser: false,
    serveDir: '.',
    // The `vitest run` build step is the assertion; nothing further to check.
    assert: async () => {},
};
