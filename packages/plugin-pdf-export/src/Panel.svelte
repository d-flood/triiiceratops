<script lang="ts">
    /*
     * The PDF-export panel. Framework-neutral seam in, Svelte inside: this
     * component is compiled INTO the plugin package (its own bundled Svelte
     * runtime) and mounted through `view.mount` — it never imports core's Svelte
     * runtime or `svelte/internal`, and reaches viewer state only through the
     * SDK-owned `PluginContext` (selectors, locale), never Svelte context.
     *
     * Chrome ownership (epic restore-plugin-toolbar-chrome, ticket 05): core owns
     * the toolbar button (rendered from the plugin's `icon`) and the docked panel
     * chrome (surface, sticky header with the plugin icon + title, and open/close).
     * This component renders ONLY the panel's content body into the content-only
     * container core hands `view.mount` — no self-toggle, no `open` state, no
     * self-positioning. The controls are restored to `main`'s themed look with the
     * shared `@triiiceratops/ui` primitives (`Select`, `Button`).
     *
     * It merges core's former `PdfExportController` + `PdfExportPanel`: it owns the
     * selection state, derives the exportable range, and drives
     * `exportCanvasRangeAsPdf` (its own bundled `pdf-lib`). Progress reporting is
     * component-local state (SPEC: async progress flows through supported paths —
     * no writes to core internals).
     */
    import { getContext } from 'svelte';

    import { Button, Select } from '@triiiceratops/ui';

    import {
        getCanvasLabel,
        resolveLanguageValue,
    } from 'triiiceratops/image-export';
    import {
        exportCanvasRangeAsPdf,
        normalizeCanvasRange,
        type PdfExportMessages,
    } from './exportPdf';
    import { reportPdfExportError } from './reportError';
    import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';
    import { GLYPHS } from './icons';
    import type { PdfExportSelection } from './types';

    // The activation context + consumer config, handed in through Svelte's
    // context map by `view.mount`. `getContext` returns them as a plain,
    // non-reactive value; both are stable for this mount's lifetime (a fresh
    // mount gets a fresh context).
    const { context, config } = getContext<PanelContext>(PLUGIN_CONTEXT_KEY);
    const { viewerState, selectors, locale } = context;

    // Cross-runtime reactivity: mirror the bits of live `ViewerState` this panel
    // renders from through memoized selectors into local `$state`. The SDK drops
    // these subscriptions on deactivation (selector-runtime disposal), so no
    // manual unsubscribe is needed.
    let canvases = $state<any[]>(viewerState.canvases ?? []);
    let manifestId = $state<string | null>(viewerState.manifestId);
    let osd = $state<unknown>(viewerState.osdViewer ?? null);

    selectors
        .select((s) => s.canvases)
        .subscribe((value) => {
            canvases = value ?? [];
        });
    selectors
        .select((s) => s.manifestId)
        .subscribe((value) => {
            manifestId = value;
        });
    selectors
        .select((s) => s.osdViewer)
        .subscribe((value) => {
            osd = value;
        });

    // Active-locale reactivity: bump a tick on change so `t()`-derived labels
    // recompute in the viewer's active locale.
    let localeTick = $state(0);
    const t = (
        key: string,
        params?: Record<string, string | number>,
    ): string => {
        void localeTick;
        return locale.t(key, params);
    };
    locale.subscribe(() => {
        localeTick++;
    });

    // Initial selection: the currently viewed canvas (or the first one).
    const initialSelection =
        viewerState.currentCanvasIndex >= 0
            ? viewerState.currentCanvasIndex
            : 0;

    // The panel's root element, bound so an actionable export failure can be
    // reported to the host on the structured `pluginerror` channel.
    let rootEl = $state<HTMLElement | null>(null);

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
        canvases.map((canvas: any, index: number) => ({
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
    let selectedRange: PdfExportSelection = $derived({
        startIndex: selectedStartIndex,
        endIndex: selectedEndIndex,
        startCanvas:
            selectedStartIndex !== null
                ? (canvases[selectedStartIndex] ?? null)
                : null,
        endCanvas:
            selectedEndIndex !== null
                ? (canvases[selectedEndIndex] ?? null)
                : null,
    });

    $effect(() => {
        config.onSelectionChange?.(selectedRange);
    });

    let selectedCount = $derived(normalizedRange?.indices.length ?? 0);
    let disabledReason = $derived.by(() => {
        void localeTick;

        if (!manifestId) {
            return t('pdf_export_disabled_no_manifest');
        }

        if (!canvasOptions.length) {
            return t('pdf_export_disabled_no_canvases');
        }

        if (selectedStartIndex === null || selectedEndIndex === null) {
            return t('pdf_export_disabled_invalid_range');
        }

        return null;
    });

    let canExport = $derived(
        !isExporting && !disabledReason && !!normalizedRange,
    );

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

    function parseCanvasIndex(value: string): number | null {
        if (value === '') {
            return null;
        }

        const parsed = Number(value);
        return Number.isInteger(parsed) ? parsed : null;
    }

    function getTargetWidth(): number {
        const container = (osd as { container?: { clientWidth?: number } })
            ?.container;
        const containerWidth = container?.clientWidth || 1200;
        const pixelRatio = window.devicePixelRatio || 1;
        return Math.min(
            1800,
            Math.max(1200, Math.round(containerWidth * pixelRatio)),
        );
    }

    // Localized progress/error builders handed to the (i18n-free) export logic.
    function buildMessages(): PdfExportMessages {
        return {
            errorNoCanvases: () => t('pdf_export_error_no_canvases'),
            errorNotAvailable: () => t('pdf_export_error_not_available'),
            errorNoCanvasesExported: () =>
                t('pdf_export_error_no_canvases_exported'),
            progressCoverSheet: () => t('pdf_export_progress_cover_sheet'),
            progressCanvas: (params) => t('pdf_export_progress_canvas', params),
            progressDownload: (params) =>
                t('pdf_export_progress_download', params),
        };
    }

    async function handleExport() {
        if (!normalizedRange || !canExport) {
            return;
        }

        isExporting = true;
        errorMessage = '';
        resultMessage = '';
        progressMessage = t('pdf_export_progress_preparing');

        const messages = buildMessages();

        try {
            // Raw IIIF Manifest JSON. This used to read `manifesto.js`'s
            // `getLabel()`; the manifest cache holds only the document now, and
            // `label` is spelled the same in v2 and v3 (the value shapes
            // differ, which `resolveLanguageValue` absorbs).
            const manifestJson = viewerState.manifestEntry?.json;
            const manifestLabel =
                resolveLanguageValue(manifestJson?.label) || null;

            const result = await exportCanvasRangeAsPdf({
                canvases,
                startIndex: normalizedRange.startIndex,
                endIndex: normalizedRange.endIndex,
                targetWidth: getTargetWidth(),
                manifestId,
                manifestLabel,
                filename: config.filename,
                getFilename: config.getFilename,
                coverSheet: config.coverSheet,
                imageRequest: config.imageRequest,
                loadImageBlob: config.loadImageBlob,
                ocrPlacementMode: config.ocrPlacementMode,
                ocrSizingMode: config.ocrSizingMode,
                ocrVisibilityMode: config.ocrVisibilityMode,
                getCanvasOcrOverlays: config.getCanvasOcrOverlays,
                getSelectedChoice: (canvasId) =>
                    viewerState.getSelectedChoice(canvasId),
                getCanvasAnnotations: async (canvasId) =>
                    manifestId
                        ? viewerState.ensureCanvasAnnotations(
                              manifestId,
                              canvasId,
                              config.ocrAnnotationSource,
                          )
                        : [],
                currentUrl:
                    typeof window !== 'undefined' ? window.location.href : null,
                messages,
                onProgress: (message) => {
                    progressMessage = message;
                },
            });

            progressMessage = '';
            resultMessage = result.failedCanvases.length
                ? t('pdf_export_result_partial', {
                      exportedCount: result.exportedCount,
                      failedCount: result.failedCanvases.length,
                  })
                : t('pdf_export_result_downloaded', {
                      count: result.exportedCount,
                      filename: result.filename,
                  });
        } catch (error) {
            progressMessage = '';
            errorMessage =
                error instanceof Error &&
                error.message === messages.errorNotAvailable()
                    ? error.message
                    : t('pdf_export_error_failed');
            // Surface the failure to the host on the structured channel (in
            // addition to the panel-local message) so integrations can react
            // without scraping the browser console for diagnostics.
            if (rootEl) {
                reportPdfExportError(rootEl, error, () => void handleExport());
            }
        } finally {
            isExporting = false;
        }
    }
</script>

<div class="tri-pdf" data-tri-pdf bind:this={rootEl}>
    <div class="tri-pdf-body">
        <p class="tri-pdf-description">{t('pdf_export_description')}</p>

        <div class="tri-pdf-fields">
            <div class="tri-pdf-field">
                <label class="tri-pdf-label" for="tri-pdf-start">
                    <span>{t('pdf_export_start_canvas')}</span>
                </label>
                <Select
                    id="tri-pdf-start"
                    class="tri-pdf-select"
                    data-tri-pdf-start
                    disabled={!canvasOptions.length || isExporting}
                    value={selectedStartIndex ?? ''}
                    onchange={(event) =>
                        updateStartIndex(
                            parseCanvasIndex(
                                (event.currentTarget as HTMLSelectElement)
                                    .value,
                            ),
                        )}
                >
                    <option value="" disabled
                        >{t('pdf_export_start_canvas_placeholder')}</option
                    >
                    {#each canvasOptions as option (option.id)}
                        <option
                            value={option.index}
                            disabled={selectedEndIndex !== null &&
                                option.index > selectedEndIndex}
                        >
                            {option.index + 1}. {option.label}
                        </option>
                    {/each}
                </Select>
            </div>

            <div class="tri-pdf-field">
                <label class="tri-pdf-label" for="tri-pdf-end">
                    <span>{t('pdf_export_end_canvas')}</span>
                </label>
                <Select
                    id="tri-pdf-end"
                    class="tri-pdf-select"
                    data-tri-pdf-end
                    disabled={!canvasOptions.length || isExporting}
                    value={selectedEndIndex ?? ''}
                    onchange={(event) =>
                        updateEndIndex(
                            parseCanvasIndex(
                                (event.currentTarget as HTMLSelectElement)
                                    .value,
                            ),
                        )}
                >
                    <option value="" disabled
                        >{t('pdf_export_end_canvas_placeholder')}</option
                    >
                    {#each canvasOptions as option (option.id)}
                        <option
                            value={option.index}
                            disabled={selectedStartIndex !== null &&
                                option.index < selectedStartIndex}
                        >
                            {option.index + 1}. {option.label}
                        </option>
                    {/each}
                </Select>
            </div>
        </div>

        <div class="tri-pdf-card">
            <div class="tri-pdf-card-body">
                <div class="tri-pdf-summary">
                    <span class="tri-pdf-summary-label"
                        >{t('pdf_export_selected_canvases')}</span
                    >
                    <span class="tri-pdf-summary-count" data-tri-pdf-count
                        >{selectedCount}</span
                    >
                </div>

                {#if progressMessage}
                    <div class="tri-pdf-alert tri-pdf-alert-info" role="status">
                        <span>{progressMessage}</span>
                    </div>
                {/if}
                {#if resultMessage}
                    <div
                        class="tri-pdf-alert tri-pdf-alert-success"
                        role="status"
                        data-tri-pdf-result
                    >
                        <span>{resultMessage}</span>
                    </div>
                {/if}
                {#if errorMessage}
                    <div class="tri-pdf-alert tri-pdf-alert-error" role="alert">
                        <span>{errorMessage}</span>
                    </div>
                {/if}
                {#if disabledReason}
                    <div class="tri-pdf-alert">
                        <span>{disabledReason}</span>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div class="tri-pdf-footer">
        <Button
            variant="primary"
            class="tri-pdf-export"
            data-tri-pdf-export
            disabled={!canExport}
            onclick={handleExport}
        >
            <!-- eslint-disable svelte/no-at-html-tags -- trusted static SVG glyph constant -->
            <svg
                class="tri-pdf-export-icon"
                viewBox={GLYPHS.viewBox}
                aria-hidden="true">{@html GLYPHS.download}</svg
            >
            <!-- eslint-enable svelte/no-at-html-tags -->
            {isExporting ? t('pdf_export_exporting') : t('pdf_export_download')}
        </Button>
    </div>
</div>
