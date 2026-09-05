<script lang="ts">
    import { getContext, onDestroy, onMount, untrack } from 'svelte';
    import type { ViewerState } from 'triiiceratops';
    import { VIEWER_STATE_KEY } from './contextKey';
    import {
        AnnotationManager,
        resolveTools,
    } from './AnnotationManager.svelte';
    import type { AnnotationStore } from './AnnotationStore.svelte';
    import AnnotationEditorPanel from './AnnotationEditorPanel.svelte';
    import type {
        AnnotationEditorConfig,
        AnnotationEditorRuntimeContext,
        DrawingTool,
    } from './types';

    // Props from the plugin system
    let {
        config,
        store,
        embedded = false,
    }: {
        config: AnnotationEditorConfig;
        store?: AnnotationStore;
        embedded?: boolean;
    } = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // UI state
    let isEditing = $state(
        untrack(() => config.ui?.startInCreateMode ?? false),
    );
    // Resolve the effective tool set once from config so the initial active
    // tool and the panel's button list honor `config.tools`/`defaultTool`
    // before the manager exists (F8).
    const resolvedTools = untrack(() => resolveTools(config));
    let activeTool = $state<DrawingTool>(resolvedTools.defaultTool);
    let selectedAnnotation = $state<any>(null);
    let isHydratingSelection = $state(false);
    let showDeleteConfirm = $state(false);
    let pendingDeleteId = $state<string | null>(null);
    let contextVersion = $state(0);
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

    /**
     * Whether core has anything on this canvas for a shape to be anchored
     * against. A canvas a plugin has **claimed** — an audiovisual canvas taken
     * over by a media plugin — is absent from `annotatableCanvasIds`, and every
     * annotation surface (the panel, the overlay, the shape overlay) scopes
     * through that list, so a rectangle drawn here would be persisted and then
     * displayed by nothing.
     *
     * An unknown scope counts as not annotatable: offering a drawing layer over
     * a canvas we cannot confirm core is painting is the failure worth avoiding.
     */
    let canvasIsAnnotatable = $derived.by(() => {
        const canvasId = viewerState?.canvasId;
        if (!canvasId) return false;
        return (viewerState?.annotatableCanvasIds ?? []).includes(canvasId);
    });

    let canCreateAnnotation = $derived.by(() => {
        void contextVersion;
        // The gate precedes the host's own: a host that allows creation still
        // cannot be given a drawing layer over a canvas core is not painting.
        if (!canvasIsAnnotatable) return false;
        const context = getRuntimeContext();
        if (config.extension?.canCreate) {
            return config.extension.canCreate(context);
        }
        return config.canCreateAnnotation ? config.canCreateAnnotation() : true;
    });
    let createDisabledReason = $derived.by(() => {
        void contextVersion;
        // No reason of our own to give — a host's reason describes the host's
        // refusal, not this one, so showing it here would misattribute it. The
        // panel simply renders its inactive state, as it does for any other
        // canvas with nothing to draw on.
        if (!canvasIsAnnotatable) return null;
        const context = getRuntimeContext();
        if (config.extension?.getCreateDisabledReason) {
            return config.extension.getCreateDisabledReason(context);
        }
        return config.getCreateDisabledReason
            ? config.getCreateDisabledReason()
            : null;
    });

    let manager = $state.raw<AnnotationManager | null>(null);

    /*
     * Annotation editing is UNAVAILABLE in this phase.
     *
     * Annotorious's OpenSeadragon integration requires the raw viewer instance,
     * and the renderer pass-through that supplied it was removed with no
     * successor and no shim (SPEC.md §Public API). There is nothing to
     * initialise the manager with, so it is never created and this controller
     * renders inert. Not a degradation — a stop, which is the decision already
     * on the record; the replacement is phase-2 work built on the paint hook
     * and the input-claim API.
     *
     * The manager and everything under it is kept intact rather than deleted:
     * the package is PAUSED, and this flag is the single point that flips when
     * the phase-2 drawing layer gives it something to initialise against. See
     * `README.md` for the disposition and the last core version it works
     * against.
     */
    const RENDERER_AVAILABLE_FOR_ANNOTORIOUS = false;

    $effect(() => {
        if (manager || !RENDERER_AVAILABLE_FOR_ANNOTORIOUS || !viewerState) {
            return;
        }

        const mgr = new AnnotationManager(config, store, viewerState);

        mgr.onSelectionChange = (annotation) => {
            selectedAnnotation = annotation;
        };

        mgr.onAnnotationCreated = (annotation) => {
            selectedAnnotation = annotation;
        };

        mgr.onAnnotationHydrationChange = (isHydrating) => {
            isHydratingSelection = isHydrating;
        };

        mgr.onActiveEditingAnnotationChange = (annotationId) => {
            if (viewerState?.annotationEditBus) {
                viewerState.annotationEditBus.activeEditAnnotationId =
                    annotationId;
            }
        };

        mgr.init(null, viewerState.canvasId);

        if (isEditing && canCreateAnnotation) {
            mgr.setEditing(true);
        }

        if (viewerState.manifestId && viewerState.canvasId) {
            void mgr.handleCanvasChange(
                viewerState.manifestId,
                viewerState.canvasId,
            );
        }

        manager = mgr;
    });

    onDestroy(() => {
        if (viewerState?.annotationEditBus) {
            viewerState.annotationEditBus.requestEdit = () => {};
            viewerState.annotationEditBus.activeEditAnnotationId = null;
        }
        manager?.destroy();
    });

    onMount(() => {
        const unsubscribe = config.extension?.subscribe?.(() => {
            contextVersion++;
        });

        const previousRequestEdit = viewerState?.annotationEditBus?.requestEdit;
        if (viewerState?.annotationEditBus) {
            viewerState.annotationEditBus.requestEdit = (annotationId) => {
                if (!annotationId) {
                    return;
                }

                void (manager as any)?.selectAnnotationById(annotationId);
            };
        }

        return () => {
            unsubscribe?.();
            if (viewerState?.annotationEditBus) {
                viewerState.annotationEditBus.requestEdit =
                    previousRequestEdit ?? (() => {});
            }
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

    // The store's unhandled persistence error, surfaced as a dismissible line in
    // the panel when the host provides no onPersistenceError handler (F20).
    let persistenceError = $derived(manager?.persistenceError ?? null);
    function handleDismissError() {
        manager?.dismissPersistenceError();
    }

    // Persistence-aware undo/redo, replayed through the adapter by the store so
    // storage and display never disagree (F6). Availability is reactive store
    // state read straight off the manager.
    let canUndo = $derived(manager?.canUndo ?? false);
    let canRedo = $derived(manager?.canRedo ?? false);
    function handleUndo() {
        void manager?.undo();
    }
    function handleRedo() {
        void manager?.redo();
    }

    async function handleSaveBodies(bodies: unknown[] | unknown) {
        if (selectedAnnotation && manager && !isHydratingSelection) {
            const ok = await manager.updateAnnotationBodies(
                selectedAnnotation.id,
                bodies,
            );
            // Keep the editor open on failure — the manager has re-signalled the
            // rolled-back selection and the error line explains what happened.
            if (ok) {
                selectedAnnotation = null;
                manager.cancelSelection();
            }
        }
    }

    function handleCancelSelection() {
        selectedAnnotation = null;
        manager?.cancelSelection();
    }

    function handleRequestDelete() {
        if (selectedAnnotation) {
            pendingDeleteId = selectedAnnotation.id;
            showDeleteConfirm = true;
        }
    }

    async function handleConfirmDelete() {
        let ok = true;
        if (pendingDeleteId && manager) {
            ok = await manager.deleteAnnotation(pendingDeleteId);
        }
        showDeleteConfirm = false;
        pendingDeleteId = null;
        // On failure keep the annotation selected so the user can retry; the
        // error line explains the failure (F20).
        if (ok) {
            selectedAnnotation = null;
        }
    }

    function handleCancelDelete() {
        // Cancel returns the user to editing the same annotation — do not clear
        // the selection here (F13).
        showDeleteConfirm = false;
        pendingDeleteId = null;
    }
</script>

<AnnotationEditorPanel
    {isEditing}
    {activeTool}
    {selectedAnnotation}
    {showDeleteConfirm}
    {isHydratingSelection}
    {canCreateAnnotation}
    {createDisabledReason}
    {persistenceError}
    bodyEditor={config.bodyEditor ?? null}
    showModeToggle={config.ui?.showModeToggle ?? true}
    showUndoRedo={config.ui?.showUndoRedo ?? true}
    purposes={config.ui?.purposes}
    allowMultipleBodies={config.ui?.allowMultipleBodies ?? true}
    runtimeContext={getRuntimeContext()}
    onDismissError={handleDismissError}
    {canUndo}
    {canRedo}
    onUndo={handleUndo}
    onRedo={handleRedo}
    availableTools={manager?.availableTools ?? resolvedTools.tools}
    onToggleEditing={handleToggleEditing}
    onSetTool={handleSetTool}
    onSaveBodies={handleSaveBodies}
    onCancelSelection={handleCancelSelection}
    onRequestDelete={handleRequestDelete}
    onConfirmDelete={handleConfirmDelete}
    onCancelDelete={handleCancelDelete}
    {embedded}
/>
