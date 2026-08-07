/**
 * Shared utility for resolving IIIF language map values.
 *
 * IIIF v3 uses language maps: `{ "en": ["Hello"], "fr": ["Bonjour"] }`
 * Manifesto returns arrays of `{ value, locale/language }` objects.
 * IIIF v2 may use plain strings.
 *
 * This module provides a single resolution strategy used across the viewer.
 */
/**
 * Resolve a IIIF language-mapped value to a single display string.
 *
 * Precedence: preferredLocale → 'en' → 'none'/unset → first available.
 */
export declare function resolveLanguageValue(value: unknown, preferredLocale?: string): string;
/**
 * Resolve a IIIF language-mapped value to all display strings
 * (for multi-value properties like metadata values with multiple entries
 * in a single language).
 *
 * @internal Not exported from any package entry point. It appears in
 * `api-reports/core.api.md` because that report is a file-level rollup and a
 * sibling in this module is public — importing it from `triiiceratops` fails.
 */
export declare function resolveAllLanguageValues(value: unknown, preferredLocale?: string): string[];
