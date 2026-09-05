<script lang="ts">
    import EmbeddedViewer from './EmbeddedViewer.svelte';
    import { MATERIAL_CLASSES } from './materialClasses';

    /**
     * The kinds of material, each running.
     *
     * A curator asking whether this copes with their collection is answered by
     * showing the collection they have, so every class here is a live viewer on
     * somebody's real manifest rather than a claim about one. Each is named for
     * the kind of material it is; the specification's name for whatever makes it
     * interesting is not the reader's business and is nowhere on the page.
     *
     * Every embed is lazy and every box reserves its space, so five viewers cost
     * a reader what one costs until they scroll to them.
     */
</script>

{#each MATERIAL_CLASSES as material (material.example.manifest)}
    <section class="mat">
        <h2>{material.name}</h2>
        <p class="mat__say">{material.what}</p>
        <EmbeddedViewer
            example={material.example}
            config={material.config}
            label={material.example.label}
        />
        <p class="mat__from">
            {material.material} —
            <a href={material.source.href}>{material.source.who}</a>
        </p>
    </section>
{/each}
