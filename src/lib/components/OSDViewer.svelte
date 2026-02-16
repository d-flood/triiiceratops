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

    const IIIF_LEVEL0_V2_HTTPS = 'https://iiif.io/api/image/2/level0.json';
    const IIIF_LEVEL0_V2_HTTP = 'http://iiif.io/api/image/2/level0.json';

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
            patchIiifLevel0ProfileCompatibility(OSD);

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
                // Consumer-provided OSD overrides
                ...(viewerState.config?.openSeadragonConfig ?? {}),
                // Enable double-click to zoom, but keep clickToZoom disabled for Annotorious
                gestureSettingsMouse: {
                    clickToZoom: false,
                    dblClickToZoom: true,
                },
            });

            viewer.addHandler('open', () => {
                const overrides = viewerState.config?.openSeadragonConfig ?? {};
                if (overrides.minZoomLevel !== undefined) return;

                // Prevent zooming into the "no tiles rendered" range seen on
                // some level-0 services when zoomed far past home view.
                const homeZoom = viewer.viewport.getHomeZoom();
                viewer.viewport.minZoomLevel = homeZoom * 0.5;

                if (overrides.minPixelRatio === undefined) {
                    viewer.minPixelRatio = 0.5;
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

    function normalizeIiifLevel0Profile<T>(source: T): T {
        if (!source || typeof source !== 'object') return source;

        const obj = source as any;
        const profile = obj.profile;

        // Keep this minimal and conservative: OSD 5 misses the https v2 profile
        // variant in some paths, so normalize only that string form.
        if (typeof profile === 'string' && profile === IIIF_LEVEL0_V2_HTTPS) {
            obj.profile = IIIF_LEVEL0_V2_HTTP;
        } else if (Array.isArray(profile) && profile.length > 0) {
            const first = profile[0];
            if (typeof first === 'string' && first === IIIF_LEVEL0_V2_HTTPS) {
                obj.profile = [IIIF_LEVEL0_V2_HTTP, ...profile.slice(1)];
            }
        }

        return source;
    }

    function patchIiifLevel0ProfileCompatibility(osd: any) {
        if (
            !osd?.IIIFTileSource?.prototype ||
            osd.__triiiceratopsIiifLevel0Patched
        )
            return;

        const proto = osd.IIIFTileSource.prototype;
        const originalConfigure = proto.configure;
        if (typeof originalConfigure !== 'function') return;

        proto.configure = function (data: any, url: string, postData: any) {
            const configured = originalConfigure.call(this, data, url, postData);
            return normalizeIiifLevel0Profile(configured);
        };

        osd.__triiiceratopsIiifLevel0Patched = true;
    }

    // Pre-fetch info.json URLs to detect 401 auth errors before passing to OSD
    async function resolveTileSources(
        sources: any[],
    ): Promise<
        | { ok: true; resolved: any[] }
        | { ok: false; error: { type: 'auth' } }
    > {
        const resolved = await Promise.all(
            sources.map(async (source) => {
                // Only probe string sources (info.json URLs); preserve string tile
                // sources so OSD follows its normal source-loading path.
                if (typeof source !== 'string')
                    return normalizeIiifLevel0Profile(source);
                try {
                    const response = await fetch(source);
                    if (response.status === 401) {
                        return { __authError: true };
                    }
                    if (response.ok) {
                        try {
                            normalizeIiifLevel0Profile(await response.json());
                        } catch {
                            // Not JSON or malformed response; let OSD handle source URL.
                        }
                    }
                    return source;
                } catch {
                    // Network errors: pass through and let OSD handle it
                    return source;
                }
            }),
        );

        // Check if any source had an auth error
        if (resolved.some((r) => r && r.__authError)) {
            return { ok: false, error: { type: 'auth' } };
        }

        return { ok: true, resolved };
    }

    // Load tile source when it changes
    $effect(() => {
        if (!viewer || !tileSources) return;

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

        if (sources.length === 0) return;

        // Capture stateKey for staleness guard
        const capturedKey = stateKey;
        const overrides = viewerState.config?.openSeadragonConfig ?? {};

        if (mode === 'continuous') {
            // Continuous mode can include mixed-size canvases; keep tile culling
            // thresholds low so smaller images don't disappear before full-strip view.
            if (overrides.minPixelRatio === undefined) {
                viewer.minPixelRatio = 0.5;
            }
            if (overrides.minZoomImageRatio === undefined) {
                viewer.minZoomImageRatio = 0.1;
            }

            resolveTileSources(sources).then((result) => {
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
                            // In continuous mode, allow a bit beyond home zoom so
                            // strips centered near one end can still include all canvases.
                            if (overrides.minZoomLevel === undefined) {
                                viewer.viewport.minZoomLevel =
                                    viewer.viewport.getHomeZoom() * 0.5;
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
            viewer.minPixelRatio = 0.5;
        }
        if (overrides.minZoomImageRatio === undefined) {
            viewer.minZoomImageRatio = 0.9;
        }

        const immediateSources = sources.map((source) =>
            typeof source === 'string'
                ? source
                : normalizeIiifLevel0Profile(source),
        );

        // Open immediately for perceived responsiveness.
        if (mode === 'paged' && immediateSources.length === 2) {
            const gap = 0.025;
            const offset = 1 + gap;

            // Two pages.
            // If LTR: [0] at 0, [1] at 1.025
            // If RTL: [0] at 1.025, [1] at 0
            const firstX = isPagedRTL ? offset : 0;
            const secondX = isPagedRTL ? 0 : offset;

            const spread = [
                {
                    tileSource: immediateSources[0],
                    x: firstX,
                    y: 0,
                    width: 1.0,
                },
                {
                    tileSource: immediateSources[1],
                    x: secondX,
                    y: 0,
                    width: 1.0,
                },
            ];
            viewer.open(spread);
        } else {
            // Individuals or single paged or fallback
            viewer.open(
                immediateSources.length === 1
                    ? immediateSources[0]
                    : immediateSources,
            );
        }

        // Pre-fetch info.json URLs in the background to detect auth errors
        // without delaying image display.
        resolveTileSources(sources).then((result) => {
            // Staleness guard: if tile sources changed while we were fetching, discard
            if (capturedKey !== lastTileSourceStr) return;

            if (!result.ok) {
                viewerState.tileSourceError = result.error;
                // Clear stale tiles from the previous canvas
                viewer.close();
                return;
            }

            // Clear any previous error
            viewerState.tileSourceError = null;
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
