<script lang="ts">
    import { onMount } from 'svelte';

    import DocsNav from '$lib/DocsNav.svelte';
    import PageHead from '$lib/PageHead.svelte';
    import { AUTOSAVE_MS, blocks, schema, siteConfig } from '$lib/content';

    /**
     * A content route's edit variant: the site's own layout, head and measure,
     * with the editor where the body would be.
     */
    let { data } = $props();

    let target = $state<HTMLElement | undefined>();

    onMount(() => {
        // The whole editing surface sits behind `import.meta.env.DEV`, which Vite
        // replaces with a literal when building. The dynamic import is then
        // unreachable and dropped, so the editor stack is absent from the build
        // rather than merely unrouted — which is what
        // `scripts/assert-no-editor-code.mjs` checks.
        if (!import.meta.env.DEV) return;

        let handle: { destroy(): void } | undefined;
        let cancelled = false;

        void import('uncial-cms').then(({ mountEditorPage }) => {
            if (cancelled || !target) return;
            handle = mountEditorPage(target, {
                config: siteConfig,
                sourcePath: data.sourcePath,
                pagePath: data.pagePath,
                blocks,
                schema,
                autosaveMs: AUTOSAVE_MS,
            });
        });

        return () => {
            cancelled = true;
            handle?.destroy();
        };
    });
</script>

<PageHead />

{#if data.docs}
    <div class="band docspage">
        <DocsNav sections={data.docs} current={data.path} />
        <div class="docspage__body">
            <!-- No contents here: they are derived from the document, and the
                 editor fetches its own copy after mounting. -->
            <div class="doc" bind:this={target}></div>
        </div>
    </div>
{:else}
    <div class="band">
        <div class="doc" bind:this={target}></div>
    </div>
{/if}
