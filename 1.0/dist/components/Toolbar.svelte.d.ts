interface Props {
    /**
     * Render as an in-flow docked rail (the cross-cutting same-side fix)
     * instead of a floating overlay. The parent renders the toolbar this way
     * only when its configured side hosts a panel/gallery AND it is open, so
     * the rail sits at the screen edge with the panel inboard of it.
     */
    docked?: boolean;
    /**
     * Render only the bare action buttons as a horizontal group (no shell,
     * positioning, handle, or collapse), for embedding inside another bar —
     * used by the Unified Bar preset to place the toolbar buttons in the
     * canvas nav.
     */
    inline?: boolean;
}
declare const Toolbar: import("svelte").Component<Props, {}, "">;
type Toolbar = ReturnType<typeof Toolbar>;
export default Toolbar;
