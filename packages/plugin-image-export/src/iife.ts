/**
 * Self-contained IIFE entry — loadable from a `<script>` tag with no bundler.
 *
 * Loading this bundle bootstraps the `window.Triiiceratops` namespace if absent
 * and registers the plugin factory into `window.Triiiceratops.plugins` (SPEC.md
 * "Browser IIFEs register package-qualified factories in one `window.Triiiceratops`
 * namespace"). It does NOT activate anything — activation is explicit and per
 * viewer:
 *
 * ```html
 * <script src="triiiceratops-element.iife.js"></script>
 * <script src="triiiceratops-plugin-image-export.iife.js"></script>
 * <script>
 *   const viewer = document.querySelector('triiiceratops-viewer');
 *   viewer.plugins = [
 *     window.Triiiceratops.plugins.get('@triiiceratops/plugin-image-export'),
 *   ];
 * </script>
 * ```
 *
 * The plugin script may load before OR after core: the registry is bootstrapped
 * order-independently, so both script orders work.
 */

import { ImageDownloadPlugin } from './plugin';
import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register';

registerBrowserPlugin(ImageDownloadPlugin);
