/**
 * Roving-focus key handling shared by the viewer's menus and radio groups.
 */

export interface RovingOptions {
    /** Also treat ArrowLeft/ArrowRight as previous/next (a horizontal group). */
    horizontal?: boolean;
}

/**
 * The index `key` moves focus to within a group of `length` items, or -1 when
 * the key roves nothing and the caller should let it through.
 *
 * `current` is the focused item's index, or -1 when focus is not on an item.
 * Next/previous wrap.
 */
export function nextRovingIndex(
    key: string,
    current: number,
    length: number,
    { horizontal = false }: RovingOptions = {},
): number {
    if (length === 0) return -1;
    const forward = key === 'ArrowDown' || (horizontal && key === 'ArrowRight');
    if (forward) return (current + 1) % length;
    const back = key === 'ArrowUp' || (horizontal && key === 'ArrowLeft');
    if (back) return (current - 1 + length) % length;
    if (key === 'Home') return 0;
    if (key === 'End') return length - 1;
    return -1;
}
