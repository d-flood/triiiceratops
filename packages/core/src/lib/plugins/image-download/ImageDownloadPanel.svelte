<script lang="ts">
    import { getContext } from 'svelte';
    import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';
    import { Button, Select } from '../../components/ui';
    import { m, language } from '../../state/i18n.svelte';
    import {
        VIEWER_STATE_KEY,
        type ViewerState,
    } from '../../state/viewer.svelte';
    import { getCanvasId, getCanvasLabel } from '../../utils/resolveCanvasImage';
    import { downloadBlob, type ExportSizeOption } from '../../utils/imageExport';
    import {
        buildImageDownloadFilename,
        exportCompositeCanvas,
        exportCurrentWorld,
        exportSingleImage,
        getCanvasImageChoices,
        getVisibleCanvasesForDownload,
        resolveCompositeCanvasSizeOptions,
        resolveSingleImageSizeOptions,
        resolveWorldSizeOptions,
        type ImageDownloadMode,
    } from './exportImage';

    let { close, embedded = false }: { close?: () => void; embedded?: boolean } =
        $props();

    const viewerState = getContext<ViewerState>(VIEWER_STATE_KEY);

    let mode = $state<ImageDownloadMode>('single');
    let selectedCanvasIndex = $state(0);
    let selectedImageIndex = $state(0);
    let sizeOptions = $state<ExportSizeOption[]>([]);
    let selectedSizeIndex = $state<number | null>(null);
    let isLoadingSizes = $state(false);
    let isDownloading = $state(false);
    let errorMessage = $state('');
    let resultMessage = $state('');

    const getSelectedChoice = (canvasId: string) =>
        viewerState.getSelectedChoice(canvasId);

    let canvas = $derived(
        viewerState.currentCanvasIndex >= 0
            ? (viewerState.canvases[viewerState.currentCanvasIndex] ?? null)
            : null,
    );
    let canvasImages = $derived(
        canvas ? getCanvasImageChoices(canvas, getSelectedChoice) : [],
    );
    let hasMultipleImages = $derived(canvasImages.length > 1);
    let showCompositeOption = $derived(hasMultipleImages);
    // Every canvas currently laid out together in the viewer (a paged
    // spread, or continuous mode) — in `individuals` mode this is always
    // just the active canvas. "Single image" mode can target any of them
    // instead of only ever the active canvas.
    let visibleCanvases = $derived(getVisibleCanvasesForDownload(viewerState));
    let hasMultipleVisibleCanvases = $derived(visibleCanvases.length > 1);
    // "Current view" is only meaningful when there's actually more than one
    // canvas visible to combine (e.g. not a lone cover page in paged mode).
    let showWorldOption = $derived(hasMultipleVisibleCanvases);
    let showModeSelect = $derived(showCompositeOption || showWorldOption);
    let singleModeCanvas = $derived(
        mode === 'single' && hasMultipleVisibleCanvases
            ? (visibleCanvases[selectedCanvasIndex] ?? canvas)
            : canvas,
    );
    let singleModeCanvasImages = $derived(
        singleModeCanvas
            ? getCanvasImageChoices(singleModeCanvas, getSelectedChoice)
            : [],
    );
    let singleModeHasMultipleImages = $derived(
        singleModeCanvasImages.length > 1,
    );
    let selectedSizeOption = $derived(
        selectedSizeIndex !== null ? (sizeOptions[selectedSizeIndex] ?? null) : null,
    );
    let canDownload = $derived(
        !isDownloading && !isLoadingSizes && !!canvas && !!selectedSizeOption,
    );
    let disabledReason = $derived.by(() => {
        void language.current;

        if (!canvas) {
            return m.image_download_disabled_no_canvas();
        }
        if (!isLoadingSizes && !sizeOptions.length) {
            return m.image_download_disabled_no_resolution();
        }
        return null;
    });

    $effect(() => {
        // If the current mode's option is no longer available (canvas
        // dropped to a single image, or viewing mode left paged/continuous),
        // fall back to "single image", which is always valid.
        if (mode === 'composite' && !showCompositeOption) {
            mode = 'single';
        } else if (mode === 'world' && !showWorldOption) {
            mode = 'single';
        }
    });

    $effect(() => {
        // Default (and reset, on navigation) the canvas picker to whichever
        // visible canvas is actually the active one — paged-spread ordering
        // doesn't always put the active canvas first.
        const activeId = viewerState.canvasId;
        const matchIndex = visibleCanvases.findIndex(
            (candidate) => getCanvasId(candidate) === activeId,
        );
        selectedCanvasIndex = matchIndex >= 0 ? matchIndex : 0;
    });

    $effect(() => {
        // Reset the per-image picker whenever the canvas backing "single
        // image" mode changes, so a stale index from a previous canvas
        // doesn't silently pick the wrong image.
        void singleModeCanvas;
        selectedImageIndex = 0;
    });

    $effect(() => {
        // Reading these tracks the effect's dependencies; the async work
        // itself runs below, guarded against stale results.
        const activeCanvas = canvas;
        const activeMode = mode;
        const activeImageIndex = selectedImageIndex;
        let cancelled = false;

        sizeOptions = [];
        selectedSizeIndex = null;

        if (!activeCanvas) {
            return;
        }

        if (activeMode === 'single') {
            const resolvedImage = singleModeCanvasImages[activeImageIndex];
            if (!resolvedImage) return;

            isLoadingSizes = true;
            resolveSingleImageSizeOptions(resolvedImage)
                .then((options) => {
                    if (cancelled) return;
                    sizeOptions = options;
                    selectedSizeIndex = options.length ? 0 : null;
                })
                .finally(() => {
                    if (!cancelled) isLoadingSizes = false;
                });
        } else if (activeMode === 'composite') {
            const options = resolveCompositeCanvasSizeOptions(
                activeCanvas,
                getSelectedChoice,
            );
            sizeOptions = options;
            selectedSizeIndex = options.length ? 0 : null;
        } else {
            const options = resolveWorldSizeOptions(
                viewerState,
                getSelectedChoice,
            );
            sizeOptions = options;
            selectedSizeIndex = options.length ? 0 : null;
        }

        return () => {
            cancelled = true;
        };
    });

    function parseIndex(value: string): number {
        const parsed = Number(value);
        return Number.isInteger(parsed) ? parsed : 0;
    }

    async function handleDownload() {
        if (!canvas || !selectedSizeOption || !canDownload) {
            return;
        }

        isDownloading = true;
        errorMessage = '';
        resultMessage = '';

        try {
            let blob: Blob;
            let downloadCanvas = canvas;

            if (mode === 'single') {
                downloadCanvas = singleModeCanvas;
                blob = await exportSingleImage(
                    singleModeCanvasImages[selectedImageIndex],
                    selectedSizeOption,
                );
            } else if (mode === 'composite') {
                blob = await exportCompositeCanvas(canvas, selectedSizeOption, {
                    getSelectedChoice,
                });
            } else {
                blob = await exportCurrentWorld(viewerState, selectedSizeOption, {
                    getSelectedChoice,
                });
            }

            const filename = buildImageDownloadFilename(
                getCanvasLabel(downloadCanvas, viewerState.currentCanvasIndex),
                mode,
                'image/png',
            );
            downloadBlob(blob, filename);
            resultMessage = m.image_download_result_downloaded({ filename });
        } catch (error) {
            console.error('[Image download] Export failed', {
                error,
                mode,
                canvasId: viewerState.canvasId,
            });
            errorMessage = m.image_download_error_failed();
        } finally {
            isDownloading = false;
        }
    }
