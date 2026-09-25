<script lang="ts">
    import type {
        AnnotationBodyEditor,
        AnnotationBodyEditorApi,
        AnnotationEditorRuntimeContext,
        AnnotationPersistenceOp,
        DrawingTool,
    } from './types';
    import { GLYPHS, VIEW_BOX, type GlyphName } from './icons';
    import { ALL_TOOLS } from './tools';
    import { useT } from './i18n.svelte';
    import DefaultBodyEditor from './DefaultBodyEditor.svelte';
    import { Button, Tooltip } from '@triiiceratops/ui';

    // The plugin's build-extracted component CSS installs once at activation
    // through the SDK style service (root-aware) — see `mount.svelte.ts`. No CSS
    // import here; a light-DOM import never reaches the element build's shadow
    // root. The panel's own look uses the shared `@triiiceratops/ui`
    // primitives (Button, Tooltip) and current `--tri-` theme tokens.

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
        availableTools = ALL_TOOLS,
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
        onSetTool: (tool: DrawingTool, fromKeyboard?: boolean) => void;
        onSaveBodies: (bodies: unknown[] | unknown) => void | Promise<void>;
        onCancelSelection: () => void;
        onRequestDelete: () => void;
        onConfirmDelete: () => void;
        onCancelDelete: () => void;
        embedded?: boolean;
    } = $props();

    // Map a failed operation to its i18n'd, user-facing message.
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
    const toolIcons: Record<DrawingTool, GlyphName> = {
        rectangle: 'Rectangle',
        ellipse: 'Ellipse',
        polygon: 'Polygon',
        point: 'Target',
        wholeCanvas: 'WholeCanvas',
    };
    /**
     * What gesture each tool answers to. One gesture per tool is the whole
     * interaction model, so the panel names the one the armed tool wants rather
     * than a single line that would have to hedge between a drag and a click.
     */
    const toolInstructions: Record<DrawingTool, string> = {
        rectangle: 'annotation_editor_instruction_rectangle',
        ellipse: 'annotation_editor_instruction_ellipse',
        polygon: 'annotation_editor_instruction_polygon',
        point: 'annotation_editor_instruction_point',
        wholeCanvas: 'annotation_editor_instruction_whole_canvas',
    };
    const toolLabels: Record<DrawingTool, string> = {
        rectangle: 'annotation_tool_rectangle',
        ellipse: 'annotation_tool_ellipse',
        polygon: 'annotation_tool_polygon',
        point: 'annotation_tool_point',
        wholeCanvas: 'annotation_tool_whole_canvas',
    };

    /**
     * Whether a button's click came from the keyboard rather than the pointer.
     *
     * A synthetic click raised by Enter or Space on a focused `<button>` has a
     * `detail` of 0; a real one carries the click count. This is what tells the
     * two creation paths apart: a pointer user arms a tool and then draws a
     * region, while a keyboard user gets the tool's default shape dropped into
     * the view to shape (place-then-shape).
     */
    function isKeyboardActivation(event: MouseEvent): boolean {
        return event.detail === 0;
    }

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
                <Button
                    class="error-dismiss"
                    size="xs"
                    ghost
                    circle
                    onclick={onDismissError}
                    aria-label={t('annotation_editor_error_dismiss')}
                >
                    {@render glyph('X', 14)}
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
                        {t('annotation_editor_edit_mode')}
                    </Button>
                    <Button
                        class="join-item"
                        size="sm"
                        variant={isEditing ? 'primary' : 'default'}
                        disabled={!canCreateAnnotation}
                        onclick={() => !isEditing && onToggleEditing()}
                    >
                        {t('annotation_editor_create_mode')}
                    </Button>
                </div>
            {/if}
            <p class="mode-instruction">
                {isEditing
                    ? t(
                          toolInstructions[activeTool] ??
                              'annotation_editor_instruction_rectangle',
                      )
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
                <Button
                    class="undo-redo-btn"
                    size="sm"
                    outline
                    disabled={!canUndo}
                    onclick={onUndo}
                >
                    {@render glyph('ArrowCounterClockwise', 16)}
                    {t('annotation_editor_undo')}
                </Button>
                <Button
                    class="undo-redo-btn"
                    size="sm"
                    outline
                    disabled={!canRedo}
                    onclick={onRedo}
                >
                    {@render glyph('ArrowClockwise', 16)}
                    {t('annotation_editor_redo')}
                </Button>
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
                        <Tooltip
                            tip={toolName}
                            placement="top"
                            class="join-item tool-tip"
                        >
                            <Button
                                size="sm"
                                variant={activeTool === tool
                                    ? 'primary'
                                    : 'default'}
                                onclick={(event: MouseEvent) =>
                                    onSetTool(
                                        tool,
                                        isKeyboardActivation(event),
                                    )}
                                aria-label={toolName}
                            >
                                {@render glyph(toolIconName, 18)}
                            </Button>
                        </Tooltip>
                    {/each}
                </div>
            </div>
        {/if}

        <!--
            The verbs, documented where the tools are. Creation and editing
            share one set, so one list covers both — and the two polygon keys
            are chosen to miss core's own `+ = - _ 0 Home` zoom bindings, which
            a reader may still be using while a handle is focused.
        -->
        <details class="keys">
            <summary class="keys-summary">
                {t('annotation_editor_keys_title')}
            </summary>
            <ul class="keys-list">
                <li>{t('annotation_editor_keys_create')}</li>
                <li>{t('annotation_editor_keys_nudge')}</li>
                <li>{t('annotation_editor_keys_nudge_large')}</li>
                <li>{t('annotation_editor_keys_tab')}</li>
                <li>{t('annotation_editor_keys_commit')}</li>
                <li>{t('annotation_editor_keys_delete')}</li>
                <li>{t('annotation_editor_keys_vertex')}</li>
            </ul>
        </details>

        <!-- Selected Annotation Editor (Inline) -->
        {#if selectedAnnotation}
            <div class="card editor-card">
                <div class="editor-header">
                    <h3 class="editor-title">
                        {t('annotation_editor_edit_section')}
                    </h3>
                    <div class="editor-actions">
                        <Button
                            class="delete-btn"
                            size="sm"
                            ghost
                            circle
                            onclick={onRequestDelete}
                            aria-label={t('annotation_editor_delete_tooltip')}
                        >
                            {@render glyph('Trash', 16)}
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
                        {t('annotation_editor_hydrating')}
                    </p>
                {/if}
            </div>
        {/if}
    </div>
</div>

<!-- Delete Confirmation Modal (Keep as modal for safety) -->
{#if showDeleteConfirm}
    <!--
        Opened with `showModal`, which is what puts it in the browser's TOP
        LAYER — above every stacking context on the page, the drawing layer's
        included. A `z-index` cannot reach that far from here: this panel is a
        stacking context of core's own, so the dialog's z-index only ever
        competes inside it, and the overlay layer core stacks above the panels
        painted the shape being deleted straight over the confirmation.

        The top layer also brings the modal semantics this dialog only looked
        like it had: an inert page behind it, focus held inside it, and Escape.
    -->
    <dialog
        class="modal modal-open"
        {@attach (dialog: HTMLDialogElement) => void dialog.showModal()}
        oncancel={onCancelDelete}
    >
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
                <Button ghost onclick={onCancelDelete}>
                    {t('annotation_editor_cancel')}
                </Button>
                <Button variant="error" onclick={onConfirmDelete}>
                    {t('annotation_editor_delete')}
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
    .error-line :global(.error-dismiss) {
        flex-shrink: 0;
        color: var(--tri-color-error);
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

    /* Keyboard shortcuts */
    .keys-summary {
        font-size: 0.75rem;
        line-height: 1rem;
        font-weight: 600;
        cursor: pointer;
    }
    .keys-list {
        margin: 0.375rem 0 0;
        padding-inline-start: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.75;
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
    .editor-actions :global(.delete-btn) {
        color: var(--tri-color-error);
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
        --join-ss: var(--tri-radius-buttons);
        --join-es: var(--tri-radius-buttons);
    }
    .join > :global(.join-item:last-child) {
        --join-se: var(--tri-radius-buttons);
        --join-ee: var(--tri-radius-buttons);
    }
    .join > :global(.join-item:not(:first-child)) {
        margin-inline-start: calc(var(--tri-border, 1px) * -1);
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
    }
    /* The dim is painted by the dialog itself, which covers the viewport, so
       the top layer's own backdrop would only double it. */
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
