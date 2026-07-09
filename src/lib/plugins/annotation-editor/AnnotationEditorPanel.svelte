<script lang="ts">
    import X from 'phosphor-svelte/lib/X';
    import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
    import Rectangle from 'phosphor-svelte/lib/Rectangle';
    import Polygon from 'phosphor-svelte/lib/Polygon';
    import Trash from 'phosphor-svelte/lib/Trash';
    import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
    import ArrowClockwise from 'phosphor-svelte/lib/ArrowClockwise';
    import Warning from 'phosphor-svelte/lib/Warning';
    import Target from 'phosphor-svelte/lib/Target';
    import type {
        AnnotationBodyEditor,
        AnnotationBodyEditorApi,
        AnnotationEditorRuntimeContext,
        AnnotationPersistenceOp,
        DrawingTool,
    } from './types';
    import { m } from '../../paraglide/messages';
    import { Button, Tooltip } from '../../components/ui';
    import DefaultBodyEditor from './DefaultBodyEditor.svelte';

    // The Annotorious stylesheet is injected into the viewer's root node by
    // AnnotationManager.injectStyles (shadow-root aware) — the single CSS path
    // (F23). No side-effect import here: a light-DOM stylesheet never reaches
    // the element build's shadow root.

    // Props
    let {
        isEditing = false,
        activeTool = 'rectangle' as DrawingTool,
        selectedAnnotation = null as any,
        showDeleteConfirm = false,
        isHydratingSelection = false,
        canCreateAnnotation = true,
        createDisabledReason = null,
        persistenceError = null,
        bodyEditor = null,
        showModeToggle = true,
        showUndoRedo = true,
        purposes = undefined,
        allowMultipleBodies = true,
        runtimeContext,
        onDismissError,
        canUndo = false,
        canRedo = false,
        onUndo,
        onRedo,
        availableTools = ['rectangle', 'polygon', 'point'] as DrawingTool[],
        onToggleEditing,
        onSetTool,
        onSaveBodies,
        onCancelSelection,
        onRequestDelete,
        onConfirmDelete,
        onCancelDelete,
        embedded = false,
    }: {
        isEditing: boolean;
        activeTool: DrawingTool;
        selectedAnnotation: any;
        showDeleteConfirm: boolean;
        isHydratingSelection: boolean;
        canCreateAnnotation: boolean;
        createDisabledReason: string | null;
        persistenceError: {
            op: AnnotationPersistenceOp;
            annotationId?: string;
        } | null;
        bodyEditor: AnnotationBodyEditor | null;
        showModeToggle?: boolean;
        showUndoRedo?: boolean;
        purposes?: readonly string[];
        allowMultipleBodies?: boolean;
        runtimeContext: AnnotationEditorRuntimeContext;
        onDismissError: () => void;
        canUndo: boolean;
        canRedo: boolean;
        onUndo: () => void;
        onRedo: () => void;
        availableTools: DrawingTool[];
        onToggleEditing: () => void;
        onSetTool: (tool: DrawingTool) => void;
        onSaveBodies: (bodies: unknown[] | unknown) => void | Promise<void>;
        onCancelSelection: () => void;
        onRequestDelete: () => void;
        onConfirmDelete: () => void;
        onCancelDelete: () => void;
        embedded?: boolean;
    } = $props();

    // Map a failed operation to its i18n'd, user-facing message (F20).
    function persistenceErrorMessage(op: AnnotationPersistenceOp): string {
        switch (op) {
            case 'load':
                return m.annotation_editor_error_load();
            case 'create':
                return m.annotation_editor_error_create();
            case 'delete':
                return m.annotation_editor_error_delete();
            case 'hydrate':
                return m.annotation_editor_error_hydrate();
            case 'update':
            default:
                return m.annotation_editor_error_update();
        }
    }

    // Tool icons
    const toolIcons: Record<string, any> = {
        rectangle: Rectangle,
        polygon: Polygon,
        point: Target,
    };

    let bodyEditorApi = $state<AnnotationBodyEditorApi | null>(null);
    let bodyEditorApiSelectionId = $state<string | null>(null);
    let customBodyEditorContainer = $state<HTMLElement | null>(null);

    function normalizeBodies(annotation: any): unknown[] {
        const body = annotation?.body;
        if (Array.isArray(body)) return body;
        if (body !== undefined && body !== null) return [body];
        return [];
    }

    $effect(() => {
        if (!selectedAnnotation) {
            bodyEditorApi = null;
            bodyEditorApiSelectionId = null;
            return;
        }

        const bodies = normalizeBodies(selectedAnnotation);

        if (
            !bodyEditorApi ||
            bodyEditorApiSelectionId !== selectedAnnotation.id
        ) {
            bodyEditorApiSelectionId = selectedAnnotation.id;
            bodyEditorApi = {
                annotation: selectedAnnotation,
                bodies,
                context: runtimeContext,
                isHydrating: isHydratingSelection,
                save: async (bodiesToSave) => {
                    await onSaveBodies(bodiesToSave);
                },
                cancel: onCancelSelection,
                requestDelete: onRequestDelete,
            };
            return;
        }

        bodyEditorApi.annotation = selectedAnnotation;
        bodyEditorApi.bodies = bodies;
        bodyEditorApi.context = runtimeContext;
        bodyEditorApi.isHydrating = isHydratingSelection;
    });

    $effect(() => {
        const api = bodyEditorApi;
        const editor = bodyEditor;
        const container = customBodyEditorContainer;
        if (!api || !editor || !('render' in editor) || !container) {
            return;
        }

        // Track updates that DOM renderers must receive by cleanup + re-render:
        // annotation replacement (including hydration), body replacement, and
        // hydrating-state flips. The API object itself remains stable per
        // selected annotation.
        const _annotation = api.annotation;
        const _bodies = api.bodies;
        const _isHydrating = api.isHydrating;

        const cleanup = editor.render(container, api);
        return () => {
            cleanup?.();
            container.replaceChildren();
        };
    });
