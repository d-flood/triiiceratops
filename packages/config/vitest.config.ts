import { defineConfig } from 'vitest/config';

import { coverage } from '../../vitest.coverage.js';

export default defineConfig({
    test: {
        coverage,
        // The module reads `sessionStorage` and `window.location`.
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        globals: false,
    },
});
