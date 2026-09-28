// Boundary re-declared against this app's anchor; must stay after `...base` (last-match-wins).
import base from '../../eslint.config.js';
import workspaceBoundaries from '../../eslint.boundaries.js';

export default [...base, ...workspaceBoundaries({ apps: ['**/*'] })];
