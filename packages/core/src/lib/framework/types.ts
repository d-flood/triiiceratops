/**
 * The shared, framework-neutral types every framework wrapper is built from
 * (CONTEXT.md **Framework wrapper**, **Viewer state**; ADR 0007).
 *
 * Nothing here imports React, Vue, or a Svelte runtime. `triiiceratops/react`
 * and `triiiceratops/vue` re-export these so a consumer never needs a deep
 * import, and the two wrappers agree on one vocabulary by construction.
 */

import type { PluginError } from '../types/plugin.js';
import type {
    ViewerState,
    ViewerStateSnapshot,
} from '../state/viewer.svelte.js';
import type { TriiiceratopsViewerElement } from '../types/viewerElement.js';
import type { ViewerError } from '../types/viewerError.js';

/**
 * The supported view of a viewer's live state: everything a consumer may read
 * or command, with the four lifecycle-plumbing methods hidden.
 *
 * This is a TYPE-LEVEL view of the very same live object — there is no facade
 * class, no `Proxy`, and no wrapper instance (SPEC "Access model"). A
 * `ReadonlyViewerState` obtained from a {@link ViewerHandle} is reference-equal
 * to the element's own `viewerState`, so identity comparisons hold and the
 * escape hatch stays honest.
 *
 * `readonly` applies one level deep, to the members themselves. It does not
 * freeze the collections a member holds, and it is not a runtime guarantee:
 * direct assignment remains a physically possible, unsupported escape hatch
 * (ADR 0007).
 */
export type ReadonlyViewerState = Readonly<
    Omit<
        ViewerState,
        'setEventTarget' | 'setViewerElement' | 'destroy' | 'destroyAllPlugins'
    >
>;

/**
 * The imperative contract both wrappers expose — React through a forwarded
 * ref, Vue through an ordinary template ref. Exactly two members: the hosted
 * custom element and its viewer state.
 *
 * A handle is REBUILT, never mutated, whenever the element publishes a new
 * `ViewerState` (see `createViewerBinding`), so holding one across a rebind
 * cannot silently point at a disposed selector runtime. A consumer that needs
 * the runtime resolves it from `state` through `getSelectorRuntime`, which is
 * why this stays two members.
 */
export interface ViewerHandle {
    readonly element: TriiiceratopsViewerElement;
    readonly state: ReadonlyViewerState;
}

/**
 * The custom element's translated event channels, in the order the wrappers
 * document them. Wrappers install one DOM listener per channel and hand the
 * consumer {@link ViewerEventDetail} — never a `CustomEvent`.
 */
export const VIEWER_EVENT_CHANNELS = [
    'statechange',
    'canvaschange',
    'manifestchange',
    'choicechange',
    'pluginerror',
    'viewererror',
] as const;

/** One translated custom-element event channel. */
export type ViewerEventChannel = (typeof VIEWER_EVENT_CHANNELS)[number];

/**
 * What each channel's `CustomEvent.detail` carries. The four state channels
 * share `ViewerStateSnapshot`; the two failure channels carry the EXACT
 * `PluginError` (with a callable `retry()`) and `ViewerError` objects core
 * dispatched, so framework translation removes no recovery behavior.
 */
export interface ViewerEventDetailMap {
    statechange: ViewerStateSnapshot;
    canvaschange: ViewerStateSnapshot;
    manifestchange: ViewerStateSnapshot;
    choicechange: ViewerStateSnapshot;
    pluginerror: PluginError;
    viewererror: ViewerError;
}

/** The detail type for one channel. */
export type ViewerEventDetail<C extends ViewerEventChannel> =
    ViewerEventDetailMap[C];

export type { TriiiceratopsViewerElement };
