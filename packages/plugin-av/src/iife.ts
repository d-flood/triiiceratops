/**
 * Self-contained IIFE entry — loadable from a `<script>` tag with no bundler.
 *
 * Loading this bundle registers the plugin factory into
 * `window.Triiiceratops.plugins`. It does NOT activate anything — activation is
 * explicit and per viewer:
 *
 * ```html
 * <script src="triiiceratops-element.iife.js"></script>
 * <script src="triiiceratops-plugin-av.iife.js"></script>
 * <script>
 *   const viewer = document.querySelector('triiiceratops-viewer');
 *   viewer.plugins = [window.Triiiceratops.plugins.get('@triiiceratops/plugin-av')];
 * </script>
 * ```
 *
 * **Core's script must come first, and this is the one plugin of which that is
 * true.** Every other plugin IIFE bundles its own Svelte and may therefore load
 * in either order; this one reads core's Svelte runtime off
 * `window.Triiiceratops`, so with no core on the page yet there is nothing to
 * read. That is the price of not shipping a second copy of the runtime —
 * 11.7 KB gzip — and it is paid by a first-party plugin released from core's own
 * repo at core's own Svelte version, never by a third-party one, which must keep
 * bundling.
 *
 * Loading it out of order is a named diagnostic, not a stack trace: the skew
 * gate in `sharedRuntimeGate.ts` runs ahead of everything here and returns
 * without registering. Nothing in this file may therefore assume the gate
 * passed — it runs only if the gate let it.
 *
 * That gate is also why registration comes from `plugin-sdk/register-shared`
 * rather than `plugin-sdk/register`: the bootstrapping entry exists so a plugin
 * can create the namespace before core does, and this bundle cannot even be
 * evaluated until core has created it.
 */

import { registerBrowserPlugin } from '@triiiceratops/plugin-sdk/register-shared';

import { AvPlugin } from './plugin';

registerBrowserPlugin(AvPlugin);
