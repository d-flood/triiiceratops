import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest.coverage.js';

// Adapter unit tests run in jsdom (React/Vue/Lit need a DOM). No framework
// compiler plugins are needed: the tests use `createElement`/`h`/plain classes,
// never JSX or SFCs, so esbuild transpiles them directly.
export default defineConfig({
    test: {
        coverage,
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        globals: false,
    },
});
