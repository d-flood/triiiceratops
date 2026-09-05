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
    /**
     * Where every curator-facing console line points: the skew gate's refusals
     * and the degradation warnings alike. One anchor rather than a URL per
     * message, so moving the docs is one edit here rather than eight; the value
     * is inlined into the built bundles either way, so a move still re-ships
     * them.
     *
     * The publish root and `/latest/` are the only version-independent paths
     * `scripts/docs-publish.mjs` writes — every page lives under a
     * `<major.minor>/` tree — so this points at the root redirect stub rather
     * than at a per-page path that would 404 or a pinned version that would rot
     * at the next release.
     */
    docs: 'https://d-flood.github.io/triiiceratops/',
} as const;
