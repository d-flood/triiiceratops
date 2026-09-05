import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest.coverage.js';

export default defineConfig({
    test: {
        coverage,
        // The module reads `sessionStorage`, `window.location` and `btoa`.
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        globals: false,
    },
});
