<script lang="ts">
    import {
        DOCUMENTATION_PATH,
        HOSTED_VIEWER_PATH,
        PLAYGROUND_PATH,
        REPOSITORY_URL,
    } from './site';

    /**
     * The rail's coloured link block: the four destinations the rail's own list
     * does not carry. The hosted viewer leads because a stranger watching their
     * own material render outperforms every chart on the site.
     *
     * Three of them are routes of this application and the fourth is the
     * repository; the documentation is a link into its own sidebar rather than
     * an entry in the rail's list, because seventeen pages in a rail of seven
     * would be a different argument.
     */
</script>

<div class="rail__out">
    <a class="viewer" href={HOSTED_VIEWER_PATH}
        >Try your own manifest <span aria-hidden="true">→</span></a
    >
    <a class="demo" href={PLAYGROUND_PATH}>Playground</a>
    <a class="docs" href={DOCUMENTATION_PATH}>Documentation</a>
    <a class="plain" href={REPOSITORY_URL}>Source on GitHub</a>
</div>
