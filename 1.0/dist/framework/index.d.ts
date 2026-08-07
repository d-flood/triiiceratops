/**
 * The framework-neutral substrate `triiiceratops/react` and
 * `triiiceratops/vue` are built on (CONTEXT.md **Framework wrapper**).
 *
 * Everything here is plain TypeScript: no React, no Vue, no Svelte runtime, and
 * no browser global touched at module evaluation. A framework entry point can
 * therefore be imported during server rendering, and both wrappers share ONE
 * implementation of registration, prop assignment, handle rules, binding
 * lifecycle, and re-availability — so their behavior cannot drift apart.
 *
 * The wrappers add framework packaging on top: rendering the host element,
 * translating events into callbacks or emits, and turning
 * {@link ViewerBindingController.subscribe} plus the core selector runtime into
 * `useSyncExternalStore` and `computed`.
 */
export { createViewerPropApplier, PROPERTY_WRITE_WARNING_THRESHOLD, type ViewerPropApplier, type ViewerPropApplierOptions, } from './applier.js';
export { createViewerBinding, type ViewerBinding, type ViewerBindingController, type ViewerBindingOptions, } from './binding.js';
export { describeViewerElement, TriiiceratopsElementRegistrationError, TriiiceratopsElementVersionError, TriiiceratopsHandleConflictError, } from './errors.js';
export { createViewerHandleSlot, type ViewerHandleClaim, type ViewerHandleSlot, } from './handle.js';
export { shallowEqual, VIEWER_ATTRIBUTE_PROPS, VIEWER_PROPERTY_PROPS, viewerElementAttributes, viewerPropTier, type ViewerAttributePropName, type ViewerAttributeProps, type ViewerElementProps, type ViewerPropertyPropName, type ViewerPropertyProps, type ViewerPropName, type ViewerPropTier, } from './props.js';
export { assertViewerElementCompatible, createViewerElementRegistrar, ensureViewerElementRegistered, VIEWER_ELEMENT_TAG, VIEWER_STATE_BRIDGE_PROPERTY, type ViewerElementRegistrarOptions, } from './registration.js';
export { getSelectorRuntime } from './runtimeRegistry.js';
export { VIEWER_EVENT_CHANNELS, type ReadonlyViewerState, type TriiiceratopsViewerElement, type ViewerEventChannel, type ViewerEventDetail, type ViewerEventDetailMap, type ViewerHandle, } from './types.js';
export { VIEWER_STATE_AVAILABLE_EVENT } from '../types/viewerElement.js';
export { TriiiceratopsCoreConflictError } from '../browser-runtime.js';
export type { SelectorCadence, SelectorProjection, SelectorProjectionOptions, SelectorRuntime, } from '../state/selectors/index.js';
