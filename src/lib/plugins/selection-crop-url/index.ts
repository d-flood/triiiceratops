import Crop from 'phosphor-svelte/lib/Crop';

import { createPanelPlugin, type PluginDef } from '../../types/plugin';

import SelectionCropUrlController from './SelectionCropUrlController.svelte';

export const SelectionCropUrlPlugin: PluginDef = createPanelPlugin({
    id: 'selection-crop-url',
    name: 'Selection Crop URL',
    icon: Crop,
    panel: SelectionCropUrlController,
    position: 'left',
});

export { Crop, SelectionCropUrlController };
export {
    buildSelectionCropUrl,
    type SelectionCropUrlResult,
    type SelectionRect,
} from './selectionCropUrl';