<script lang="ts">
    import { setContext } from 'svelte';
    import { ViewerState, VIEWER_STATE_KEY } from '../state/viewer.svelte';
    import OSDViewer from './OSDViewer.svelte';
    import CanvasNavigation from './CanvasNavigation.svelte';
    import AnnotationOverlay from './AnnotationOverlay.svelte';
    import ThumbnailGallery from './ThumbnailGallery.svelte';
    import FloatingMenu from './FloatingMenu.svelte';
    import MetadataDialog from './MetadataDialog.svelte';
    import SearchPanel from './SearchPanel.svelte';

    let { manifestId } = $props();

    // Create per-instance viewer state
    const viewerState = new ViewerState();
    setContext(VIEWER_STATE_KEY, viewerState);

    $effect(() => {
        if (manifestId) {
            viewerState.setManifest(manifestId);
        }
    });

    $effect(() => {
        const handleFullScreenChange = () => {
            viewerState.isFullScreen = !!document.fullscreenElement;
        };
        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => {
            document.removeEventListener(
                'fullscreenchange',
                handleFullScreenChange,
            );
        };
    });

    let manifestData = $derived(viewerState.manifest);
    let canvases = $derived(viewerState.canvases);
    let currentCanvasIndex = $derived(viewerState.currentCanvasIndex);

    let tileSources = $derived.by(() => {
        if (
            !canvases ||
            currentCanvasIndex === -1 ||
            !canvases[currentCanvasIndex]
        ) {
            if (!manifestData?.isFetching) {
                console.log('TriiiceratopsViewer: No canvas found');
            }
            return null;
        }

        const canvas = canvases[currentCanvasIndex];

        // Use Manifesto to get images
        let images = canvas.getImages();

        // Fallback for IIIF v3: iterate content if images is empty
        if ((!images || !images.length) && canvas.getContent) {
            images = canvas.getContent();
        }

        if (!images || !images.length) {
            // Check for raw v3 items
            if (canvas.__jsonld && canvas.__jsonld.items) {
                // Try to locate annotation pages -> annotations
            }
            if (!manifestData?.isFetching) {
                console.log('TriiiceratopsViewer: No images/content in canvas');
            }
            return null;
        }

        const annotation = images[0];
        let resource = annotation.getResource ? annotation.getResource() : null;

        // v3 fallback: getBody
        if (!resource && annotation.getBody) {
            const body = annotation.getBody();
            if (Array.isArray(body) && body.length > 0) resource = body[0];
            else if (body) resource = body;
        }

        // Check if resource is valid (Manifesto sometimes returns empty objects for v3 bodies)
        if (
            resource &&
            !resource.id &&
            !resource.__jsonld &&
            (!resource.getServices || resource.getServices().length === 0)
        ) {
            resource = null;
        }

        if (!resource) {
            // raw json fallback
            const json = annotation.__jsonld || annotation;
            if (json.body) {
                resource = Array.isArray(json.body) ? json.body[0] : json.body;
            }
        }

        if (!resource) {
            // console.log('TriiiceratopsViewer: No resource in annotation');
            return null;
        }

        // Helper to normalize ID
        const getId = (thing: any) => thing.id || thing['@id'];

        // Start of service detection logic
        let services = [];
        if (resource.getServices) {
            services = resource.getServices();
        }

        // Fallback: check raw json service
        if (!services.length) {
            const rJson = resource.__jsonld || resource;
            // console.log('Checking raw resource for services:', rJson);
            if (rJson.service) {
                services = Array.isArray(rJson.service)
                    ? rJson.service
                    : [rJson.service];
            }
        }

        // console.log('Found services:', services);

        if (services.length > 0) {
            // Find a valid image service
            const service = services.find((s: any) => {
                const type = s.getType ? s.getType() : s.type || '';
                const profile = s.getProfile ? s.getProfile() : s.profile || '';
                return (
                    type === 'ImageService1' ||
                    type === 'ImageService2' ||
                    type === 'ImageService3' ||
                    (typeof profile === 'string' &&
                        profile.includes('http://iiif.io/api/image')) ||
                    (typeof profile === 'string' && profile === 'level0')
                );
            });

            if (service) {
                let id = getId(service);
                if (id && !id.endsWith('/info.json')) {
                    id = `${id}/info.json`;
                }
                return id;
            }
        }

        // Fallback: Heuristic from Image ID (if it looks like IIIF)
        const resourceId = getId(resource);
        if (resourceId && resourceId.includes('/iiif/')) {
            // Try to strip standard IIIF parameters to find base
            // IIIF URLs often look like .../identifier/region/size/rotation/quality.format
            // We look for the part before the region (often 'full')
            const parts = resourceId.split('/');
            // find index of 'full' or region
            const regionIndex = parts.findIndex(
                (p: string) => p === 'full' || p.match(/^\d+,\d+,\d+,\d+$/),
            );
            if (regionIndex > 0) {
                const base = parts.slice(0, regionIndex).join('/');
                return `${base}/info.json`;
            }
        }

        console.log(
            'TriiiceratopsViewer: No service or ID found, returning raw URL',
        );
        const url = resourceId;
        return { type: 'image', url };
    });
</script>

<div
    id="triiiceratops-viewer"
    class="w-full h-full relative bg-base-100 flex items-center justify-center"
>
    {#if manifestData?.isFetching}
        <span class="loading loading-spinner loading-lg text-primary"></span>
    {:else if manifestData?.error}
        <div class="text-error">Error: {manifestData.error}</div>
    {:else if tileSources}
        {#key tileSources}
            <OSDViewer {tileSources} {viewerState} />
        {/key}
    {:else}
        <div class="text-base-content/50">No image found</div>
    {/if}

    {#if canvases.length > 1}
        <CanvasNavigation {viewerState} />
        <ThumbnailGallery {canvases} />
    {/if}

    <AnnotationOverlay />
    <MetadataDialog />
    <SearchPanel />
    <!-- Global Floating Menu -->
    <FloatingMenu />
</div>
