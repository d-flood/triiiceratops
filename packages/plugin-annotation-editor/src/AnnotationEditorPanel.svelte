<script lang="ts">
    import type {
        AnnotationBodyEditor,
        AnnotationBodyEditorApi,
        AnnotationEditorRuntimeContext,
        AnnotationPersistenceOp,
        DrawingTool,
    } from './types';
    import { GLYPHS, VIEW_BOX, type GlyphName } from './icons';
    import { useT } from './i18n.svelte';
    import DefaultBodyEditor from './DefaultBodyEditor.svelte';

    // The Annotorious stylesheet + the plugin chrome install once at activation
    // through the SDK style service (root-aware) — see `styles.ts`. No CSS import
    // here; a light-DOM import never reaches the element build's shadow root (F23).

    const t = useT();

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
                return t('annotation_editor_error_load');
            case 'create':
                return t('annotation_editor_error_create');
            case 'delete':
                return t('annotation_editor_error_delete');
            case 'hydrate':
                return t('annotation_editor_error_hydrate');
            case 'update':
            default:
                return t('annotation_editor_error_update');
        }
    }

    // Tool icons
    const toolIcons: Record<string, GlyphName> = {
        rectangle: 'Rectangle',
        polygon: 'Polygon',
        point: 'Target',
    };
    const toolLabels: Record<string, string> = {
        rectangle: 'annotation_tool_rectangle',
        polygon: 'annotation_tool_polygon',
        point: 'annotation_tool_point',
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

{#snippet glyph(name: GlyphName, size: number)}
    <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
    <svg
        class="tri-ae-glyph"
        viewBox={VIEW_BOX}
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
        focusable="false">{@html GLYPHS[name]}</svg
    >
    <!-- eslint-enable svelte/no-at-html-tags -->
{/snippet}

<div class="panel" data-panel-id="annotation-editor" class:floating={!embedded}>
    {#if !embedded}
        <div class="header">
            <h2 class="title">
                {@render glyph('PencilSimple', 20)}
                {t('annotation_editor_title')}
            </h2>
        </div>
    {/if}

    <div class="content" class:scroll={!embedded}>
        <!-- Persistence error line (only shown without a host error handler) -->
        {#if persistenceError}
            <div class="error-line" role="alert">
                <span class="error-icon">{@render glyph('Warning', 16)}</span>
                <span class="error-text">
                    {persistenceErrorMessage(persistenceError.op)}
                </span>
                <button
                    type="button"
                    class="tri-ae-btn tri-ae-btn-icon error-dismiss"
                    onclick={onDismissError}
                    aria-label={t('annotation_editor_error_dismiss')}
                >
                    {@render glyph('X', 14)}
                </button>
            </div>
        {/if}

        <!-- Drawing Mode Toggle -->
        <div class="mode-section">
            {#if showModeToggle}
                <div class="join mode-toggle">
                    <button
                        type="button"
                        class="tri-ae-btn join-item"
                        class:is-primary={!isEditing}
                        onclick={() => isEditing && onToggleEditing()}
                    >
                        {t('annotation_editor_edit_mode')}
                    </button>
                    <button
                        type="button"
                        class="tri-ae-btn join-item"
                        class:is-primary={isEditing}
                        disabled={!canCreateAnnotation}
                        onclick={() => !isEditing && onToggleEditing()}
                    >
                        {t('annotation_editor_create_mode')}
                    </button>
                </div>
            {/if}
            <p class="mode-instruction">
                {isEditing
                    ? t('annotation_editor_instruction_create')
                    : t('annotation_editor_instruction_edit')}
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
                <button
                    type="button"
                    class="tri-ae-btn undo-redo-btn"
                    disabled={!canUndo}
                    onclick={onUndo}
                >
                    {@render glyph('ArrowCounterClockwise', 16)}
                    {t('annotation_editor_undo')}
                </button>
                <button
                    type="button"
                    class="tri-ae-btn undo-redo-btn"
                    disabled={!canRedo}
                    onclick={onRedo}
                >
                    {@render glyph('ArrowClockwise', 16)}
                    {t('annotation_editor_redo')}
                </button>
            </div>
        {/if}

        <!-- Tool Selection -->
        {#if isEditing}
            <div class="tool-section">
                <p class="tool-label">
                    {t('annotation_editor_tool_label')}
                </p>
                <div class="join">
                    {#each availableTools as tool (tool)}
                        {@const toolIconName = toolIcons[tool] ?? 'Rectangle'}
                        {@const toolName = t(
                            toolLabels[tool] ?? 'annotation_tool_rectangle',
                        )}
                        <button
                            type="button"
                            class="tri-ae-btn tri-ae-btn-icon join-item"
                            class:is-primary={activeTool === tool}
                            onclick={() => onSetTool(tool)}
                            aria-label={toolName}
                            title={toolName}
                        >
                            {@render glyph(toolIconName, 18)}
                        </button>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Selected Annotation Editor (Inline) -->
        {#if selectedAnnotation}
            <div class="card editor-card">
                <div class="editor-header">
                    <h3 class="editor-title">
                        {t('annotation_editor_edit_section')}
                    </h3>
                    <div class="editor-actions">
                        <button
                            type="button"
                            class="tri-ae-btn tri-ae-btn-icon delete-btn"
                            onclick={onRequestDelete}
                            aria-label={t('annotation_editor_delete_tooltip')}
                        >
                            {@render glyph('Trash', 16)}
                        </button>
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
                        {t('annotation_editor_hydrating')}
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
                <span class="modal-warning-icon"
                    >{@render glyph('Warning', 24)}</span
                >
                {t('annotation_editor_delete_title')}
            </h3>
            <p class="modal-message">
                {t('annotation_editor_delete_message')}
            </p>
            <div class="modal-action">
                <button
                    type="button"
                    class="tri-ae-btn"
                    onclick={onCancelDelete}
                >
                    {t('annotation_editor_cancel')}
                </button>
                <button
                    type="button"
                    class="tri-ae-btn is-error"
                    onclick={onConfirmDelete}
                >
                    {t('annotation_editor_delete')}
                </button>
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
        border-right-color: var(--tri-surface-border);
        box-shadow:
            0 20px 25px -5px #0000001a,
            0 8px 10px -6px #0000001a;
    }
    .panel.floating .content {
        width: 100%;
    }

    .tri-ae-glyph {
        display: inline-block;
        vertical-align: middle;
        flex-shrink: 0;
    }

    /* Buttons (replacing the former core `Button` primitive) */
    .tri-ae-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        padding: 0.375rem 0.75rem;
        border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
        border-radius: var(--tri-radius-buttons, 0.5rem);
        background-color: var(--tri-input-bg, transparent);
        color: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
    }
    .tri-ae-btn:hover:not(:disabled) {
        background-color: color-mix(in oklab, currentColor 10%, transparent);
    }
    .tri-ae-btn.is-primary {
        background-color: var(--tri-color-primary, #2563eb);
        color: var(--tri-color-primary-content, #fff);
        border-color: transparent;
    }
    .tri-ae-btn.is-error {
        background-color: var(--tri-color-error, #dc2626);
        color: #fff;
        border-color: transparent;
    }
    .tri-ae-btn:disabled {
        opacity: 0.5;
        cursor: default;
    }
    .tri-ae-btn-icon {
        padding: 0.375rem;
    }

    .header {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom-width: 1px;
        border-bottom-style: solid;
        border-bottom-color: var(--tri-surface-border);
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
        border-radius: var(--tri-radius-buttons);
        background-color: color-mix(
            in oklab,
            var(--tri-color-error) 15%,
            var(--panel-surface)
        );
        color: var(--tri-color-error);
        font-size: 0.75rem;
        line-height: 1rem;
    }
    .error-icon {
        flex-shrink: 0;
        display: inline-flex;
    }
    .error-text {
        flex: 1 1 0%;
    }
    .error-dismiss {
        flex-shrink: 0;
        color: var(--tri-color-error);
        border-color: transparent;
        background: transparent;
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

    /* Undo/Redo */
    .undo-redo {
        display: flex;
        gap: 0.5rem;
    }
    .undo-redo-btn {
        flex: 1 1 0%;
    }

    /* Selected annotation editor card */
    .card {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: var(--tri-radius-panels);
    }
    .editor-card {
        background-color: var(--tri-input-bg);
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
    .delete-btn {
        color: var(--tri-color-error);
        border-color: transparent;
        background: transparent;
    }

    .custom-body-editor {
        width: 100%;
    }

    .hydrating-note {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.6;
    }

    /* join group */
    .join {
        display: inline-flex;
        align-items: stretch;
    }
    .join > .join-item:not(:first-child) {
        margin-inline-start: -1px;
        border-start-start-radius: 0;
        border-end-start-radius: 0;
    }
    .join > .join-item:not(:last-child) {
        border-start-end-radius: 0;
        border-end-end-radius: 0;
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
        background-color: var(--tri-input-bg);
        padding: 1.5rem;
        border-radius: var(--tri-radius-panels);
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
    .modal-warning-icon {
        color: var(--tri-color-warning);
        display: inline-flex;
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
