import type { PluginDef } from '../../types/plugin';
import ImageManipulationController from './ImageManipulationController.svelte';
import SlidersIcon from 'phosphor-svelte/lib/Sliders';

/**
 * Pre-configured Image Manipulation plugin.
 *
 * Usage:
 * ```svelte
 * import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';
 *
 * <TriiiceratopsViewer plugins={[ImageManipulationPlugin]} />
 * ```
 */
export const ImageManipulationPlugin: PluginDef = {
    id: 'image-manipulation',
    name: 'image_adjustments_title',
    icon: SlidersIcon,
    panel: ImageManipulationController,
    position: 'left',
};

// Individual exports for customization
export { ImageManipulationController, SlidersIcon };
export type { ImageFilters } from './types';
export { DEFAULT_FILTERS } from './types';
