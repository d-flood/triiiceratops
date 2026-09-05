<script lang="ts">
    import { setContext } from 'svelte';
    import MetadataPanel from './MetadataPanel.svelte';
    import { VIEWER_STATE_KEY } from '../state/viewer.svelte';

    let {
        manifest,
        manifestId,
        locale = 'en',
    }: {
        manifest: any;
        manifestId?: string;
        /** The viewer's active locale — the content locale the panel resolves in. */
        locale?: string;
    } = $props();

    // `manifestEntry` is the whole contract the panel reads: the raw IIIF
    // Manifest JSON the cache holds, v2 or v3 as authored.
    const viewerState = {
        config: {},
        showMetadataPanel: true,
        get activeLocale() {
            return locale;
        },
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
