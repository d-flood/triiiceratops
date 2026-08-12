/**
 * The dismissal lifecycle shared by the viewer's per-node overlays: Escape
 * closes, a pointer outside closes, and focus returns where it came from.
 *
 * A Svelte action rather than a component, so a popover and a docked panel
 * section keep their own markup and still agree on the parts a reader notices.
 * Before this they disagreed: the canvas-info popover captured its invoker from
 * `document.activeElement` (the shadow HOST, not the control the reader left)
 * and used a focusable backdrop `<button>` for outside-dismiss; the panel
 * section resolved the invoker correctly and had no outside-dismiss at all.
 *
 * Not used by the toolbar or by `Select`: the toolbar arbitrates between many
 * flyouts at once through attribute matching rather than owning one node, and
 * `Select` is a listbox driven by the popover API. Those are different shapes,
 * not copies of this one.
 */

export type DismissibleOptions = {
    /** Called when the overlay should close. */
    onDismiss: () => void;
    /**
     * The element that opened the overlay. Focus returns here on dismiss.
     * Defaults to whatever had focus when the action mounted.
     */
    invoker?: HTMLElement | null;
    /** Move focus into the overlay on mount (WCAG 2.4.3). Default true. */
    focusOnMount?: boolean;
    /** Dismiss on Escape. Default true. */
    escape?: boolean;
    /** Dismiss on a pointer press outside the node. Default true. */
    outsidePointer?: boolean;
    /**
     * Extra elements that count as "inside" — a trigger that lives outside the
     * overlay must not dismiss it on the same press that opened it.
     */
    within?: (HTMLElement | null | undefined)[];
    /**
     * Filled in with a `dismiss()` the component can call.
     *
     * A close button is a dismissal too, and it must return focus by the same
     * rule as Escape — calling `onDismiss` directly from the button skips that,
     * which is how the panel close button dropped focus to `<body>`.
     */
    controls?: { dismiss?: () => void };
};

export function dismissible(node: HTMLElement, options: DismissibleOptions) {
    let current = options;

    // Captured before focus moves in, through `getRootNode` rather than
    // `document`: the viewer renders inside a shadow root, where
    // `document.activeElement` is the host element instead of the control that
    // had focus, so focus would return to the wrong place.
    const root = node.getRootNode() as Document | ShadowRoot;
    const opener = root.activeElement as HTMLElement | null;

    function dismiss() {
        (current.invoker ?? (opener === node ? null : opener))?.focus();
        current.onDismiss();
    }

    function onKeydown(event: KeyboardEvent) {
        if (current.escape === false || event.key !== 'Escape') return;
        // Scoped to the node, not the window, so a nested overlay closes itself
        // and leaves its parent open.
        event.stopPropagation();
        dismiss();
    }

    function onPointerDown(event: PointerEvent) {
        if (current.outsidePointer === false) return;
        // `composedPath`, not `event.target`: a retargeted event makes a press
        // on the trigger look "outside" the overlay.
        const path = event.composedPath();
        if (path.includes(node)) return;
        for (const element of current.within ?? []) {
            if (element && path.includes(element)) return;
        }
        dismiss();
    }

    if (current.controls) current.controls.dismiss = dismiss;

    node.addEventListener('keydown', onKeydown);
    document.addEventListener('pointerdown', onPointerDown, true);

    if (current.focusOnMount !== false && !node.contains(root.activeElement)) {
        if (node.tabIndex < 0) node.tabIndex = -1;
        node.focus();
    }

    return {
        update(next: DismissibleOptions) {
            current = next;
            if (current.controls) current.controls.dismiss = dismiss;
        },
        destroy() {
            node.removeEventListener('keydown', onKeydown);
            document.removeEventListener('pointerdown', onPointerDown, true);
        },
    };
}
