<script lang="ts">
    import { setContext } from 'svelte';
    import MetadataPanel from './MetadataPanel.svelte';
    import { VIEWER_STATE_KEY } from '../state/viewer.svelte';

    let {
        manifest,
        manifestId,
    }: {
        manifest: any;
        manifestId?: string;
    } = $props();

    // `manifestEntry` is the whole contract the panel reads: the raw IIIF
    // Manifest JSON the cache holds, v2 or v3 as authored. This used to hand
    // back a `manifesto.js`-shaped double carrying `getLabel`/`getDescription`/
    // `getRequiredStatement`/`getLicense`, which is the abstraction the
    // `remove-manifesto` epic removes (ticket 09).
    const viewerState = {
        config: {},
        showMetadataPanel: true,
        get manifestId() {
            return manifestId ?? manifest.id;
        },
        get manifestEntry() {
            return { json: manifest, isFetching: false };
        },
        toggleMetadataPanel() {},
    };

    setContext(VIEWER_STATE_KEY, viewerState);
</script>

<MetadataPanel />
