<script lang="ts">
    import { getContext } from 'svelte';
    import { manifestsState } from '../../state/manifests.svelte';
    import {
        VIEWER_STATE_KEY,
        type ViewerState,
    } from '../../state/viewer.svelte';
    import { getCanvasLabel } from '../../utils/resolveCanvasImage';
    import type {
        PdfCoverSheetConfig,
        PdfImageLoader,
        PdfImageRequestConfig,
    } from './exportPdf';
    import { exportCanvasRangeAsPdf, normalizeCanvasRange } from './exportPdf';
    import PdfExportPanel from './PdfExportPanel.svelte';

    let {
        isOpen: _isOpen = false,
        close,
        config = {},
    }: {
        isOpen?: boolean;
        close: () => void;
        config?: {
            coverSheet?: PdfCoverSheetConfig;
            ocrAnnotationSource?: string;
            imageRequest?: PdfImageRequestConfig;
            loadImageBlob?: PdfImageLoader;
        };
    } = $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);
    const initialSelection =
        viewerState.currentCanvasIndex >= 0
            ? viewerState.currentCanvasIndex
            : 0;

    let startSelection = $state<number | null>(initialSelection);
    let endSelection = $state<number | null>(initialSelection);
    let isExporting = $state(false);
    let errorMessage = $state('');
    let resultMessage = $state('');
    let progressMessage = $state('');

    function clampIndex(value: number, count: number): number {
        return Math.min(Math.max(0, value), count - 1);
    }

    let canvasOptions = $derived(
        viewerState.canvases.map((canvas: any, index: number) => ({
            id: canvas.id || canvas['@id'] || `canvas-${index}`,
            label: getCanvasLabel(canvas, index),
            index,
        })),
    );

    let selectedStartIndex = $derived(
        startSelection !== null && canvasOptions.length
            ? clampIndex(startSelection, canvasOptions.length)
            : null,
    );
    let selectedEndIndex = $derived(
        endSelection !== null && canvasOptions.length
            ? clampIndex(endSelection, canvasOptions.length)
            : null,
    );
    let normalizedRange = $derived(
        selectedStartIndex !== null && selectedEndIndex !== null
            ? normalizeCanvasRange(
                  selectedStartIndex,
                  selectedEndIndex,
                  canvasOptions.length,
              )
            : null,
    );

    let selectedCount = $derived(normalizedRange?.indices.length ?? 0);
    let disabledReason = $derived.by(() => {
        if (!viewerState.manifestId) {
            return 'Load a manifest to export canvases.';
        }

        if (!canvasOptions.length) {
            return 'No canvases are available to export.';
        }

        if (selectedStartIndex === null || selectedEndIndex === null) {
            return 'Select a valid start and end canvas to export.';
        }

        return null;
    });

    let canExport = $derived(
        !isExporting && !disabledReason && !!normalizedRange,
    );
    let hasCoverSheet = $derived(!!config.coverSheet?.fields.length);

    function updateStartIndex(value: number | null) {
        startSelection = value;

        if (value !== null && endSelection !== null && endSelection < value) {
            endSelection = null;
        }
    }

    function updateEndIndex(value: number | null) {
        endSelection = value;

        if (
            value !== null &&
            startSelection !== null &&
            startSelection > value
        ) {
            startSelection = null;
        }
    }

    function getTargetWidth(): number {
        const containerWidth =
            viewerState.osdViewer?.container?.clientWidth || 1200;
        const pixelRatio = window.devicePixelRatio || 1;
        return Math.min(
            1800,
            Math.max(1200, Math.round(containerWidth * pixelRatio)),
        );
    }

    async function handleExport() {
        if (!normalizedRange || !canExport) {
            return;
        }

        isExporting = true;
        errorMessage = '';
        resultMessage = '';
        progressMessage = 'Preparing export...';

        try {
            const result = await exportCanvasRangeAsPdf({
                canvases: viewerState.canvases,
                startIndex: normalizedRange.startIndex,
                endIndex: normalizedRange.endIndex,
                targetWidth: getTargetWidth(),
                manifestId: viewerState.manifestId,
                coverSheet: config.coverSheet,
                imageRequest: config.imageRequest,
                loadImageBlob: config.loadImageBlob,
                getSelectedChoice: (canvasId) =>
                    viewerState.getSelectedChoice(canvasId),
                getCanvasAnnotations: async (canvasId) =>
                    viewerState.manifestId
                        ? manifestsState.ensureCanvasAnnotations(
                              viewerState.manifestId,
                              canvasId,
                              config.ocrAnnotationSource,
                          )
                        : [],
                currentUrl: window.location.href,
                onProgress: (message) => {
                    progressMessage = message;
                },
            });

            progressMessage = '';
            resultMessage = result.failedCanvases.length
                ? `Downloaded ${result.exportedCount} canvas(es). Skipped ${result.failedCanvases.length}.`
                : `Downloaded ${result.exportedCount} canvas(es) as ${result.filename}.`;
        } catch (error) {
            progressMessage = '';
            errorMessage =
                error instanceof Error
                    ? error.message
                    : 'Unable to export canvases.';
        } finally {
            isExporting = false;
        }
    }
</script>

<PdfExportPanel
    {canvasOptions}
    startIndex={selectedStartIndex}
    endIndex={selectedEndIndex}
    {selectedCount}
    {isExporting}
    {progressMessage}
    {resultMessage}
    {errorMessage}
    canExport={!!canExport}
    {disabledReason}
    {hasCoverSheet}
    onStartIndexChange={updateStartIndex}
    onEndIndexChange={updateEndIndex}
    onExport={handleExport}
    onClose={close}
/>
