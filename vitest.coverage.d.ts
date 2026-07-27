import type { UserConfig } from 'vitest/config';

/**
 * Type companion for the JS module `vitest.coverage.js` (ticket 22). Derives the
 * exact coverage-options shape from vitest's own config type so the shared
 * object stays assignable to every package's `test.coverage`.
 */
export declare const coverage: NonNullable<
    NonNullable<UserConfig['test']>['coverage']
>;
