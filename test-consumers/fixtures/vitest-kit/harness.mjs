// vitest-kit: plain vitest project on packed tarballs; `vitest run` is the assertion.
export default {
    name: 'vitest-kit',
    tarballs: ['triiiceratops', '@triiiceratops/plugin-sdk'],
    buildScript: 'test',
    browser: false,
    serveDir: '.',
    assert: async () => {},
};
