// The bare viewer extends the workspace-shared flat config at the repo root.
// ESLint resolves this file first when run from `apps/viewer`, so the base
// config's root-anchored `apps/**` glob matches nothing from here and the
// boundary has to be re-declared against this app's own anchor.
//
// The call must stay *after* `...base`: the base config policies `**/src/**` as
// package source, which also matches `src/**` here, and flat config resolves the
// overlap last-match-wins. See the ordering invariant in eslint.boundaries.js.
import base from '../../eslint.config.js';
import workspaceBoundaries from '../../eslint.boundaries.js';

export default [...base, ...workspaceBoundaries({ apps: ['**/*'] })];
