import { defineConfig } from 'vitest/config';

// Adapter unit tests run in jsdom (React/Vue/Lit need a DOM). No framework
// compiler plugins are needed: the tests use `createElement`/`h`/plain classes,
// never JSX or SFCs, so esbuild transpiles them directly.
export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        globals: false,
    },
});
