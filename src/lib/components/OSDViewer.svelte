<script lang="ts">
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import {
        DEFAULT_MIN_PIXEL_RATIO,
        DEFAULT_MIN_ZOOM_IMAGE_RATIO,
        MOBILE_DRAWER_FALLBACK,
        shouldUseMobileDrawerFallback,
    } from './osdDefaults';
    import { resolveTileSources } from './osdTileSources';
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
    // Track last opened tile source to prevent unnecessary resets
    let lastTileSourceStr = '';

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
            const userAgent = navigator.userAgent || '';
            const consumerOverrides = viewerState.config?.openSeadragonConfig ?? {};

            // Prefer canvas first on mobile unless consumer overrides drawer.
            // This avoids known WebGL tile rendering issues on some devices.
            const defaultDrawer =
                shouldUseMobileDrawerFallback({
                    userAgent,
                    drawerOverride: consumerOverrides.drawer,
                })
                    ? { drawer: [...MOBILE_DRAWER_FALLBACK] }
                    : {};

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
                ...defaultDrawer,
                // Consumer-provided OSD overrides
                ...consumerOverrides,
                // Enable double-click to zoom, but keep clickToZoom disabled for Annotorious
                gestureSettingsMouse: {
                    clickToZoom: false,
                    dblClickToZoom: true,
                },
            });

            viewer.addHandler('open', () => {
                const overrides = viewerState.config?.openSeadragonConfig ?? {};
                if (overrides.minZoomLevel !== undefined) return;

                // Keep a conservative floor below home zoom to avoid over-zoomed
                // empty/unstable ranges while preserving normal navigation.
                const homeZoom = viewer.viewport.getHomeZoom();
                const floorFactor =
                    viewerState.viewingMode === 'continuous' ? 0.8 : 0.95;
                viewer.viewport.minZoomLevel = homeZoom * floorFactor;

                if (overrides.minPixelRatio === undefined) {
                    viewer.minPixelRatio = DEFAULT_MIN_PIXEL_RATIO;
                }
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

    // Apply consumer OSD config overrides reactively
    $effect(() => {
        if (!viewer) return;
        const overrides = viewerState.config?.openSeadragonConfig;
        if (!overrides) return;
        for (const [key, value] of Object.entries(overrides)) {
            viewer[key] = value;
        }
    });

    // Load tile source when it changes
    $effect(() => {
        if (!viewer) return;

        // If sources are cleared/absent during a canvas/world switch, clear
        // stale tiles immediately and allow the same source to reopen later.
        if (!tileSources) {
            viewer.close();
            viewerState.tileSourceError = null;
            lastTileSourceStr = '';
            return;
        }

        const mode = viewerState.viewingMode;
        const direction = viewerState.viewingDirection;

        // Check if source or layout params actually changed to avoid resetting zoom
        // We include mode and direction in the key because they affect layout even if sources are same
        const stateKey = `${mode}:${direction}:${JSON.stringify(tileSources)}`;
        if (stateKey === lastTileSourceStr) return;
        lastTileSourceStr = stateKey;

        const isRTL =
            direction === 'right-to-left' || direction === 'bottom-to-top'; // Treat BTT as reversed flow?
        // Actually usually BTT is vertical reversed.
        // For RTL logic in Paged (Side-by-Side), only 'right-to-left' matters.
        const isPagedRTL = direction === 'right-to-left';

        const isVertical =
            direction === 'top-to-bottom' || direction === 'bottom-to-top';
        const isBTT = direction === 'bottom-to-top';

        // Normalize sources
        const sources = Array.isArray(tileSources)
            ? tileSources
            : tileSources
              ? [tileSources]
              : [];

        if (sources.length === 0) {
            viewer.close();
            viewerState.tileSourceError = null;
            lastTileSourceStr = '';
            return;
        }

        // Capture stateKey for staleness guard
        const capturedKey = stateKey;
        const overrides = viewerState.config?.openSeadragonConfig ?? {};

        if (mode === 'continuous') {
            // Remove current world immediately so stale canvases are not shown
            // while async source resolution is in progress.
            viewer.close();
            viewerState.tileSourceError = null;

            if (overrides.minPixelRatio === undefined) {
                viewer.minPixelRatio = DEFAULT_MIN_PIXEL_RATIO;
            }
            if (overrides.minZoomImageRatio === undefined) {
                viewer.minZoomImageRatio = DEFAULT_MIN_ZOOM_IMAGE_RATIO;
            }

            resolveTileSources({
                sources,
                osd: OSD,
                viewport: {
                    width: container?.clientWidth ?? 0,
                    height: container?.clientHeight ?? 0,
                },
            }).then((result) => {
                // Staleness guard: if tile sources changed while we were fetching, discard
                if (capturedKey !== lastTileSourceStr) return;

                if (!result.ok) {
                    viewerState.tileSourceError = result.error;
                    viewer.close();
                    return;
                }

                viewerState.tileSourceError = null;
                const resolvedSources = result.resolved;

                const gap = 0.025;

                // Build position info for all sources
                const allPositions = resolvedSources.map((source, index) => {
                    let x = 0;
                    let y = 0;
                    if (isVertical) {
                        const yPos = index * (1 + gap);
                        y = isBTT ? -yPos : yPos;
                    } else {
                        const xPos = index * (1 + gap);
                        x = isRTL ? -xPos : xPos;
                    }
                    return { tileSource: source, x, y, width: 1.0 };
                });

                // Only open a window of canvases around the active one for fast initial load.
                // The rest are added progressively after the viewer opens.
                const INITIAL_WINDOW = 3; // canvases on each side of current
                const currentIndex = viewerState.currentCanvasIndex;
                const startIdx = Math.max(0, currentIndex - INITIAL_WINDOW);
                const endIdx = Math.min(
                    allPositions.length,
                    currentIndex + INITIAL_WINDOW + 1,
                );

                const initialSpread = allPositions.slice(startIdx, endIdx);
                viewer.open(initialSpread);

                viewer.addOnceHandler('open', () => {
                    // Zoom to the active canvas
                    const itemIdx = currentIndex - startIdx;
                    const item = viewer.world.getItemAt(itemIdx);
                    if (item) {
                        viewer.viewport.fitBounds(item.getBounds(), true);
                    }

                    // Progressively add remaining canvases in batches
                    const remaining = [
                        ...allPositions
                            .slice(0, startIdx)
                            .map((pos, i) => ({ ...pos, originalIndex: i })),
                        ...allPositions
                            .slice(endIdx)
                            .map((pos, i) => ({
                                ...pos,
                                originalIndex: endIdx + i,
                            })),
                    ];

                    const BATCH_SIZE = 5;
                    let batchIdx = 0;

                    function addNextBatch() {
                        // Staleness guard
                        if (capturedKey !== lastTileSourceStr) return;

                        const batch = remaining.slice(
                            batchIdx * BATCH_SIZE,
                            (batchIdx + 1) * BATCH_SIZE,
                        );
                        if (batch.length === 0) {
                            // Keep a modest margin below home zoom in continuous
                            // mode to reduce empty over-zoom edge cases.
                            if (overrides.minZoomLevel === undefined) {
                                viewer.viewport.minZoomLevel =
                                    viewer.viewport.getHomeZoom() * 0.8;
                            }
                            return;
                        }

                        for (const pos of batch) {
                            viewer.addTiledImage({
                                tileSource: pos.tileSource,
                                x: pos.x,
                                y: pos.y,
                                width: pos.width,
                            });
                        }
                        batchIdx++;
                        setTimeout(addNextBatch, 100);
                    }

                    // Start adding remaining canvases after a short delay
                    setTimeout(addNextBatch, 200);
                });
            });

            return;
        }

        // In paged/individual modes, clear the current image immediately so
        // users don't see stale content while tile sources are being prepared.
        viewer.close();
        viewerState.tileSourceError = null;

        // Restore less aggressive defaults outside continuous mode unless user-overridden.
        if (overrides.minPixelRatio === undefined) {
            viewer.minPixelRatio = DEFAULT_MIN_PIXEL_RATIO;
        }
        if (overrides.minZoomImageRatio === undefined) {
            viewer.minZoomImageRatio = DEFAULT_MIN_ZOOM_IMAGE_RATIO;
        }

        resolveTileSources({
            sources,
            osd: OSD,
            viewport: {
                width: container?.clientWidth ?? 0,
                height: container?.clientHeight ?? 0,
            },
        }).then((result) => {
            // Staleness guard: if tile sources changed while we were fetching, discard
            if (capturedKey !== lastTileSourceStr) return;

            if (!result.ok) {
                viewerState.tileSourceError = result.error;
                viewer.close();
                return;
            }

            viewerState.tileSourceError = null;
            const resolvedSources = result.resolved;

            if (mode === 'paged' && resolvedSources.length === 2) {
                const gap = 0.025;
                const offset = 1 + gap;

                // Two pages.
                // If LTR: [0] at 0, [1] at 1.025
                // If RTL: [0] at 1.025, [1] at 0
                const firstX = isPagedRTL ? offset : 0;
                const secondX = isPagedRTL ? 0 : offset;

                const spread = [
                    {
                        tileSource: resolvedSources[0],
                        x: firstX,
                        y: 0,
                        width: 1.0,
                    },
                    {
                        tileSource: resolvedSources[1],
                        x: secondX,
                        y: 0,
                        width: 1.0,
                    },
                ];
                viewer.open(spread);
            } else {
                // Individuals or single paged or fallback
                viewer.open(
                    resolvedSources.length === 1
                        ? resolvedSources[0]
                        : resolvedSources,
                );
            }
        });
    });

    // Handle navigation in continuous mode
    $effect(() => {
        // Only run if viewer is ready, mode is continuous, and we have canvases
        if (
            !viewer ||
            viewerState.viewingMode !== 'continuous' ||
            !viewerState.canvases.length
        )
            return;

        // Depend on currentCanvasIndex
        const currentIndex = viewerState.currentCanvasIndex;

        // Calculate the expected position for this canvas index.
        // Items may be added out of order due to progressive loading,
        // so we find the item by its position rather than world index.
        const direction = viewerState.viewingDirection;
        const isVertical =
            direction === 'top-to-bottom' || direction === 'bottom-to-top';
        const isBTT = direction === 'bottom-to-top';
        const isRTL =
            direction === 'right-to-left' || direction === 'bottom-to-top';
        const gap = 0.025;

        const expectedPos = isVertical
            ? isBTT
                ? -(currentIndex * (1 + gap))
                : currentIndex * (1 + gap)
            : isRTL
              ? -(currentIndex * (1 + gap))
              : currentIndex * (1 + gap);

        // Find the world item at the expected position
        const itemCount = viewer.world.getItemCount();
        let matchedItem = null;
        for (let i = 0; i < itemCount; i++) {
            const item = viewer.world.getItemAt(i);
            const bounds = item.getBounds();
            const pos = isVertical ? bounds.y : bounds.x;
            if (Math.abs(pos - expectedPos) < 0.01) {
                matchedItem = item;
                break;
            }
        }

        if (matchedItem) {
            viewer.viewport.fitBounds(matchedItem.getBounds());
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
