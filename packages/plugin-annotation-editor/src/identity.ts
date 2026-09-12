/**
 * This plugin's identity, in one place.
 *
 * The version reaches consumers as the plugin's declared identity, and writing
 * it out at the `definePlugin` site is how it drifted from the package.
 */
export const PLUGIN_META = {
    name: '@triiiceratops/plugin-annotation-editor',
    version: '1.0.0',
} as const;
