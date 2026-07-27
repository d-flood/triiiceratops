import type { PluginError } from '@triiiceratops/plugin-sdk';

/**
 * Package identity carried on every structured failure this plugin reports.
 * Kept beside the panel (not imported from `plugin.ts`) so this module has no
 * dependency on the Svelte view; the values mirror the `definePlugin` meta.
 */
const PLUGIN_NAME = '@triiiceratops/plugin-image-download';
const PLUGIN_VERSION = '1.0.0-rc.0';

/**
 * Route an actionable download/export failure to the host through the structured
 * `pluginerror` channel (ticket 09 shape, {@link PluginError}) instead of the
 * browser console; `node` is the panel's own root element, which lives inside the viewer
 * root, so a bubbling + composed event reaches the host's `pluginerror` listener
 * and escapes the shadow root for a Web Component host — the same delivery core
 * uses for lifecycle failures. The event name is core's `PLUGIN_ERROR_EVENT`
 * (`'pluginerror'`); it is used as a string literal so this framework-neutral
 * bundle never pulls in core's runtime entry.
 *
 * `phase` is `'command'`: the failure occurred while carrying out a user-driven
 * viewer operation (the download action), the closest lifecycle phase in
 * {@link PluginError}. `retry` re-runs that operation.
 */
export function reportImageDownloadError(
    node: EventTarget,
    error: unknown,
    retry: () => void,
): void {
    const detail: PluginError = {
        pluginName: PLUGIN_NAME,
        pluginVersion: PLUGIN_VERSION,
        phase: 'command',
        error,
        retry,
    };
    node.dispatchEvent(
        new CustomEvent('pluginerror', {
            detail,
            bubbles: true,
            composed: true,
        }),
    );
}
