<script lang="ts">
    import { DEPLOYMENTS } from './deployments';

    /**
     * Real deployments, as ruled rows a reader can open.
     *
     * Two groupings, because the two kinds of entry make different claims: a
     * reading room is a collection somebody publishes, and a tool is software
     * that emits the viewer into other people's pages. Folding the second into
     * the first would read as a sixth reading room, which it is not.
     *
     * Each reading room offers two links, because they answer different
     * questions: the landing page says who runs it, and the example is the
     * evidence.
     *
     * It renders nothing while a grouping is empty rather than showing a
     * placeholder: a placeholder deployment is exactly the claim this section
     * exists to make honestly.
     */

    const readingRooms = DEPLOYMENTS.filter(
        (deployment) => deployment.kind === 'reading-room',
    );
    const tools = DEPLOYMENTS.filter(
        (deployment) => deployment.kind === 'tool',
    );
</script>

{#snippet rows(entries: typeof DEPLOYMENTS)}
    <div class="prod">
        {#each entries as deployment (deployment.href)}
            <div class="prod__row">
                <span>
                    <a class="who" href={deployment.href}>{deployment.who}</a>
                    <span class="what">{deployment.what}</span>
                </span>
                {#if deployment.example}
                    <a class="go" href={deployment.example}>
                        Open an example<span class="vh">
                            of {deployment.who}</span
                        >
                    </a>
                {/if}
            </div>
        {/each}
    </div>
{/snippet}

{#if readingRooms.length > 0}
    <section>
        <h2>Reading rooms running the viewer</h2>
        <p class="prod__say">
            Open any of these and you are looking at the viewer doing its job.
        </p>
        {@render rows(readingRooms)}
    </section>
{/if}

{#if tools.length > 0}
    <section>
        <h2>Tools that ship the viewer</h2>
        <p class="prod__say">
            Software that generates pages carrying the viewer, rather than a
            collection to browse.
        </p>
        {@render rows(tools)}
    </section>
{/if}
