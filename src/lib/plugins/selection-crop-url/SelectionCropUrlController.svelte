<script lang="ts">
    import { getContext, onDestroy } from 'svelte';
    import Check from 'phosphor-svelte/lib/Check';
    import Copy from 'phosphor-svelte/lib/Copy';
    import Crosshair from 'phosphor-svelte/lib/Crosshair';

    import { manifestsState } from '../../state/manifests.svelte';
    import {
        VIEWER_STATE_KEY,
        type ViewerState,
    } from '../../state/viewer.svelte';
    import {
        resolveCanvasImage,
        type ResolvedCanvasImage,
    } from '../../utils/resolveCanvasImage';

    import {
        buildSelectionCropUrl,
        type SelectionCropUrlResult,
        type SelectionRect,
    } from './selectionCropUrl';

    type Point = {
        x: number;
        y: number;
    };

    type DragState = {
        startPoint: Point;
        currentPoint: Point;
        startImagePoint: Point;
        targetItem: any;
    };

    type SelectionContext = {
        serviceId: string | null;
        serviceProfile: string | null;
        tileSource: any | null;
        baseRegion: SelectionRect | null;
        fallbackImageUrl: string | null;
    };

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    const infoTileSourceCache = new Map<string, Promise<any | null>>();

    let copied = $state(false);
    let selecting = $state(false);
    let dragState = $state<DragState | null>(null);
    let result = $state<SelectionCropUrlResult | null>(null);
    let feedbackMessage = $state('');
    let errorMessage = $state('');
    let overlayElement: HTMLDivElement | null = $state.raw(null);
    let copyResetTimer: ReturnType<typeof setTimeout> | null = $state.raw(null);
    let lastCanvasId = $state(viewerState.canvasId);

    let currentCanvas = $derived.by(() => {
        if (viewerState.currentCanvasIndex < 0) {
            return null;
        }

        return viewerState.canvases[viewerState.currentCanvasIndex] ?? null;
    });

    let currentResolvedImage = $derived<ResolvedCanvasImage | null>(
        currentCanvas ? resolveCanvasImage(currentCanvas) : null,
    );

    let canSelect = $derived(
        !!viewerState.osdViewer && !!viewerState.manifestId && !!viewerState.canvasId,
    );

    let selectionPreview = $derived.by(() => {
        if (!dragState) {
            return null;
        }

        const x = Math.min(dragState.startPoint.x, dragState.currentPoint.x);
        const y = Math.min(dragState.startPoint.y, dragState.currentPoint.y);
        const width = Math.abs(dragState.currentPoint.x - dragState.startPoint.x);
        const height = Math.abs(dragState.currentPoint.y - dragState.startPoint.y);

        if (width < 1 || height < 1) {
            return null;
        }

        return { x, y, width, height };
    });

    let resultTitle = $derived.by(() => {
        if (!result) {
            return '';
        }

        if (result.mode === 'iiif-crop') {
            return 'Exact crop URL';
        }

        if (result.mode === 'level0-tile') {
            return 'Level 0 tile fallback';
        }

        if (result.mode === 'full-image') {
            return 'Full image fallback';
        }

        return 'Selection URL';
    });

    let resultDescription = $derived.by(() => {
        if (!result) {
            return '';
        }

        if (result.mode === 'iiif-crop') {
            return 'The copied URL requests the exact selected rectangle.';
        }

        if (result.mode === 'level0-tile') {
            const levelText =
                result.tileLevel !== null &&
                result.tileX !== null &&
                result.tileY !== null
                    ? `Tile level ${result.tileLevel}, column ${result.tileX}, row ${result.tileY}.`
                    : 'A containing tile was used.';

            return `This image service is level 0, so the copied URL uses the deepest single tile that still contains the selection. ${levelText}`;
        }

        if (result.mode === 'full-image') {
            return 'No tile metadata was available, so the copied URL falls back to the full image.';
        }

        return 'Unable to generate a URL for the current selection.';
    });

    function clearCopyResetTimer() {
        if (copyResetTimer) {
            clearTimeout(copyResetTimer);
            copyResetTimer = null;
        }
    }

    function setCopied(nextValue: boolean) {
        copied = nextValue;
        clearCopyResetTimer();

        if (nextValue) {
            copyResetTimer = setTimeout(() => {
                copied = false;
                copyResetTimer = null;
            }, 2000);
        }
    }

    function setSelectionMode(nextValue: boolean) {
        selecting = nextValue;
        dragState = null;

        if (nextValue) {
            feedbackMessage = 'Drag on the image to draw a crop box.';
            errorMessage = '';
        } else if (!result?.url) {
            feedbackMessage = '';
        }
    }

    function extractPoint(point: any): Point {
        return {
            x: Number(point?.x ?? 0),
            y: Number(point?.y ?? 0),
        };
    }

    function getCurrentCanvas(): any | null {
        if (!viewerState.manifestId || !viewerState.canvasId) {
            return null;
        }

        return manifestsState
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
            }) ?? null;
    }

    function getItemAtPoint(position: Point): any | null {
        const viewer = viewerState.osdViewer;
        if (!viewer?.viewport || !viewer?.world) {
            return null;
        }

        const viewportPoint = viewer.viewport.viewerElementToViewportCoordinates(
            position,
        );

        for (let index = viewer.world.getItemCount() - 1; index >= 0; index--) {
            const item = viewer.world.getItemAt(index);
            if (item?.getBounds?.().containsPoint?.(viewportPoint)) {
                return item;
            }
        }

        return null;
    }

    function toImagePoint(item: any, position: Point): Point {
        const viewer = viewerState.osdViewer;
        const viewportPoint = viewer.viewport.viewerElementToViewportCoordinates(
            position,
        );
        return extractPoint(item.viewportToImageCoordinates(viewportPoint));
    }

    function buildSelectionRect(start: Point, end: Point): SelectionRect | null {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const width = Math.abs(end.x - start.x);
        const height = Math.abs(end.y - start.y);

        if (width < 1 || height < 1) {
            return null;
        }

        return { x, y, width, height };
    }

    function extractSourceUrl(source: any): string | null {
        if (!source || typeof source !== 'object') {
            return null;
        }

        if (typeof source.url === 'string' && source.url) {
            return source.url;
        }

        if (typeof source['@id'] === 'string' && source['@id']) {
            return source['@id'];
        }

        if (typeof source.id === 'string' && source.id) {
            return source.id;
        }

        return null;
    }

    function normalizeServiceId(serviceId: string | null | undefined) {
        if (!serviceId) {
            return null;
        }

        return serviceId.endsWith('/info.json')
            ? serviceId.slice(0, -'/info.json'.length)
            : serviceId;
    }

    async function loadIiifTileSource(serviceId: string): Promise<any | null> {
        const normalizedId = normalizeServiceId(serviceId);
        if (!normalizedId) {
            return null;
        }

        const cached = infoTileSourceCache.get(normalizedId);
        if (cached) {
            return cached;
        }

        const loadPromise = (async () => {
            const response = await fetch(`${normalizedId}/info.json`);
            if (!response.ok) {
                return null;
            }

            const infoJson = await response.json();
            const osdModule = await import('openseadragon');
            const OSD = (osdModule.default || osdModule) as any;
            if (!OSD?.IIIFTileSource?.prototype) {
                return null;
            }

            const configured = OSD.IIIFTileSource.prototype.configure.call(
                {},
                infoJson,
                `${normalizedId}/info.json`,
                null,
            );

            return new OSD.IIIFTileSource(configured);
        })().catch(() => null);

        infoTileSourceCache.set(normalizedId, loadPromise);
        return loadPromise;
    }

    async function resolveSelectionContext(targetItem: any): Promise<SelectionContext> {
        const source = targetItem?.source ?? null;
        const sourceServiceId = normalizeServiceId(source?._id || source?.id || null);

        if (sourceServiceId || source?.profile) {
            return {
                serviceId: sourceServiceId,
                serviceProfile: source?.profile ?? null,
                tileSource: source,
                baseRegion: null,
                fallbackImageUrl: extractSourceUrl(source),
            };
        }

        const currentCanvas = getCurrentCanvas();
        const resolved = currentCanvas ? resolveCanvasImage(currentCanvas) : null;
        const visibleCurrentItem = viewerState.osdViewer?.world?.getItemAt?.(0) ?? null;

        if (resolved && visibleCurrentItem === targetItem) {
            const tileSource = resolved.serviceId
                ? await loadIiifTileSource(resolved.serviceId)
                : null;

            return {
                serviceId: resolved.serviceId,
                serviceProfile: resolved.serviceProfile,
                tileSource,
                baseRegion: resolved.imageApiRegion,
                fallbackImageUrl: resolved.resourceId,
            };
        }

        return {
            serviceId: null,
            serviceProfile: null,
            tileSource: null,
            baseRegion: null,
            fallbackImageUrl:
                extractSourceUrl(source) || currentResolvedImage?.resourceId || null,
        };
    }

    async function finalizeSelection(position: Point) {
        const activeDrag = dragState;
        dragState = null;

        if (!activeDrag) {
            return;
        }

        const endImagePoint = toImagePoint(activeDrag.targetItem, position);
        const selection = buildSelectionRect(
            activeDrag.startImagePoint,
            endImagePoint,
        );

        if (!selection) {
            feedbackMessage = 'Draw a larger rectangle to generate a crop URL.';
            return;
        }

        feedbackMessage = 'Generating image URL...';
        errorMessage = '';

        const context = await resolveSelectionContext(activeDrag.targetItem);
        const nextResult = buildSelectionCropUrl({
            selection,
            serviceId: context.serviceId,
            serviceProfile: context.serviceProfile,
            tileSource: context.tileSource,
            baseRegion: context.baseRegion,
            fallbackImageUrl: context.fallbackImageUrl,
        });

        result = nextResult;

        if (!nextResult.url) {
            feedbackMessage = '';
            errorMessage =
                nextResult.reason === 'empty-selection'
                    ? 'Draw a larger rectangle to generate a crop URL.'
                    : 'This selection could not be turned into an image URL.';
            return;
        }

        if (nextResult.mode === 'iiif-crop') {
            feedbackMessage = 'Generated an exact crop URL.';
        } else if (nextResult.mode === 'level0-tile') {
            feedbackMessage =
                'Generated a level 0 fallback URL using the deepest containing tile.';
        } else {
            feedbackMessage = 'Generated a full image fallback URL.';
        }

        selecting = false;
    }

    async function copyUrl() {
        if (!result?.url || !navigator?.clipboard) {
            return;
        }

        await navigator.clipboard.writeText(result.url);
        setCopied(true);
    }

    $effect(() => {
        if (viewerState.canvasId === lastCanvasId) {
            return;
        }

        lastCanvasId = viewerState.canvasId;
        selecting = false;
        dragState = null;
        result = null;
        feedbackMessage = '';
        errorMessage = '';
    });

    $effect(() => {
        const viewer = viewerState.osdViewer;
        if (!viewer?.setMouseNavEnabled) {
            return;
        }

        viewer.setMouseNavEnabled(!selecting);

        return () => {
            viewer.setMouseNavEnabled(true);
        };
    });

    $effect(() => {
        const container = viewerState.osdViewer?.container;
        if (!container || typeof document === 'undefined') {
            return;
        }

        const nextOverlay = document.createElement('div');
        nextOverlay.style.position = 'absolute';
        nextOverlay.style.display = 'none';
        nextOverlay.style.pointerEvents = 'none';
        nextOverlay.style.border = '2px solid color-mix(in srgb, var(--color-primary) 85%, white 15%)';
        nextOverlay.style.background = 'color-mix(in srgb, var(--color-primary) 20%, transparent 80%)';
        nextOverlay.style.boxSizing = 'border-box';
        nextOverlay.style.zIndex = '12';
        nextOverlay.dataset.selectionCropOverlay = 'true';
        container.appendChild(nextOverlay);
        overlayElement = nextOverlay;

        return () => {
            if (overlayElement === nextOverlay) {
                overlayElement = null;
            }
            nextOverlay.remove();
        };
    });

    $effect(() => {
        if (!overlayElement) {
            return;
        }

        if (!selecting || !selectionPreview) {
            overlayElement.style.display = 'none';
            return;
        }

        overlayElement.style.display = 'block';
        overlayElement.style.left = `${selectionPreview.x}px`;
        overlayElement.style.top = `${selectionPreview.y}px`;
        overlayElement.style.width = `${selectionPreview.width}px`;
        overlayElement.style.height = `${selectionPreview.height}px`;
    });

    $effect(() => {
        const viewer = viewerState.osdViewer;
        if (!viewer || !selecting) {
            return;
        }

        const handleCanvasPress = (event: any) => {
            const position = extractPoint(event.position);
            const targetItem = getItemAtPoint(position);

            if (!targetItem) {
                errorMessage = 'Start the selection on a visible image.';
                feedbackMessage = '';
                return;
            }

            event.preventDefaultAction = true;
            const startImagePoint = toImagePoint(targetItem, position);
            dragState = {
                startPoint: position,
                currentPoint: position,
                startImagePoint,
                targetItem,
            };
            result = null;
            errorMessage = '';
            feedbackMessage = 'Drag to define the crop area.';
        };

        const handleCanvasDrag = (event: any) => {
            if (!dragState) {
                return;
            }

            event.preventDefaultAction = true;
            dragState = {
                ...dragState,
                currentPoint: extractPoint(event.position),
            };
        };

        const handleCanvasRelease = (event: any) => {
            if (!dragState) {
                return;
            }

            event.preventDefaultAction = true;
            void finalizeSelection(extractPoint(event.position));
        };

        viewer.addHandler('canvas-press', handleCanvasPress);
        viewer.addHandler('canvas-drag', handleCanvasDrag);
        viewer.addHandler('canvas-release', handleCanvasRelease);

        return () => {
            viewer.removeHandler('canvas-press', handleCanvasPress);
            viewer.removeHandler('canvas-drag', handleCanvasDrag);
            viewer.removeHandler('canvas-release', handleCanvasRelease);
        };
    });

    onDestroy(() => {
        clearCopyResetTimer();
    });
