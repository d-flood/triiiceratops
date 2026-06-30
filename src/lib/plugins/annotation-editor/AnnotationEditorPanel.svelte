<script lang="ts">
    import X from 'phosphor-svelte/lib/X';
    import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
    import Rectangle from 'phosphor-svelte/lib/Rectangle';
    import Polygon from 'phosphor-svelte/lib/Polygon';
    import Trash from 'phosphor-svelte/lib/Trash';
    import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
    import ArrowClockwise from 'phosphor-svelte/lib/ArrowClockwise';
    import Plus from 'phosphor-svelte/lib/Plus';
    import Warning from 'phosphor-svelte/lib/Warning';
    import Target from 'phosphor-svelte/lib/Target';
    import Check from 'phosphor-svelte/lib/Check';
    import type { DrawingTool, W3CAnnotationBody } from './types';
    import { W3C_PURPOSES } from './types';
    import { m } from '../../paraglide/messages';
    import { Button, Select, TextInput, Tooltip } from '../../components/ui';

    // Import Annotorious CSS for the drawing overlay to ensure it's loaded by Vite
    import '@annotorious/openseadragon/annotorious-openseadragon.css';

    // Props
    let {
        isEditing = false,
        activeTool = 'rectangle' as DrawingTool,
        selectedAnnotation = null as any,
        showDeleteConfirm = false,
        isHydratingSelection = false,
        canUndo = false,
        canRedo = false,
        canCreateAnnotation = true,
        createDisabledReason = null,
        availableTools = ['rectangle', 'polygon', 'point'] as DrawingTool[],
        onToggleEditing,
        onSetTool,
        onSaveBodies,
        onRequestDelete,
        onConfirmDelete,
        onCancelDelete,
        onUndo,
        onRedo,
        embedded = false,
    }: {
        isEditing: boolean;
        activeTool: DrawingTool;
        selectedAnnotation: any;
        showDeleteConfirm: boolean;
        isHydratingSelection: boolean;
        canUndo: boolean;
        canRedo: boolean;
        canCreateAnnotation: boolean;
        createDisabledReason: string | null;
        availableTools: DrawingTool[];
        onToggleEditing: () => void;
        onSetTool: (tool: DrawingTool) => void;
        onSaveBodies: (bodies: W3CAnnotationBody[]) => void;
        onRequestDelete: () => void;
        onConfirmDelete: () => void;
        onCancelDelete: () => void;
        onUndo: () => void;
        onRedo: () => void;
        embedded?: boolean;
    } = $props();

    // Tool icons
    const toolIcons: Record<string, any> = {
        rectangle: Rectangle,
        polygon: Polygon,
        point: Target,
    };

    // Body editor state (local copy for editing)
    let editableBodies = $state<W3CAnnotationBody[]>([]);

    // Sync when a new annotation is selected
    $effect(() => {
        if (selectedAnnotation) {
            const body = selectedAnnotation.body;
            if (Array.isArray(body)) {
                editableBodies = body.map((b: any) => ({ ...b }));
            } else if (body) {
                editableBodies = [{ ...body }];
            } else {
                editableBodies = [];
            }
        }
    });

    function addBody() {
        editableBodies = [
            ...editableBodies,
            { purpose: 'commenting', value: '' },
        ];
    }

    function removeBody(index: number) {
        editableBodies = editableBodies.filter((_, i) => i !== index);
    }

    function handleSaveBodies() {
        // Filter empty bodies
        const valid = editableBodies.filter((b) => b.value?.trim());
        onSaveBodies(valid);
    }
</script>

