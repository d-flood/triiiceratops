<script lang="ts">
    import { setContext, untrack } from 'svelte';
    import AnnotationPanel from './AnnotationPanel.svelte';
    import { VIEWER_STATE_KEY, type ViewerState } from '../state/viewer.svelte';

    // Destructured, like the other test hosts: a bare `$props()` identifier
    // makes Svelte assume custom-element props and warn.
    let { viewerState }: { viewerState: ViewerState } = $props();

    // The state object's identity never changes for the life of a test host, so
    // capturing it once is what the context contract wants — `untrack` says
    // that on purpose, rather than leaving a `state_referenced_locally` warning.
    setContext(
        VIEWER_STATE_KEY,
        untrack(() => viewerState),
    );
</script>

<AnnotationPanel />