</script>

<div class="h-full min-h-0 overflow-y-auto p-4">
    <div class="flex flex-col gap-4">
        <div class="space-y-2">
            <p class="text-sm leading-6 opacity-80">
                Drag on the visible image to generate a URL for the selected
                rectangle. Non-level-0 services return an exact crop. Level 0
                services fall back to the deepest single tile that still
                contains the selection.
            </p>

            <button
                class={[
                    'btn btn-sm gap-2 w-full sm:w-auto',
                    selecting ? 'btn-outline' : 'btn-primary',
                ]}
                onclick={() => setSelectionMode(!selecting)}
                disabled={!canSelect}
            >
                <Crosshair size={16} />
                {selecting ? 'Cancel Selection' : 'Start Selection'}
            </button>

            {#if !canSelect}
                <p class="text-xs text-error">
                    Load a manifest and canvas before creating a crop URL.
                </p>
            {/if}

            {#if feedbackMessage}
                <p class="text-xs opacity-70">{feedbackMessage}</p>
            {/if}

            {#if errorMessage}
                <p class="text-xs text-error">{errorMessage}</p>
            {/if}
        </div>

        {#if result?.url}
            <div class="rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 space-y-1">
                        <h3 class="text-sm font-semibold">{resultTitle}</h3>
                        <p class="text-xs leading-5 opacity-70">
                            {resultDescription}
                        </p>
                    </div>

                    <button
                        class="btn btn-xs btn-ghost shrink-0 gap-1"
                        onclick={copyUrl}
                    >
                        {#if copied}
                            <Check size={14} />
                            Copied
                        {:else}
                            <Copy size={14} />
                            Copy
                        {/if}
                    </button>
                </div>

                <textarea
                    class="textarea textarea-sm mt-3 h-32 w-full font-mono text-xs"
                    readonly
                >{result.url}</textarea>
            </div>
        {/if}
    </div>
</div>