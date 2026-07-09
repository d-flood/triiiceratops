<script lang="ts">
    import X from 'phosphor-svelte/lib/X';
    import Plus from 'phosphor-svelte/lib/Plus';
    import Check from 'phosphor-svelte/lib/Check';
    import type { AnnotationBodyEditorApi, W3CAnnotationBody } from './types';
    import { W3C_PURPOSES } from './types';
    import { m } from '../../paraglide/messages';
    import { Button, Select, TextInput } from '../../components/ui';

    let {
        api,
        embedded = false,
        purposes = W3C_PURPOSES,
        allowMultipleBodies = true,
    }: {
        api: AnnotationBodyEditorApi;
        embedded?: boolean;
        purposes?: readonly string[];
        allowMultipleBodies?: boolean;
    } = $props();

    type EditableBody = W3CAnnotationBody & { __opaque?: false };
    type OpaqueBody = { __opaque: true; body: unknown };
    type BodyDraft = EditableBody | OpaqueBody;

    let editableBodies = $state<BodyDraft[]>([]);

    function defaultPurpose(): string {
        return purposes[0] ?? 'commenting';
    }

    function emptyEditableBody(): EditableBody {
        return { purpose: defaultPurpose(), value: '', __opaque: false };
    }

    $effect(() => {
        // Reset the local draft only when the selected annotation changes or is
        // replaced by hydration. Typing into the draft must not echo back into
        // api.bodies until Save is clicked.
        const _annotation = api.annotation;
        const drafts = api.bodies.map(toDraft);
        editableBodies =
            !allowMultipleBodies && drafts.length === 0
                ? [emptyEditableBody()]
                : drafts;
    });

    function cloneBody<T>(body: T): T {
        if (body && typeof body === 'object') {
            return { ...(body as Record<string, unknown>) } as T;
        }
        return body;
    }

    function isEditableBody(body: unknown): body is W3CAnnotationBody {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return false;
        }

        const record = body as Record<string, unknown>;
        const type = record.type;
        const value = record.value;

        return (
            (type === undefined || type === 'TextualBody') &&
            (value === undefined || typeof value === 'string')
        );
    }

    function toDraft(body: unknown): BodyDraft {
        if (isEditableBody(body)) {
            return { ...cloneBody(body), __opaque: false };
        }

        return { __opaque: true, body: cloneBody(body) };
    }

    function addBody() {
        editableBodies = [...editableBodies, emptyEditableBody()];
    }

    function removeBody(index: number) {
        editableBodies = editableBodies.filter((_, i) => i !== index);
    }

    async function handleSaveBodies() {
        const valid = editableBodies.flatMap((body) => {
            if (body.__opaque) {
                return [body.body];
            }

            const { __opaque, ...w3cBody } = body;
            return w3cBody.value?.trim() ? [w3cBody] : [];
        });

        await api.save(valid.length === 1 ? valid[0] : valid);
    }
</script>

<div class="bodies" class:bodies-scroll={!embedded}>
    {#each editableBodies as body, i (i)}
        <div class="card body-card">
            {#if body.__opaque}
                <div class="unknown-body">
                    <p class="unknown-body-note">
                        {m.annotation_editor_unknown_body_note()}
                    </p>
                    <code class="unknown-body-preview">
                        {JSON.stringify(body.body, null, 2)}
                    </code>
                </div>
            {:else}
                <div class="body-row">
                    <Select
                        class="body-purpose"
                        size="xs"
                        bind:value={body.purpose}
                    >
                        {#each purposes as purpose (purpose)}
                            <option value={purpose} class="purpose-option">
                                {purpose}
                            </option>
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
                        disabled={api.isHydrating}
                        bind:value={body.value}
                    />
                {:else if body.purpose === 'linking'}
                    <TextInput
                        class="body-input"
                        type="url"
                        size="xs"
                        placeholder={m.annotation_editor_link_placeholder()}
                        disabled={api.isHydrating}
                        bind:value={body.value}
                    />
                {:else}
                    <textarea
                        class="body-textarea"
                        rows="2"
                        placeholder={m.annotation_editor_text_placeholder()}
                        disabled={api.isHydrating}
                        bind:value={body.value}
                    ></textarea>
                {/if}
            {/if}
        </div>
    {/each}
</div>

{#if allowMultipleBodies}
    <Button
        class="add-content"
        size="xs"
        ghost
        onclick={addBody}
        disabled={api.isHydrating}
    >
        <Plus size={14} />
        {m.annotation_editor_add_content()}
    </Button>
{/if}

<div class="save-row">
    <Button
        class="save-btn"
        size="sm"
        variant="primary"
        onclick={handleSaveBodies}
        disabled={api.isHydrating}
    >
        <Check size={16} />
        {m.annotation_editor_save()}
    </Button>
</div>

<style>
    .card {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: var(--radius-panels);
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
        background-color: var(--panel-surface);
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
        border-radius: var(--radius-buttons);
        background-color: var(--input-bg);
        padding-block: calc(0.25rem * 2);
        vertical-align: middle;
        width: 100%;
        padding-inline-start: 0.75rem;
        padding-inline-end: 0.75rem;
        font-size: max(var(--font-size, 0.6875rem), 0.6875rem);
        touch-action: manipulation;
        box-shadow:
            0 1px
                color-mix(
                    in oklab,
                    var(--input-color) calc(var(--depth) * 10%),
                    #0000
                )
                inset,
            0 -1px oklch(100% 0 0 / calc(var(--depth) * 0.1)) inset;
        --input-color: color-mix(in oklab, var(--panel-fg) 20%, #0000);
    }
    .body-textarea:focus,
    .body-textarea:focus-within {
        --input-color: var(--panel-fg);
        box-shadow: 0 1px
            color-mix(
                in oklab,
                var(--input-color) calc(var(--depth) * 10%),
                #0000
            );
        outline: 2px solid var(--input-color);
        outline-offset: 2px;
        isolation: isolate;
    }
    .body-textarea:is(:disabled, [disabled]) {
        cursor: not-allowed;
        border-color: var(--panel-surface);
        background-color: var(--panel-surface);
        color: color-mix(in oklab, var(--panel-fg) 40%, transparent);
        box-shadow: none;
    }
    .body-textarea:is(:disabled, [disabled])::placeholder {
        color: color-mix(in oklab, var(--panel-fg) 20%, transparent);
    }

    .unknown-body {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .unknown-body-note {
        font-size: 0.75rem;
        line-height: 1rem;
        opacity: 0.7;
    }
    .unknown-body-preview {
        display: block;
        max-height: 8rem;
        overflow: auto;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        border-radius: var(--radius-buttons);
        background-color: var(--input-bg);
        padding: 0.5rem;
        font-size: 0.6875rem;
        line-height: 1rem;
    }

    :global(.add-content) {
        width: 100%;
    }

    .save-row {
        padding-top: 0.5rem;
    }
    .save-row :global(.save-btn) {
        width: 100%;
    }
</style>
