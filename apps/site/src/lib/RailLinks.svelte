<script lang="ts">
    import {
        DOCUMENTATION_PATH,
        HOSTED_VIEWER_PATH,
        PLAYGROUND_PATH,
        REPOSITORY_URL,
    } from './site';

    /**
     * The rail's coloured link block: the four destinations that are not pages
     * of this site. The hosted viewer leads because a stranger watching their
     * own material render outperforms every chart on the site.
     *
     * The documentation link uses the version-agnostic alias, not a version
     * segment: the rail outlives release lines.
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
