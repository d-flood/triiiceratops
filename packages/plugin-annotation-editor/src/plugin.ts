/** `uiId` must stay `'annotation-editor'`: core finds editable shapes by it. */
import {
    definePlugin,
    type PluginView,
    type SdkPlugin,
} from '@triiiceratops/plugin-sdk';

import { catalog } from './catalog';
import { ICON } from './icons';
import { PLUGIN_META } from './identity';
import { mountAnnotationEditor } from './mount.svelte';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { ALL_TOOLS } from './tools';
import type { AnnotationEditorConfig } from './types';

export function createAnnotationEditorPlugin(
    config: AnnotationEditorConfig = {},
): SdkPlugin {
    const view: PluginView = {
        mount(container, context) {
            return mountAnnotationEditor(container, context, config);
        },
    };

    return definePlugin({
        name: PLUGIN_META.name,
        title: 'annotation_editor_title',
        uiId: 'annotation-editor',
        version: PLUGIN_META.version,
        coreRange: '>=1.0.0-rc.36',
        pluginApiRange: '^1.0.0',
        icon: ICON,
        target: config.target ?? 'panel',
        dismiss: 'explicit',
        catalog,
        view,
    });
}

export const AnnotationEditorPlugin: SdkPlugin = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    tools: ALL_TOOLS,
    defaultTool: 'rectangle',
});
