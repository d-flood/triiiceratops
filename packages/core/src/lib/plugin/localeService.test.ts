// Per-viewer plugin locale service tests (ticket 08).
//
// Covers catalog resolution in the active locale, English fallback for a missing
// key, `{param}` interpolation, and `subscribe` firing when the active locale
// changes.

import { describe, expect, it } from 'vitest';

import {
    createPluginLocaleService,
    type ActiveLocaleSource,
} from './localeService';
import type { LocaleCatalog } from '../types/plugin';

const CATALOG: LocaleCatalog = {
    en: {
        greeting: 'Hello',
        apples: 'You have {count} apples',
        onlyEn: 'English',
    },
    de: { greeting: 'Hallo', apples: 'Du hast {count} Äpfel' },
};

/** A hand-driven active-locale source the test can mutate + notify. */
function makeSource(initial: string) {
    let current = initial;
    const listeners = new Set<(l: string) => void>();
    const source: ActiveLocaleSource = {
        get current() {
            return current;
        },
        subscribe(cb) {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
    };
    return {
        source,
        set(next: string) {
            current = next;
            for (const cb of [...listeners]) cb(next);
        },
    };
}

describe('plugin locale service', () => {
    it('resolves the catalog in the active locale (de)', () => {
        const { source } = makeSource('de');
        const locale = createPluginLocaleService(source, CATALOG);
        expect(locale.current).toBe('de');
        expect(locale.t('greeting')).toBe('Hallo');
    });

    it('falls back to the English catalog for a key missing in the active locale', () => {
        const { source } = makeSource('de');
        const locale = createPluginLocaleService(source, CATALOG);
        // `onlyEn` exists only in `en`.
        expect(locale.t('onlyEn')).toBe('English');
    });

    it('falls back to the key itself when it is nowhere in the catalog', () => {
        const { source } = makeSource('de');
        const locale = createPluginLocaleService(source, CATALOG);
        expect(locale.t('missing.key')).toBe('missing.key');
    });

    it('interpolates {param} placeholders', () => {
        const { source } = makeSource('en');
        const locale = createPluginLocaleService(source, CATALOG);
        expect(locale.t('apples', { count: 3 })).toBe('You have 3 apples');
    });

    it('leaves an unknown placeholder verbatim', () => {
        const { source } = makeSource('en');
        const locale = createPluginLocaleService(source, CATALOG);
        expect(locale.t('apples', {})).toBe('You have {count} apples');
    });

    it('tracks the active locale live through `current` and `t`', () => {
        const driver = makeSource('en');
        const locale = createPluginLocaleService(driver.source, CATALOG);
        expect(locale.t('greeting')).toBe('Hello');
        driver.set('de');
        expect(locale.current).toBe('de');
        expect(locale.t('greeting')).toBe('Hallo');
    });

    it('subscribe fires with the new tag when the active locale changes', () => {
        const driver = makeSource('en');
        const locale = createPluginLocaleService(driver.source, CATALOG);
        const seen: string[] = [];
        const unsub = locale.subscribe((l) => seen.push(l));

        driver.set('de');
        expect(seen).toEqual(['de']);

        unsub();
        driver.set('en');
        expect(seen).toEqual(['de']); // no more callbacks after unsubscribe.
    });

    it('with no catalog, `t` returns the key (with interpolation)', () => {
        const { source } = makeSource('en');
        const locale = createPluginLocaleService(source);
        expect(locale.t('anything')).toBe('anything');
        expect(locale.t('hi {name}', { name: 'Ada' })).toBe('hi Ada');
    });
});
