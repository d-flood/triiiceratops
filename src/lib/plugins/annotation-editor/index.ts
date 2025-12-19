import type { PluginDef } from '../../types/plugin';
import AnnotationEditorController from './AnnotationEditorController.svelte';
import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
import type { AnnotationEditorConfig } from './types';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { createLoader } from './loader.svelte';

/**
 * Create an Annotation Editor plugin with custom configuration.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createAnnotationEditorPlugin, LocalStorageAdapter } from 'triiiceratops/plugins/annotation-editor';
 *
 *   const annotationPlugin = createAnnotationEditorPlugin({
 *     adapter: new LocalStorageAdapter(),
 *     user: { id: 'user-123', name: 'Jane Doe' },
 *   });
 * </script>
 *
 * <TriiiceratopsViewer plugins={[annotationPlugin]} />
 * ```
 */
export function createAnnotationEditorPlugin(
    config: AnnotationEditorConfig = {},
): PluginDef {
    const adapter = config.adapter || new LocalStorageAdapter();
    const fullConfig = { ...config, adapter };

    return {
        id: 'annotation-editor',
        name: 'annotation_editor_title',
        icon: PencilSimple,
        panel: AnnotationEditorController,
        position: 'left',
        props: { config: fullConfig },
        onInit: createLoader(adapter),
    };
}

/**
 * Pre-configured Annotation Editor plugin with localStorage adapter.
 * For advanced configuration, use createAnnotationEditorPlugin().
 *
 * @example
 * ```svelte
 * <script>
 *   import { AnnotationEditorPlugin } from 'triiiceratops/plugins/annotation-editor';
 * </script>
 *
 * <TriiiceratopsViewer plugins={[AnnotationEditorPlugin]} />
 * ```
 */
export const AnnotationEditorPlugin: PluginDef = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    tools: ['rectangle', 'polygon', 'point'],
    defaultTool: 'rectangle',
});

// Individual exports for customization
export { AnnotationEditorController };
export { default as AnnotationEditorIcon } from 'phosphor-svelte/lib/PencilSimple';

// Type exports
export type {
    AnnotationEditorConfig,
    DrawingTool,
    W3CAnnotationBody,
    W3CPurpose,
    AnnotationStorageAdapter,
} from './types';
export { W3C_PURPOSES } from './types';

// Adapter exports
export type { W3CAnnotation } from './adapters/types';
export { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
