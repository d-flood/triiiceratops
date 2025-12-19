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
    import { setLocale, locales } from '../../paraglide/runtime';
    import { m } from '../../paraglide/messages';

    // Import Annotorious CSS for the drawing overlay to ensure it's loaded by Vite
    import '@annotorious/openseadragon/annotorious-openseadragon.css';

    // Props
    let {
        isEditing = false,
        activeTool = 'rectangle' as DrawingTool,
        selectedAnnotation = null as any,
        showDeleteConfirm = false,
        canUndo = false,
        canRedo = false,
        availableTools = ['rectangle', 'polygon', 'point'] as DrawingTool[],
        onToggleEditing,
        onSetTool,
        onSaveBodies,
        onRequestDelete,
        onConfirmDelete,
        onCancelDelete,
        onUndo,
        onRedo,
        onClose,
        locale,
    }: {
        isEditing: boolean;
        activeTool: DrawingTool;
        selectedAnnotation: any;
        showDeleteConfirm: boolean;
        canUndo: boolean;
        canRedo: boolean;
        availableTools: DrawingTool[];
        onToggleEditing: () => void;
        onSetTool: (tool: DrawingTool) => void;
        onSaveBodies: (bodies: W3CAnnotationBody[]) => void;
        onRequestDelete: () => void;
        onConfirmDelete: () => void;
        onCancelDelete: () => void;
        onUndo: () => void;
        onRedo: () => void;
        onClose: () => void;
        locale?: string;
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

    $effect(() => {
        if (locale && locales.includes(locale as any)) {
            setLocale(locale as any);
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

<div
    class="w-80 h-full bg-base-200 border-r border-base-300 shadow-xl flex flex-col"
>
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-base-300">
        <h2 class="text-lg font-semibold flex items-center gap-2">
            <PencilSimple size={20} />
            {m.annotation_editor_title()}
        </h2>
        <button
            class="btn btn-sm btn-ghost btn-circle"
            onclick={onClose}
            aria-label={m.close()}
        >
            <X size={20} />
        </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- Drawing Mode Toggle -->
        <div class="flex flex-col gap-2">
            <div class="join grid grid-cols-2 w-full">
                <button
                    class="join-item btn btn-sm {!isEditing
                        ? 'btn-secondary'
                        : ''}"
                    onclick={() => isEditing && onToggleEditing()}
                >
                    {m.annotation_editor_edit_mode()}
                </button>
                <button
                    class="join-item btn btn-sm {isEditing
                        ? 'btn-primary'
                        : ''}"
                    onclick={() => !isEditing && onToggleEditing()}
                >
                    {m.annotation_editor_create_mode()}
                </button>
            </div>
            <p class="text-xs opacity-60 text-center">
                {isEditing
                    ? m.annotation_editor_instruction_create()
                    : m.annotation_editor_instruction_edit()}
            </p>
        </div>

        <!-- Tool Selection -->
        {#if isEditing}
            <div class="space-y-2">
                <p class="text-sm font-medium">
                    {m.annotation_editor_tool_label()}
                </p>
                <div class="join">
                    {#each availableTools as tool}
                        {@const Icon = toolIcons[tool] ?? Rectangle}
                        {@const toolName =
                            {
                                rectangle: m.annotation_tool_rectangle(),
                                polygon: m.annotation_tool_polygon(),
                                point: m.annotation_tool_point(),
                            }[tool] ?? tool}
                        <button
                            class="join-item btn btn-sm tooltip tooltip-bottom {activeTool ===
                            tool
                                ? 'btn-primary'
                                : ''}"
                            data-tip={toolName}
                            onclick={() => onSetTool(tool)}
                            aria-label={toolName}
                        >
                            <Icon size={18} />
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Undo/Redo -->
            <div class="flex gap-2">
                <button
                    class="btn btn-sm btn-outline flex-1"
                    disabled={!canUndo}
                    onclick={onUndo}
                >
                    <ArrowCounterClockwise size={16} />
                    {m.annotation_editor_undo()}
                </button>
                <button
                    class="btn btn-sm btn-outline flex-1"
                    disabled={!canRedo}
                    onclick={onRedo}
                >
                    <ArrowClockwise size={16} />
                    {m.annotation_editor_redo()}
                </button>
            </div>
        {/if}

        <!-- Selected Annotation Editor (Inline) -->
        {#if selectedAnnotation}
            <div class="card bg-base-100 p-4 space-y-3">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="font-medium text-sm">
                        {m.annotation_editor_edit_section()}
                    </h3>
                    <div class="flex gap-1">
                        <button
                            class="btn btn-sm btn-error btn-ghost btn-circle"
                            onclick={onRequestDelete}
                            aria-label={m.annotation_editor_delete_tooltip()}
                        >
                            <Trash size={16} />
                        </button>
                    </div>
                </div>

                <div class="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                    {#each editableBodies as body, i}
                        <div class="card bg-base-200 p-2 space-y-2">
                            <div class="flex items-center gap-2">
                                <select
                                    class="select select-xs select-bordered flex-1"
                                    bind:value={body.purpose}
                                >
                                    {#each W3C_PURPOSES as purpose}
                                        <option
                                            value={purpose}
                                            class="capitalize">{purpose}</option
                                        >
                                    {/each}
                                </select>
                                <button
                                    class="btn btn-xs btn-ghost btn-circle text-error"
                                    onclick={() => removeBody(i)}
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {#if body.purpose === 'tagging'}
                                <input
                                    type="text"
                                    class="input input-xs input-bordered w-full"
                                    placeholder={m.annotation_editor_tag_placeholder()}
                                    bind:value={body.value}
                                />
                            {:else if body.purpose === 'linking'}
                                <input
                                    type="url"
                                    class="input input-xs input-bordered w-full"
                                    placeholder={m.annotation_editor_link_placeholder()}
                                    bind:value={body.value}
                                />
                            {:else}
                                <textarea
                                    class="textarea textarea-xs textarea-bordered w-full"
                                    rows="2"
                                    placeholder={m.annotation_editor_text_placeholder()}
                                    bind:value={body.value}
                                ></textarea>
                            {/if}
                        </div>
                    {/each}
                </div>

                <button class="btn btn-xs btn-ghost w-full" onclick={addBody}>
                    <Plus size={14} />
                    {m.annotation_editor_add_content()}
                </button>

                <div class="pt-2">
                    <button
                        class="btn btn-sm btn-primary w-full"
                        onclick={handleSaveBodies}
                    >
                        <Check size={16} />
                        {m.annotation_editor_save()}
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<!-- Delete Confirmation Modal (Keep as modal for safety) -->
{#if showDeleteConfirm}
    <dialog class="modal modal-open">
        <div class="modal-box">
            <h3 class="font-bold text-lg flex items-center gap-2">
                <Warning size={24} class="text-warning" />
                {m.annotation_editor_delete_title()}
            </h3>
            <p class="py-4">
                {m.annotation_editor_delete_message()}
            </p>
            <div class="modal-action">
                <button class="btn btn-ghost" onclick={onCancelDelete}>
                    {m.annotation_editor_cancel()}
                </button>
                <button class="btn btn-error" onclick={onConfirmDelete}>
                    {m.annotation_editor_delete()}
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button onclick={onCancelDelete}>close</button>
        </form>
    </dialog>
{/if}
