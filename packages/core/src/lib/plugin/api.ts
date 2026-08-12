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
export const CORE_VERSION = '1.0.0-rc.25';

/**
 * The plugin API version, independent of {@link CORE_VERSION}. Starts at
 * `1.0.0` for the 1.0 line.
 */
export const pluginApiVersion = '1.0.0';

/**
 * Runtime capabilities core declares. Capabilities describe compatibility, not
 * security permissions.
 *
 * **Empty, deliberately.** The one capability that ever existed here declared
 * the bundled major of the third-party renderer, because that renderer's
 * surface belonged to a
 * third party and core could only promise the pass-through field's existence and
 * timing. The renderer is now first-party and its surface is governed by core's
 * own semver, which `coreRange` already negotiates — so that capability was
 * **retired with no successor**, and no `renderer@1` replaced it. Reintroducing
 * one would recreate the versioning split this work removed.
 *
 * A plugin still declaring the retired identifier fails activation. That is the
 * correct outcome: it needs a renderer object that no longer exists.
 *
 * The vocabulary itself is not retired — a future capability naming a genuinely
 * optional runtime feature (rather than a dependency's major) belongs here.
 */
export const capabilities: readonly string[] = [];
