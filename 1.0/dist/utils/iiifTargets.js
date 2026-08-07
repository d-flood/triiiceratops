export function parseIiifXywh(value) {
    if (!value)
        return null;
    const match = value.match(/xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/);
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
export function getIiifCanvasId(targetId) {
    const [canvasId] = targetId.split('#');
    return canvasId || null;
}
export function extractIiifTargetId(target) {
    if (!target)
        return null;
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
    const record = target;
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
function normalizeIiifSelectors(selector) {
    if (!selector)
        return [];
    if (Array.isArray(selector)) {
        return selector.flatMap((item) => normalizeIiifSelectors(item));
    }
    if (typeof selector !== 'object') {
        return [];
    }
    const record = selector;
    if (record.item) {
        return normalizeIiifSelectors(record.item);
    }
    return [record];
}
function findSelectorXywh(selectors) {
    const preferredSelector = selectors.find((selector) => selector?.type === 'FragmentSelector' &&
        typeof selector?.value === 'string' &&
        selector.value.includes('xywh='));
    if (preferredSelector) {
        return parseIiifXywh(preferredSelector.value);
    }
    const fallbackSelector = selectors.find((selector) => typeof selector?.value === 'string' &&
        selector.value.includes('xywh='));
    return fallbackSelector ? parseIiifXywh(fallbackSelector.value) : null;
}
export function normalizeIiifTargets(target) {
    if (!target)
        return [];
    if (Array.isArray(target)) {
        return target.flatMap((item) => normalizeIiifTargets(item));
    }
    const targetId = extractIiifTargetId(target);
    const selectors = typeof target === 'object' && target && 'selector' in target
        ? normalizeIiifSelectors(target.selector)
        : [];
    const xywh = findSelectorXywh(selectors) ||
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
