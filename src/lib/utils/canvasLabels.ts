import { resolveLanguageValue } from './languageMap';

export function getCanvasLabel(canvas: any, fallbackIndex?: number): string {
    const fallback =
        fallbackIndex === undefined
            ? 'Untitled canvas'
            : `Canvas ${fallbackIndex + 1}`;

    try {
        const label = canvas.getLabel?.();
        if (Array.isArray(label) && label.length > 0) {
            return resolveLanguageValue(label) || fallback;
        }
    } catch {
        // ignore malformed labels
    }

    const rawLabel = canvas.label || canvas.__jsonld?.label;
    if (rawLabel) {
        const resolved = resolveLanguageValue(rawLabel);
        if (resolved) {
            return resolved;
        }
    }

    return fallback;
}
