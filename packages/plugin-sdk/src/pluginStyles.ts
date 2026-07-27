/**
 * Shape a plugin's global stylesheet + its stable install id into the pair the
 * SDK style service consumes.
 *
 * A plugin's global CSS is installed through the SDK style service
 * (`context.styles.install(STYLES, STYLE_ID)`) so it is root-aware: it reaches
 * the document head for a light-DOM viewer and the shadow root for the Web
 * Component (SPEC.md — "Global plugin CSS is installed through a root-aware style
 * service"). Plugin styling inherits the core public token contract (`--tri-*`)
 * because the plugin's DOM lives inside the viewer root; only plugin-specific
 * rules ship here (SPEC.md — "Plugin panel styling continues to inherit the core
 * public token contract while plugin-specific styles remain package-owned").
 *
 * This helper carries only that shared shape — every plugin still owns its own
 * (namespaced, non-Svelte-scoped) CSS and its install id. `id` is the stable
 * style-service install id, keyed `<pluginName>:<id>` by the service. The
 * returned object is destructured back into the two named exports each plugin
 * ships (`export const { STYLES, STYLE_ID } = definePluginStyles(css, id)`), so
 * consumers and tests see the identical `STYLES` / `STYLE_ID` string exports.
 *
 * Dependency-free (takes and returns strings, imports nothing) so bundling it
 * into a plugin IIFE pulls no runtime and no Svelte into the bundle.
 */
export function definePluginStyles(
    css: string,
    id: string,
): { readonly STYLES: string; readonly STYLE_ID: string } {
    return { STYLES: css, STYLE_ID: id };
}
