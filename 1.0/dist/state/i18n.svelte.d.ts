export { m } from '../paraglide/messages.js';
import { m } from '../paraglide/messages.js';
/**
 * The page-global (application) locale, reactive to Paraglide `setLocale`. This
 * is the page default a viewer falls back to when it has no configured
 * `config.locale` — not, by itself, any single viewer's active locale (a viewer
 * with `config.locale` set ignores it). See CONTEXT.md **Active locale**.
 */
export declare const language: {
    readonly current: "en" | "de";
};
/**
 * A reactive holder for one viewer's active locale, shared through Svelte
 * context. `current` is read at each message call, so message rendering tracks
 * the viewer's active locale reactively.
 */
export interface ActiveLocaleSource {
    readonly current: string;
}
/**
 * Publish the owning viewer's active locale to its chrome subtree. Call once at
 * the viewer root. Descendant components pick it up through {@link getMessages}.
 */
export declare function provideActiveLocale(source: ActiveLocaleSource): void;
/**
 * The chrome-facing message accessor. Returns a drop-in replacement for the raw
 * `m` namespace whose calls render in the owning viewer's active locale (from
 * {@link provideActiveLocale} context), falling back to the page-global locale
 * when used outside a viewer subtree. Call once during component initialization
 * (`const m = getMessages();`) and use `m.*()` exactly as before.
 */
export declare function getMessages(): typeof m;
