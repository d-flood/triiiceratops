/**
 * Internal barrel for the Vue framework wrapper. The PUBLISHED entry point is
 * `../vue.ts` (`triiiceratops/vue`); this file exists so the wrapper's own
 * modules and tests have one import site.
 */
export { ViewerProvider, type ViewerProviderProps } from './context.js';
export { provideViewer, type TriiiceratopsViewerInstance, type ViewerHandleRef, } from './handle.js';
export { useViewer, useViewerSelector, type ViewerProjection, type ViewerSelectorOptions, } from './selector.js';
export { TriiiceratopsViewer, type TriiiceratopsViewerProps, type ViewerEmits, } from './viewer.js';
