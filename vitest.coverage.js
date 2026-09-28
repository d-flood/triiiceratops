// Shared vitest v8 coverage options.
export const coverage = {
    provider: 'v8',
    reporter: ['text-summary', 'json-summary', 'json'],
    reportsDirectory: './coverage',
    all: true,
    include: ['src/**/*.{ts,svelte}'],
    exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.svelte.test.ts',
        'src/**/*.d.ts',
        'src/test/**',
        'src/**/test/**',
        'src/**/__tests__/**',
        'src/lib/generated/**',
        'src/e2e/**',
    ],
};