</script>

{#key language.current}
    <div class="panel" data-panel-id="image-download" class:standalone={!embedded}>
        {#if !embedded}
            <div class="header">
                <h2 class="header-title">
                    <DownloadSimple size={20} />
                    {m.image_download_title()}
                </h2>
            </div>
        {/if}

        <div class="body" class:scrollable={!embedded}>
            <p class="description">
                {m.image_download_description()}
            </p>

            <div class="fields">
                {#if showModeSelect}
                    <div class="field">
                        <label class="label" for="image-download-mode">
                            <span>{m.image_download_mode()}</span>
                        </label>
                        <Select
                            id="image-download-mode"
                            class="field-select"
                            disabled={isDownloading}
                            value={mode}
                            onchange={(event) => {
                                mode = (
                                    event.currentTarget as HTMLSelectElement
                                ).value as ImageDownloadMode;
                            }}
                        >
                            {#if showCompositeOption}
                                <option value="composite"
                                    >{m.image_download_mode_composite()}</option
                                >
                            {/if}
                            <option value="single"
                                >{m.image_download_mode_single()}</option
                            >
                            {#if showWorldOption}
                                <option value="world"
                                    >{m.image_download_mode_world()}</option
                                >
                            {/if}
                        </Select>
                    </div>
                {/if}

                {#if mode === 'single' && hasMultipleVisibleCanvases}
                    <div class="field">
                        <label class="label" for="image-download-canvas">
                            <span>{m.image_download_canvas()}</span>
                        </label>
                        <Select
                            id="image-download-canvas"
                            class="field-select"
                            disabled={isDownloading}
                            value={selectedCanvasIndex}
                            onchange={(event) => {
                                selectedCanvasIndex = parseIndex(
                                    (event.currentTarget as HTMLSelectElement)
                                        .value,
                                );
                            }}
                        >
                            {#each visibleCanvases as visibleCanvas, index (index)}
                                <option value={index}>
                                    {getCanvasLabel(visibleCanvas, index)}
                                </option>
                            {/each}
                        </Select>
                    </div>
                {/if}

                {#if mode === 'single' && singleModeHasMultipleImages}
                    <div class="field">
                        <label class="label" for="image-download-image">
                            <span>{m.image_download_image()}</span>
                        </label>
                        <Select
                            id="image-download-image"
                            class="field-select"
                            disabled={isDownloading}
                            value={selectedImageIndex}
                            onchange={(event) => {
                                selectedImageIndex = parseIndex(
                                    (event.currentTarget as HTMLSelectElement)
                                        .value,
                                );
                            }}
                        >
                            {#each singleModeCanvasImages as image, index (index)}
                                <option value={index}>
                                    {image.label ??
                                        `${m.image_download_image()} ${index + 1}`}
                                </option>
                            {/each}
                        </Select>
                    </div>
                {/if}

                <div class="field">
                    <label class="label" for="image-download-resolution">
                        <span>{m.image_download_resolution()}</span>
                    </label>
                    <Select
                        id="image-download-resolution"
                        class="field-select"
                        disabled={isDownloading ||
                            isLoadingSizes ||
                            !sizeOptions.length}
                        value={selectedSizeIndex ?? ''}
                        onchange={(event) => {
                            selectedSizeIndex = parseIndex(
                                (event.currentTarget as HTMLSelectElement)
                                    .value,
                            );
                        }}
                    >
                        <option value="" disabled>
                            {m.image_download_resolution_placeholder()}
                        </option>
                        {#each sizeOptions as option, index (index)}
                            <option value={index}>{option.label}</option>
                        {/each}
                    </Select>
                </div>
            </div>

            {#if resultMessage || errorMessage || disabledReason}
                <div class="card">
                    <div class="card-body">
                        {#if resultMessage}
                            <div class="alert alert-success">
                                <span>{resultMessage}</span>
                            </div>
                        {/if}

                        {#if errorMessage}
                            <div class="alert alert-error">
                                <span>{errorMessage}</span>
                            </div>
                        {/if}

                        {#if disabledReason}
                            <div class="alert">
                                <span>{disabledReason}</span>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>

        <div class="footer">
            <Button
                variant="primary"
                class="download-button"
                disabled={!canDownload}
                onclick={handleDownload}
            >
                <DownloadSimple size={18} />
                {isDownloading
                    ? m.image_download_downloading()
                    : m.image_download_download()}
            </Button>
        </div>
    </div>
{/key}

<style>
    .panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .panel.standalone {
        width: 20rem;
        height: 100%;
        background-color: var(--panel-surface);
        border-right: 1px solid var(--surface-border);
        box-shadow:
            0 20px 25px -5px #0000001a,
            0 8px 10px -6px #0000001a;
    }

    .header {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid var(--surface-border);
    }

    .header-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.125rem;
        line-height: 1.75rem;
        font-weight: 600;
    }

    .body {
        width: 100%;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .body.scrollable {
        flex: 1 1 0%;
        overflow-y: auto;
    }

    .description {
        font-size: 0.875rem;
        line-height: 1.25rem;
        color: color-mix(in oklab, var(--panel-fg) 70%, transparent);
    }

    .fields {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
        gap: 0.75rem;
    }

    .field {
        width: 100%;
    }

    .label {
        white-space: nowrap;
        color: color-mix(in oklab, currentcolor 60%, transparent);
        align-items: center;
        gap: 0.375rem;
        display: inline-flex;
    }

    .field :global(.field-select) {
        width: 100%;
    }

    .card {
        border-radius: var(--radius-panels);
        display: flex;
        flex-direction: column;
        position: relative;
        background-color: var(--input-bg);
        border: 1px solid var(--surface-border);
    }

    .card-body {
        padding: 1rem;
        font-size: 0.875rem;
        flex-direction: column;
        flex: auto;
        gap: 0.5rem;
        display: flex;
    }

    /*
     * Soft alert: tinted background/border derived from --alert-color, no shadow.
     * The color variant sets --alert-color (drives bg/border) and overrides the
     * text color to the variant's *-content token.
     */
    .alert {
        --alert-color: var(--panel-fg);
        border-width: var(--border);
        border-style: solid;
        border-color: var(--alert-border-color);
        --alert-border-color: color-mix(
            in oklab,
            var(--alert-color) 10%,
            var(--input-bg)
        );
        border-radius: var(--radius-panels);
        color: var(--panel-fg);
        background: color-mix(
            in oklab,
            var(--alert-color) 8%,
            var(--input-bg)
        );
        background-image: none;
        box-shadow: none;
        text-align: start;
        grid-template-columns: auto;
        grid-auto-flow: column;
        justify-content: start;
        place-items: center start;
        gap: 1rem;
        padding-block: 0.5rem;
        padding-inline: 1rem;
        font-size: 0.875rem;
        line-height: 1.25rem;
        display: grid;
    }

    .alert:has(:nth-child(2)) {
        grid-template-columns: auto minmax(auto, 1fr);
    }

    .alert.alert-success {
        --alert-color: var(--color-success);
        color: var(--color-success-content);
    }

    .alert.alert-error {
        --alert-color: var(--color-error);
        color: var(--color-error-content);
    }

    .footer {
        width: 100%;
        padding: 1rem;
        border-top: 1px solid var(--surface-border);
    }

    .footer :global(.download-button) {
        width: 100%;
    }
</style>
