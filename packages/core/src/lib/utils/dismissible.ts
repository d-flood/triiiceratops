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

import type { FocusMemory } from './focusMemory';

/**
 * The selector addressing the toolbar toggle that opens the panel with `panelId`
 * — the identity both sides of a toolbar rebuild agree on.
 *
 * The value is escaped: a panel id is plugin-authored and a `"` or `\` in it
 * would make `matches()` and `querySelector()` throw, aborting the action at
 * mount and throwing inside `dismiss()` before the panel ever closes.
 */
export function panelToggleSelector(panelId: string): string {
    return `[data-panel-toggle="${panelId.replace(/["\\]/g, '\\$&')}"]`;
}

export type DismissibleOptions = {
    /** Called when the overlay should close. */
    onDismiss: () => void;
    /**
     * The element that opened the overlay. Focus returns here on dismiss.
     * Defaults to whatever had focus when the action mounted.
     */
    invoker?: HTMLElement | null;
    /**
     * A selector identifying the control that opened the overlay, resolved at
     * dismiss time rather than captured at mount.
     *
     * An invoker held as a node is only correct while that node outlives the
     * overlay, and a toolbar toggle does not: opening a left-docked panel docks
     * the toolbar as a rail, destroying and rebuilding the toggle the reader
     * activated. Identity survives that rebuild where a node reference cannot.
     *
     * Resolved through {@link focusMemory}, and so only within the viewer that
     * owns the overlay; a document-wide lookup would find a sibling viewer's
     * toggle and send focus into the wrong viewer.
     */
    invokerSelector?: string;
    /**
     * The owning viewer's focus memory, which both scopes
     * {@link invokerSelector} to that viewer and knows which control the reader
     * left. Required for {@link invokerSelector} to resolve anything.
     */
    focusMemory?: FocusMemory;
    /**
     * Move focus into the overlay on mount (WCAG 2.4.3). Default true.
     *
     * `'orphaned'` moves focus in only when the invoker named by
     * {@link invokerSelector} was destroyed by the state change that opened the
     * overlay — focus is on `<body>` and there is nothing to leave it on, so the
     * overlay takes it and Escape becomes reachable without tabbing in. When the
     * invoker survives, focus stays on it, unchanged.
     *
     * **Ordering invariant:** "was destroyed" is read once, at mount, from focus
     * memory. It is only true if the toolbar holding the invoker has already been
     * torn down by the time this action mounts — which is what the floating→rail
     * hand-off does in a single Svelte flush, outgoing toolbar first, then the
     * panel column. If that hand-off ever becomes asynchronous, or the panel
     * column mounts before the old toolbar is removed, the invoker still looks
     * connected here, `'orphaned'` reads false, and a left-docked panel silently
     * goes back to leaving focus on `<body>` with Escape unreachable.
     */
    focusOnMount?: boolean | 'orphaned';
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
    const active = root.activeElement as HTMLElement | null;
    // `<body>` is "nobody", not an opener: focusing it back on dismiss would
    // drop the reader out of the page's tab order.
    const opener =
        active === node || active === node.ownerDocument.body ? null : active;

    // The invoker may already be gone: the state change that opened this overlay
    // can destroy the control that triggered it, in which case `opener` is
    // `<body>`. Focus memory still holds the node, so an overlay that knows its
    // invoker's identity can tell that this — and not a programmatic open — is
    // what happened.
    const previous = options.focusMemory?.lastFocused() ?? null;
    const invokerWasOrphaned =
        !!options.invokerSelector &&
        !!previous &&
        !previous.isConnected &&
        previous.matches(options.invokerSelector);

    function invokerElement(): HTMLElement | null {
        if (current.invoker) return current.invoker;
        // The live opener wins: a panel opened from somewhere other than its
        // toolbar toggle must return focus to the control the reader actually
        // left. Identity resolution is for the case that control no longer
        // exists — the rail hand-off destroyed it and built a twin.
        if (opener?.isConnected) return opener;
        const byIdentity =
            current.invokerSelector && current.focusMemory
                ? current.focusMemory.resolve(current.invokerSelector)
                : null;
        return byIdentity ?? opener;
    }

    function dismiss() {
        invokerElement()?.focus();
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

    const focusOnMount = current.focusOnMount ?? true;
    const takeFocus =
        focusOnMount === 'orphaned'
            ? invokerWasOrphaned
            : focusOnMount !== false;

    if (takeFocus && !node.contains(root.activeElement)) {
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
