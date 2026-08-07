/**
 * Distributing one viewer's handle to a deep React tree.
 *
 * Consumers create the handle (`useViewerHandle`) and pass it to
 * `<TriiiceratopsViewer handle={…}>`, so application UI has no placement
 * constraint. `<ViewerProvider>` exists only so a deep component does not have
 * to be threaded that handle through every intermediate component: it is a
 * trivial value provider. It gates nothing, renders its children
 * unconditionally, and has no fallback — reads through the handle are nullable
 * until the viewer's state exists, which is the honest state of the world.
 */
import type { ReactElement, ReactNode } from 'react';
import type { ViewerHandleSlot } from '../framework/index.js';
export interface ViewerProviderProps {
    /** The handle from `useViewerHandle()`, for this subtree's viewer. */
    value: ViewerHandleSlot;
    children?: ReactNode;
}
/**
 * Publish one viewer handle to a subtree. Nest a second provider to scope a
 * second viewer; the nearest one wins, exactly like any React context.
 */
export declare function ViewerProvider(props: ViewerProviderProps): ReactElement;
/**
 * The handle a hook should read: the one passed explicitly, else the nearest
 * provided one.
 *
 * Being given neither is a wiring mistake with no sensible fallback — the hook
 * cannot know which viewer it means — so it is named rather than silently
 * returning `undefined` forever.
 */
export declare function useResolvedViewerHandle(explicit: ViewerHandleSlot | null | undefined, hookName: string): ViewerHandleSlot;
