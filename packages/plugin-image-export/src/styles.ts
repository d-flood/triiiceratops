import { definePluginStyles } from '@triiiceratops/plugin-sdk';

// `?raw` rather than an import Vite's CSS pipeline would own: this sheet is
// installed through the SDK style service (root-aware, nonce-aware), not
// appended by a bundler, so it has to reach the bundle as a string. That string
// is what no minifier would otherwise visit, which is why the shared plugin
// build compacts it on the way in.
import panelCss from './panel.css?raw';

/**
 * The plugin's package-owned global CSS and its style-service install id. What
 * the rules cover, and where core's ownership of the panel chrome stops, is
 * documented in `panel.css` beside them.
 */
export const { STYLES, STYLE_ID } = definePluginStyles(panelCss, 'panel');
