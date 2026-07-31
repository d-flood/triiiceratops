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

import { createContext, createElement, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';

import type { ViewerHandleSlot } from '../framework/index.js';

/** `null` means "no `<ViewerProvider>` above this component". */
const ViewerHandleContext = createContext<ViewerHandleSlot | null>(null);

export interface ViewerProviderProps {
    /** The handle from `useViewerHandle()`, for this subtree's viewer. */
    value: ViewerHandleSlot;
    children?: ReactNode;
}

/**
 * Publish one viewer handle to a subtree. Nest a second provider to scope a
 * second viewer; the nearest one wins, exactly like any React context.
 */
export function ViewerProvider(props: ViewerProviderProps): ReactElement {
    return createElement(
        ViewerHandleContext.Provider,
        { value: props.value },
        props.children,
    );
}

/**
 * The handle a hook should read: the one passed explicitly, else the nearest
 * provided one.
 *
 * Being given neither is a wiring mistake with no sensible fallback — the hook
 * cannot know which viewer it means — so it is named rather than silently
 * returning `undefined` forever.
 */
export function useResolvedViewerHandle(
    explicit: ViewerHandleSlot | null | undefined,
    hookName: string,
): ViewerHandleSlot {
    const provided = useContext(ViewerHandleContext);
    const slot = explicit ?? provided;
    if (!slot) {
        throw new Error(
            `${hookName}() was called with no viewer handle and no ` +
                `<ViewerProvider> above it, so it cannot tell which viewer to ` +
                `read. Create a handle with useViewerHandle(), pass it to ` +
                `<TriiiceratopsViewer handle={…}>, and then either pass it to ` +
                `${hookName}(handle, …) or wrap the reading components in ` +
                `<ViewerProvider value={handle}>.`,
        );
    }
    return slot;
}
