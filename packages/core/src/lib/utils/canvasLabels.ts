import { resolveLanguageValue } from './languageMap';

/**
 * A canvas's display label, version-neutral.
 *
 * Reads the raw JSON first — `label` is a bare string or a `[{"@value"}]` array
 * in IIIF v2 and a language map in v3, and `resolveLanguageValue` handles all
 * three. The `getLabel()` accessor is the last rung and goes away with
 * `manifesto.js` (`.tracker/remove-manifesto`, ticket 10).
 *
 * @param preferredLocale BCP-47 tag to prefer when the label is localized.
 *   Falls back to `en`, then to an unlocalized entry, then to the first.
 */
export function getCanvasLabel(
    canvas: any,
    fallbackIndex?: number,
    preferredLocale?: string,
): string {
    const fallback =
        fallbackIndex === undefined
            ? 'Untitled canvas'
            : `Canvas ${fallbackIndex + 1}`;

    const rawLabel = canvas?.label ?? canvas?.__jsonld?.label;
    if (rawLabel) {
        const resolved = resolveLanguageValue(rawLabel, preferredLocale);
        if (resolved) {
            return resolved;
        }
    }

    try {
        const label = canvas?.getLabel?.();
        if (Array.isArray(label) && label.length > 0) {
            return resolveLanguageValue(label, preferredLocale) || fallback;
        }
    } catch {
        // ignore malformed labels
    }

    return fallback;
}
