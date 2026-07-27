<script lang="ts">
    import type { AnnotationBodyEditorApi, W3CAnnotationBody } from './types';
    import { W3C_PURPOSES } from './types';
    import { GLYPHS, VIEW_BOX, type GlyphName } from './icons';
    import { useT } from './i18n.svelte';

    const t = useT();

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

<div class="bodies" class:bodies-scroll={!embedded}>
    {#each editableBodies as body, i (i)}
        <div class="card body-card">
            {#if body.__opaque}
                <div class="unknown-body">
                    <p class="unknown-body-note">
                        {t('annotation_editor_unknown_body_note')}
                    </p>
                    <code class="unknown-body-preview">
                        {JSON.stringify(body.body, null, 2)}
                    </code>
                </div>
            {:else}
                <div class="body-row">
                    <select class="body-purpose" bind:value={body.purpose}>
                        {#each purposes as purpose (purpose)}
                            <option value={purpose} class="purpose-option">
                                {purpose}
                            </option>
                        {/each}
                    </select>
                    <button
                        type="button"
                        class="tri-ae-btn tri-ae-btn-icon body-remove"
                        onclick={() => removeBody(i)}
                    >
                        {@render glyph('X', 14)}
                    </button>
                </div>

                {#if body.purpose === 'tagging'}
                    <input
                        class="body-input"
                        type="text"
                        placeholder={t('annotation_editor_tag_placeholder')}
                        disabled={api.isHydrating}
                        bind:value={body.value}
                    />
                {:else if body.purpose === 'linking'}
                    <input
                        class="body-input"
                        type="url"
                        placeholder={t('annotation_editor_link_placeholder')}
                        disabled={api.isHydrating}
                        bind:value={body.value}
                    />
                {:else}
                    <textarea
                        class="body-textarea"
                        rows="2"
                        placeholder={t('annotation_editor_text_placeholder')}
                        disabled={api.isHydrating}
                        bind:value={body.value}
                    ></textarea>
                {/if}
            {/if}
        </div>
    {/each}
</div>

{#if allowMultipleBodies}
    <button
        type="button"
        class="tri-ae-btn add-content"
        onclick={addBody}
        disabled={api.isHydrating}
    >
        {@render glyph('Plus', 14)}
        {t('annotation_editor_add_content')}
    </button>
{/if}

<div class="save-row">
    <button
        type="button"
        class="tri-ae-btn is-primary save-btn"
        onclick={handleSaveBodies}
        disabled={api.isHydrating}
    >
        {@render glyph('Check', 16)}
        {t('annotation_editor_save')}
    </button>
</div>

<style>
    .card {
        position: relative;
        display: flex;
        flex-direction: column;
        border-radius: var(--tri-radius-panels);
    }

    .tri-ae-glyph {
        display: inline-block;
        vertical-align: middle;
        flex-shrink: 0;
    }

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
        font-size: 0.75rem;
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
    .tri-ae-btn:disabled {
        opacity: 0.5;
        cursor: default;
    }
    .tri-ae-btn-icon {
        padding: 0.375rem;
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
    .body-purpose {
        flex: 1 1 0%;
        border-radius: var(--tri-radius-buttons);
        border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
        background-color: var(--tri-input-bg);
        color: inherit;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
    }
    .body-remove {
        color: var(--tri-color-error);
        border-color: transparent;
        background: transparent;
    }
    .purpose-option {
        text-transform: capitalize;
    }
    .body-input {
        width: 100%;
        border-radius: var(--tri-radius-buttons);
        border: 1px solid var(--tri-surface-border, rgb(0 0 0 / 0.15));
        background-color: var(--tri-input-bg);
        color: inherit;
        padding: 0.25rem 0.5rem;
        font-size: 0.75rem;
    }

    .body-textarea {
        border: var(--tri-border, 1px) solid #0000;
        border-color: var(--input-color);
        min-height: calc(0.25rem * 20);
        flex-shrink: 1;
        appearance: none;
        border-radius: var(--tri-radius-buttons);
        background-color: var(--tri-input-bg);
        padding-block: calc(0.25rem * 2);
        vertical-align: middle;
        width: 100%;
        padding-inline-start: 0.75rem;
        padding-inline-end: 0.75rem;
        font-size: max(var(--font-size, 0.6875rem), 0.6875rem);
        touch-action: manipulation;
        color: inherit;
        --input-color: color-mix(in oklab, var(--panel-fg) 20%, #0000);
    }
    .body-textarea:focus,
    .body-textarea:focus-within {
        --input-color: var(--panel-fg);
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
        border-radius: var(--tri-radius-buttons);
        background-color: var(--tri-input-bg);
        padding: 0.5rem;
        font-size: 0.6875rem;
        line-height: 1rem;
    }

    .add-content {
        width: 100%;
    }

    .save-row {
        padding-top: 0.5rem;
    }
    .save-btn {
        width: 100%;
    }
</style>
