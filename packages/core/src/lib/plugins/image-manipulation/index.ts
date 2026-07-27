import { createFlyoutPlugin, type PluginDef } from '../../types/plugin';
import ImageManipulationFlyout from './ImageManipulationFlyout.svelte';
import SlidersIcon from 'phosphor-svelte/lib/Sliders';

/**
 * Pre-configured Image Manipulation plugin.
 *
 * Renders as a compact icon rail that grows out of its toolbar button
 * (a "flyout"), rather than occupying a full side panel.
 *
 * Usage:
 * ```svelte
 * import { ImageManipulationPlugin } from 'triiiceratops/plugins/image-manipulation';
 *
 * <TriiiceratopsViewer plugins={[ImageManipulationPlugin]} />
 * ```
 */
export const ImageManipulationPlugin: PluginDef = createFlyoutPlugin({
    id: 'image-manipulation',
    name: 'image_adjustments_title',
    icon: SlidersIcon,
    flyout: ImageManipulationFlyout,
});

// Individual exports for customization
export { ImageManipulationFlyout, SlidersIcon };
export type { ImageFilters } from './types';
export { DEFAULT_FILTERS } from './types';
