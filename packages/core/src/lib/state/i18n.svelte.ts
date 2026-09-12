import { getContext, setContext } from 'svelte';

import en from '../messages/en.json';
import { logger } from '../logging/logger';
import type { ViewerConfig } from '../types/config';
import type { LocaleCatalog } from '../types/plugin';
import {
    FALLBACK_LOCALE,
    interpolate,
    mergeCatalogs,
    resolveMessage,
} from '../utils/localeCatalog';

/**
 * A core chrome message name. Derived from the English catalog itself, so a key
 * renamed or deleted in `src/lib/messages/en.json` is a type error at every call
 * site, with no generator in the build.
 */
export type MessageKey = keyof typeof en;

/**
 * The chrome message namespace: one call signature per key, taking the
 * placeholder values that key's template interpolates.
 */
export type Messages = {
    readonly [K in MessageKey]: (
        inputs?: Record<string, string | number>,
    ) => string;
};

/**
 * The only catalog core ships inline. Every other language reaches a viewer
 * through its host's `messages` / `loadMessages`; the German catalog core
 * maintains is published as the `triiiceratops/locales/de.json` asset.
 */
const coreCatalogs: LocaleCatalog = { en };

/** The `ViewerConfig` fields a viewer's chrome catalogs come from. */
export type HostCatalogConfig = Pick<ViewerConfig, 'messages' | 'loadMessages'>;

/** A BCP 47 tag's primary language subtag, lowercased. */
function primarySubtag(tag: string): string {
    return tag.split('-')[0].toLowerCase();
}

/**
 * The locale of the surrounding page, from `<html lang>`, or English when the
 * host declares none.
 *
 * The tag is taken verbatim. It is a CONTENT locale, and which chrome catalogs
 * exist is not a page-global fact — a host supplies them per viewer — so
 * narrowing a tag to one that can actually be rendered happens where a message
 * resolves instead (see {@link chromeLocale}).
 */
function documentLocale(): string {
    const declared =
        typeof document === 'undefined'
            ? ''
            : document.documentElement.lang.trim();
    return declared || FALLBACK_LOCALE;
}

let currentLocale = $state(documentLocale());

/**
 * Held for the life of the module rather than created inline. happy-dom keeps a
 * mutation listener's callback in a `WeakRef` reachable only from the observer
 * (fixed in happy-dom 20.11.6, which `package.json` therefore floors), so an
 * unreferenced observer silently stops delivering records once the collector
 * runs — which under a full suite is after some other test has mounted
 * something heavy, not at a reproducible point.
 */
const langObserver =
    typeof document === 'undefined'
        ? null
        : new MutationObserver(() => {
              currentLocale = documentLocale();
          });

langObserver?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['lang'],
});

/**
 * The page-global (application) locale, tracking the document's declared
 * language. This is the page default a viewer falls back to when it has no
 * configured `config.locale` — not, by itself, any single viewer's active locale
 * (a viewer with `config.locale` set ignores it). See CONTEXT.md **Active
 * locale**.
 */
export const language = {
    get current() {
        return currentLocale;
    },
};

// ==================== HOST-SUPPLIED CATALOGS ====================

/**
 * One viewer's chrome catalogs: the `messages` its config carries, merged per
 * key over core's English, plus whatever its `loadMessages` has resolved.
 *
 * Per viewer rather than per page, because `messages` is per viewer: two viewers
 * on one page may be handed different catalogs, and the loader gate is therefore
 * per viewer too.
 */
export interface HostCatalogs {
    /** Core's English with this viewer's host catalogs merged over it. */
    readonly catalog: LocaleCatalog;
    /**
     * Ask the loader for `locale` unless this viewer can already render it.
     * At most one call per locale per viewer, whatever that call produced: a
     * reader switching away and back must not refetch, and a rejected load must
     * not be retried on every re-render.
     */
    request(locale: string): void;
}

/**
 * The chrome catalogs one viewer root owns, reading its live config. `config` is
 * a getter rather than a value so the catalogs are derived from it — a host that
 * hands over a new `messages` needs no second call, and the first render already
 * has the catalog.
 */
export function createHostCatalogs(
    config: () => HostCatalogConfig,
): HostCatalogs {
    let loaded = $state.raw<LocaleCatalog>({});
    // The loader gate, deliberately outside reactivity: it records what has
    // already been asked for so nothing asks twice, and no render depends on it.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const attempted = new Set<string>();

    const catalog = $derived(
        mergeCatalogs(coreCatalogs, config().messages, loaded),
    );

    return {
        get catalog() {
            return catalog;
        },
        request(locale) {
            const load = config().loadMessages;
            if (!load || attempted.has(locale)) return;
            if (Object.hasOwn(catalog, locale)) return;
            attempted.add(locale);
            void load(locale).then(
                (messages) => {
                    if (messages && Object.keys(messages).length > 0) {
                        loaded = { ...loaded, [locale]: messages };
                        return;
                    }
                    logger.warn(`loadMessages("${locale}"): no catalog.`);
                },
                (error: unknown) => {
                    logger.warn(`loadMessages("${locale}") failed`, error);
                },
            );
        },
    };
}

