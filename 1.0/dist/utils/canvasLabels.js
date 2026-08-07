import { resolveLanguageValue } from './languageMap';
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
export function getCanvasLabel(canvas, fallbackIndex, preferredLocale) {
    const fallback = fallbackIndex === undefined
        ? 'Untitled canvas'
        : `Canvas ${fallbackIndex + 1}`;
    const rawLabel = canvas?.label;
    if (rawLabel) {
        const resolved = resolveLanguageValue(rawLabel, preferredLocale);
        if (resolved) {
            return resolved;
        }
    }
    return fallback;
}
