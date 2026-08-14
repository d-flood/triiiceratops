/**
 * This plugin's identity, in one place.
 *
 * `definePlugin` and the `pluginerror` reporter both need it, and writing the
 * version out at each site is how the two drift from each other.
 */
export const PLUGIN_META = {
    name: '@triiiceratops/plugin-av',
    version: '1.0.0-rc.0',
    /**
     * The id this viewer knows the plugin by — its chrome id, its overlay-layer
     * prefix, and the key `viewerState.getPluginState` answers to.
     */
    uiId: 'av',
} as const;
