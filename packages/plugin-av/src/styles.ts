import { definePluginStyles } from '@triiiceratops/plugin-sdk';

// `?raw` rather than an import Vite's CSS pipeline would own: this sheet is
// installed through the SDK style service (root-aware, nonce-aware), not
// appended by a bundler, so it has to reach the bundle as a string. That string
// is what no minifier would otherwise visit, which is why `vite.config.ts`
// compacts it on the way in.
import stageCss from './stage.css?raw';

/**
 * The stage stylesheet and its style-service install id. What the rules do and
 * why they are shaped this way is documented in `stage.css` beside them.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(stageCss, 'stage');
