<script lang="ts">
    import { getContext, onDestroy, onMount, untrack } from 'svelte';
    import {
        VIEWER_STATE_KEY,
        type ViewerState,
    } from '../../state/viewer.svelte';
    import { AnnotationManager } from './AnnotationManager.svelte';
    import AnnotationEditorPanel from './AnnotationEditorPanel.svelte';
    import type {
        AnnotationEditorConfig,
        AnnotationEditorRuntimeContext,
        DrawingTool,
        W3CAnnotationBody,
    } from './types';

    const REQUEST_EDIT_EVENT = 'triiiceratops:annotation-editor:request-edit';

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
    let isHydratingSelection = $state(false);
    let showDeleteConfirm = $state(false);
    let pendingDeleteId = $state<string | null>(null);
    let canUndo = $state(false);
    let canRedo = $state(false);
    function getRuntimeContext(): AnnotationEditorRuntimeContext {
        return {
            manifestId: viewerState?.manifestId ?? null,
            canvasId: viewerState?.canvasId ?? null,
            isEditing,
            selectedAnnotation,
            user: config.user,
            hostContext: config.extension?.getContext?.() ?? null,
        };
    }

    let canCreateAnnotation = $derived.by(() => {
        const context = getRuntimeContext();
        if (config.extension?.canCreate) {
            return config.extension.canCreate(context);
        }
        return config.canCreateAnnotation ? config.canCreateAnnotation() : true;
    });
    let createDisabledReason = $derived.by(() => {
        const context = getRuntimeContext();
        if (config.extension?.getCreateDisabledReason) {
            return config.extension.getCreateDisabledReason(context);
        }
        return config.getCreateDisabledReason
            ? config.getCreateDisabledReason()
            : null;
    });

    // Create the annotation manager
    let manager: AnnotationManager | null = $state.raw(null);

    $effect(() => {
        if (manager || !viewerState?.osdViewer) {
            return;
        }

        const mgr = new AnnotationManager(config);

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

        mgr.onAnnotationHydrationChange = (isHydrating) => {
            isHydratingSelection = isHydrating;
        };

        mgr.init(viewerState.osdViewer, viewerState.canvasId);

        if (viewerState.manifestId && viewerState.canvasId) {
            void mgr.handleCanvasChange(
                viewerState.manifestId,
                viewerState.canvasId,
            );
        }

        manager = mgr;
    });

    onDestroy(() => {
        manager?.destroy();
    });

    onMount(() => {
        const handleRequestEdit = (event: Event) => {
            const annotationId = (
                event as CustomEvent<{ annotationId?: string | null }>
            ).detail?.annotationId;

            if (!annotationId) {
                return;
            }

            void (manager as any)?.selectAnnotationById(annotationId);
        };

        window.addEventListener(REQUEST_EDIT_EVENT, handleRequestEdit);

        return () => {
            window.removeEventListener(REQUEST_EDIT_EVENT, handleRequestEdit);
        };
    });

    // Watch for canvas changes
    $effect(() => {
        const manifestId = viewerState?.manifestId;
        const canvasId = viewerState?.canvasId;
        manager?.handleCanvasChange(manifestId ?? null, canvasId ?? null);
    });

    $effect(() => {
        if (canCreateAnnotation || !isEditing) {
            return;
        }
        isEditing = false;
        manager?.setEditing(false);
    });

    // Handlers
    function handleToggleEditing() {
        if (!isEditing && !canCreateAnnotation) {
            return;
        }
        isEditing = !isEditing;
        manager?.setEditing(isEditing);
    }

    function handleSetTool(tool: DrawingTool) {
        activeTool = tool;
        manager?.setTool(tool);
    }

    async function handleSaveBodies(bodies: W3CAnnotationBody[]) {
        if (selectedAnnotation && manager && !isHydratingSelection) {
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
        selectedAnnotation = null;
        manager?.cancelSelection();
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
    {isHydratingSelection}
    {canUndo}
    {canRedo}
    {canCreateAnnotation}
    {createDisabledReason}
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
