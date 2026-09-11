<script lang="ts">
    import {
        BUILDER_PATH,
        DOCUMENTATION_PATH,
        HOSTED_VIEWER_PATH,
        REPOSITORY_URL,
    } from './site';

    // Tools and resources stay directly reachable below the numbered introduction.
</script>

<div class="rail__out">
    <a class="viewer" href={HOSTED_VIEWER_PATH}
        >Try your own manifest <span aria-hidden="true">→</span></a
    >
    <a class="builder" href={BUILDER_PATH}>Build your viewer</a>
    <a class="docs" href={DOCUMENTATION_PATH}>Documentation</a>
    <a class="plain" href={REPOSITORY_URL}>Source on GitHub</a>
</div>
