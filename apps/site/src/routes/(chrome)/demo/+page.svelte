<script lang="ts">
    import PageHead from '$lib/PageHead.svelte';
    import RecipeStage from '$lib/recipes/RecipeStage.svelte';

    /**
     * Every IIIF Cookbook recipe the workspace tracks, on one running viewer.
     *
     * A page of this site rather than an application of its own: it takes the
     * rail, the heading and the words every other route takes, because what it
     * is for is reading a catalog. The viewer is the thing the catalog is about,
     * not the frame around it.
     *
     * Out of the rail's list and therefore `noindex` and out of the sitemap —
     * the same standing as `/system/`. It is a maintainer's instrument, and a
     * search for a IIIF viewer should land on a page making the argument rather
     * than on the bench the argument was checked at. The path is kept because
     * it has been published, and because it still answers with a viewer.
     */
</script>

<PageHead />

<RecipeStage />
