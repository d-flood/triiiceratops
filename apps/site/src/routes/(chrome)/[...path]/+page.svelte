<script lang="ts">
    import { Renderer } from 'uncial/render';

    import DocsNav from '$lib/DocsNav.svelte';
    import DocsToc from '$lib/DocsToc.svelte';
    import PageHead from '$lib/PageHead.svelte';
    import { blocks, schema } from '$lib/content';

    /**
     * A content route's reader-facing page. Uncial's renderer only: no editor
     * code reaches a production build, which `scripts/assert-no-editor-code.mjs`
     * holds the build output to.
     *
     * A documentation page is the same page with the same chrome around it,
     * plus the two things a documentation page needs and a marketing page does
     * not: the declared sidebar, and its own contents.
     */
    let { data } = $props();
</script>

<PageHead />

{#if data.docs}
    <div class="band docspage">
        <DocsNav sections={data.docs} current={data.path} />
        <div class="docspage__body">
            <DocsToc entries={data.toc ?? []} />
            <div class="doc">
                <Renderer content={data.document} {blocks} {schema} />
            </div>
        </div>
    </div>
{:else if data.document.content?.length}
    <div class="band">
        <div class="doc">
            <Renderer content={data.document} {blocks} {schema} />
        </div>
    </div>
{/if}
