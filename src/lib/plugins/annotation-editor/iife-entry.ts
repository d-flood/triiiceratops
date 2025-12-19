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

import type { PluginDef } from '../../types/plugin';
import AnnotationEditorController from './AnnotationEditorController.svelte';
import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';

// Pre-configured plugin for IIFE usage
const AnnotationEditorPlugin: PluginDef = {
    id: 'annotation-editor',
    name: 'annotation_editor_title',
    icon: PencilSimple,
    panel: AnnotationEditorController,
    position: 'left',
    props: {
        config: {
            adapter: new LocalStorageAdapter(),
            tools: ['rectangle', 'polygon'],
            defaultTool: 'rectangle',
        },
    },
};

// Ensure the namespace exists (should already be created by the element script)
window.TriiiceratopsPlugins = window.TriiiceratopsPlugins || {};

// Register the plugin
window.TriiiceratopsPlugins.AnnotationEditor = AnnotationEditorPlugin;

export { AnnotationEditorPlugin };
