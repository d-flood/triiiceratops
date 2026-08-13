/**
 * Core's declared plugin-compatibility surface.
 *
 * These values are what the SDK negotiates a plugin's declared `coreRange`,
 * `pluginApiRange`, and `requiredCapabilities` against at activation. Core
 * passes them into every activation via the {@link PluginHost}; the SDK never
 * imports them directly (keeping the SDK framework-neutral and the packages
 * decoupled).
 *
 * The plugin API version is intentionally separate from the core package
 * version (SPEC.md "Plugin SDK And Browser API"): additive capabilities bump
 * the plugin API minor; removals or semantic changes require a plugin API
 * major.
 */

/**
 * The core package version, exposed for `coreRange` negotiation and the browser
 * runtime descriptor. Kept in sync with `package.json`; a future change should
 * replace the literal with a generated/snapshotted value.
 */
export const CORE_VERSION = '1.0.0-rc.37';

/**
 * The plugin API version, independent of {@link CORE_VERSION}. `1.1.0` for the
 * additive {@link capabilities} entry below.
 */
export const pluginApiVersion = '1.1.0';

/**
 * Runtime capabilities core declares. Capabilities describe compatibility, not
 * security permissions.
 *
 * A capability names a genuinely OPTIONAL runtime feature a plugin fails closed
 * without — not a dependency's major. The one that ever meant the latter
 * declared the bundled major of the third-party renderer; the renderer is now
 * first-party and governed by core's own semver, which `coreRange` already
 * negotiates, so that capability was **retired with no successor** and a plugin
 * still declaring the retired identifier fails activation. That is the correct
 * outcome: it needs a renderer object that no longer exists.
 *
 * - `canvas-claim` — `ViewerState.claimCanvas`, the seam a plugin owning a
 *   canvas's non-image content activates over (ADR 0017). Without it such a
 *   plugin would activate against an older viewer and silently render over an
 *   unsupported-content placard it could not suppress.
 * - `published-state` — an activation may publish one state object
 *   (`PluginContext.publishState`) that hosts reach through
 *   `viewerState.getPluginState(pluginId)` (ADR 0018). A plugin whose whole
 *   external control surface is its published state requires it, so an older
 *   core refuses activation instead of mounting a plugin no host can drive.
 */
export const capabilities: readonly string[] = ['canvas-claim', 'published-state'];