</script>

<div class="panel" data-panel-id="annotation-editor" class:floating={!embedded}>
    {#if !embedded}
        <div class="header">
            <h2 class="title">
                <PencilSimple size={20} />
                {m.annotation_editor_title()}
            </h2>
        </div>
    {/if}

    <div class="content" class:scroll={!embedded}>
        <!-- Persistence error line (only shown without a host error handler) -->
        {#if persistenceError}
            <div class="error-line" role="alert">
                <Warning size={16} class="error-icon" />
                <span class="error-text">
                    {persistenceErrorMessage(persistenceError.op)}
                </span>
                <Button
                    class="error-dismiss"
                    size="xs"
                    ghost
                    circle
                    onclick={onDismissError}
                    aria-label={m.annotation_editor_error_dismiss()}
                >
                    <X size={14} />
                </Button>
            </div>
        {/if}

        <!-- Drawing Mode Toggle -->
        <div class="mode-section">
            {#if showModeToggle}
                <div class="join mode-toggle">
                    <Button
                        class="join-item"
                        size="sm"
                        variant={!isEditing ? 'primary' : 'default'}
                        onclick={() => isEditing && onToggleEditing()}
                    >
                        {m.annotation_editor_edit_mode()}
                    </Button>
                    <Button
                        class="join-item"
                        size="sm"
                        variant={isEditing ? 'primary' : 'default'}
                        disabled={!canCreateAnnotation}
                        onclick={() => !isEditing && onToggleEditing()}
                    >
                        {m.annotation_editor_create_mode()}
                    </Button>
                </div>
            {/if}
            <p class="mode-instruction">
                {isEditing
                    ? m.annotation_editor_instruction_create()
                    : m.annotation_editor_instruction_edit()}
            </p>
            {#if !canCreateAnnotation && createDisabledReason}
                <p class="mode-disabled-reason">
                    {createDisabledReason}
                </p>
            {/if}
        </div>

        <!-- Undo/Redo — persistence-aware, available in edit and create mode -->
        {#if showUndoRedo}
            <div class="undo-redo">
                <Button
                    class="undo-redo-btn"
                    size="sm"
                    outline
                    disabled={!canUndo}
                    onclick={onUndo}
                >
                    <ArrowCounterClockwise size={16} />
                    {m.annotation_editor_undo()}
                </Button>
                <Button
                    class="undo-redo-btn"
                    size="sm"
                    outline
                    disabled={!canRedo}
                    onclick={onRedo}
                >
                    <ArrowClockwise size={16} />
                    {m.annotation_editor_redo()}
                </Button>
            </div>
        {/if}

        <!-- Tool Selection -->
        {#if isEditing}
            <div class="tool-section">
                <p class="tool-label">
                    {m.annotation_editor_tool_label()}
                </p>
                <div class="join">
                    {#each availableTools as tool (tool)}
                        {@const Icon = toolIcons[tool] ?? Rectangle}
                        {@const toolName =
                            {
                                rectangle: m.annotation_tool_rectangle(),
                                polygon: m.annotation_tool_polygon(),
                                point: m.annotation_tool_point(),
                            }[tool] ?? tool}
                        <Tooltip
                            tip={toolName}
                            placement="bottom"
                            class="join-item tool-tip"
                        >
                            <Button
                                size="sm"
                                variant={activeTool === tool
                                    ? 'primary'
                                    : 'default'}
                                onclick={() => onSetTool(tool)}
                                aria-label={toolName}
                            >
                                <Icon size={18} />
                            </Button>
                        </Tooltip>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Selected Annotation Editor (Inline) -->
        {#if selectedAnnotation}
            <div class="card editor-card">
                <div class="editor-header">
                    <h3 class="editor-title">
                        {m.annotation_editor_edit_section()}
                    </h3>
                    <div class="editor-actions">
                        <Button
                            class="delete-btn"
                            size="sm"
                            ghost
                            circle
                            onclick={onRequestDelete}
                            aria-label={m.annotation_editor_delete_tooltip()}
                        >
                            <Trash size={16} />
                        </Button>
                    </div>
                </div>

                {#if bodyEditorApi && bodyEditor && 'component' in bodyEditor}
                    {@const BodyEditor = bodyEditor.component}
                    <BodyEditor api={bodyEditorApi} />
                {:else if bodyEditorApi && bodyEditor && 'render' in bodyEditor}
                    <div
                        class="custom-body-editor"
                        bind:this={customBodyEditorContainer}
                    ></div>
                {:else if bodyEditorApi}
                    <DefaultBodyEditor
                        api={bodyEditorApi}
                        {embedded}
                        {purposes}
                        {allowMultipleBodies}
                    />
                {/if}

                {#if isHydratingSelection}
                    <p class="hydrating-note">
                        {m.annotation_editor_hydrating()}
                    </p>
                {/if}
            </div>
        {/if}
    </div>
</div>

<!-- Delete Confirmation Modal (Keep as modal for safety) -->
{#if showDeleteConfirm}
    <dialog class="modal modal-open">
        <div class="modal-box">
            <h3 class="modal-title">
                <Warning size={24} class="modal-warning-icon" />
                {m.annotation_editor_delete_title()}
            </h3>
            <p class="modal-message">
                {m.annotation_editor_delete_message()}
            </p>
            <div class="modal-action">
                <Button ghost onclick={onCancelDelete}>
                    {m.annotation_editor_cancel()}
                </Button>
                <Button variant="error" onclick={onConfirmDelete}>
                    {m.annotation_editor_delete()}
                </Button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={onCancelDelete}>close</button>
        </form>
    </dialog>
{/if}

<style>
    .panel {
        min-height: 0;
        display: flex;
        flex-direction: column;
    }
    .panel.floating {
        height: 100%;
        width: 20rem;
        background-color: var(--panel-surface);
        border-right-width: 1px;
        border-right-style: solid;
        border-right-color: var(--surface-border);
        box-shadow:
            0 20px 25px -5px #0000001a,
            0 8px 10px -6px #0000001a;
    }
    .panel.floating .content {
        width: 100%;
    }

    .header {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--surface-border);
    }
    .title {
        font-size: 1.125rem;
        line-height: 1.75rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .content {
        width: 100%;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .content.scroll {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    /* Persistence error line */
    .error-line {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-buttons);
        background-color: color-mix(
            in oklab,
            var(--color-error) 15%,
            var(--panel-surface)
        );
        color: var(--color-error);
        font-size: 0.75rem;
        line-height: 1rem;
    }
    .error-line :global(.error-icon) {
        flex-shrink: 0;
    }
    .error-text {
        flex: 1 1 0%;
    }
    .error-line :global(.error-dismiss) {
        flex-shrink: 0;
        color: var(--color-error);
    }

    /* Drawing Mode Toggle */
    .mode-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .mode-instruction {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.6;
        text-align: center;
    }
    .mode-disabled-reason {
        font-size: 0.75rem;
        line-height: 1rem;
        text-align: center;
        color: color-mix(in oklab, var(--panel-fg) 70%, transparent);
    }

    /* Tool Selection */
    .tool-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .tool-label {
        font-size: 0.875rem;
        line-height: 1.25rem;
        font-weight: 500;
    }
    /* Tooltip wrapper acts as the join item so its button inherits join radii. */
    .tool-section :global(.tool-tip) {
        display: inline-flex;
    }

    /* Undo/Redo */
    .undo-redo {
        display: flex;
        gap: 0.5rem;
    }
    .undo-redo :global(.undo-redo-btn) {
        flex: 1 1 0%;
    }

    /* Selected annotation editor card */
    .card {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: var(--radius-panels);
    }
    .editor-card {
        background-color: var(--input-bg);
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    .editor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
    }
    .editor-title {
        font-weight: 500;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }
    .editor-actions {
        display: flex;
        gap: 0.25rem;
    }
    .editor-actions :global(.delete-btn) {
        color: var(--color-error);
    }

    .custom-body-editor {
        width: 100%;
    }

    .hydrating-note {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.6;
    }

    /* join group (radii handled by the join-aware primitives) */
    .join {
        display: inline-flex;
        align-items: stretch;
        --join-ss: 0;
        --join-se: 0;
        --join-es: 0;
        --join-ee: 0;
    }
    .join > :global(.join-item:first-child) {
        --join-ss: var(--radius-buttons);
        --join-es: var(--radius-buttons);
    }
    .join > :global(.join-item:last-child) {
        --join-se: var(--radius-buttons);
        --join-ee: var(--radius-buttons);
    }
    .join > :global(.join-item:not(:first-child)) {
        margin-inline-start: calc(var(--border, 1px) * -1);
    }

    /* Mode toggle: a 2-column grid join filling the row */
    .mode-toggle {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: 100%;
    }

    /* Delete confirmation modal */
    .modal {
        pointer-events: none;
        visibility: hidden;
        position: fixed;
        inset: 0;
        margin: 0;
        display: grid;
        height: 100%;
        max-height: none;
        width: 100%;
        max-width: none;
        align-items: center;
        justify-items: center;
        background-color: transparent;
        padding: 0;
        color: inherit;
        overflow: clip;
        overscroll-behavior: contain;
        z-index: 999;
    }
    .modal::backdrop {
        display: none;
    }
    .modal.modal-open {
        pointer-events: auto;
        visibility: visible;
        opacity: 100%;
        background-color: oklch(0% 0 0 / 0.4);
    }
    .modal-box {
        grid-column-start: 1;
        grid-row-start: 1;
        max-height: 100vh;
        width: calc(11 / 12 * 100%);
        max-width: 32rem;
        background-color: var(--input-bg);
        padding: 1.5rem;
        border-radius: var(--radius-panels);
        box-shadow: oklch(0% 0 0 / 0.25) 0px 25px 50px -12px;
        overflow-y: auto;
        overscroll-behavior: contain;
    }
    .modal-title {
        font-weight: 700;
        font-size: 1.125rem;
        line-height: 1.75rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    :global(.modal-warning-icon) {
        color: var(--color-warning);
    }
    .modal-message {
        padding-block: 1rem;
    }
    .modal-action {
        margin-top: 1.5rem;
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }
    .modal-backdrop {
        grid-column-start: 1;
        grid-row-start: 1;
        display: grid;
        align-self: stretch;
        justify-self: stretch;
        color: transparent;
        z-index: -1;
    }
    .modal-backdrop button {
        cursor: pointer;
    }
</style>
