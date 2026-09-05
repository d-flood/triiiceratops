/**
 * Per-viewer plugin locale service.
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
 * supplies a recording double of this service instead.
 */

import type { LocaleCatalog, PluginLocaleService } from '../types/plugin';

/**
 * The owning viewer's active-locale observable, as the style/locale services see
 * it: a synchronous `current` read plus a change subscription that delivers the
 * new tag. Core builds one from `ViewerState.activeLocale`; the value is derived
 * from `config.locale` (else the page default), so a `config.locale` change
 * propagates here.
 */
export interface ActiveLocaleSource {
    /** The viewer's current active locale (BCP-47). */
    readonly current: string;
    /** Observe active-locale changes; returns an unsubscribe. */
    subscribe(callback: (locale: string) => void): () => void;
}

/** The fallback locale a missing translation resolves against. */
const FALLBACK_LOCALE = 'en';

/**
 * Fill `{name}` placeholders in a template from `params`. An unknown placeholder
 * is left verbatim so a template/params mismatch is visible rather than silently
 * blanked.
 */
function interpolate(
    template: string,
    params?: Record<string, string | number>,
): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
    );
}

/**
 * Create a per-activation locale service bound to one active-locale source and
 * one plugin catalog.
 */
export function createPluginLocaleService(
    source: ActiveLocaleSource,
    catalog: LocaleCatalog = {},
): PluginLocaleService {
    function resolve(key: string): string {
        const active = source.current;
        return catalog[active]?.[key] ?? catalog[FALLBACK_LOCALE]?.[key] ?? key;
    }

    return {
        get current(): string {
            return source.current;
        },
        t(key: string, params?: Record<string, string | number>): string {
            return interpolate(resolve(key), params);
        },
        subscribe(callback: (locale: string) => void): () => void {
            return source.subscribe(callback);
        },
    };
}
