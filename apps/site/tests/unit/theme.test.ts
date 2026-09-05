/**
 * The scheme choice: its three states, and the script that applies it.
 *
 * The no-flash requirement is a fact about *where* the script is and *how* it
 * loads, which no browser assertion can distinguish from a script that happens
 * to be fast on the test machine. It is checked here, against the template.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY, readStoredTheme, storeTheme } from '../../src/lib/theme';

const APP_HTML = readFileSync(
    fileURLToPath(new URL('../../src/app.html', import.meta.url)),
    'utf8',
);

/** Install a `localStorage` for one test, and hand back what it recorded. */
function withStore(store: Partial<Storage>) {
    vi.stubGlobal('localStorage', store);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('the inline script in app.html', () => {
    const script = APP_HTML.slice(
        APP_HTML.indexOf('<script>'),
        APP_HTML.indexOf('</script>'),
    );

    it('is inline and blocking', () => {
        expect(script).not.toBe('');
        // A `src`, `defer`, `async` or `type="module"` script runs after the
        // first paint, which is exactly the flash this exists to prevent.
        expect(APP_HTML).not.toMatch(/<script[^>]+(src|defer|async|type)=/);
    });

    it('runs before the head SvelteKit fills, and so before the stylesheet', () => {
        expect(APP_HTML.indexOf('<script>')).toBeLessThan(
            APP_HTML.indexOf('%sveltekit.head%'),
        );
        expect(APP_HTML.indexOf('%sveltekit.head%')).toBeLessThan(
            APP_HTML.indexOf('%sveltekit.body%'),
        );
    });

    it('reads the same namespaced key the module writes', () => {
        expect(script).toContain(THEME_STORAGE_KEY);
    });

    it('tolerates a throwing accessor, and writes nothing when no choice is stored', () => {
        expect(script).toContain('try');
        expect(script).toContain('catch');
        expect(script).not.toContain('setItem');
    });
});

describe('reading the stored choice', () => {
    it('returns the choice when one is stored', () => {
        withStore({ getItem: () => 'dark' });
        expect(readStoredTheme()).toBe('dark');
    });

    it('returns null when nothing is stored, so the machine preference wins', () => {
        withStore({ getItem: () => null });
        expect(readStoredTheme()).toBeNull();
    });

    it('ignores a value that is not a scheme', () => {
        withStore({ getItem: () => 'sepia' });
        expect(readStoredTheme()).toBeNull();
    });

    it('survives a throwing accessor', () => {
        withStore({
            getItem: () => {
                throw new Error('site data blocked');
            },
        });
        expect(readStoredTheme()).toBeNull();
    });
});

describe('storing the choice', () => {
    it('writes the namespaced key', () => {
        const written: [string, string][] = [];
        withStore({
            setItem: (key: string, value: string) => {
                written.push([key, value]);
            },
        });
        storeTheme('light');
        expect(written).toEqual([[THEME_STORAGE_KEY, 'light']]);
    });

    it('does not throw when the store is unavailable', () => {
        withStore({
            setItem: () => {
                throw new Error('site data blocked');
            },
        });
        expect(() => storeTheme('dark')).not.toThrow();
    });
});

describe('the key', () => {
    it('is namespaced, because two surfaces on this origin store a scheme', () => {
        expect(THEME_STORAGE_KEY).not.toBe('theme');
        expect(THEME_STORAGE_KEY.startsWith('triiiceratops.')).toBe(true);
    });
});
