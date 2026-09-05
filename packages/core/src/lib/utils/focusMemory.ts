/**
 * Remembers the control that had focus most recently *within one viewer*, so a
 * mount can still identify it after it has been destroyed.
 *
 * A control can be destroyed by the very state change it triggers: activating a
 * panel toggle docks the toolbar as a screen-edge rail, which unmounts the
 * floating toolbar the reader was standing in (see the `dockRailLeft` comment
 * in `TriiiceratopsViewer.svelte`). By then `activeElement` is `<body>`, so an
 * overlay mounting in that same flush cannot see who opened it. Keeping the node
 * lets a mount ask both "was focus orphaned?" and "by which control?", and then
 * re-resolve that control by identity in the toolbar that replaced it.
 *
 * One instance per viewer, provided on {@link FOCUS_MEMORY_KEY}. Never a module
 * global: two viewers on a page share a document, so a shared memory would let a
 * freshly mounted viewer take focus on behalf of a toggle that belonged to the
 * other one — unexpected focus on load (WCAG 3.2.1), which is worse than the
 * dropped focus this exists to fix.
 */

/** Svelte context key for the viewer's {@link FocusMemory}. */
export const FOCUS_MEMORY_KEY = Symbol('triiiceratops-focus-memory');

export type FocusMemory = {
    /**
     * The most recently focused control in this viewer, whether or not it is
     * still connected. A disconnected one means focus was orphaned by that
     * element's removal.
     */
    lastFocused(): HTMLElement | null;
    /** The first control matching `selector` in this viewer, if any. */
    resolve(selector: string): HTMLElement | null;
};

export type ViewerFocusMemory = FocusMemory & {
    /** Start recording within `viewerRoot`'s tree. Idempotent. */
    attach(viewerRoot: HTMLElement): void;
    /** Stop recording and release the remembered node. */
    destroy(): void;
};

export function createFocusMemory(): ViewerFocusMemory {
    let last: HTMLElement | null = null;
    let scope: HTMLElement | null = null;
    let detach: (() => void) | null = null;

    return {
        attach(viewerRoot: HTMLElement) {
            if (detach) return;
            scope = viewerRoot;
            // The listener goes on the root the controls actually live in, not
            // on the document: focus moving between two elements of the SAME
            // shadow tree is retargeted to the host and never reaches a document
            // listener, which is exactly the move a panel returning focus to its
            // toolbar toggle makes.
            const root = viewerRoot.getRootNode() as Document | ShadowRoot;
            // Capture phase and `composedPath`, so a control is recorded as
            // itself rather than as a host in between.
            const onFocusIn = (event: Event) => {
                const target = event.composedPath()[0];
                last =
                    target instanceof HTMLElement && viewerRoot.contains(target)
                        ? target
                        : null;
            };
            root.addEventListener('focusin', onFocusIn, true);
            detach = () => root.removeEventListener('focusin', onFocusIn, true);
        },
        destroy() {
            detach?.();
            detach = null;
            // Dropping the node matters as much as the listener: it is usually
            // detached by now, and holding it would pin the whole torn-down
            // subtree for the life of the page.
            last = null;
            scope = null;
        },
        lastFocused: () => last,
        resolve: (selector: string) =>
            scope?.querySelector<HTMLElement>(selector) ?? null,
    };
}

/** True when nothing in `node`'s document holds focus any more. */
export function focusIsOrphaned(node: Node): boolean {
    const doc = node.ownerDocument;
    if (!doc) return false;
    let active = doc.activeElement;
    while (active?.shadowRoot?.activeElement) {
        active = active.shadowRoot.activeElement;
    }
    if (!active || active === doc.body) return true;
    // A shadow host that is not focusable in its own right is `activeElement`
    // only because something inside it was, so "the host, with nothing focused
    // inside it" means that something was removed. A host that IS focusable —
    // a plugin's custom element wrapping a third-party widget — is a place a
    // reader can genuinely be standing; leave it alone.
    return !!active.shadowRoot && !isFocusable(active);
}

function isFocusable(element: Element): boolean {
    return element instanceof HTMLElement && element.tabIndex >= 0;
}
