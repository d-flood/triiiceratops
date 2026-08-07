/**
 * The Vue handle: an ordinary template ref on `<TriiiceratopsViewer>`.
 *
 * Vue already has the thing React's `useViewerHandle()` had to invent — a
 * stable, consumer-owned box whose value the component fills in — so this
 * wrapper adds no handle API of its own. `useTemplateRef('viewer')` IS the
 * handle:
 *
 * ```ts
 * const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
 * const goTo = (id: string) => viewer.value?.state?.setCanvas(id);
 * ```
 *
 * The component exposes exactly the two {@link ViewerHandle} members and
 * nothing else, so the imperative escape hatch stays small. Both are read
 * through Vue reactive sources, which is what lets a `computed` that touches
 * `handleRef.value?.state` rewire itself after the element is detached and
 * reattached (`<KeepAlive>`).
 *
 * Nullability is honest rather than manufactured. Vue's template-ref mechanism
 * fills the ref with the component's exposed object on mount and clears it on
 * unmount, so `viewer.value` is `null` before mount and after unmount, and
 * `viewer.value.state` is `undefined` in the window between mount and the
 * element publishing its first `ViewerState`. Nothing is gated or withheld to
 * hide that window.
 */
import { getCurrentInstance, inject, provide } from 'vue';
/** `provide`/`inject` key for the handle a subtree reads through. */
const VIEWER_HANDLE_KEY = Symbol('triiiceratops:viewer-handle');
/**
 * Publish one viewer's handle to this component's subtree, so a deep component
 * can call `useViewer()` / `useViewerSelector(projection)` without the ref
 * being threaded through every intermediate component.
 *
 * Call it from `setup`, exactly like `provide`. It gates nothing and has no
 * fallback: reads through the handle stay nullable until the viewer's state
 * exists. Providing again in a nested component scopes a second viewer, and
 * the nearest one wins.
 *
 * @example
 * ```ts
 * const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
 * provideViewer(viewer);
 * ```
 */
export function provideViewer(handle) {
    provide(VIEWER_HANDLE_KEY, handle);
}
/**
 * The handle a composable should read: the one passed explicitly, else the
 * nearest provided one.
 *
 * Being given neither is a wiring mistake with no sensible fallback — the
 * composable cannot know which viewer is meant — so it is named rather than
 * silently returning `undefined` forever.
 */
export function resolveViewerHandleRef(explicit, composableName) {
    // `inject` outside a component instance warns; a composable called from a
    // plain function should get this module's own diagnostic instead.
    const provided = getCurrentInstance()
        ? inject(VIEWER_HANDLE_KEY, null)
        : null;
    const source = explicit ?? provided;
    if (!source) {
        throw new Error(`${composableName}() was called with no viewer handle and no ` +
            `provideViewer() above it, so it cannot tell which viewer to ` +
            `read. Put a template ref on <TriiiceratopsViewer ref="viewer">, ` +
            `then either pass it to ${composableName}(viewer, …) or publish ` +
            `it to the subtree with provideViewer(viewer) or ` +
            `<ViewerProvider :value="viewer">.`);
    }
    return source;
}
