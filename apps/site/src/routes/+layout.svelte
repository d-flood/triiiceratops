<script lang="ts">
    import '../app.css';

    /**
     * The root layout carries the stylesheet and nothing else.
     *
     * Two kinds of route hang off it. The prose routes are wrapped in the
     * marketing chrome — the rail, the mobile sheet, the footer — which is the
     * `(chrome)` group's layout. `/demo/` and `/viewer/` are applications that
     * fill the window and draw their own chrome, so they sit outside that group
     * and share only the stylesheet, the theme and the type.
     */

    let { children } = $props();
</script>

{@render children()}
