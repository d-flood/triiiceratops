/**
 * Whether two JSON-shaped values serialize alike, compared without serializing
 * either: same keys in the same order, skipping what `JSON.stringify` skips.
 */
export function sameJson(a: any, b: any): boolean {
    if (!a || !b || typeof a != 'object' || typeof b != 'object') {
        return a === b;
    }
    const aKeys = serializedKeys(a);
    const bKeys = serializedKeys(b);
    return (
        Array.isArray(a) == Array.isArray(b) &&
        aKeys.length == bKeys.length &&
        aKeys.every(
            (key, index) => key == bKeys[index] && sameJson(a[key], b[key]),
        )
    );
}

const serializedKeys = (value: any) =>
    Object.keys(value).filter(
        (key) => value[key] !== undefined && typeof value[key] != 'function',
    );

/** A plain deep copy of a JSON-shaped value. */
export function copyJson<T>(value: T): T {
    if (!value || typeof value != 'object') return value;
    if (Array.isArray(value)) return value.map(copyJson) as T;
    return Object.fromEntries(
        Object.entries(value).map(([key, member]) => [key, copyJson(member)]),
    ) as T;
}
