// The core package extends the workspace-shared flat config at the repo root.
// ESLint resolves this file first when run from `packages/core`, so its ignore
// globs (`dist/`, `src/lib/paraglide/`, …) are anchored to this package — and so
// is the boundary factory's empty prefix.
import base from '../../eslint.config.js';
import demoBoundary from '../../eslint.boundaries.js';

export default [...base, ...demoBoundary()];
