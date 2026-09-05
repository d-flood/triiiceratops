<script lang="ts">
    import MaterialClasses from '$lib/MaterialClasses.svelte';
    import PageHead from '$lib/PageHead.svelte';

    /**
     * The kinds of material the viewer copes with, each running on somebody's
     * real manifest.
     *
     * The page's whole body is that set of embeds, which is derived from
     * `$lib/materialClasses` and was never editable, so it renders from code
     * rather than from a document holding one placed block.
     */
</script>

<PageHead />

<div class="band">
    <div class="doc">
        <MaterialClasses />
    </div>
</div>
