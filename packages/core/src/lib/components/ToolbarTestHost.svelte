<script lang="ts">
    import { setContext, untrack } from 'svelte';
    import Toolbar from './Toolbar.svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';

    // A real `ViewerState`, so every button's gate, label and pressed state is
    // read from the same object the viewer chrome reads.
    let { viewerState }: { viewerState: ViewerState } = $props();

    // The state object is fixed for a mount; `untrack` says so, since context is
    // set once at creation and cannot follow a changing prop anyway.
    setContext(
        VIEWER_STATE_KEY,
        untrack(() => viewerState),
    );
</script>

<Toolbar />
