// Shared vitest v8 coverage options (ticket 22).
//
// Every package measures line + branch coverage with the v8 provider and emits a
// machine-readable `coverage/coverage-summary.json`. Those per-package summaries
// feed the committed `coverage-baseline.json` floor, enforced in CI by
// `scripts/coverage/check.mjs` (coverage may not drop below the baseline;
// raising the baseline is a normal reviewed commit).
//
// `all: true` instruments every source file in `include` — not only files a test
// happened to import — so deleting a test lowers the covered-line count against a
// fixed denominator and is caught by the compare. Generated code, demos, tests,
// and type-only declarations are excluded from the denominator.
export const coverage = {
    provider: 'v8',
    reporter: ['text-summary', 'json-summary'],
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
        // Generated code (relocated + gitignored; type-checked via build).
        'src/lib/paraglide/**',
        'src/paraglide/**',
        'src/lib/generated/**',
        // Demo / dev-server only sources (never shipped).
        'src/demo/**',
        'src/demo-consumer/**',
        'src/demo-webcomponent/**',
    ],
};
