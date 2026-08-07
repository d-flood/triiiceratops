/**
 * Per-viewer plugin locale service (ticket 08).
 *
 * Combines the owning viewer's active-locale source (CONTEXT.md **Active
 * locale**) with the plugin's own package-owned {@link LocaleCatalog} to produce
 * the {@link PluginLocaleService} handed to the plugin: `current` reports the
 * viewer's active locale, `subscribe` fires when it changes, and `t` resolves a
 * key against the catalog in that locale with English fallback.
 *
 * Core builds this because it owns both the active locale (an inventoried
 * observable member) and the resolution algorithm; the catalog is plugin-owned
 * data that reaches core through `SdkPluginMeta.catalog`. The SDK's test kit
 * (ticket 14) supplies a recording double of this service instead.
 */
/** The fallback locale a missing translation resolves against. */
const FALLBACK_LOCALE = 'en';
/**
 * Fill `{name}` placeholders in a template from `params`. An unknown placeholder
 * is left verbatim so a template/params mismatch is visible rather than silently
 * blanked.
 */
function interpolate(template, params) {
    if (!params)
        return template;
    return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
}
/**
 * Create a per-activation locale service bound to one active-locale source and
 * one plugin catalog.
 */
export function createPluginLocaleService(source, catalog = {}) {
    function resolve(key) {
        const active = source.current;
        return catalog[active]?.[key] ?? catalog[FALLBACK_LOCALE]?.[key] ?? key;
    }
    return {
        get current() {
            return source.current;
        },
        t(key, params) {
            return interpolate(resolve(key), params);
        },
        subscribe(callback) {
            return source.subscribe(callback);
        },
    };
}
