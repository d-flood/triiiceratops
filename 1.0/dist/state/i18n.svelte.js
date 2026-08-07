// Re-export messages directly from paraglide
// The 'm' export is provided by paraglide's messages.js
export { m } from '../paraglide/messages.js';
import { getContext, setContext } from 'svelte';
import { m } from '../paraglide/messages.js';
import { getLocale, setLocale as baseSetLocale, overwriteSetLocale, } from '../paraglide/runtime.js';
// For SSR compatibility, we use a simple variable instead of $state()
let currentLocale = $state(getLocale());
// Capture the original setLocale before overwriting it
const originalSetLocale = baseSetLocale;
// Wrap setLocale to track locale changes
overwriteSetLocale((newLocale, options) => {
    originalSetLocale(newLocale, options);
    currentLocale = getLocale();
});
/**
 * The page-global (application) locale, reactive to Paraglide `setLocale`. This
 * is the page default a viewer falls back to when it has no configured
 * `config.locale` — not, by itself, any single viewer's active locale (a viewer
 * with `config.locale` set ignores it). See CONTEXT.md **Active locale**.
 */
export const language = {
    get current() {
        return currentLocale;
    },
};
const ACTIVE_LOCALE_KEY = Symbol('triiiceratops:activeLocale');
/**
 * Publish the owning viewer's active locale to its chrome subtree. Call once at
 * the viewer root. Descendant components pick it up through {@link getMessages}.
 */
export function provideActiveLocale(source) {
    setContext(ACTIVE_LOCALE_KEY, source);
}
/** The active-locale source from context, or null outside any viewer subtree. */
function useActiveLocaleSource() {
    return (getContext(ACTIVE_LOCALE_KEY) ?? null);
}
/**
 * Wrap the Paraglide `m` namespace so every message call renders in a resolved
 * locale. Each message function accepts `{ locale }` as its final options
 * argument (Paraglide v2); the wrapper forwards the caller's inputs unchanged
 * and always supplies the resolved locale, so missing translations still fall
 * back to English (Paraglide default behavior).
 *
 * The Proxy target is a fresh, extensible object — never `m` itself. In the
 * bundled/SSR build Paraglide defines each message as a non-configurable,
 * non-writable data property, and the ECMAScript Proxy invariant requires a
 * `get` trap to return the target's actual value for such properties; a wrapper
 * function is not that value, so proxying `m` directly throws at first message
 * access. Proxying `{}` carries no such invariant. `has` still reports `m`'s
 * keys so `in` checks and enumeration reflect the real message set.
 */
function createLocalizedMessages(resolveLocale) {
    const messages = m;
    return new Proxy({}, {
        get(_target, prop) {
            const value = messages[prop];
            if (typeof value !== 'function') {
                return value;
            }
            return (inputs) => value(inputs ?? {}, { locale: resolveLocale() });
        },
        has(_target, prop) {
            return prop in messages;
        },
    });
}
/**
 * The chrome-facing message accessor. Returns a drop-in replacement for the raw
 * `m` namespace whose calls render in the owning viewer's active locale (from
 * {@link provideActiveLocale} context), falling back to the page-global locale
 * when used outside a viewer subtree. Call once during component initialization
 * (`const m = getMessages();`) and use `m.*()` exactly as before.
 */
export function getMessages() {
    const source = useActiveLocaleSource();
    return createLocalizedMessages(() => source?.current ?? getLocale());
}
