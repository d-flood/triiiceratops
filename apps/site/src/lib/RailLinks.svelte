<script lang="ts">
    import {
        BUILDER_PATH,
        DOCUMENTATION_PATH,
        HOSTED_VIEWER_PATH,
        REPOSITORY_URL,
    } from './site';

    /**
     * The rail's coloured link block: the four things a reader can do, as
     * opposed to the pages the rail's own list carries, which are the argument
     * the site makes.
     *
     * The hosted viewer leads because a stranger watching their own material
     * render outperforms every chart on the site, and the builder follows it
     * because making the viewer look like their own site is what that stranger
     * wants next. The builder is therefore in both this block and the list: the
     * list is a table of contents and this is a set of actions, and one page can
     * be an entry in each.
     *
     * The repository sits last and unpainted on purpose. It is the one
     * destination nobody has to be persuaded to find, so it takes the row that
     * persuades least.
     */
</script>

<div class="rail__out">
    <a class="viewer" href={HOSTED_VIEWER_PATH}
        >Try your own manifest <span aria-hidden="true">→</span></a
    >
    <a class="builder" href={BUILDER_PATH}>Build your viewer</a>
    <a class="docs" href={DOCUMENTATION_PATH}>Documentation</a>
    <a class="plain" href={REPOSITORY_URL}>Source on GitHub</a>
</div>
