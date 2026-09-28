/* One-based: the rail reads "Feature 2 of 12". Unparseable falls back to the first. */
export const FEATURE_PARAM = 'feature';

export function parseFeatureIndex(search: string, total: number): number {
    const raw = new URLSearchParams(search).get(FEATURE_PARAM);
    if (raw === null) return 0;
    const oneBased = Number(raw);
    if (!Number.isInteger(oneBased)) return 0;
    if (oneBased < 1 || oneBased > total) return 0;
    return oneBased - 1;
}

export function featureSearch(at: number): string {
    return `?${FEATURE_PARAM}=${at + 1}`;
}
