/**
 * The reader's colour-scheme choice: three states, one key.
 *
 * `'light'` and `'dark'` are explicit choices. *No stored value* is the third
 * state and the default — the page follows `prefers-color-scheme` — so absence
 * is meaningful and must never be written back as a value.
 *
 * The key is namespaced against everything else this origin stores, and the one
 * key serves the whole domain: the marketing routes, the documentation and the
 * playground are all routes of this application and share the one toggle, so
 * the choice travels with the reader rather than flashing at each boundary.
 *
 * The stored choice is applied to `<html>` by the inline blocking script in
 * `app.html`, before first paint. Nothing here runs early enough to do that job;
 * this module is the control that changes the choice, and the key both share.
 */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'triiiceratops.theme';

export const THEME_ATTRIBUTE = 'data-theme';

function isTheme(value: unknown): value is Theme {
    return value === 'light' || value === 'dark';
}

/**
 * The reader's explicit choice, or `null` for "follow the machine".
 *
 * A throwing accessor — a private window, a browser set to block site data —
 * reads as no choice rather than as an error. Losing a preference is a smaller
 * failure than a page that does not render.
 */
export function readStoredTheme(): Theme | null {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return isTheme(stored) ? stored : null;
    } catch {
        return null;
    }
}

/** Persist an explicit choice, tolerating an unavailable store. */
export function storeTheme(theme: Theme): void {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
        // Nothing to recover: the choice applies to this document either way.
    }
}

/**
 * The scheme the document is currently showing.
 *
 * Read from the document and the machine rather than from state, so the answer
 * is the same one the stylesheet is acting on — including on the first click
 * after hydration, when no component has yet observed anything.
 */
export function currentTheme(): Theme {
    const explicit = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    if (isTheme(explicit)) return explicit;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
}

/** Apply an explicit choice to this document and remember it. */
export function chooseTheme(theme: Theme): void {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
    storeTheme(theme);
}
