<script lang="ts">
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { parseAnnotations } from '../utils/annotationAdapter';
    import { manifestsState } from '../state/manifests.svelte';
    import type { ViewerState } from '../state/viewer.svelte';

    let {
        tileSources,
        viewerState,
    }: { tileSources: string | object | null; viewerState: ViewerState } =
        $props();

    let container: HTMLElement | undefined = $state();
    let viewer: any | undefined = $state.raw();
    let OSD: any | undefined = $state();

    // Track OSD state changes for reactivity
    let osdVersion = $state(0);

    // Get all annotations for current canvas (manifest + search)
    let allAnnotations = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return [];
        }
        const manifestAnnotations = manifestsState.getAnnotations(
            viewerState.manifestId,
            viewerState.canvasId,
        );
        const searchAnnotations = viewerState.currentCanvasSearchAnnotations;
        return [...manifestAnnotations, ...searchAnnotations];
    });

    // Get search hit IDs for styling
    let searchHitIds = $derived.by(() => {
        const ids = new SvelteSet<string>();
        viewerState.currentCanvasSearchAnnotations.forEach((anno: any) => {
            const id = anno.id || anno['@id'];
            if (id) ids.add(id);
        });
        return ids;
    });

    // Parse annotations
    let parsedAnnotations = $derived.by(() => {
        return parseAnnotations(allAnnotations, searchHitIds);
    });

    // Rendered annotations with pixel coordinates
    let renderedAnnotations = $derived.by(() => {
        // Depend on osdVersion to trigger updates
        void osdVersion;

        if (!viewer || !OSD || !parsedAnnotations.length) {
            return [];
        }

        const tiledImage = viewer.world.getItemAt(0);
        if (!tiledImage) {
            return [];
        }

        const results: any[] = [];

        // Check if annotation editor is open to prevent double rendering
        const editorPanel = viewerState.pluginPanels.find(
            (p) => p.id === 'annotation-editor:panel',
        );
        const isEditorOpen = editorPanel ? editorPanel.isVisible() : false;

        for (const anno of parsedAnnotations) {
            // Filter based on visibility
            if (anno.isSearchHit) {
                // Search hits are always visible
            } else if (!viewerState.showAnnotations) {
                continue;
            } else if (!viewerState.visibleAnnotationIds.has(anno.id)) {
                continue;
            }

            if (anno.geometry.type === 'RECTANGLE') {
                // Convert image coordinates to viewport coordinates
                const viewportRect = tiledImage.imageToViewportRectangle(
                    anno.geometry.x,
                    anno.geometry.y,
                    anno.geometry.w,
                    anno.geometry.h,
                );

                // Convert viewport to pixel coordinates
                const pixelRect =
                    viewer.viewport.viewportToViewerElementRectangle(
                        viewportRect,
                    );

                results.push({
                    id: anno.id,
                    type: 'RECTANGLE' as const,
                    rect: {
                        x: pixelRect.x,
                        y: pixelRect.y,
                        width: pixelRect.width,
                        height: pixelRect.height,
                    },
                    isSearchHit: anno.isSearchHit,
                    tooltip: anno.body.map((b) => b.value).join(' '),
                    // Disable pointer events if editor is open so blue annotations can be selected
                    pointerEvents: isEditorOpen ? 'none' : 'auto',
                });
            } else if (anno.geometry.type === 'POLYGON') {
                // Convert each point from image to viewport to pixel
                const pixelPoints = anno.geometry.points.map((point) => {
                    const viewportPoint = tiledImage.imageToViewportCoordinates(
                        new OSD.Point(point[0], point[1]),
                    );
                    const pixelPoint =
                        viewer.viewport.viewportToViewerElementCoordinates(
                            viewportPoint,
                        );
                    return [pixelPoint.x, pixelPoint.y];
                });

                // Calculate bounding box for SVG positioning
                let minX = Infinity,
                    minY = Infinity,
                    maxX = -Infinity,
                    maxY = -Infinity;
                for (const [x, y] of pixelPoints) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }

                // Adjust points relative to bounding box
                const relativePoints = pixelPoints.map(([x, y]) => [
                    x - minX,
                    y - minY,
                ]);

                results.push({
                    id: anno.id,
                    type: 'POLYGON' as const,
                    bounds: {
                        x: minX,
                        y: minY,
                        width: maxX - minX,
                        height: maxY - minY,
                    },
                    points: relativePoints,
                    isSearchHit: anno.isSearchHit,
                    tooltip: anno.body.map((b) => b.value).join(' '),
                    pointerEvents: isEditorOpen ? 'none' : 'auto',
                });
            }
        }

        return results;
    });

    onMount(() => {
        if (!container) return;

        let mounted = true;

        (async () => {
            // Dynamically import OpenSeadragon to avoid SSR issues
            const osdModule = await import('openseadragon');
            if (!mounted) return;

            OSD = osdModule.default || osdModule;

            // Initialize OpenSeadragon viewer
            viewer = OSD({
                element: container,
                tileSources: null, // Will be set via effect
                prefixUrl: '', // No navigation UI images needed
                showNavigationControl: false,
                showHomeControl: false,
                showFullPageControl: false,
                showSequenceControl: false,
                showZoomControl: false,
                showRotationControl: false,
                animationTime: 0.5,
                springStiffness: 7.0,
                zoomPerClick: 2.0,
                // Enable double-click to zoom, but keep clickToZoom disabled for Annotorious
                gestureSettingsMouse: {
                    clickToZoom: false,
                    dblClickToZoom: true,
                },
            });

            // Notify plugins that OSD is ready
            viewerState.notifyOSDReady(viewer);
        })();

        return () => {
            mounted = false;
            viewer?.destroy();
            viewerState.osdViewer = null;
        };
    });

    // Subscribe to OSD events for reactivity
    $effect(() => {
        if (!viewer) return;

        const update = () => {
            osdVersion++;
        };

        viewer.addHandler('open', update);
        viewer.addHandler('animation', update);
        viewer.addHandler('resize', update);
        viewer.addHandler('rotate', update);
        viewer.world.addHandler('add-item', update);
        viewer.world.addHandler('remove-item', update);

        return () => {
            viewer.removeHandler('open', update);
            viewer.removeHandler('animation', update);
            viewer.removeHandler('resize', update);
            viewer.removeHandler('rotate', update);
            viewer.world.removeHandler('add-item', update);
            viewer.world.removeHandler('remove-item', update);
        };
    });

    // Load tile source when it changes
    $effect(() => {
        if (!viewer || !tileSources) return;

        if (
            viewerState.twoPageMode &&
            tileSources instanceof Array &&
            tileSources.length === 2
        ) {
            const secondPageLocation = 1.025;
            const twoPageSpread = [
                {
                    tileSource: tileSources[0],
                    x: 0,
                    y: 0,
                    width: 1.0,
                },
                {
                    tileSource: tileSources[1],
                    x: secondPageLocation, // small gap between pages
                    y: 0,
                    width: 1.0,
                },
            ];
            viewer.open(twoPageSpread);
        } else {
            viewer.open(tileSources);
        }
    });
