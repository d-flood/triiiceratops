/**
 * This plugin's identity, in one place.
 *
 * `definePlugin` and the `pluginerror` reporter both need it, and writing the
 * version out at each site is how the two drifted from each other.
 */
export const PLUGIN_META = {
    name: '@triiiceratops/plugin-pdf-export',
    version: '1.0.0-rc.0',
} as const;
