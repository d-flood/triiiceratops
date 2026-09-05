<script lang="ts">
    import { routeAt } from './routes';

    /**
     * A route's styled structure: the heading, its real introductory sentence,
     * and — until the prose lands — placeholder body text carrying the layout.
     *
     * The placeholder is announced rather than dressed up as an argument. A
     * route in this state is also unlinked from the rail, skipped by the
     * next-page link, `noindex` and absent from the sitemap, all from the one
     * declaration in `routes.ts`.
     */
    let { path }: { path: string } = $props();

    const route = $derived(routeAt(path));
</script>

{#if route}
    <div class="pagehead">
        <h1>{route.title}</h1>
        <p class="lede">{route.intro}</p>
    </div>

    {#if route.copy === 'filler'}
        <!--
            "noindex" is deliberately not wrapped in <code>. The mono face is
            90 KB and nothing else on a marketing route uses it yet, so marking
            up one word of a placeholder that deletes itself would put that face
            on the first-paint path of all six filler routes for no reader
            benefit.
        -->
        <p class="pending">
            The prose for this page has not been written yet. Until it is, the
            page is unlinked from the rail, skipped by the next-page link, and
            marked noindex. What follows is placeholder text carrying the layout.
        </p>
    {/if}

    <div class="band">
        <div class="prose">
            <h2>Placeholder section</h2>
            <p>
                Placeholder paragraph. This block exists so the page's measure,
                rhythm and rule weights can be judged at the width a reader will
                see them, and so the route is a real document rather than an
                empty one.
            </p>
            <p>
                Placeholder paragraph. A second paragraph, because a single one
                does not show how the spacing between them reads.
            </p>
            <h2>Placeholder section</h2>
            <p>
                Placeholder paragraph. Ideas on this site sit on ruled rows and
                lists rather than in cards, so the list below stands in for
                whatever the finished page arranges here.
            </p>
            <ul>
                <li>Placeholder item.</li>
                <li>Placeholder item.</li>
                <li>Placeholder item.</li>
            </ul>
        </div>
    </div>
{/if}
