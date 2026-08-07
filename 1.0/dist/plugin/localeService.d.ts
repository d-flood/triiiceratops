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
/**
 * Create a per-activation locale service bound to one active-locale source and
 * one plugin catalog.
 */
export declare function createPluginLocaleService(source: ActiveLocaleSource, catalog?: LocaleCatalog): PluginLocaleService;
