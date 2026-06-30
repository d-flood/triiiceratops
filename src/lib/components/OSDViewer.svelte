<script lang="ts">
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import {
        DEFAULT_MIN_PIXEL_RATIO,
        DEFAULT_MIN_ZOOM_IMAGE_RATIO,
        MOBILE_DRAWER_FALLBACK,
        shouldUseMobileDrawerFallback,
    } from './osdDefaults';
    import {
        getCanvasDisplayLayouts,
        getContinuousTargetPosition,
        type CanvasDisplayLayout,
    } from './osdLayout';
    import { resolveTileSources } from './osdTileSources';
    import { parseAnnotations } from '../utils/annotationAdapter';
    import {
        canvasPointToImagePoint,
        canvasPointsToImagePoints,
        canvasRectToImageRect,
    } from '../utils/canvasImageSpace';
    import { resolveCanvasImage } from '../utils/resolveCanvasImage';
    import { manifestsState } from '../state/manifests.svelte';
    import type { ViewerState } from '../state/viewer.svelte';

    const REQUEST_EDIT_EVENT = 'triiiceratops:annotation-editor:request-edit';
    const ACTIVE_EDIT_ID_EVENT =
        'triiiceratops:annotation-editor:active-edit-id';

    let {
        tileSources,
        viewerState,
    }: { tileSources: string | object | null; viewerState: ViewerState } =
        $props();

    let container: HTMLElement | undefined = $state();
    let viewer: any | undefined = $state.raw();
    let OSD: any | undefined = $state();
    let activeEditAnnotationId = $state<string | null>(null);
    let continuousLayouts: CanvasDisplayLayout[] = $state.raw([]);
    let readonlyTooltip = $state<{
        id: string;
        text: string;
        x: number;
        y: number;
        side: 'top' | 'bottom' | 'left' | 'right';
    } | null>(null);

    const MULTI_CANVAS_GAP = 0.0125;
    const POINT_MARKER_SIZE = 10;

    type ViewerTileSourceError =
        | { type: 'auth' }
        | { type: 'load'; message?: string; details?: string };

    function setTileSourceError(error: ViewerTileSourceError | null) {
        (viewerState as any).tileSourceError = error;
    }

    function getErrorText(value: unknown): string | null {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (value instanceof Error && value.message.trim()) {
            return value.message.trim();
        }
        if (!value || typeof value !== 'object') return null;

        const record = value as Record<string, unknown>;
        for (const key of [
            'message',
            'detail',
            'statusText',
            'url',
            'src',
            '_id',
        ]) {
            const text = record[key];
            if (typeof text === 'string' && text.trim()) return text.trim();
        }

        return null;
    }

    function createLoadError(event: any): ViewerTileSourceError {
        const message =
            getErrorText(event?.message) || 'Unable to load this image.';
        const details =
            getErrorText(event?.detail) ||
            getErrorText(event?.source) ||
            getErrorText(event?.tileSource);

        return details && details !== message
            ? { type: 'load', message, details }
            : { type: 'load', message };
    }

    function handleAnnotationOverlayKeydown(
        annotationId: string,
        event: KeyboardEvent,
    ) {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        requestAnnotationEdit(annotationId, event);
    }

    function isEditableOverlayAnnotation(anno: { isSearchHit?: boolean }) {
        return annotationEditorOpen && !anno.isSearchHit;
    }

    function shouldShowOverlayTooltip(anno: {
        isSearchHit?: boolean;
        isFullCanvasTarget?: boolean;
        tooltip?: string;
    }) {
        return !anno.isSearchHit && !anno.isFullCanvasTarget && !!anno.tooltip;
    }

    function pointInPolygon(
        x: number,
        y: number,
        points: Array<[number, number]>,
    ) {
        let inside = false;

        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const [xi, yi] = points[i];
            const [xj, yj] = points[j];
            const intersects =
                yi > y !== yj > y &&
                x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

            if (intersects) {
                inside = !inside;
            }
        }

        return inside;
    }

    function annotationContainsPoint(anno: any, x: number, y: number) {
        if (anno.type === 'RECTANGLE') {
            return (
                x >= anno.rect.x &&
                x <= anno.rect.x + anno.rect.width &&
                y >= anno.rect.y &&
                y <= anno.rect.y + anno.rect.height
            );
        }

        if (anno.type === 'POINT') {
            const centerX = anno.point.x;
            const centerY = anno.point.y;
            const radius = POINT_MARKER_SIZE / 2;

            return (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2;
        }

        if (anno.type === 'POLYGON') {
            return pointInPolygon(
                x - anno.bounds.x,
                y - anno.bounds.y,
                anno.points,
            );
        }

        return false;
    }

    function getTooltipSide(clientX: number, clientY: number) {
        if (clientY < 72) return 'bottom';
        if (clientX > window.innerWidth - 160) return 'left';
        if (clientX < 160) return 'right';
        return 'top';
    }

    function updateReadonlyTooltip(event: PointerEvent) {
        if (!container) {
            readonlyTooltip = null;
            return;
        }

        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const hoveredAnnotation = [...renderedAnnotations]
            .reverse()
            .find(
                (anno) =>
                    !isEditableOverlayAnnotation(anno) &&
                    shouldShowOverlayTooltip(anno) &&
                    annotationContainsPoint(anno, x, y),
            );

        if (!hoveredAnnotation) {
            readonlyTooltip = null;
            return;
        }

        readonlyTooltip = {
            id: hoveredAnnotation.id,
            text: hoveredAnnotation.tooltip,
            x: Math.min(Math.max(event.clientX, 16), window.innerWidth - 16),
            y: Math.min(
                Math.max(event.clientY - 10, 16),
                window.innerHeight - 16,
            ),
            side: getTooltipSide(event.clientX, event.clientY),
        };
    }

    function clearReadonlyTooltip() {
        readonlyTooltip = null;
    }

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

    let annotationEditorOpen = $derived.by(() => {
        const editorPanel = viewerState.pluginPanels.find(
            (panel) => panel.id === 'annotation-editor:panel',
        );

        return editorPanel?.isVisible() ?? false;
    });

    let currentCanvasImageDimensions = $derived.by(() => {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return null;
        }

        const canvas = manifestsState
            .getCanvases(viewerState.manifestId)
            .find((entry: any) => {
                const id =
                    entry?.id ||
                    entry?.['@id'] ||
                    entry?.__jsonld?.id ||
                    entry?.__jsonld?.['@id'] ||
                    entry?.getCanvasId?.() ||
                    entry?.getId?.();
                return id === viewerState.canvasId;
            });

        const resolved = canvas ? resolveCanvasImage(canvas) : null;
        if (
            !resolved ||
            typeof resolved.resourceWidth !== 'number' ||
            typeof resolved.resourceHeight !== 'number'
        ) {
            return null;
        }

        return {
            canvasWidth: resolved.canvasWidth,
            canvasHeight: resolved.canvasHeight,
            imageWidth: resolved.resourceWidth,
            imageHeight: resolved.resourceHeight,
        };
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

        for (const anno of parsedAnnotations) {
            const geometry = anno.geometry as
                | typeof anno.geometry
                | { type: 'POINT'; x: number; y: number };

            // Filter based on visibility
            if (anno.isSearchHit) {
                // Search hits are always visible
            } else if (
                !viewerState.visibleAnnotationIds.has(anno.sourceAnnotationId)
            ) {
                continue;
            }

            if (anno.sourceAnnotationId === activeEditAnnotationId) {
                continue;
            }

            if (geometry.type === 'RECTANGLE') {
                const imageRect =
                    anno.coordinateSpace === 'canvas'
                        ? canvasRectToImageRect(
                              {
                                  x: geometry.x,
                                  y: geometry.y,
                                  width: geometry.w,
                                  height: geometry.h,
                              },
                              currentCanvasImageDimensions,
                          )
                        : {
                              x: geometry.x,
                              y: geometry.y,
                              width: geometry.w,
                              height: geometry.h,
                          };

                // Convert image coordinates to viewport coordinates
                const viewportRect = tiledImage.imageToViewportRectangle(
                    imageRect.x,
                    imageRect.y,
                    imageRect.width,
                    imageRect.height,
                );

                // Convert viewport to pixel coordinates
                const pixelRect =
                    viewer.viewport.viewportToViewerElementRectangle(
                        viewportRect,
                    );

                results.push({
                    id: anno.renderId,
                    annotationId: anno.sourceAnnotationId,
                    type: 'RECTANGLE' as const,
                    isFullCanvasTarget: anno.isFullCanvasTarget,
                    rect: {
                        x: pixelRect.x,
                        y: pixelRect.y,
                        width: pixelRect.width,
                        height: pixelRect.height,
                    },
                    isSearchHit: anno.isSearchHit,
                    tooltip: anno.body.map((b) => b.value).join(' '),
                });
            } else if (geometry.type === 'POLYGON') {
                // Convert each point from image to viewport to pixel
                const imagePoints =
                    anno.coordinateSpace === 'canvas'
                        ? canvasPointsToImagePoints(
                              geometry.points,
                              currentCanvasImageDimensions,
                          )
                        : geometry.points;

                const pixelPoints = imagePoints.map((point) => {
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
                    id: anno.renderId,
                    annotationId: anno.sourceAnnotationId,
                    type: 'POLYGON' as const,
                    isFullCanvasTarget: anno.isFullCanvasTarget,
                    bounds: {
                        x: minX,
                        y: minY,
                        width: maxX - minX,
                        height: maxY - minY,
                    },
                    points: relativePoints,
                    isSearchHit: anno.isSearchHit,
                    tooltip: anno.body.map((b) => b.value).join(' '),
                });
            } else if (geometry.type === 'POINT') {
                const imagePoint =
                    anno.coordinateSpace === 'canvas'
                        ? canvasPointToImagePoint(
                              { x: geometry.x, y: geometry.y },
                              currentCanvasImageDimensions,
                          )
                        : { x: geometry.x, y: geometry.y };
                const viewportPoint = tiledImage.imageToViewportCoordinates(
                    new OSD.Point(imagePoint.x, imagePoint.y),
                );
                const pixelPoint =
                    viewer.viewport.viewportToViewerElementCoordinates(
                        viewportPoint,
                    );

                results.push({
                    id: anno.renderId,
                    annotationId: anno.sourceAnnotationId,
                    type: 'POINT' as const,
                    isFullCanvasTarget: anno.isFullCanvasTarget,
                    point: {
                        x: pixelPoint.x,
                        y: pixelPoint.y,
                    },
                    isSearchHit: anno.isSearchHit,
                    tooltip: anno.body.map((b) => b.value).join(' '),
                });
            }
        }

        return results;
    });

    onMount(() => {
        if (!container) return;

        let mounted = true;

        const handleActiveEditAnnotation = (event: Event) => {
            activeEditAnnotationId =
                (event as CustomEvent<{ annotationId?: string | null }>).detail
                    ?.annotationId ?? null;
        };

        window.addEventListener(
            ACTIVE_EDIT_ID_EVENT,
            handleActiveEditAnnotation,
        );

        (async () => {
            // Dynamically import OpenSeadragon to avoid SSR issues
            const osdModule = await import('openseadragon');
            if (!mounted) return;

            OSD = osdModule.default || osdModule;
            const userAgent = navigator.userAgent || '';
            const consumerOverrides =
                viewerState.config?.openSeadragonConfig ?? {};

            // Prefer canvas first on mobile unless consumer overrides drawer.
            // This avoids known WebGL tile rendering issues on some devices.
            const defaultDrawer = shouldUseMobileDrawerFallback({
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
                tabIndex: '', // This prevents the focus outline from appearing
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

            const handleTileSourceFailure = (event: any) => {
                setTileSourceError(createLoadError(event));
                viewer?.close();
            };

            viewer.addHandler('open-failed', handleTileSourceFailure);
            viewer.addHandler('add-item-failed', handleTileSourceFailure);

            viewer.addHandler('open', () => {
                const overrides = viewerState.config?.openSeadragonConfig ?? {};
                if (overrides.minZoomLevel === undefined) {
                    // Keep a conservative floor below home zoom to avoid over-zoomed
                    // empty/unstable ranges while preserving normal navigation.
                    const homeZoom = viewer.viewport.getHomeZoom();
                    const floorFactor =
                        viewerState.viewingMode === 'continuous' ? 0.8 : 0.95;
                    viewer.viewport.minZoomLevel = homeZoom * floorFactor;
                }

                if (overrides.minPixelRatio === undefined) {
                    viewer.minPixelRatio = DEFAULT_MIN_PIXEL_RATIO;
                }

                const region = viewerState.initialCanvasRegion;
                const tiledImage = viewer.world.getItemAt(0);
                if (region && tiledImage) {
                    const imageRect = canvasRectToImageRect(
                        region,
                        currentCanvasImageDimensions,
                    );
                    const viewportRect = tiledImage.imageToViewportRectangle(
                        imageRect.x,
                        imageRect.y,
                        imageRect.width,
                        imageRect.height,
                    );
                    viewer.viewport.fitBounds(viewportRect, true);
                    viewerState.setInitialCanvasRegion(null);
                }
            });

            // Notify plugins that OSD is ready
            viewerState.notifyOSDReady(viewer);
        })();

        return () => {
            mounted = false;
            window.removeEventListener(
                ACTIVE_EDIT_ID_EVENT,
                handleActiveEditAnnotation,
            );
            viewer?.destroy();
            viewerState.osdViewer = null;
        };
    });

    function requestAnnotationEdit(
        annotationId: string,
        event: MouseEvent | KeyboardEvent,
    ) {
        const editorPanel = viewerState.pluginPanels.find(
            (p) => p.id === 'annotation-editor:panel',
        );

        if (!editorPanel?.isVisible()) {
            return;
        }

        event.stopPropagation();
        window.dispatchEvent(
            new CustomEvent(REQUEST_EDIT_EVENT, {
                detail: { annotationId },
            }),
        );
    }

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
            setTileSourceError(null);
            lastTileSourceStr = '';
            return;
        }

        const mode = viewerState.viewingMode;
        const direction = viewerState.viewingDirection;

        // Check if source or layout params actually changed to avoid resetting zoom
        // We include mode and direction in the key because they affect layout even if sources are same
        const stateKey = `${mode}:${direction}:${viewerState.preserveCanvasScale}:${JSON.stringify(tileSources)}`;
        if (stateKey === lastTileSourceStr) return;
        lastTileSourceStr = stateKey;

        const isPagedRTL = direction === 'right-to-left';

        // Normalize sources
        const sources = Array.isArray(tileSources)
            ? tileSources
            : tileSources
              ? [tileSources]
              : [];

        const isPositionedSource = (source: any) =>
            !!source && typeof source === 'object' && 'tileSource' in source;

        if (sources.length === 0) {
            viewer.close();
            setTileSourceError(null);
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
            setTileSourceError(null);

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
                    setTileSourceError(result.error);
                    viewer.close();
                    return;
                }

                setTileSourceError(null);
                const resolvedSources = result.resolved;

                const layoutResult = getCanvasDisplayLayouts(resolvedSources, {
                    mode,
                    direction,
                    preserveCanvasScale: viewerState.preserveCanvasScale,
                    gap: MULTI_CANVAS_GAP,
                });
                continuousLayouts = layoutResult.layouts;
                const allPositions = layoutResult.sources;

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
                        ...allPositions.slice(endIdx).map((pos, i) => ({
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
        setTileSourceError(null);

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
                setTileSourceError(result.error);
                viewer.close();
                return;
            }

            setTileSourceError(null);
            const resolvedSources = result.resolved;

            if (mode === 'paged') {
                const positioned = getCanvasDisplayLayouts(resolvedSources, {
                    mode,
                    direction: isPagedRTL ? 'right-to-left' : 'left-to-right',
                    preserveCanvasScale: viewerState.preserveCanvasScale,
                    gap: MULTI_CANVAS_GAP,
                }).sources;

                viewer.open(
                    positioned.length === 1 ? positioned[0] : positioned,
                );
            } else {
                const positioned = resolvedSources.map((source) =>
                    isPositionedSource(source)
                        ? {
                              tileSource: source.tileSource,
                              x: source.x,
                              y: source.y,
                              width: source.width,
                          }
                        : source,
                );

                viewer.open(
                    positioned.length === 1 ? positioned[0] : positioned,
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
        const expectedPos = getContinuousTargetPosition(
            currentIndex,
            continuousLayouts,
            direction,
        );
        if (expectedPos === null) return;

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

<div
    class="viewer-root"
    onpointermove={updateReadonlyTooltip}
    onpointerleave={clearReadonlyTooltip}
>
    <div
        bind:this={container}
        class="osd-surface osd-background"
        class:has-bg={!viewerState.config.transparentBackground}
    ></div>

    <!-- Render annotations -->
    {#each renderedAnnotations as anno (anno.id)}
        {#if !anno.isFullCanvasTarget || viewerState.hoveredAnnotationId === anno.annotationId}
            {#if anno.type === 'RECTANGLE'}
                {#if isEditableOverlayAnnotation(anno)}
                    <button
                        type="button"
                        id="annotation-visual-{anno.id}"
                        data-annotation-id={anno.annotationId}
                        class="anno-rect"
                        class:tooltip={shouldShowOverlayTooltip(anno)}
                        class:tooltip-primary={shouldShowOverlayTooltip(anno)}
                        class:search-hit={anno.isSearchHit}
                        data-tip={shouldShowOverlayTooltip(anno)
                            ? anno.tooltip
                            : undefined}
                        aria-label={anno.tooltip}
                        style="
          left: {anno.rect.x}px;
          top: {anno.rect.y}px;
          width: {anno.rect.width}px;
          height: {anno.rect.height}px;
                 "
                        onclick={(event) =>
                            requestAnnotationEdit(anno.annotationId, event)}
                        onkeydown={(event) =>
                            handleAnnotationOverlayKeydown(
                                anno.annotationId,
                                event,
                            )}
                    ></button>
                {:else}
                    <div
                        id="annotation-visual-{anno.id}"
                        data-annotation-id={anno.annotationId}
                        class="anno-readonly-wrap"
                        style="
          left: {anno.rect.x}px;
          top: {anno.rect.y}px;
          width: {anno.rect.width}px;
          height: {anno.rect.height}px;
                 "
                    >
                        <div
                            class="anno-rect-fill"
                            class:search-hit={anno.isSearchHit}
                            class:hovered={readonlyTooltip?.id === anno.id}
                        ></div>
                    </div>
                {/if}
            {:else if anno.type === 'POLYGON'}
                {#if isEditableOverlayAnnotation(anno)}
                    <button
                        type="button"
                        id="annotation-visual-{anno.id}"
                        data-annotation-id={anno.annotationId}
                        class="anno-polygon-btn"
                        class:tooltip={shouldShowOverlayTooltip(anno)}
                        class:tooltip-primary={shouldShowOverlayTooltip(anno)}
                        data-tip={shouldShowOverlayTooltip(anno)
                            ? anno.tooltip
                            : undefined}
                        aria-label={anno.tooltip}
                        style="
          left: {anno.bounds.x}px;
          top: {anno.bounds.y}px;
          width: {anno.bounds.width}px;
          height: {anno.bounds.height}px;
        "
                        onclick={(event) =>
                            requestAnnotationEdit(anno.annotationId, event)}
                        onkeydown={(event) =>
                            handleAnnotationOverlayKeydown(
                                anno.annotationId,
                                event,
                            )}
                    >
                        <svg class="anno-polygon-svg">
                            <polygon
                                points={anno.points
                                    .map((p: any) => p.join(','))
                                    .join(' ')}
                                class="anno-polygon-shape interactive"
                                class:search-hit={anno.isSearchHit}
                                stroke-width="2"
                            />
                        </svg>
                    </button>
                {:else}
                    <div
                        id="annotation-visual-{anno.id}"
                        data-annotation-id={anno.annotationId}
                        class="anno-readonly-wrap"
                        style="
          left: {anno.bounds.x}px;
          top: {anno.bounds.y}px;
          width: {anno.bounds.width}px;
          height: {anno.bounds.height}px;
        "
                    >
                        <svg class="anno-polygon-svg readonly">
                            <polygon
                                points={anno.points
                                    .map((p: any) => p.join(','))
                                    .join(' ')}
                                class="anno-polygon-shape"
                                class:search-hit={anno.isSearchHit}
                                class:hovered={readonlyTooltip?.id === anno.id}
                                stroke-width="2"
                            />
                        </svg>
                    </div>
                {/if}
            {:else if anno.type === 'POINT'}
                {#if isEditableOverlayAnnotation(anno)}
                    <button
                        type="button"
                        id="annotation-visual-{anno.id}"
                        data-annotation-id={anno.annotationId}
                        class="anno-point"
                        class:tooltip={shouldShowOverlayTooltip(anno)}
                        class:tooltip-primary={shouldShowOverlayTooltip(anno)}
                        class:search-hit={anno.isSearchHit}
                        data-tip={shouldShowOverlayTooltip(anno)
                            ? anno.tooltip
                            : undefined}
                        aria-label={anno.tooltip}
                        style="
		  left: {anno.point.x - POINT_MARKER_SIZE / 2}px;
		  top: {anno.point.y - POINT_MARKER_SIZE / 2}px;
		  width: {POINT_MARKER_SIZE}px;
		  height: {POINT_MARKER_SIZE}px;
		"
                        onclick={(event) =>
                            requestAnnotationEdit(anno.annotationId, event)}
                        onkeydown={(event) =>
                            handleAnnotationOverlayKeydown(
                                anno.annotationId,
                                event,
                            )}
                    ></button>
                {:else}
                    <div
                        id="annotation-visual-{anno.id}"
                        data-annotation-id={anno.annotationId}
                        class="anno-readonly-wrap"
                        style="
		  left: {anno.point.x - POINT_MARKER_SIZE / 2}px;
		  top: {anno.point.y - POINT_MARKER_SIZE / 2}px;
		  width: {POINT_MARKER_SIZE}px;
		  height: {POINT_MARKER_SIZE}px;
		"
                    >
                        <div
                            class="anno-point-fill"
                            class:search-hit={anno.isSearchHit}
                            class:hovered={readonlyTooltip?.id === anno.id}
                        ></div>
                    </div>
                {/if}
            {/if}
        {/if}
    {/each}

    {#if readonlyTooltip}
        <div
            class="tooltip tooltip-open tooltip-primary readonly-tooltip"
            class:place-top={readonlyTooltip.side === 'top'}
            class:place-bottom={readonlyTooltip.side === 'bottom'}
            class:place-left={readonlyTooltip.side === 'left'}
            class:place-right={readonlyTooltip.side === 'right'}
            data-tip={readonlyTooltip.text}
            aria-hidden="true"
            style="left: {readonlyTooltip.x}px; top: {readonlyTooltip.y}px; width: 0; height: 0;"
        ></div>
    {/if}
</div>

<style>
    /* Color tokens used by annotation overlays */
    .anno-rect,
    .anno-readonly-wrap,
    .anno-rect-fill,
    .anno-point,
    .anno-point-fill,
    .anno-polygon-shape {
        --anno-red: oklch(63.7% 0.237 25.331);
        --anno-yellow: oklch(85.2% 0.199 91.936);
    }

    .viewer-root {
        width: 100%;
        height: 100%;
        position: relative;
    }

    .osd-surface {
        width: 100%;
        height: 100%;
    }

    .osd-surface.has-bg {
        background-color: var(--viewer-bg);
    }

    /* Shared transition for annotation color changes (transition-colors) */
    .anno-rect,
    .anno-rect-fill,
    .anno-point,
    .anno-point-fill,
    .anno-polygon-shape {
        transition-property: color, background-color, border-color,
            text-decoration-color, fill, stroke;
        transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        transition-duration: 0.15s;
    }

    /* Editable rectangle overlay (a real <button>) */
    .anno-rect {
        position: absolute;
        border-width: 2px;
        border-style: solid;
        cursor: pointer;
        pointer-events: auto;
        border-color: var(--anno-red);
        background-color: color-mix(
            in oklab,
            var(--anno-red) 20%,
            transparent
        );
    }
    .anno-rect.search-hit {
        border-color: var(--anno-yellow);
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 40%,
            transparent
        );
    }
    .anno-rect:hover {
        background-color: color-mix(
            in oklab,
            var(--anno-red) 40%,
            transparent
        );
    }
    .anno-rect.search-hit:hover {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 60%,
            transparent
        );
    }

    /* Read-only overlay wrapper (positions the fill) */
    .anno-readonly-wrap {
        position: absolute;
        pointer-events: none;
    }

    /* Read-only rectangle fill */
    .anno-rect-fill {
        pointer-events: none;
        position: absolute;
        inset: 0;
        border-width: 2px;
        border-style: solid;
        border-color: var(--anno-red);
        background-color: color-mix(
            in oklab,
            var(--anno-red) 20%,
            transparent
        );
    }
    .anno-rect-fill.hovered {
        background-color: color-mix(
            in oklab,
            var(--anno-red) 40%,
            transparent
        );
    }
    .anno-rect-fill.search-hit {
        border-color: var(--anno-yellow);
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 40%,
            transparent
        );
    }
    .anno-rect-fill.search-hit.hovered {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 60%,
            transparent
        );
    }

    /* Editable polygon overlay (a real <button>) */
    .anno-polygon-btn {
        position: absolute;
        pointer-events: auto;
        border-width: 0;
        background-color: transparent;
        padding: 0;
    }

    .anno-polygon-svg {
        position: absolute;
        inset: 0;
        height: 100%;
        width: 100%;
    }
    .anno-polygon-svg.readonly {
        pointer-events: none;
    }

    .anno-polygon-shape {
        fill: color-mix(in oklab, var(--anno-red) 20%, transparent);
        stroke: var(--anno-red);
    }
    .anno-polygon-shape.search-hit {
        fill: color-mix(in oklab, var(--anno-yellow) 40%, transparent);
        stroke: var(--anno-yellow);
    }
    .anno-polygon-shape.hovered {
        fill: color-mix(in oklab, var(--anno-red) 40%, transparent);
    }
    .anno-polygon-shape.search-hit.hovered {
        fill: color-mix(in oklab, var(--anno-yellow) 60%, transparent);
    }
    .anno-polygon-shape.interactive {
        cursor: pointer;
    }
    .anno-polygon-shape.interactive:hover {
        fill: color-mix(in oklab, var(--anno-red) 40%, transparent);
    }
    .anno-polygon-shape.interactive.search-hit:hover {
        fill: color-mix(in oklab, var(--anno-yellow) 60%, transparent);
    }

    /* Editable point overlay (a real <button>) */
    .anno-point {
        position: absolute;
        border-radius: calc(infinity * 1px);
        border-width: 2px;
        border-style: solid;
        cursor: pointer;
        pointer-events: auto;
        border-color: var(--anno-red);
        background-color: var(--anno-red);
    }
    .anno-point.search-hit {
        border-color: var(--anno-yellow);
        background-color: var(--anno-yellow);
    }
    .anno-point:hover {
        background-color: color-mix(
            in oklab,
            var(--anno-red) 80%,
            transparent
        );
    }
    .anno-point.search-hit:hover {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 80%,
            transparent
        );
    }

    /* Read-only point fill */
    .anno-point-fill {
        pointer-events: none;
        position: absolute;
        inset: 0;
        border-radius: calc(infinity * 1px);
        border-width: 2px;
        border-style: solid;
        border-color: var(--anno-red);
        background-color: var(--anno-red);
    }
    .anno-point-fill.hovered {
        background-color: color-mix(
            in oklab,
            var(--anno-red) 80%,
            transparent
        );
    }
    .anno-point-fill.search-hit {
        border-color: var(--anno-yellow);
        background-color: var(--anno-yellow);
    }
    .anno-point-fill.search-hit.hovered {
        background-color: color-mix(
            in oklab,
            var(--anno-yellow) 80%,
            transparent
        );
    }

    /* Fixed read-only tooltip anchor */
    .readonly-tooltip {
        position: fixed;
        z-index: 50;
        pointer-events: none;
    }

    /* Tooltip styling (matches src/lib/components/ui/Tooltip.svelte) */
    .tooltip {
        --tt-bg: var(--color-neutral);
        --tt-fg: var(--color-neutral-content);
        --tt-off: calc(100% + 0.5rem);
        --tt-tail: calc(100% + 1px + 0.25rem);
        display: inline-block;
        position: relative;
    }

    .tooltip-primary {
        --tt-bg: var(--color-primary);
        --tt-fg: var(--color-primary-content);
    }

    .tooltip[data-tip]:not([data-tip=''])::before {
        border-radius: var(--radius-field);
        text-align: center;
        white-space: normal;
        max-width: 20rem;
        color: var(--tt-fg);
        opacity: 0;
        background-color: var(--tt-bg);
        pointer-events: none;
        z-index: 2;
        content: attr(data-tip);
        width: max-content;
        padding-block: 0.25rem;
        padding-inline: 0.5rem;
        font-size: 0.875rem;
        line-height: 1.25;
        position: absolute;
    }

    .tooltip[data-tip]:not([data-tip=''])::after {
        opacity: 0;
        background-color: var(--tt-bg);
        content: '';
        pointer-events: none;
        --mask-tooltip: url("data:image/svg+xml,%3Csvg width='10' height='4' viewBox='0 0 8 4' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0.500009 1C3.5 1 3.00001 4 5.00001 4C7 4 6.5 1 9.5 1C10 1 10 0.499897 10 0H0C-1.99338e-08 0.5 0 1 0.500009 1Z' fill='black'/%3E%3C/svg%3E%0A");
        width: 0.625rem;
        height: 0.25rem;
        mask-position: -1px 0;
        mask-repeat: no-repeat;
        mask-image: var(--mask-tooltip);
        display: block;
        position: absolute;
    }

    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]::before,
        .tooltip[data-tip]::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms,
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) 75ms;
        }
    }

    .tooltip[data-tip]:not([data-tip='']):hover::before,
    .tooltip[data-tip]:not([data-tip='']):hover::after,
    .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::before,
    .tooltip[data-tip]:not([data-tip='']):has(:global(:focus-visible))::after,
    .tooltip-open[data-tip]:not([data-tip=''])::before,
    .tooltip-open[data-tip]:not([data-tip=''])::after {
        opacity: 1;
        --tt-pos: 0rem;
    }
    @media (prefers-reduced-motion: no-preference) {
        .tooltip[data-tip]:not([data-tip='']):hover::before,
        .tooltip[data-tip]:not([data-tip='']):hover::after,
        .tooltip[data-tip]:not([data-tip='']):has(
                :global(:focus-visible)
            )::before,
        .tooltip[data-tip]:not([data-tip='']):has(
                :global(:focus-visible)
            )::after {
            transition:
                opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
                transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
    }

    /* Default placement is top (when no side specified) */
    .tooltip::before,
    .tooltip.place-top::before {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-off) 50%;
    }
    .tooltip::after,
    .tooltip.place-top::after {
        transform: translateX(-50%) translateY(var(--tt-pos, 0.25rem));
        inset: auto auto var(--tt-tail) 50%;
    }
    .tooltip.place-bottom::before {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem));
        inset: var(--tt-off) auto auto 50%;
    }
    .tooltip.place-bottom::after {
        transform: translateX(-50%) translateY(var(--tt-pos, -0.25rem))
            rotate(180deg);
        inset: var(--tt-tail) auto auto 50%;
    }
    .tooltip.place-left::before {
        transform: translateX(calc(var(--tt-pos, 0.25rem) - 0.25rem))
            translateY(-50%);
        inset: 50% var(--tt-off) auto auto;
    }
    .tooltip.place-left::after {
        transform: translateX(var(--tt-pos, 0.25rem)) translateY(-50%)
            rotate(-90deg);
        inset: 50% calc(var(--tt-tail) + 1px) auto auto;
    }
    .tooltip.place-right::before {
        transform: translateX(calc(var(--tt-pos, -0.25rem) + 0.25rem))
            translateY(-50%);
        inset: 50% auto auto var(--tt-off);
    }
    .tooltip.place-right::after {
        transform: translateX(var(--tt-pos, -0.25rem)) translateY(-50%)
            rotate(90deg);
        inset: 50% auto auto calc(var(--tt-tail) + 1px);
    }
</style>
