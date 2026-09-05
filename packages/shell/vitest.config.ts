import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.coverage.js';

export default defineConfig({
    test: {
        coverage,
        include: ['tests/**/*.test.ts'],
    },
});