// ==================== PER-VIEWER ACTIVE LOCALE ====================
//
// Locale is a per-viewer contract (CONTEXT.md **Active locale**): a viewer's
// active locale is the language its own picker chose if the user chose one,
// otherwise its typed `config.locale`, otherwise the page default. Two viewers
// on one page may differ. The mechanism is uniform: the viewer root publishes
// its active locale and its host catalogs into Svelte context via
// {@link provideActiveLocale}, and every chrome component renders messages
// through {@link getMessages}, which resolves each key in that locale. There is
// no second mechanism — chrome never calls the page-global {@link m} (whose
// locale is the document's).
//
// The active locale is a CONTENT locale: it is what IIIF language maps resolve
// against, and it ranges over whatever languages a manifest is authored in.
// The chrome catalogs a viewer has are a much smaller set, so
// {@link chromeLocale} clamps it to one they cover.

/**
 * A reactive holder for one viewer's active locale and host catalogs, shared
 * through Svelte context. `current` is read at each message call, so message
 * rendering tracks the viewer's active locale reactively.
 */
export interface ActiveLocaleSource {
    readonly current: string;
    /** The owning viewer's host catalogs, when it has any. */
    readonly host?: HostCatalogs;
}

const ACTIVE_LOCALE_KEY = Symbol('triiiceratops:activeLocale');

/**
 * Publish the owning viewer's active locale to its chrome subtree. Call once at
 * the viewer root. Descendant components pick it up through {@link getMessages}.
 */
export function provideActiveLocale(source: ActiveLocaleSource): void {
    setContext(ACTIVE_LOCALE_KEY, source);
}

/** The active-locale source from context, or null outside any viewer subtree. */
function useActiveLocaleSource(): ActiveLocaleSource | null {
    return (
        getContext<ActiveLocaleSource | undefined>(ACTIVE_LOCALE_KEY) ?? null
    );
}

/**
 * The locale a chrome message renders in: the first tag `catalog` covers out of
 * the requested one, its primary subtag (`de-AT` → `de`), the page's, and the
 * page's primary subtag — else English.
 *
 * A viewer's active locale is a *content* locale: the language picker offers
 * whatever the manifest is authored in, which is routinely a language no chrome
 * catalog covers. The page's language is the better stand-in than English there,
 * so chrome stays in the surrounding application's language rather than snapping
 * to the base locale.
 */
function chromeLocale(catalog: LocaleCatalog, requested: string): string {
    const candidates = [
        requested,
        primarySubtag(requested),
        currentLocale,
        primarySubtag(currentLocale),
    ];
    for (const candidate of candidates) {
        if (candidate && Object.hasOwn(catalog, candidate)) return candidate;
    }
    return FALLBACK_LOCALE;
}

/**
 * Build a message namespace whose every call renders in the locale and catalogs
 * `source` resolves to at call time.
 *
 * A Proxy rather than 68 closures: the namespace is built once per component
 * initialization, and every key would otherwise be allocated whether or not
 * that component renders it. `has` reports the catalog's keys so `in` checks
 * and enumeration reflect the real message set.
 */
function createLocalizedMessages(
    source: () => ActiveLocaleSource | null,
): Messages {
    return new Proxy({} as Messages, {
        get(_target, prop) {
            const key = prop as string;
            if (!Object.hasOwn(en, key)) return undefined;
            return (inputs?: Record<string, string | number>) => {
                const active = source();
                const catalog = active?.host?.catalog ?? coreCatalogs;
                const locale = chromeLocale(
                    catalog,
                    active?.current ?? currentLocale,
                );
                return interpolate(
                    resolveMessage(catalog, locale, key),
                    inputs,
                );
            };
        },
        has(_target, prop) {
            return Object.hasOwn(en, prop as string);
        },
    });
}

/**
 * The page-global message namespace: messages rendered in the document's
 * language, from the catalogs core ships. Chrome inside a viewer uses
 * {@link getMessages} instead, so this serves only callers with no viewer
 * subtree to read from — and therefore no host catalogs either.
 */
export const m: Messages = createLocalizedMessages(() => null);

/**
 * The chrome-facing message accessor. Returns a namespace whose calls render in
 * the owning viewer's active locale and against its host catalogs (from
 * {@link provideActiveLocale} context), falling back to the page-global locale
 * and core's own catalogs when used outside a viewer subtree. Call once during
 * component initialization (`const m = getMessages();`) and use `m.*()` exactly
 * as before.
 */
export function getMessages(): Messages {
    // Read from context HERE, during initialization, and close over the result:
    // `getContext` is only legal while a component is initializing, and a
    // message call happens whenever the chrome renders.
    const source = useActiveLocaleSource();
    return createLocalizedMessages(() => source);
}

/**
 * A core chrome string looked up by a name core does not own — a plugin's
 * declared `tooltip` or panel `name`. Plugins that predate their own catalogs
 * name a core message; the rest name themselves, and get their own name back.
 */
export function resolveChromeName(messages: Messages, name: string): string {
    const render = (messages as Record<string, (() => string) | undefined>)[
        name
    ];
    return render ? render() : name;
}
