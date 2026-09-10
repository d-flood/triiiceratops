/**
 * Describing material a drop carried in, so the stage can reserve a box for it
 * and announce it — what `features.ts` declares for the material it owns.
 */

import type { Example } from './examples';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A IIIF language map read for a reader of this page: English where the
 * publisher offers it, then the untagged entry, then whatever is there. A
 * manifest naming no language at all is common enough to be worth the fallback.
 */
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

/**
 * What the stage needs of a manifest it has never heard of. Nothing here is
 * required of a publisher, so every field falls back rather than throwing: a
 * manifest that declares no canvas dimensions still gets a box, and one that
 * declares no label is still announced as something.
 */
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
        label: labelString(document.label) || 'Material carried in by a drop',
        firstCanvas: {
            width: typeof first.width === 'number' ? first.width : 1000,
            height: typeof first.height === 'number' ? first.height : 1000,
        },
    };
}

/** The id of a manifest's first canvas, for a drop that named no canvas. */
export function firstCanvasId(json: unknown): string {
    const document = isRecord(json) ? json : {};
    const items = Array.isArray(document.items) ? document.items : [];
    const first = isRecord(items[0]) ? items[0] : {};
    return typeof first.id === 'string' ? first.id : '';
}
