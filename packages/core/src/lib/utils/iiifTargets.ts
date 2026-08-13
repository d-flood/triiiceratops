import type { IiifTemporalFragment } from './iiifTime';

export type IiifTargetBounds = [number, number, number, number];

export type NormalizedIiifTarget = {
    raw: unknown;
    targetId: string | null;
    canvasId: string | null;
    selectors: any[];
    xywh: IiifTargetBounds | null;
};

export function parseIiifXywh(value: string): IiifTargetBounds | null {
    if (!value) return null;

    const match = value.match(
        /xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/,
    );
    if (!match) {
        return null;
    }

    return [
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
    ];
}

/**
 * The fragment component of a target, or `''` when it has none. A value with
 * no `#` is treated as a bare fragment (`t=157`, `xywh=...&t=...`) unless it
 * carries a query string, which only a full URI can — and a query is never
 * fragment content.
 */
function getFragmentComponent(value: string): string {
    const hashIndex = value.indexOf('#');
    if (hashIndex !== -1) return value.slice(hashIndex + 1);
    return value.includes('?') ? '' : value;
}

/**
 * One bound of a `t=` dimension in seconds, or `null` when it is absent or in
 * a form this parser does not read.
 */
function parseNptSeconds(raw: string): number | null {
    const digits = raw.startsWith('npt:') ? raw.slice(4) : raw;
    // Rejects the `hh:mm:ss` spelling, signs, whitespace and `Infinity`;
    // `Number` then rejects the multi-dot leftovers (`.`, `..`, `1.2.3`).
    if (!/^[\d.]+$/.test(digits)) return null;
    const seconds = Number(digits);
    return Number.isFinite(seconds) ? seconds : null;
}

/**
 * Parse the temporal dimension of a media fragment (`#t=157`, `#t=157,203`,
 * `#t=,203`), the time counterpart of {@link parseIiifXywh}.
 *
 * Only Normal Play Time in plain seconds is read — the form every IIIF
 * Cookbook recipe uses — with an explicit `npt:` prefix accepted and ignored
 * on either bound. NPT's `hh:mm:ss` spelling is valid Media Fragments but is
 * not parsed: it yields `null` rather than a wrong number of seconds. Only the
 * fragment component is inspected, so a `t=` in a query string (`?t=157`,
 * `?foo=1&t=157`) is never mistaken for a media fragment.
 */
export function parseIiifTime(value: string): IiifTemporalFragment | null {
    if (!value) return null;

    const match = getFragmentComponent(value).match(/(?:^|&)t=([^&]*)/);
    if (!match) return null;

    const bounds = match[1].split(',');
    if (bounds.length > 2) return null;

    const start = parseNptSeconds(bounds[0]);
    const end = bounds.length === 2 ? parseNptSeconds(bounds[1]) : null;

    // Media Fragments defaults an omitted start to the beginning of the media,
    // but an unreadable one is garbage rather than an omission.
    if (start === null && bounds[0] !== '') return null;
    if (start === null && end === null) return null;

    const seconds = start ?? 0;
    // endSeconds is carried, never validated against the start (spec fence).
    return end === null ? { seconds } : { seconds, endSeconds: end };
}

/**
 * The media time a IIIF selector names: a `PointSelector`'s numeric `t` — the
 * spelling the `start` property uses in Cookbook 0015 — or a
 * `FragmentSelector`'s `t=` value. A point has no extent, so a `PointSelector`
 * never yields an `endSeconds`.
 */
export function parseIiifSelectorTime(
    selector: unknown,
): IiifTemporalFragment | null {
    if (!selector || typeof selector !== 'object') return null;

    const record = selector as { type?: unknown; t?: unknown; value?: unknown };
    if (
        record.type === 'PointSelector' &&
        typeof record.t === 'number' &&
        Number.isFinite(record.t)
    ) {
        return { seconds: record.t };
    }

    return typeof record.value === 'string'
        ? parseIiifTime(record.value)
        : null;
}

export function getIiifCanvasId(targetId: string): string | null {
    const [canvasId] = targetId.split('#');
    return canvasId || null;
}

export function extractIiifTargetId(target: unknown): string | null {
    if (!target) return null;

    if (typeof target === 'string') {
        return target;
    }

    if (Array.isArray(target)) {
        for (const item of target) {
            const targetId = extractIiifTargetId(item);
            if (targetId) {
                return targetId;
            }
        }
        return null;
    }

    if (typeof target !== 'object') {
        return null;
    }

    const record = target as Record<string, any>;
    if (typeof record.id === 'string') {
        return record.id;
    }

    if (typeof record['@id'] === 'string') {
        return record['@id'];
    }

    if (record.source) {
        return extractIiifTargetId(record.source);
    }

    return null;
}

function normalizeIiifSelectors(selector: unknown): any[] {
    if (!selector) return [];

    if (Array.isArray(selector)) {
        return selector.flatMap((item) => normalizeIiifSelectors(item));
    }

    if (typeof selector !== 'object') {
        return [];
    }

    const record = selector as Record<string, any>;
    if (record.item) {
        return normalizeIiifSelectors(record.item);
    }

    return [record];
}

function findSelectorXywh(selectors: any[]): IiifTargetBounds | null {
    const preferredSelector = selectors.find(
        (selector) =>
            selector?.type === 'FragmentSelector' &&
            typeof selector?.value === 'string' &&
            selector.value.includes('xywh='),
    );
    if (preferredSelector) {
        return parseIiifXywh(preferredSelector.value);
    }

    const fallbackSelector = selectors.find(
        (selector) =>
            typeof selector?.value === 'string' &&
            selector.value.includes('xywh='),
    );

    return fallbackSelector ? parseIiifXywh(fallbackSelector.value) : null;
}

export function normalizeIiifTargets(target: unknown): NormalizedIiifTarget[] {
    if (!target) return [];

    if (Array.isArray(target)) {
        return target.flatMap((item) => normalizeIiifTargets(item));
    }

    const targetId = extractIiifTargetId(target);
    const selectors =
        typeof target === 'object' && target && 'selector' in target
            ? normalizeIiifSelectors((target as Record<string, any>).selector)
            : [];
    const xywh =
        findSelectorXywh(selectors) ||
        (targetId ? parseIiifXywh(targetId) : null);

    return [
        {
            raw: target,
            targetId,
            canvasId: targetId ? getIiifCanvasId(targetId) : null,
            selectors,
            xywh,
        },
    ];
}
