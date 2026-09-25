<script lang="ts">
    import { getContext, onDestroy, onMount, untrack } from 'svelte';
    import type { ViewerState } from 'triiiceratops';
    import { VIEWER_STATE_KEY } from './contextKey';
    import { resolveTools } from './tools';
    import type { AnnotationStore } from './AnnotationStore.svelte';
    import type { W3CAnnotation } from './adapters/types';
    import type { DrawingSession } from './drawingSession.svelte';
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
        session,
        embedded = false,
    }: {
        config: AnnotationEditorConfig;
        store?: AnnotationStore;
        /**
         * The arming state the drawing layer reads. Absent when the panel is
         * mounted on its own (its unit tests), which simply means nothing is
         * drawing.
         */
        session?: DrawingSession;
        embedded?: boolean;
    } = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    // UI state
    let isEditing = $state(
        untrack(() => config.ui?.startInCreateMode ?? false),
    );
    // Resolve the effective tool set once from config so the initial active
    // tool and the panel's button list honor `config.tools`/`defaultTool`.
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

    /*
     * The host's seams onto a write. `extension.prepareDraft` and the flat
     * `prepareAnnotation` are the same hook — the richer one wins — and enrich
     * a NEW annotation; `extension.beforeSave` is the last word on every
     * annotation on its way to the store. Both live here rather than on the
     * drawing layer because the runtime context they are handed is this
     * component's state, and both are handed to the layer through the session.
     */
    function prepareDraft(annotation: W3CAnnotation): W3CAnnotation {
        if (config.extension?.prepareDraft) {
            return config.extension.prepareDraft(
                annotation,
                getRuntimeContext(),
            );
        }
        return config.prepareAnnotation
            ? config.prepareAnnotation(annotation)
            : annotation;
    }

    async function applyBeforeSave(
        annotation: W3CAnnotation,
    ): Promise<W3CAnnotation> {
        return config.extension?.beforeSave
            ? await config.extension.beforeSave(annotation, getRuntimeContext())
            : annotation;
    }

    /*
     * Tell the host what is selected, from one place: every path that opens or
     * clears a selection writes `selectedAnnotation`, so watching it is what
     * keeps a new path from forgetting the hook. Keyed on the id, so replacing
     * the same annotation with its hydrated copy is not a second selection.
     */
    let notifiedSelectionId: string | null = null;
    $effect(() => {
        const annotation = selectedAnnotation;
        const id = annotation?.id ?? null;
        if (id === notifiedSelectionId) return;
        notifiedSelectionId = id;
        untrack(() => {
            config.extension?.onSelectionChange?.(
                annotation,
                getRuntimeContext(),
            );
        });
    });

    /**
     * Open an annotation for editing, fetching its full body first when the
     * adapter loaded it as a **skeleton**. Until it arrives the body
     * editor is disabled rather than showing — and letting the reader save
     * over — bodies that were never loaded.
     */
    async function selectAnnotation(annotation: W3CAnnotation): Promise<void> {
        selectedAnnotation = annotation;
        if (!store?.hydrateSupported || !store.isSkeleton(annotation.id)) {
            return;
        }
        isHydratingSelection = true;
        try {
            // The store discards a result whose canvas changed underneath it;
            // the veto covers the other race, a reader who moved on to
            // another annotation while the body was in flight.
            const full = await store.hydrate(
                annotation.id,
                () => selectedAnnotation?.id === annotation.id,
            );
            if (full && selectedAnnotation?.id === annotation.id) {
                selectedAnnotation = full;
            }
        } finally {
            isHydratingSelection = false;
        }
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

    onDestroy(() => {
        // Deactivation, not a panel close: core mounts this content once per
        // activation and only re-parents it in and out of its surface. Releasing
        // core's per-viewer edit channel is what belongs here — the handler
        // installed below closes over this component, and the id suppresses a
        // shape in core's own overlay, so both would outlive the editor that
        // owns them. Disarming is NOT here: it answers to the panel closing,
        // which this never sees — the drawing layer holds that invariant, off
        // the mirror's `surfaceOpen`.
        if (viewerState?.annotationEditBus) {
            viewerState.annotationEditBus.requestEdit = () => {};
            viewerState.annotationEditBus.activeEditAnnotationId = null;
        }
    });

    onMount(() => {
        const unsubscribe = config.extension?.subscribe?.(() => {
            contextVersion++;
        });

        // A shape the drawing layer committed and the store persisted: open it
        // for a body straight away, which is the whole point of having drawn it.
        if (session) {
            session.onCreated = (annotation) => {
                void selectAnnotation(annotation);
            };
            // The host's draft and save hooks, which the layer applies around
            // its own writes.
            session.prepareDraft = prepareDraft;
            session.beforeSave = applyBeforeSave;
            // Escape on the drawing layer comes back here rather than clearing
            // the session's tool directly: create mode is what arming is
            // derived from, so leaving it is the only disarm the panel agrees
            // with.
            session.requestDisarm = () => {
                isEditing = false;
            };
            // Escape on an open edit. Clearing the selection is the cancel:
            // the handles, the suppression of core's own shape and the body
            // editor all hang off it.
            session.requestCancelEdit = () => {
                selectedAnnotation = null;
            };
            // The Delete key on the shape under edit. Routed to the same
            // confirmation the panel's delete button opens: parity means the
            // keyboard reaches the deletion, not that it skips the guard the
            // pointer path has.
            session.requestDelete = () => {
                handleRequestDelete();
            };
        }

        const previousRequestEdit = viewerState?.annotationEditBus?.requestEdit;
        if (viewerState?.annotationEditBus) {
            // Claiming the channel is what makes core treat this viewer's
            // shapes as editable, and this is the only way a tap on a shape
            // reaches the plugin: core owns the tap, this owns what it opens.
            //
            // This id is the whole of what the plugin takes from core's
            // selection: `activeAnnotationId` is deliberately not read. Core
            // toggles it, so a second tap on the open shape clears it while
            // requestEdit fires with the same id, and deriving the edit from it
            // would close a shape the moment `session.onCreated` opened it.
            viewerState.annotationEditBus.requestEdit = (annotationId) => {
                const annotation = store?.get(annotationId);
                // Not in the store — a search hit, or an annotation the
                // manifest published rather than this editor's adapter. There
                // is nothing to save it back through.
                if (!annotation) return;
                // The reader reached for the shape itself, so focus belongs on
                // it — this is the only path that is a tap on the image.
                if (session) session.focusOnEdit = true;
                void selectAnnotation(annotation);
            };
        }

        return () => {
            unsubscribe?.();
            if (session) {
                session.onCreated = null;
                session.prepareDraft = null;
                session.beforeSave = null;
                session.requestDisarm = null;
                session.requestCancelEdit = null;
                session.requestDelete = null;
            }
            if (viewerState?.annotationEditBus) {
                viewerState.annotationEditBus.requestEdit =
                    previousRequestEdit ?? (() => {});
            }
        };
    });

    $effect(() => {
        if (canCreateAnnotation || !isEditing) {
            return;
        }
        isEditing = false;
    });

    /*
     * Arming is modal: create mode with a tool selected IS the armed state, and
     * this is what hands the drawing layer the whole surface. An `$effect`
     * rather than a `$derived` because the target is state on an object shared
     * with a component tree the panel does not own.
     */
    $effect(() => {
        if (!session) return;
        session.armedTool = isEditing ? activeTool : null;
    });

    /*
     * Which annotation the drawing layer draws with handles, and therefore
     * which one core's overlay stands down on.
     *
     * Only in edit mode: create mode arms a tool over the whole surface, so a
     * drag on a shape's handles would draw a new shape instead of reshaping it,
     * and handles that answer nothing are worse than none. A shape created in
     * create mode is still selected for its body — it simply keeps core's own
     * rendering until the reader leaves the mode.
     */
    $effect(() => {
        if (!session) return;
        session.editingAnnotationId =
            !isEditing && selectedAnnotation ? selectedAnnotation.id : null;
    });

    // Handlers
    function handleToggleEditing() {
        if (!isEditing && !canCreateAnnotation) {
            return;
        }
        isEditing = !isEditing;
    }

    function handleSetTool(tool: DrawingTool, fromKeyboard = false) {
        activeTool = tool;
        // The whole-canvas tool is the one tool with no gesture: there is no
        // region to describe, so activating it is the entire interaction and
        // the annotation is created there and then. Pressing it again creates
        // another, which is the only way a reader gets a second whole-page note.
        if (tool === 'wholeCanvas') {
            session?.createWholeCanvasAnnotation?.();
            return;
        }
        // Every other tool needs a region, and a keyboard user has no cursor to
        // describe one with: activating from the keyboard drops the tool's
        // default shape at the centre of the view for the editing verbs to
        // move and size (place-then-shape).
        if (fromKeyboard) {
            session?.placeDefaultShape?.(tool);
        }
    }

    // The store's unhandled persistence error, surfaced as a dismissible line in
    // the panel when the host provides no onPersistenceError handler.
    let persistenceError = $derived(store?.panelError ?? null);
    function handleDismissError() {
        store?.dismissError();
    }

    // Persistence-aware undo/redo, replayed through the adapter by the store so
    // storage and display never disagree. Availability is reactive store
    // state.
    let canUndo = $derived(store?.canUndo ?? false);
    let canRedo = $derived(store?.canRedo ?? false);
    function handleUndo() {
        void store?.undo();
    }
    function handleRedo() {
        void store?.redo();
    }

    async function handleSaveBodies(bodies: unknown[] | unknown) {
        if (!selectedAnnotation || !store || isHydratingSelection) return;
        // The store's copy, not the selection snapshot: a reshape on the
        // drawing layer has already written new geometry, and spreading the
        // snapshot would put the old box back.
        const current = store.get(selectedAnnotation.id) ?? selectedAnnotation;
        const ok = await store.persist(
            await applyBeforeSave({
                ...current,
                body: bodies,
            }),
        );
        // Keep the editor open on failure — the store has rolled the write back
        // and the error line explains what happened.
        if (ok) {
            selectedAnnotation = null;
        }
    }

    function handleCancelSelection() {
        selectedAnnotation = null;
    }

    function handleRequestDelete() {
        if (selectedAnnotation) {
            pendingDeleteId = selectedAnnotation.id;
            showDeleteConfirm = true;
        }
    }

    async function handleConfirmDelete() {
        let ok = true;
        if (pendingDeleteId && store) {
            ok = await store.delete(pendingDeleteId);
        }
        showDeleteConfirm = false;
        pendingDeleteId = null;
        // On failure keep the annotation selected so the user can retry; the
        // error line explains the failure.
        if (ok) {
            selectedAnnotation = null;
        }
    }

    function handleCancelDelete() {
        // Cancel returns the user to editing the same annotation — do not clear
        // the selection here.
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
    availableTools={resolvedTools.tools}
    onToggleEditing={handleToggleEditing}
    onSetTool={handleSetTool}
    onSaveBodies={handleSaveBodies}
    onCancelSelection={handleCancelSelection}
    onRequestDelete={handleRequestDelete}
    onConfirmDelete={handleConfirmDelete}
    onCancelDelete={handleCancelDelete}
    {embedded}
/>
