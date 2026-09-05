<script lang="ts">
    import Hero from '$lib/Hero.svelte';
    import InstallBlock from '$lib/InstallBlock.svelte';
    import { DEPLOYMENTS } from '$lib/deployments';
    import { LISTED, routeAt } from '$lib/routes';

    /**
     * The front page routes; it does not argue. Hero, install, production,
     * teasers, footer — in that order, with production directly under install
     * because a working link into a live reading room is the cheapest strong
     * proof the site can carry. No chart, no feature grid, and no argument
     * repeated from the pages behind it: each of those has its own page, and
     * this one's job is to send a reader to the right one.
     */
    const route = routeAt('/');
    const onward = LISTED.filter((entry) => entry.path !== '/');
</script>

<!--
    This one route preloads the mono. It is the first marketing route to carry
    code: the install block is the call to action, D36 requires that command to
    be set in the self-hosted Source Code Pro so it renders identically here and
    in the documentation, and code above the fold is what makes that 90 KB face
    a first-paint dependency. So this route pays for it rather than making all
    eight preload it. The global head (src/app.html) stays roman-only.
-->
<svelte:head>
    <link
        rel="preload"
        href="/fonts/SourceCodeVariable-Roman-Latin.woff2"
        as="font"
        type="font/woff2"
        crossorigin="anonymous"
    />
</svelte:head>

{#if route}
    <Hero headline={route.title} lede={route.intro} />
{/if}

<div class="band band--paper">
    <InstallBlock />
</div>

{#if DEPLOYMENTS.length > 0}
    <div class="band">
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
    </div>
{/if}

{#if onward.length > 0}
    <nav class="band" aria-label="The rest of the site">
        <h2>The rest of the site</h2>
        <div class="rows">
            {#each onward as entry, index (entry.path)}
                <a href={entry.path}>
                    <span class="n">{index + 2}</span>
                    <span class="ttl">{entry.shortTitle}</span>
                    <span class="say">{entry.intro}</span>
                    <span class="go" aria-hidden="true">→</span>
                </a>
            {/each}
        </div>
    </nav>
{/if}
