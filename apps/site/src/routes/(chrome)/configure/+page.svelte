<script lang="ts">
    import PageHead from '$lib/PageHead.svelte';

    /**
     * The configuration builder's route.
     *
     * It renders from code rather than from a content document, because what it
     * will carry is the builder itself: a reader sets the viewer's chrome
     * against their own manifest and leaves with a URL. Until the builder lands,
     * the body below stands in for it, so the route's measure, rhythm and rule
     * weights can be judged at the width a reader will see them.
     */
</script>

<PageHead />

<div class="band">
    <div class="prose">
        <h2>Placeholder section</h2>
        <p>
            Placeholder paragraph. This block exists so the page's measure,
            rhythm and rule weights can be judged at the width a reader will see
            them, and so the route is a real document rather than an empty one.
        </p>
        <p>
            Placeholder paragraph. A second paragraph, because a single one does
            not show how the spacing between them reads.
        </p>
    </div>
</div>
