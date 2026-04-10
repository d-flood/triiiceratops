<script lang="ts">
    import { onMount } from 'svelte';
    import { SvelteMap, SvelteSet } from 'svelte/reactivity';
    import {
        DEFAULT_MIN_PIXEL_RATIO,
        DEFAULT_MIN_ZOOM_IMAGE_RATIO,
        MOBILE_DRAWER_FALLBACK,
        shouldUseMobileDrawerFallback,
    } from './osdDefaults';
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
        isFullCanvasTarget?: boolean;
        tooltip?: string;
    }) {
        return !anno.isFullCanvasTarget && !!anno.tooltip;
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
            y: Math.min(Math.max(event.clientY, 16), window.innerHeight - 16),
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
            } else if (!viewerState.visibleAnnotationIds.has(anno.id)) {
                continue;
            }

            if (anno.id === activeEditAnnotationId) {
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
                    id: anno.id,
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
                    id: anno.id,
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
                    id: anno.id,
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

                // Build position info for all sources
                const canvasOrder = new SvelteMap<string, number>();
                let nextCanvasOrder = 0;

                const allPositions = resolvedSources.map((source, index) => {
                    let x = 0;
                    let y = 0;
                    const canvasId = isPositionedSource(source)
                        ? source.canvasId
                        : `canvas-${index}`;
                    if (!canvasOrder.has(canvasId)) {
                        canvasOrder.set(canvasId, nextCanvasOrder++);
                    }
                    const canvasIndex = canvasOrder.get(canvasId) ?? index;
                    const localX = isPositionedSource(source) ? source.x : 0;
                    const localY = isPositionedSource(source) ? source.y : 0;
                    const localWidth = isPositionedSource(source)
                        ? source.width
                        : 1.0;
                    const actualTileSource = isPositionedSource(source)
                        ? source.tileSource
                        : source;

                    if (isVertical) {
                        const yPos = canvasIndex * (1 + MULTI_CANVAS_GAP);
                        y = (isBTT ? -yPos : yPos) + localY;
                        x = localX;
                    } else {
                        const xPos = canvasIndex * (1 + MULTI_CANVAS_GAP);
                        x = (isRTL ? -xPos : xPos) + localX;
                        y = localY;
                    }
                    return {
                        tileSource: actualTileSource,
                        x,
                        y,
                        width: localWidth,
                    };
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
                const offset = 1 + MULTI_CANVAS_GAP;
                const canvasIds = [
                    ...new Set(
                        resolvedSources.map((source, index) =>
                            isPositionedSource(source)
                                ? source.canvasId
                                : `canvas-${index}`,
                        ),
                    ),
                ];
                const canvasOffsets = new SvelteMap<string, number>();

                canvasIds.forEach((canvasId, index) => {
                    if (canvasIds.length === 1) {
                        canvasOffsets.set(canvasId, 0);
                        return;
                    }

                    if (index === 0) {
                        canvasOffsets.set(canvasId, isPagedRTL ? offset : 0);
                    } else {
                        canvasOffsets.set(canvasId, isPagedRTL ? 0 : offset);
                    }
                });

                const positioned = resolvedSources.map((source) =>
                    isPositionedSource(source)
                        ? {
                              tileSource: source.tileSource,
                              x:
                                  source.x +
                                  (canvasOffsets.get(source.canvasId) ?? 0),
                              y: source.y,
                              width: source.width,
                          }
                        : source,
                );

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
        const isBTT = direction === 'bottom-to-top';
        const isRTL =
            direction === 'right-to-left' || direction === 'bottom-to-top';

        const expectedPos = isVertical
            ? isBTT
                ? -(currentIndex * (1 + MULTI_CANVAS_GAP))
                : currentIndex * (1 + MULTI_CANVAS_GAP)
            : isRTL
              ? -(currentIndex * (1 + MULTI_CANVAS_GAP))
              : currentIndex * (1 + MULTI_CANVAS_GAP);

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
    class="w-full h-full relative"
    onpointermove={updateReadonlyTooltip}
    onpointerleave={clearReadonlyTooltip}
>
    <div
        bind:this={container}
        class="w-full h-full osd-background {viewerState.config
            .transparentBackground
            ? ''
            : 'bg-base-100'}"
    ></div>

    <!-- Render annotations -->
    {#each renderedAnnotations as anno (anno.id)}
        {#if !anno.isFullCanvasTarget || viewerState.hoveredAnnotationId === anno.id}
            {#if anno.type === 'RECTANGLE'}
                {#if isEditableOverlayAnnotation(anno)}
                    <button
                        type="button"
                        id="annotation-visual-{anno.id}"
                        class="absolute border-2 transition-colors cursor-pointer pointer-events-auto {shouldShowOverlayTooltip(
                            anno,
                        )
                            ? 'tooltip tooltip-primary '
                            : ''}{anno.isSearchHit
                            ? 'border-yellow-400 bg-yellow-400/40 hover:bg-yellow-400/60'
                            : 'border-red-500 bg-red-500/20 hover:bg-red-500/40'}"
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
                            requestAnnotationEdit(anno.id, event)}
                        onkeydown={(event) =>
                            handleAnnotationOverlayKeydown(anno.id, event)}
                    ></button>
                {:else}
                    <div
                        id="annotation-visual-{anno.id}"
                        class="absolute pointer-events-none"
                        style="
          left: {anno.rect.x}px;
          top: {anno.rect.y}px;
          width: {anno.rect.width}px;
          height: {anno.rect.height}px;
                 "
                    >
                        <div
                            class="pointer-events-none absolute inset-0 border-2 transition-colors {anno.isSearchHit
                                ? readonlyTooltip?.id === anno.id
                                    ? 'border-yellow-400 bg-yellow-400/60'
                                    : 'border-yellow-400 bg-yellow-400/40'
                                : readonlyTooltip?.id === anno.id
                                  ? 'border-red-500 bg-red-500/40'
                                  : 'border-red-500 bg-red-500/20'}"
                        ></div>
                    </div>
                {/if}
            {:else if anno.type === 'POLYGON'}
                {#if isEditableOverlayAnnotation(anno)}
                    <button
                        type="button"
                        class="absolute pointer-events-auto border-0 bg-transparent p-0 {shouldShowOverlayTooltip(
                            anno,
                        )
                            ? 'tooltip tooltip-primary'
                            : ''}"
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
                            requestAnnotationEdit(anno.id, event)}
                        onkeydown={(event) =>
                            handleAnnotationOverlayKeydown(anno.id, event)}
                    >
                        <svg class="absolute inset-0 h-full w-full">
                            <polygon
                                id="annotation-visual-{anno.id}"
                                points={anno.points
                                    .map((p: any) => p.join(','))
                                    .join(' ')}
                                class="cursor-pointer transition-colors {anno.isSearchHit
                                    ? 'fill-yellow-400/40 stroke-yellow-400 hover:fill-yellow-400/60'
                                    : 'fill-red-500/20 stroke-red-500 hover:fill-red-500/40'}"
                                stroke-width="2"
                            />
                        </svg>
                    </button>
                {:else}
                    <div
                        class="absolute pointer-events-none"
                        style="
          left: {anno.bounds.x}px;
          top: {anno.bounds.y}px;
          width: {anno.bounds.width}px;
          height: {anno.bounds.height}px;
        "
                    >
                        <svg
                            class="pointer-events-none absolute inset-0 h-full w-full"
                        >
                            <polygon
                                id="annotation-visual-{anno.id}"
                                points={anno.points
                                    .map((p: any) => p.join(','))
                                    .join(' ')}
                                class="transition-colors {anno.isSearchHit
                                    ? readonlyTooltip?.id === anno.id
                                        ? 'fill-yellow-400/60 stroke-yellow-400'
                                        : 'fill-yellow-400/40 stroke-yellow-400'
                                    : readonlyTooltip?.id === anno.id
                                      ? 'fill-red-500/40 stroke-red-500'
                                      : 'fill-red-500/20 stroke-red-500'}"
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
                        class="absolute rounded-full border-2 transition-colors cursor-pointer pointer-events-auto {shouldShowOverlayTooltip(
                            anno,
                        )
                            ? 'tooltip tooltip-primary '
                            : ''}{anno.isSearchHit
                            ? 'border-yellow-400 bg-yellow-400 hover:bg-yellow-400/80'
                            : 'border-red-500 bg-red-500 hover:bg-red-500/80'}"
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
                            requestAnnotationEdit(anno.id, event)}
                        onkeydown={(event) =>
                            handleAnnotationOverlayKeydown(anno.id, event)}
                    ></button>
                {:else}
                    <div
                        id="annotation-visual-{anno.id}"
                        class="absolute pointer-events-none"
                        style="
		  left: {anno.point.x - POINT_MARKER_SIZE / 2}px;
		  top: {anno.point.y - POINT_MARKER_SIZE / 2}px;
		  width: {POINT_MARKER_SIZE}px;
		  height: {POINT_MARKER_SIZE}px;
		"
                    >
                        <div
                            class="pointer-events-none absolute inset-0 rounded-full border-2 transition-colors {anno.isSearchHit
                                ? readonlyTooltip?.id === anno.id
                                    ? 'border-yellow-400 bg-yellow-400/80'
                                    : 'border-yellow-400 bg-yellow-400'
                                : readonlyTooltip?.id === anno.id
                                  ? 'border-red-500 bg-red-500/80'
                                  : 'border-red-500 bg-red-500'}"
                        ></div>
                    </div>
                {/if}
            {/if}
        {/if}
    {/each}

    {#if readonlyTooltip}
        <div
            class={[
                'tooltip tooltip-open tooltip-primary fixed z-50 pointer-events-none',
                readonlyTooltip.side === 'top' && 'tooltip-top',
                readonlyTooltip.side === 'bottom' && 'tooltip-bottom',
                readonlyTooltip.side === 'left' && 'tooltip-left',
                readonlyTooltip.side === 'right' && 'tooltip-right',
            ]}
            data-tip={readonlyTooltip.text}
            aria-hidden="true"
            style="left: {readonlyTooltip.x}px; top: {readonlyTooltip.y}px; width: 0; height: 0;"
        ></div>
    {/if}
</div>