</script>

<div class="w-full h-full relative">
    <div
        bind:this={container}
        class="w-full h-full osd-background {viewerState.config
            .transparentBackground
            ? ''
            : 'bg-base-100'}"
    ></div>

    <!-- Render annotations -->
    {#each renderedAnnotations as anno (anno.id)}
        {#if anno.type === 'RECTANGLE'}
            <div
                id="annotation-visual-{anno.id}"
                class="absolute border-2 transition-colors cursor-pointer pointer-events-auto {anno.isSearchHit
                    ? 'border-yellow-400 bg-yellow-400/40 hover:bg-yellow-400/60'
                    : 'border-red-500 bg-red-500/20 hover:bg-red-500/40'}"
                style="
          left: {anno.rect.x}px;
          top: {anno.rect.y}px;
          width: {anno.rect.width}px;
          height: {anno.rect.height}px;
          pointer-events: {anno.pointerEvents};
        "
                title={anno.tooltip}
            ></div>
        {:else if anno.type === 'POLYGON'}
            <svg
                class="absolute pointer-events-auto"
                style="
          left: {anno.bounds.x}px;
          top: {anno.bounds.y}px;
          width: {anno.bounds.width}px;
          height: {anno.bounds.height}px;
          pointer-events: {anno.pointerEvents};
        "
            >
                <title>{anno.tooltip}</title>
                <polygon
                    id="annotation-visual-{anno.id}"
                    points={anno.points.map((p: any) => p.join(',')).join(' ')}
                    class="cursor-pointer transition-colors {anno.isSearchHit
                        ? 'fill-yellow-400/40 stroke-yellow-400 hover:fill-yellow-400/60'
                        : 'fill-red-500/20 stroke-red-500 hover:fill-red-500/40'}"
                    stroke-width="2"
                />
            </svg>
        {/if}
    {/each}
</div>