<div class="panel" class:floating={!embedded}>
    {#if !embedded}
        <div class="header">
            <h2 class="title">
                <PencilSimple size={20} />
                {m.annotation_editor_title()}
            </h2>
        </div>
    {/if}

    <div class="content" class:scroll={!embedded}>
        <!-- Drawing Mode Toggle -->
        <div class="mode-section">
            <div class="join mode-toggle">
                <Button
                    class="join-item"
                    size="sm"
                    variant={!isEditing ? 'secondary' : 'default'}
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

            <!-- Undo/Redo -->
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

                <div class="bodies" class:bodies-scroll={!embedded}>
                    {#each editableBodies as body, i (i)}
                        <div class="card body-card">
                            <div class="body-row">
                                <Select
                                    class="body-purpose"
                                    size="xs"
                                    bind:value={body.purpose}
                                >
                                    {#each W3C_PURPOSES as purpose (purpose)}
                                        <option
                                            value={purpose}
                                            class="purpose-option">{purpose}</option
                                        >
                                    {/each}
                                </Select>
                                <Button
                                    class="body-remove"
                                    size="xs"
                                    ghost
                                    circle
                                    onclick={() => removeBody(i)}
                                >
                                    <X size={14} />
                                </Button>
                            </div>

                            {#if body.purpose === 'tagging'}
                                <TextInput
                                    class="body-input"
                                    size="xs"
                                    placeholder={m.annotation_editor_tag_placeholder()}
                                    disabled={isHydratingSelection}
                                    bind:value={body.value}
                                />
                            {:else if body.purpose === 'linking'}
                                <TextInput
                                    class="body-input"
                                    type="url"
                                    size="xs"
                                    placeholder={m.annotation_editor_link_placeholder()}
                                    disabled={isHydratingSelection}
                                    bind:value={body.value}
                                />
                            {:else}
                                <textarea
                                    class="body-textarea"
                                    rows="2"
                                    placeholder={m.annotation_editor_text_placeholder()}
                                    disabled={isHydratingSelection}
                                    bind:value={body.value}
                                ></textarea>
                            {/if}
                        </div>
                    {/each}
                </div>

                {#if isHydratingSelection}
                    <p class="hydrating-note">
                        Loading the full annotation text...
                    </p>
                {/if}

                <Button
                    class="add-content"
                    size="xs"
                    ghost
                    onclick={addBody}
                    disabled={isHydratingSelection}
                >
                    <Plus size={14} />
                    {m.annotation_editor_add_content()}
                </Button>

                <div class="save-row">
                    <Button
                        class="save-btn"
                        size="sm"
                        variant="primary"
                        onclick={handleSaveBodies}
                        disabled={isHydratingSelection}
                    >
                        <Check size={16} />
                        {m.annotation_editor_save()}
                    </Button>
                </div>
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
        background-color: var(--color-base-200);
        border-right-width: 1px;
        border-right-style: solid;
        border-right-color: var(--color-base-300);
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
        border-bottom-color: var(--color-base-300);
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
        color: color-mix(in oklab, var(--color-base-content) 70%, transparent);
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
        border-radius: var(--radius-box);
    }
    .editor-card {
        background-color: var(--color-base-100);
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

    .bodies {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding-right: 0.25rem;
    }
    .bodies-scroll {
        max-height: 40vh;
        overflow-y: auto;
    }

    .body-card {
        background-color: var(--color-base-200);
        padding: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .body-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .body-row :global(.body-purpose) {
        flex: 1 1 0%;
    }
    .body-row :global(.body-remove) {
        color: var(--color-error);
    }
    .purpose-option {
        text-transform: capitalize;
    }
    .body-card :global(.body-input) {
        width: 100%;
    }

    .body-textarea {
        border: var(--border) solid #0000;
        border-color: var(--input-color);
        min-height: calc(0.25rem * 20);
        flex-shrink: 1;
        appearance: none;
        border-radius: var(--radius-field);
        background-color: var(--color-base-100);
        padding-block: calc(0.25rem * 2);
        vertical-align: middle;
        width: 100%;
        padding-inline-start: 0.75rem;
        padding-inline-end: 0.75rem;
        font-size: max(var(--font-size, 0.6875rem), 0.6875rem);
        touch-action: manipulation;
        box-shadow:
            0 1px
                color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000)
                inset,
            0 -1px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset;
        --input-color: color-mix(in oklab, var(--color-base-content) 20%, #0000);
    }
    .body-textarea:focus,
    .body-textarea:focus-within {
        --input-color: var(--color-base-content);
        box-shadow: 0 1px
            color-mix(in oklab, var(--input-color) calc(var(--depth) * 10%), #0000);
        outline: 2px solid var(--input-color);
        outline-offset: 2px;
        isolation: isolate;
    }
    .body-textarea:is(:disabled, [disabled]) {
        cursor: not-allowed;
        border-color: var(--color-base-200);
        background-color: var(--color-base-200);
        color: color-mix(in oklab, var(--color-base-content) 40%, transparent);
        box-shadow: none;
    }
    .body-textarea:is(:disabled, [disabled])::placeholder {
        color: color-mix(in oklab, var(--color-base-content) 20%, transparent);
    }

    .hydrating-note {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.6;
    }

    .editor-card :global(.add-content) {
        width: 100%;
    }

    .save-row {
        padding-top: 0.5rem;
    }
    .save-row :global(.save-btn) {
        width: 100%;
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
        --join-ss: var(--radius-field);
        --join-es: var(--radius-field);
    }
    .join > :global(.join-item:last-child) {
        --join-se: var(--radius-field);
        --join-ee: var(--radius-field);
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
        background-color: var(--color-base-100);
        padding: 1.5rem;
        border-radius: var(--radius-box);
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
