// This package extends the workspace-shared flat config at the repo root.
// ESLint resolves this file first when run from this package directory, so the
// base config's ignore globs are anchored to this package.
import base from '../../eslint.config.js';

export default base;
