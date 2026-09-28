/**
 * `triiiceratops/vue` — the Vue 3.5 framework wrapper.
 *
 * Vue 3.5 is an OPTIONAL peer: importing this module on a server is safe and
 * registers nothing.
 *
 * Nothing below is re-exported from core's `.` entry: its declarations reach
 * the compiled `TriiiceratopsViewer.svelte.d.ts`, which imports `svelte`, and
 * inheriting that would break this subpath's no-Svelte type promise.
 */

export {
    provideViewer,
    TriiiceratopsViewer,
    useViewer,
    useViewerSelector,
    ViewerProvider,
    type TriiiceratopsViewerInstance,
    type TriiiceratopsViewerProps,
    type ViewerEmits,
    type ViewerHandleRef,
    type ViewerProjection,
    type ViewerProviderProps,
    type ViewerSelectorOptions,
} from './vue/index.js';

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
