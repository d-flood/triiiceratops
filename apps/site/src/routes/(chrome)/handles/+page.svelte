<script lang="ts">
    import FeatureStage from '$lib/FeatureStage.svelte';
    import PageHead from '$lib/PageHead.svelte';

    /**
     * What the viewer can do, one feature at a time, on a running viewer.
     *
     * The stage is a full-bleed strip of the main column — the hero's
     * treatment, not a band's: it spans the column edge to edge so the material
     * gets the whole width, rather than stopping at the content measure prose
     * is held to. It renders from code rather than from a document for the same
     * reason as before: its body is a running viewer, never editable prose.
     */
</script>

<PageHead />

<FeatureStage />
