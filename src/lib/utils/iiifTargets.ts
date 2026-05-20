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
