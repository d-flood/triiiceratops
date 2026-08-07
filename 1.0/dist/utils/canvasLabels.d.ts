/**
 * A canvas's display label, version-neutral.
 *
 * `label` is a bare string or a `[{"@value"}]` array in IIIF v2 and a language
 * map in v3, and `resolveLanguageValue` handles all three — so the single raw
 * read below covers both versions.
 *
 * @param preferredLocale BCP-47 tag to prefer when the label is localized.
 *   Falls back to `en`, then to an unlocalized entry, then to the first.
 */
export declare function getCanvasLabel(canvas: any, fallbackIndex?: number, preferredLocale?: string): string;
