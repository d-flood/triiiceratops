import { Features } from 'lightningcss';

// The floor `oklch` and `color-mix` need. Lower targets make lightningcss
// emit color fallbacks; higher ones drop the Safari prefixes. Vite's
// lightningcss minifier reads `build.cssTarget`, not `css.lightningcss.targets`.
export const cssTarget = ['chrome111', 'firefox113', 'safari16.4'];

// Below Safari 17.5 lightningcss pairs every `color-scheme` with dead
// `--lightningcss-light`/`-dark` variables for a `light-dark()` the styles
// never call.
export const lightningcss = { exclude: Features.LightDark };
