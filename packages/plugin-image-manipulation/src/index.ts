/**
 * `@triiiceratops/plugin-image-manipulation` — ESM entry.
 *
 * Import the plugin factory and activate it explicitly on a viewer:
 *
 * ```ts
 * import { ImageManipulationPlugin } from '@triiiceratops/plugin-image-manipulation';
 * // Svelte:  <TriiiceratopsViewer plugins={[ImageManipulationPlugin]} />
 * // WC:      viewer.plugins = [ImageManipulationPlugin];
 * ```
 */

export { ImageManipulationPlugin } from './plugin';
export { DEFAULT_FILTERS } from './types';
export type { ImageFilters } from './types';
