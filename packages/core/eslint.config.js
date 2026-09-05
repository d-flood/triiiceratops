// The core package extends the workspace-shared flat config at the repo root.
// ESLint resolves this file first when run from `packages/core`, so its ignore
// globs (`dist/`, `src/lib/paraglide/`, …) are anchored to this package. The
// workspace boundary rules come from the base config and must not be restated
// here: they are anchored so that they match from either cwd, and every other
// package inherits them the same way.
import base from '../../eslint.config.js';

export default base;
