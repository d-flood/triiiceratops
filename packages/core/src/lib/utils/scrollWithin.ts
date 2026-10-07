/**
 * Scrolls `item` into view inside `scroller` alone. `scrollIntoView` would also
 * scroll every scrollable ancestor, yanking the host page.
 */
export function scrollWithin(
    scroller: HTMLElement,
    item: Element,
    block: 'center' | 'nearest',
    {
        inline = false,
        behavior = 'auto',
    }: { inline?: boolean; behavior?: ScrollBehavior } = {},
): void {
    const box = item.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    let top = scroller.scrollTop;
    if (block === 'center') {
        top += box.top - view.top - (view.height - box.height) / 2;
    } else if (box.top < view.top) {
        top += box.top - view.top;
    } else if (box.bottom > view.bottom) {
        top += box.bottom - view.bottom;
    }
    const left = inline
        ? scroller.scrollLeft +
          box.left -
          view.left -
          (view.width - box.width) / 2
        : scroller.scrollLeft;
    scroller.scrollTo({ left, top, behavior });
}
