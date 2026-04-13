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

    const viewerState = {
        config: {},
        showMetadataPanel: true,
        get manifestId() {
            return manifestId ?? manifest.id;
        },
        get manifest() {
            return {
                __jsonld: manifest,
                getLabel: () => manifest.label,
                getDescription: () => '',
                getRequiredStatement: () => null,
                getLicense: () => '',
            };
        },
        toggleMetadataPanel() {},
    };

    setContext(VIEWER_STATE_KEY, viewerState);
</script>

<MetadataPanel />
