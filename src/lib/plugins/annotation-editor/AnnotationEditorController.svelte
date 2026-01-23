<script lang="ts">
    import { getContext, onMount, onDestroy, untrack } from 'svelte';
    import {
        VIEWER_STATE_KEY,
        type ViewerState,
    } from '../../state/viewer.svelte';
    import { AnnotationManager } from './AnnotationManager.svelte';
    import AnnotationEditorPanel from './AnnotationEditorPanel.svelte';
    import type {
        AnnotationEditorConfig,
        DrawingTool,
        W3CAnnotationBody,
    } from './types';

    // Props from the plugin system
    let {
        isOpen: _isOpen = false,
        close,
        config,
    }: {
        isOpen: boolean;
        close: () => void;
        config: AnnotationEditorConfig;
    } = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // UI state
    let isEditing = $state(false);
    let activeTool = $state<DrawingTool>(
        untrack(() => config.defaultTool ?? 'rectangle'),
    );
    let selectedAnnotation = $state<any>(null);
    let showDeleteConfirm = $state(false);
    let pendingDeleteId = $state<string | null>(null);
    let canUndo = $state(false);
    let canRedo = $state(false);

    // Create the annotation manager
    let manager: AnnotationManager | null = $state.raw(null);

    onMount(() => {
        if (viewerState?.osdViewer) {
            const mgr = new AnnotationManager(config);

            // Set up callbacks
            mgr.onSelectionChange = (annotation) => {
                selectedAnnotation = annotation;
            };

            mgr.onUndoRedoChange = (undo, redo) => {
                canUndo = undo;
                canRedo = redo;
            };

            mgr.onAnnotationCreated = (annotation) => {
                selectedAnnotation = annotation;
            };

            mgr.init(viewerState.osdViewer, viewerState.canvasId);

            // Load initial annotations
            if (viewerState.manifestId && viewerState.canvasId) {
                mgr.handleCanvasChange(
                    viewerState.manifestId,
                    viewerState.canvasId,
                );
            }

            manager = mgr;
        } else {
            console.warn(
                '[AnnotationEditor] No OSD viewer available at mount time',
            );
        }
    });

    onDestroy(() => {
        manager?.destroy();
    });

    // Watch for canvas changes
    $effect(() => {
        const manifestId = viewerState?.manifestId;
        const canvasId = viewerState?.canvasId;
        manager?.handleCanvasChange(manifestId ?? null, canvasId ?? null);
    });

    // Handlers
    function handleToggleEditing() {
        isEditing = !isEditing;
        manager?.setEditing(isEditing);
    }

    function handleSetTool(tool: DrawingTool) {
        activeTool = tool;
        manager?.setTool(tool);
    }

    async function handleSaveBodies(bodies: W3CAnnotationBody[]) {
        if (selectedAnnotation && manager) {
            await manager.updateAnnotationBodies(selectedAnnotation.id, bodies);
            selectedAnnotation = null;
            manager.cancelSelection();
        }
    }

    function handleRequestDelete() {
        if (selectedAnnotation) {
            pendingDeleteId = selectedAnnotation.id;
            showDeleteConfirm = true;
        }
    }

    async function handleConfirmDelete() {
        if (pendingDeleteId && manager) {
            await manager.deleteAnnotation(pendingDeleteId);
        }
        showDeleteConfirm = false;
        pendingDeleteId = null;
        selectedAnnotation = null;
    }

    function handleCancelDelete() {
        showDeleteConfirm = false;
        pendingDeleteId = null;
        manager?.cancelSelection();
    }

    function handleUndo() {
        manager?.undo();
    }

    function handleRedo() {
        manager?.redo();
    }

    function handleClose() {
        if (isEditing) {
            isEditing = false;
            manager?.setEditing(false);
        }
        close();
    }
</script>

<AnnotationEditorPanel
    {isEditing}
    {activeTool}
    {selectedAnnotation}
    {showDeleteConfirm}
    {canUndo}
    {canRedo}
    availableTools={manager?.availableTools ?? [
        'rectangle',
        'polygon',
        'point',
    ]}
    onToggleEditing={handleToggleEditing}
    onSetTool={handleSetTool}
    onSaveBodies={handleSaveBodies}
    onRequestDelete={handleRequestDelete}
    onConfirmDelete={handleConfirmDelete}
    onCancelDelete={handleCancelDelete}
    onUndo={handleUndo}
    onRedo={handleRedo}
    onClose={handleClose}
/>
