<script lang="ts">
    import { setContext, untrack } from 'svelte';
    import ViewerControls from './ViewerControls.svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';

    // A real `ViewerState`, so the bar is driven through the registry a claimant
    // actually registers against rather than a stand-in shaped like it.
    let { viewerState }: { viewerState: ViewerState } = $props();

    // The state object is fixed for a mount; `untrack` says so, since context is
    // set once at creation and cannot follow a changing prop anyway.
    setContext(
        VIEWER_STATE_KEY,
        untrack(() => viewerState),
    );
</script>

<ViewerControls />
