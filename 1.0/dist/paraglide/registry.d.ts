/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.PluralRulesOptions} [options]
 * @returns {string}
 */
export function plural(locale: import("./runtime.js").Locale, input: unknown, options?: Intl.PluralRulesOptions): string;
/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string}
 */
export function number(locale: import("./runtime.js").Locale, input: unknown, options?: Intl.NumberFormatOptions): string;
/**
 * @param {import("./runtime.js").Locale} locale
 * @param {unknown} input
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string}
 */
export function datetime(locale: import("./runtime.js").Locale, input: unknown, options?: Intl.DateTimeFormatOptions): string;
