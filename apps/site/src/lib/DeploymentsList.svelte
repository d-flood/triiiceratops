<script lang="ts">
    import { DEPLOYMENTS } from './deployments';

    /**
     * Real deployments, as a strip of links a reader can open.
     *
     * It renders nothing while the list is empty rather than showing a
     * placeholder: a placeholder deployment is exactly the claim this section
     * exists to make honestly.
     */
</script>

{#if DEPLOYMENTS.length > 0}
    <section>
        <h2>Running in production</h2>
        <p class="aside prod__say">
            Open any of these and you are looking at the viewer doing its job.
        </p>
        <div class="prod">
            {#each DEPLOYMENTS as deployment (deployment.href)}
                <a href={deployment.href}>
                    <span>
                        <span class="who">{deployment.who}</span>
                        <span class="what">{deployment.what}</span>
                    </span>
                    <span class="go">Open</span>
                </a>
            {/each}
        </div>
    </section>
{/if}
