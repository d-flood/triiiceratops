import { defineConfig } from 'vitest/config';

// A PLAIN vitest project: no vite-plugin-svelte, no Svelte compiler, no
// framework tooling. The only non-vitest dependency is `jsdom` (vitest's DOM
// environment), which the real, compiled `ViewerState` needs for its
// reactivity-driven subscription watcher (`typeof window !== 'undefined'`).
export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.js'],
    },
});
