import type { Example } from './examples';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function labelString(value: unknown): string {
    if (!isRecord(value)) return '';

    const keys = Object.keys(value);
    for (const key of ['en', 'none', ...keys]) {
        const entries = value[key];
        if (!Array.isArray(entries)) continue;
        const first = entries.find(
            (entry) => typeof entry === 'string' && entry.trim(),
        );
        if (typeof first === 'string') return first.trim();
    }
    return '';
}

export function describeDroppedManifest(
    manifestId: string,
    json: unknown,
): Example {
    const document = isRecord(json) ? json : {};
    const items = Array.isArray(document.items) ? document.items : [];
    const first = isRecord(items[0]) ? items[0] : {};

    return {
        manifest: manifestId,
        canvases: items.length || 1,
        label: labelString(document.label) || 'Dropped manifest',
        firstCanvas: {
            width: typeof first.width === 'number' ? first.width : 1000,
            height: typeof first.height === 'number' ? first.height : 1000,
        },
    };
}

export function firstCanvasId(json: unknown): string {
    const document = isRecord(json) ? json : {};
    const items = Array.isArray(document.items) ? document.items : [];
    const first = isRecord(items[0]) ? items[0] : {};
    return typeof first.id === 'string' ? first.id : '';
}
