<script lang="ts">
    import { onMount } from 'svelte';

    import DocsNav from '$lib/DocsNav.svelte';
    import PageHead from '$lib/PageHead.svelte';
    import { AUTOSAVE_MS, blocks, schema, siteConfig } from '$lib/content';
    import type { ContentDocument } from 'uncial/core';
    import type { EditorController, StatusView } from 'uncial-cms/session';

    let { data } = $props();

    type EditorComponent = (typeof import('uncial/editor'))['Editor'];

    let Editor = $state<EditorComponent | undefined>(undefined);
    let doc = $state<ContentDocument | undefined>(undefined);
    let meta = $state<Record<string, unknown>>({});
    let status = $state<StatusView | undefined>(undefined);
    let conflict = $state(false);
    let controller: EditorController | undefined;

    onMount(() => {
        /* DEV-only: dynamic imports drop from the build, keeping the editor out of production. */
        if (!import.meta.env.DEV) return;

        let cancelled = false;

        void Promise.all([
            import('uncial/editor'),
            import('uncial-cms/session'),
            import('$lib/editor-chrome.css'),
        ]).then(([editor, cms]) => {
            if (cancelled) return;
            Editor = editor.Editor;
            controller = cms.createEditorSession({
                config: siteConfig,
                sourcePath: data.sourcePath,
                pagePath: data.pagePath,
                blocks,
                schema,
                autosaveMs: AUTOSAVE_MS,
                isDestroyed: () => cancelled,
                ui: {
                    status: (view) => (status = view),
                    setDocument: (next) => {
                        doc = next;
                        meta = next.meta ?? {};
                    },
                    saveEnabled: () => {},
                    conflictVisible: (visible) => (conflict = visible),
                },
            });
            void controller.load();
        });

        return () => {
            cancelled = true;
            controller?.stop();
        };
    });
</script>

{#snippet surface()}
    <div class="uncial-cms-editor-page">
        {#if status}
            <p class="uncial-cms-status" role="status">
                {status.text}{#if status.href}
                    <a href={status.href}>commit</a>
                {/if}
            </p>
        {/if}

        {#if conflict}
            <div class="uncial-cms-banner" role="alert">
                <p class="uncial-cms-banner-message">
                    This page changed on the local checkout since you loaded it.
                    Your unsaved changes are safe — choose how to proceed.
                </p>
                <div class="uncial-cms-banner-actions">
                    <button
                        type="button"
                        onclick={() => controller?.downloadMyVersion()}
                        >Download my version</button
                    >
                    <button
                        type="button"
                        onclick={() => void controller?.reloadLatest()}
                        >Reload latest</button
                    >
                    <button
                        type="button"
                        onclick={() => controller?.dismissConflict()}
                        >Dismiss</button
                    >
                </div>
            </div>
        {/if}

        {#if Editor && doc}
            <Editor
                {blocks}
                {schema}
                bind:json={doc}
                bind:meta
                onChange={(next) =>
                    controller?.documentChanged(next as ContentDocument)}
            />
        {/if}
    </div>
{/snippet}

<PageHead />

{#if data.docs}
    <div class="band band--editing docspage">
        <DocsNav sections={data.docs} current={data.path} />
        <div class="docspage__body">
            <!-- No contents here: they are derived from the document, and the
                 editor holds its own copy once it has loaded. -->
            <div class="doc">{@render surface()}</div>
        </div>
    </div>
{:else}
    <div class="band band--editing">
        <div class="doc">{@render surface()}</div>
    </div>
{/if}
