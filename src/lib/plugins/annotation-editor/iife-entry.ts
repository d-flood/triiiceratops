/**
 * IIFE entry point for the Annotation Editor plugin.
 * This file is bundled separately for script-tag usage.
 *
 * Usage:
 * <script src="triiiceratops-element.iife.js"></script>
 * <script src="triiiceratops-plugin-annotation-editor.iife.js"></script>
 * <script>
 *   const viewer = document.querySelector('triiiceratops-viewer');
 *   viewer.plugins = [window.TriiiceratopsPlugins.AnnotationEditor];
 * </script>
 */

import { registerIifePlugin } from '../../types/plugin';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { createAnnotationEditorPlugin } from './index';

const AnnotationEditorPlugin = createAnnotationEditorPlugin({
    adapter: new LocalStorageAdapter(),
    tools: ['rectangle', 'polygon'],
    defaultTool: 'rectangle',
});

registerIifePlugin('AnnotationEditor', AnnotationEditorPlugin);

export { AnnotationEditorPlugin };
