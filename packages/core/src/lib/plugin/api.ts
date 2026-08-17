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
 * runtime descriptor.
 *
 * A literal rather than an import of `package.json`, so the element bundle
 * carries no JSON module — but it is the version a plugin's `coreRange` is
 * matched against, so drift refuses plugins pinned to a version that was
 * actually published, naming one that was not. `api.version.test.ts` reads
 * `package.json` and fails on any disagreement; bump both together.
 */
export const CORE_VERSION = '1.0.0-rc.36';

/**
 * The plugin API version, independent of {@link CORE_VERSION}. `1.5.0` for the
 * transcript control on the `transport-chrome` {@link capabilities} entry below,
 * over the `1.4.0` that added that entry.
 *
 * A minor rather than the major a semantic change would take, because the
 * contract it widens has not shipped: `transport-chrome` arrived in this same
 * unreleased line, so its view, port and icon set growing a control is still
 * that seam being drafted. Once a core carrying it is published, adding a
 * REQUIRED member to any of the three becomes a major — a claimant built against
 * the published contract would no longer satisfy it.
 */
export const pluginApiVersion = '1.5.0';

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
 * - `shared-svelte-runtime` — core publishes the curated `svelte` and
 *   `svelte/internal/client` helpers on `window.Triiiceratops`
 *   (`SharedSvelteRuntime` in `browser-runtime.ts`), which a FIRST-PARTY plugin
 *   IIFE consumes instead of bundling a second copy. `svelte/internal` is
 *   private API with no semver guarantee, so a plugin built against it must
 *   fail closed on a core that shares no runtime — or shares a different one —
 *   rather than throw an unnamed `TypeError` out of a compiled component. A
 *   plugin declaring this must also pin `coreRange` exactly: the capability
 *   says the runtime is shared, and only the exact version says it is the same
 *   runtime.
 * - `shared-core-utils` — core publishes a curated handful of its own utility
 *   functions on `window.Triiiceratops.core` (`SharedCoreUtils` in
 *   `browser-runtime.ts`), which a FIRST-PARTY plugin IIFE reads instead of
 *   bundling a second copy of the modules behind them. A plugin whose bundle
 *   externalizes `triiiceratops` requires it, so a core that publishes no such
 *   member refuses activation rather than leaving the plugin dereferencing
 *   `undefined`.
 * - `transport-chrome` — a claimant of timed media may register a view model of
 *   playback facts and a port of playback commands
 *   (`ViewerState.registerTransportChrome`), which core renders as playback
 *   controls in its own control bar. A plugin whose only playback chrome is the
 *   one core renders requires it, so a core too old to render it refuses
 *   activation with a named diagnostic rather than mounting a plugin whose
 *   controls never appear.
 */
export const capabilities: readonly string[] = [
    'canvas-claim',
    'published-state',
    'shared-svelte-runtime',
    'shared-core-utils',
    'transport-chrome',
];
