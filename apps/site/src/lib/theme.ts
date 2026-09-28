/* Absence is the third state ("follow the machine") and must never be written back. */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'triiiceratops.theme';

export const THEME_ATTRIBUTE = 'data-theme';

function isTheme(value: unknown): value is Theme {
    return value === 'light' || value === 'dark';
}

export function readStoredTheme(): Theme | null {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return isTheme(stored) ? stored : null;
    } catch {
        return null;
    }
}

export function storeTheme(theme: Theme): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Choice applies to this document either way.
    }
}

export function currentTheme(): Theme {
    const explicit = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    if (isTheme(explicit)) return explicit;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

export function chooseTheme(theme: Theme): void {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
    storeTheme(theme);
}
