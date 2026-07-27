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
 * <script src="triiiceratops-plugin-pdf-export.iife.js"></script>
 * <script>
 *   const viewer = document.querySelector('triiiceratops-viewer');
 *   viewer.plugins = [
 *     window.Triiiceratops.plugins.get('@triiiceratops/plugin-pdf-export'),
 *   ];
 * </script>
 * ```
 *
 * The plugin script may load before OR after core: the registry is bootstrapped
 * order-independently, so both script orders work. This bundle carries its own
 * `pdf-lib` (bundled in), so no bundler and no separate dependency install is
 * required for the no-bundler path.
 */

import { PdfExportPlugin } from './plugin';
import { registerBrowserPlugin } from './register';

registerBrowserPlugin(PdfExportPlugin);
