/**
 * Message resolution against a {@link LocaleCatalog}.
 *
 * One resolver serves both consumers: core's own chrome messages
 * (`state/i18n.svelte.ts`) and the per-viewer plugin locale service
 * (`plugin/localeService.ts`). Core gains no second formatter.
 */

import type { LocaleCatalog } from '../types/plugin';

/** The fallback locale a missing translation resolves against. */
export const FALLBACK_LOCALE = 'en';

/**
 * Fill `{name}` placeholders in a template from `params`. An unknown placeholder
 * is left verbatim so a template/params mismatch is visible rather than silently
 * blanked.
 */
export function interpolate(
    template: string,
    params?: Record<string, string | number>,
): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
    );
}

/**
 * Look a key up in `locale`, then in English, then answer with the key itself.
 *
 * The per-key English fallback (rather than per-catalog) is what lets a partial
 * catalog translate the strings it covers and leave the rest in English.
 */
export function resolveMessage(
    catalog: LocaleCatalog,
    locale: string,
    key: string,
): string {
    return catalog[locale]?.[key] ?? catalog[FALLBACK_LOCALE]?.[key] ?? key;
}

/**
 * One catalog from several, a later source winning per key.
 *
 * Locales left with no message at all are dropped: a host names a locale its
 * loader can supply by mapping it to an empty object, and such a locale must
 * not look renderable before the catalog arrives.
 */
export function mergeCatalogs(
    ...sources: readonly (LocaleCatalog | undefined)[]
): LocaleCatalog {
    const merged: LocaleCatalog = {};
    for (const source of sources) {
        for (const [locale, messages] of Object.entries(source ?? {})) {
            if (!messages) continue;
            merged[locale] = { ...merged[locale], ...messages };
        }
    }
    for (const [locale, messages] of Object.entries(merged)) {
        if (Object.keys(messages).length === 0) delete merged[locale];
    }
    return merged;
}
