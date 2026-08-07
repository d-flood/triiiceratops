/**
 * `triiiceratops/vue` — the Vue 3.5 framework wrapper.
 *
 * A Vue application renders `<TriiiceratopsViewer>` with typed props, puts an
 * ordinary template ref on it, and reads the viewer's live state through
 * `useViewer()` and `useViewerSelector()`. Registration of the self-contained
 * custom element is automatic, lazy, and shared; Svelte stays behind the
 * custom-element boundary at runtime AND at type-check time.
 *
 * ```vue
 * <script setup lang="ts">
 * import {
 *     TriiiceratopsViewer,
 *     useViewerSelector,
 *     type TriiiceratopsViewerInstance,
 * } from 'triiiceratops/vue';
 *
 * const viewer = useTemplateRef<TriiiceratopsViewerInstance>('viewer');
 * const canvasId = useViewerSelector(viewer, (state) => state.canvasId);
 * </script>
 *
 * <template>
 *     <TriiiceratopsViewer
 *         ref="viewer"
 *         manifest-id="https://example.org/manifest"
 *         @canvas-change="(snapshot) => syncUrl(snapshot.canvasId)"
 *     />
 * </template>
 * ```
 *
 * Because the component is a render function, the raw custom-element tag never
 * reaches Vue's template compiler: no `compilerOptions.isCustomElement`
 * configuration is required.
 *
 * Vue 3.5 is an OPTIONAL peer dependency: `vue` is a bare import specifier here
 * and never a runtime dependency of core. Importing this module on a server is
 * safe — nothing touches `window`, `document`, or `customElements` at
 * evaluation, and nothing is registered.
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
export { provideViewer, TriiiceratopsViewer, useViewer, useViewerSelector, ViewerProvider, } from './vue/index.js';
// ---------------------------------------------------------------------------
// The framework-neutral contracts a Vue consumer reaches for. Same objects,
// same types, as `triiiceratops/react` exposes.
// ---------------------------------------------------------------------------
export { TriiiceratopsCoreConflictError, TriiiceratopsElementRegistrationError, TriiiceratopsElementVersionError, TriiiceratopsHandleConflictError, VIEWER_ELEMENT_TAG, VIEWER_EVENT_CHANNELS, VIEWER_STATE_AVAILABLE_EVENT, } from './framework/index.js';
