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

import {
    createElement,
    useImperativeHandle,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';
import type { HTMLAttributes, ReactElement, Ref } from 'react';

import { useBrowserLayoutEffect } from './effects.js';
import {
    createViewerBinding,
    createViewerHandleSlot,
    createViewerPropApplier,
    VIEWER_ELEMENT_TAG,
    VIEWER_EVENT_CHANNELS,
    viewerElementAttributes,
    viewerPropTier,
    type TriiiceratopsViewerElement,
    type ViewerElementProps,
    type ViewerEventChannel,
    type ViewerHandle,
    type ViewerHandleSlot,
    type ViewerPropApplier,
} from '../framework/index.js';
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

/** Which callback prop each channel feeds. */
const EVENT_PROP_BY_CHANNEL = {
    statechange: 'onStateChange',
    canvaschange: 'onCanvasChange',
    manifestchange: 'onManifestChange',
    choicechange: 'onChoiceChange',
    pluginerror: 'onPluginError',
    viewererror: 'onViewerError',
} as const satisfies Record<ViewerEventChannel, keyof ViewerEventProps>;

/**
 * Props that are the wrapper's own and must never be forwarded to the host
 * element. Viewer inputs are excluded separately, by tier, through
 * `viewerPropTier`, so this list never has to track them.
 */
const WRAPPER_ONLY_PROPS: ReadonlySet<string> = new Set<string>([
    'handle',
    'ref',
    'key',
    'children',
    ...Object.values(EVENT_PROP_BY_CHANNEL),
]);

export interface TriiiceratopsViewerProps
    extends
        ViewerElementProps,
        ViewerEventProps,
        Omit<
            HTMLAttributes<HTMLElement>,
            keyof ViewerEventProps | 'children' | 'dangerouslySetInnerHTML'
        > {
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

/** The server has no viewer, so the slot reads null there. */
function getNoHandle(): ViewerHandle | null {
    return null;
}

/**
 * Every prop React should put on the host element: whatever the consumer
 * passed that is neither a viewer input nor one of the wrapper's own props.
 */
function hostElementProps(
    props: Readonly<TriiiceratopsViewerProps>,
): Record<string, unknown> {
    const forwarded: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(props)) {
        if (WRAPPER_ONLY_PROPS.has(name)) continue;
        if (viewerPropTier(name) !== undefined) continue;
        forwarded[name] = value;
    }
    return forwarded;
}

export function TriiiceratopsViewer(
    props: TriiiceratopsViewerProps,
): ReactElement {
    const { handle: providedSlot, ref } = props;

    // Strict Mode double-invokes this initializer and discards one slot. The
    // discarded one is never claimed and never armed, so it is inert.
    const [ownSlot] = useState(createViewerHandleSlot);
    const slot = providedSlot ?? ownSlot;

    // Registration rejected (no registry, or a foreign element already owns the
    // tag). Rethrown during render so it reaches a React error boundary rather
    // than the console.
    const [registrationError, setRegistrationError] = useState<unknown>(null);
    if (registrationError !== null) throw registrationError;

    const elementRef = useRef<TriiiceratopsViewerElement | null>(null);
    // Latest callbacks, read by the DOM listeners. One listener per channel is
    // installed for the element's whole lifetime, so changing a callback prop
    // can neither leak nor duplicate a listener.
    const callbacksRef = useRef<ViewerEventProps>(props);
    // Keyed to the element, NOT to the effect: Strict Mode's simulated remount
    // must not reset the applier's memory of what it already wrote and reload
    // the manifest.
    const applierRef = useRef<{
        element: TriiiceratopsViewerElement;
        applier: ViewerPropApplier;
    } | null>(null);

    // Re-render when this viewer binds, rebinds, or unbinds, so the forwarded
    // ref is always the current handle.
    const handle = useSyncExternalStore(slot.subscribe, slot.get, getNoHandle);

    useBrowserLayoutEffect(() => {
        callbacksRef.current = props;
    });

    useBrowserLayoutEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        const controller = createViewerBinding({
            handle: slot,
            onRegistrationError: (error: unknown) => {
                setRegistrationError(() => error);
            },
        });

        const removers = VIEWER_EVENT_CHANNELS.map((channel) => {
            const listener = (event: Event): void => {
                const callback = callbacksRef.current[
                    EVENT_PROP_BY_CHANNEL[channel]
                ] as ((detail: unknown) => void) | undefined;
                callback?.((event as CustomEvent<unknown>).detail);
            };
            element.addEventListener(channel, listener);
            return (): void => element.removeEventListener(channel, listener);
        });

        // Claim, listen, register, then check — all inside `attach`.
        controller.attach(element);

        return () => {
            for (const remove of removers) remove();
            // Removes the availability listener, disposes this viewer's
            // selector runtime, clears the binding, and releases the slot.
            controller.destroy();
        };
    }, [slot]);

    // Every render: the applier suppresses unchanged writes itself, so a parent
    // re-render with equal props touches nothing.
    useBrowserLayoutEffect(() => {
        const element = elementRef.current;
        if (!element) return;
        let entry = applierRef.current;
        if (!entry || entry.element !== element) {
            entry = { element, applier: createViewerPropApplier(element) };
            applierRef.current = entry;
        }
        entry.applier.apply(props);
    });

    // The escape hatch: the binding's OWN handle object, not a synthesized one,
    // so `ref.current.state` is reference-equal to `handle.get()!.state` and to
    // the element's `viewerState`. React clears it on unmount.
    useImperativeHandle<ViewerHandle | null, ViewerHandle | null>(
        ref,
        () => handle,
        [handle],
    );

    return createElement(VIEWER_ELEMENT_TAG, {
        ...hostElementProps(props),
        ...viewerElementAttributes(props),
        ref: elementRef,
    });
}
