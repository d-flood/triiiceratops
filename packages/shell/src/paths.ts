/**
 * Absolute paths to the shell's stylesheets, for the checks that read them.
 *
 * A test asserting that a stylesheet agrees with something outside it has to
 * open the file, and the workspace boundary forbids reaching across a package's
 * directory by path. Naming the files here keeps every such check on the
 * package's public surface, and makes a rename break the build rather than a
 * `readFileSync` at runtime.
 */

import { fileURLToPath } from 'node:url';

/** The colour, type and space tokens, and the `@font-face` declarations. */
export const TOKENS_CSS = fileURLToPath(
    new URL('../tokens.css', import.meta.url),
);

/** The form-control skin. */
export const CONTROLS_CSS = fileURLToPath(
    new URL('../controls.css', import.meta.url),
);
