<script lang="ts">
    import { Renderer } from 'uncial/render';

    import DocsNav from '$lib/DocsNav.svelte';
    import DocsToc from '$lib/DocsToc.svelte';
    import PageHead from '$lib/PageHead.svelte';
    import { blocks, schema } from '$lib/content';

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
