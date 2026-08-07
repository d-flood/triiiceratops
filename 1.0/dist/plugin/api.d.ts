/**
 * Core's declared plugin-compatibility surface (ticket 07).
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
 * runtime descriptor. Kept in sync with `package.json`; ticket 21 replaces the
 * literal with a generated/snapshotted value.
 */
export declare const CORE_VERSION = "1.0.0-rc.25";
/**
 * The plugin API version, independent of {@link CORE_VERSION}. Starts at
 * `1.0.0` for the 1.0 line.
 */
export declare const pluginApiVersion = "1.0.0";
/**
 * Runtime capabilities core declares. `osd@5` states the bundled OpenSeadragon
 * major (ADR 0009 / SPEC.md ViewerState contract); it changes only with a core
 * major. Capabilities describe compatibility, not security permissions.
 */
export declare const capabilities: readonly string[];
