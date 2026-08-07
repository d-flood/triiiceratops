/**
 * `<TriiiceratopsViewer>` — the React 19 framework wrapper.
 *
 * It hosts the existing `<triiiceratops-viewer>` custom element and translates
 * its lifecycle, properties, events, and viewer state into React idioms. It
 * does not implement or own a second viewer, and it renders exactly ONE
 * element: no layout wrapper, no children, nothing projected into light or
 * shadow DOM. Adopting the wrapper therefore changes no sizing or CSS.
 *
 * Authored as plain TypeScript with `createElement` — no JSX, no `.tsx`, and no
 * extra build step. `build:lib`'s `svelte-package` step copies unknown file
 * types verbatim, so a `.tsx` here would ship broken.
 *
 * ## The three prop tiers
 *
 * - **Attribute tier** (`manifestId`, `canvasId`, `theme`) is rendered
 *   declaratively as kebab-case attributes, identically on the server and on
 *   the client's first render, so hydration reuses and upgrades the same host.
 * - **Property tier** (`manifestJson`, `themeConfig`, `config`,
 *   `initialCanvasRegion`, `plugins`, `searchProvider`) goes through the shared
 *   applier in a LAYOUT effect. Layout, not passive: Svelte's
 *   `connectedCallback` awaits a microtask before mounting the inner viewer,
 *   and React's layout phase runs inside the commit's own task, so the values
 *   are in place before the viewer first mounts.
 * - **Host attributes** (`className`, `style`, `id`, `data-*`, `aria-*`, and
 *   ordinary DOM attributes and handlers) are forwarded to the element by
 *   React, unchanged.
 *
 * `manifestId` and `canvasId` are one-way, UNCONTROLLED inputs — `defaultValue`
 * + `onChange`, never `value` + `onChange`. Re-asserting an unchanged value
 * after the user navigates internally writes nothing, so the wrapper never
 * fights the viewer. Observe where the viewer actually is with a selector or
 * the `onCanvasChange` / `onManifestChange` callbacks.
 */
import type { HTMLAttributes, ReactElement, Ref } from 'react';
import { type ViewerElementProps, type ViewerHandle, type ViewerHandleSlot } from '../framework/index.js';
import type { PluginError } from '../types/plugin.js';
import type { ViewerStateSnapshot } from '../state/viewer.svelte.js';
import type { ViewerError } from '../types/viewerError.js';
/**
 * Typed callbacks for the custom element's event channels. Each receives the
 * event DETAIL directly — never a `CustomEvent` — so application code is
 * independent of the DOM event envelope. The error channels carry the exact
 * objects core dispatched, including `PluginError.retry()`.
 */
export interface ViewerEventProps {
    /** Any inventoried viewer-state change, batched. */
    onStateChange?: (snapshot: ViewerStateSnapshot) => void;
    /** The displayed canvas changed. */
    onCanvasChange?: (snapshot: ViewerStateSnapshot) => void;
    /** The loaded manifest changed. */
    onManifestChange?: (snapshot: ViewerStateSnapshot) => void;
    /** A IIIF `Choice` selection changed. */
    onChoiceChange?: (snapshot: ViewerStateSnapshot) => void;
    /** A plugin failed. The exact `PluginError`, with a callable `retry()`. */
    onPluginError?: (error: PluginError) => void;
    /** The viewer failed. The exact typed `ViewerError`. */
    onViewerError?: (error: ViewerError) => void;
}
export interface TriiiceratopsViewerProps extends ViewerElementProps, ViewerEventProps, Omit<HTMLAttributes<HTMLElement>, keyof ViewerEventProps | 'children' | 'dangerouslySetInnerHTML'> {
    /**
     * The handle from `useViewerHandle()`, bound to this viewer while it is
     * mounted. Optional: a viewer with no state-reading consumers needs none.
     * Passing one handle to two viewers throws.
     */
    handle?: ViewerHandleSlot | null;
    /** Yields `ViewerHandle | null`; cleared on unmount. */
    ref?: Ref<ViewerHandle | null>;
    /** Reserved and unused: the viewer accepts no children. */
    children?: never;
    /** `data-*` attributes are forwarded to the host element. */
    [dataAttribute: `data-${string}`]: unknown;
}
/** The imperative value a forwarded `ref` receives. */
export type TriiiceratopsViewerRef = ViewerHandle;
export declare function TriiiceratopsViewer(props: TriiiceratopsViewerProps): ReactElement;
