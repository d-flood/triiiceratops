/**
 * `triiiceratops/react` — the React 19 framework wrapper.
 *
 * A React application renders `<TriiiceratopsViewer>` with typed props, creates
 * a handle with `useViewerHandle()`, and reads the viewer's live state through
 * `useViewer()` and `useViewerSelector()`. Registration of the self-contained
 * custom element is automatic, lazy, and shared; Svelte stays behind the
 * custom-element boundary at runtime AND at type-check time.
 *
 * ```ts
 * const handle = useViewerHandle();
 * const canvasId = useViewerSelector(handle, (state) => state.canvasId);
 * return createElement(TriiiceratopsViewer, {
 *     handle,
 *     manifestId: 'https://example.org/manifest',
 *     onCanvasChange: (snapshot) => setUrlCanvas(snapshot.canvasId),
 * });
 * ```
 *
 * React 19 is an OPTIONAL peer dependency: `react` is a bare import specifier
 * here and never a runtime dependency of core. Importing this module on a
 * server is safe — nothing touches `window`, `document`, or `customElements`
 * at evaluation, and nothing is registered.
 *
 * **Re-export boundary.** Everything below comes from the framework substrate,
 * `triiiceratops/selectors`, or the shared `types/*` modules. Nothing is
 * re-exported from core's `.` entry: its declarations reach the compiled
 * `TriiiceratopsViewer.svelte.d.ts`, which imports `svelte`, and inheriting
 * that would break this subpath's no-Svelte type promise (SPEC "Superseded
 * decisions").
 */

// ---------------------------------------------------------------------------
// The wrapper itself.
// ---------------------------------------------------------------------------

export {
    TriiiceratopsViewer,
    useViewer,
    useViewerHandle,
    useViewerSelector,
    ViewerProvider,
    type TriiiceratopsViewerProps,
    type TriiiceratopsViewerRef,
    type ViewerEventProps,
    type ViewerProjection,
    type ViewerProviderProps,
    type ViewerSelectorOptions,
} from './react/index.js';

// ---------------------------------------------------------------------------
// The framework-neutral contracts a React consumer reaches for. Same objects,
// same types, as `triiiceratops/vue` exposes.
// ---------------------------------------------------------------------------

export {
    TriiiceratopsCoreConflictError,
    TriiiceratopsElementRegistrationError,
    TriiiceratopsElementVersionError,
    TriiiceratopsHandleConflictError,
    VIEWER_ELEMENT_TAG,
    VIEWER_EVENT_CHANNELS,
    VIEWER_STATE_AVAILABLE_EVENT,
    type ReadonlyViewerState,
    type TriiiceratopsViewerElement,
    type ViewerEventChannel,
    type ViewerEventDetail,
    type ViewerEventDetailMap,
    type ViewerHandle,
    type ViewerHandleSlot,
} from './framework/index.js';

export type { SelectorCadence } from './state/selectors/index.js';

// ---------------------------------------------------------------------------
// Shared public types that appear in the props and callbacks above, so common
// usage never needs a deep import.
// ---------------------------------------------------------------------------

export type { ViewerStateSnapshot } from './state/viewer.svelte.js';
export type {
    SearchHit,
    SearchProvider,
    SearchProviderContext,
    SearchResultGroup,
    ViewerConfig,
} from './types/config.js';
export type {
    IconDescriptor,
    PluginError,
    PluginMountThunk,
    PluginSurface,
    PluginUiTarget,
    SdkPlugin,
} from './types/plugin.js';
export type { ViewerError } from './types/viewerError.js';
export type { ThemeConfig } from './theme/types.js';
export type { CanvasRegion } from './utils/contentState.js';
