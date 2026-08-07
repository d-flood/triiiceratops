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
export { createViewerPropApplier, PROPERTY_WRITE_WARNING_THRESHOLD, } from './applier.js';
export { createViewerBinding, } from './binding.js';
export { describeViewerElement, TriiiceratopsElementRegistrationError, TriiiceratopsElementVersionError, TriiiceratopsHandleConflictError, } from './errors.js';
export { createViewerHandleSlot, } from './handle.js';
export { shallowEqual, VIEWER_ATTRIBUTE_PROPS, VIEWER_PROPERTY_PROPS, viewerElementAttributes, viewerPropTier, } from './props.js';
export { assertViewerElementCompatible, createViewerElementRegistrar, ensureViewerElementRegistered, VIEWER_ELEMENT_TAG, VIEWER_STATE_BRIDGE_PROPERTY, } from './registration.js';
export { getSelectorRuntime } from './runtimeRegistry.js';
export { VIEWER_EVENT_CHANNELS, } from './types.js';
export { VIEWER_STATE_AVAILABLE_EVENT } from '../types/viewerElement.js';
export { TriiiceratopsCoreConflictError } from '../browser-runtime.js';
