import { defineConfig } from 'vitest/config';

// A PLAIN vitest project (node environment, no Svelte tooling) that runs the
// adapter conformance suite exported from the packed
// `@triiiceratops/plugin-annotation-editor/testing` subpath. The suite is pure
// storage behavior, so no DOM is needed.
export default defineConfig({
    test: {
        include: ['src/**/*.test.js'],
    },
});
