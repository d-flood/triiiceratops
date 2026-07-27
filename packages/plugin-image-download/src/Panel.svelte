<script lang="ts">
    /*
     * The image-download panel. Framework-neutral seam in, Svelte inside: this
     * component is compiled INTO the plugin package (its own bundled Svelte
     * runtime) and mounted through `view.mount` — it never imports core's Svelte
     * runtime or `svelte/internal`, and reaches viewer state only through the
     * SDK-owned `PluginContext`.
     *
     * Because the plugin runs its OWN Svelte runtime, reading core's `$state`
     * off `viewerState` inside a `$derived` would NOT be reactive across the
     * runtime boundary. Cross-runtime reactivity is bridged explicitly: a
     * `stateTick` counter is bumped by `viewerState.subscribe` (batched,
     * member-level core notifications) and every viewer-derived value reads it,
     * so the panel recomputes on the next flush after any inventoried change.
     */
    import { getContext } from 'svelte';

    import {
        downloadBlob,
        getCanvasId,
        getCanvasLabel,
        type ExportSizeOption,
    } from 'triiiceratops/image-export';

    import { PLUGIN_CONTEXT_KEY, type PanelContext } from './contextKey';
    import { reportImageDownloadError } from './reportError';
    import { DOWNLOAD_ICON } from './icons';
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

    const { context } = getContext<PanelContext>(PLUGIN_CONTEXT_KEY);
    const { viewerState, selectors, locale, ui } = context;

    // Cross-runtime bridges: bump a tick so the plugin runtime's derivations
    // recompute on batched viewer changes / active-locale changes. Viewer
    // reactivity goes through the SDK selector runtime (disposed by the SDK on
    // deactivation — no manual cleanup, no subscription leak); a fresh-array
    // projection propagates on every state-version advance the panel depends on.
    let stateTick = $state(0);
    let localeTick = $state(0);
    selectors
        .select((s) => [
            s.canvasId,
            s.currentCanvasIndex,
            s.canvases,
            s.viewingMode,
            s.viewingDirection,
            s.pagedOffset,
            s.preserveCanvasScale,
        ])
        .subscribe(() => {
            stateTick++;
        });
    locale.subscribe(() => {
        localeTick++;
    });

    const t = (key: string, params?: Record<string, string | number>): string => {
        void localeTick;
        return locale.t(key, params);
    };

    let open = $state(false);

    let mode = $state<ImageDownloadMode>('single');
    let selectedCanvasIndex = $state(0);
    let selectedImageIndex = $state(0);
    let sizeOptions = $state<ExportSizeOption[]>([]);
    let selectedSizeIndex = $state<number | null>(null);
    let isLoadingSizes = $state(false);
    let isDownloading = $state(false);
    let errorMessage = $state('');
    let resultMessage = $state('');
    // The panel's root element, bound so an actionable download failure can be
    // reported to the host on the structured `pluginerror` channel.
    let rootEl = $state<HTMLElement | null>(null);

    const getSelectedChoice = (canvasId: string) =>
        viewerState.getSelectedChoice(canvasId);

    const canvas = $derived.by(() => {
        void stateTick;
        return viewerState.currentCanvasIndex >= 0
            ? (viewerState.canvases[viewerState.currentCanvasIndex] ?? null)
            : null;
    });
    const canvasImages = $derived.by(() => {
        void stateTick;
        return canvas ? getCanvasImageChoices(canvas, getSelectedChoice) : [];
    });
    const hasMultipleImages = $derived(canvasImages.length > 1);
    const showCompositeOption = $derived(hasMultipleImages);
    // Every canvas currently laid out together in the viewer (a paged spread,
    // or continuous mode) — in `individuals` mode this is always just the
    // active canvas. "Single image" mode can target any of them.
    const visibleCanvases = $derived.by(() => {
        void stateTick;
        return getVisibleCanvasesForDownload(viewerState);
    });
    const hasMultipleVisibleCanvases = $derived(visibleCanvases.length > 1);
    // "Current view" is only meaningful when there's actually more than one
    // canvas visible to combine (e.g. not a lone cover page in paged mode).
    const showWorldOption = $derived(hasMultipleVisibleCanvases);
    const showModeSelect = $derived(showCompositeOption || showWorldOption);
    const singleModeCanvas = $derived.by(() => {
        void stateTick;
        return mode === 'single' && hasMultipleVisibleCanvases
            ? (visibleCanvases[selectedCanvasIndex] ?? canvas)
            : canvas;
    });
    const singleModeCanvasImages = $derived.by(() => {
        void stateTick;
        return singleModeCanvas
            ? getCanvasImageChoices(singleModeCanvas, getSelectedChoice)
            : [];
    });
    const singleModeHasMultipleImages = $derived(
        singleModeCanvasImages.length > 1,
    );
    const selectedSizeOption = $derived(
        selectedSizeIndex !== null
            ? (sizeOptions[selectedSizeIndex] ?? null)
            : null,
    );
    const canDownload = $derived(
        !isDownloading && !isLoadingSizes && !!canvas && !!selectedSizeOption,
    );
    const disabledReason = $derived.by(() => {
        void localeTick;
        if (!canvas) {
            return t('image_download_disabled_no_canvas');
        }
        if (!isLoadingSizes && !sizeOptions.length) {
            return t('image_download_disabled_no_resolution');
        }
        return null;
    });

    $effect(() => {
        // If the current mode's option is no longer available (canvas dropped
        // to a single image, or viewing mode left paged/continuous), fall back
        // to "single image", which is always valid.
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
        void stateTick;
        const activeId = viewerState.canvasId;
        const matchIndex = visibleCanvases.findIndex(
            (candidate) => getCanvasId(candidate) === activeId,
        );
        selectedCanvasIndex = matchIndex >= 0 ? matchIndex : 0;
    });

    $effect(() => {
        // Reset the per-image picker whenever the canvas backing "single image"
        // mode changes, so a stale index doesn't silently pick the wrong image.
        void singleModeCanvas;
        selectedImageIndex = 0;
    });

    $effect(() => {
        // Reading these tracks the effect's dependencies; the async work itself
        // runs below, guarded against stale results.
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
                const resolvedImage =
                    singleModeCanvasImages[selectedImageIndex];
                if (!resolvedImage) return;
                blob = await exportSingleImage(resolvedImage, selectedSizeOption);
            } else if (mode === 'composite') {
                blob = await exportCompositeCanvas(canvas, selectedSizeOption, {
                    getSelectedChoice,
                });
            } else {
                blob = await exportCurrentWorld(
                    viewerState,
                    selectedSizeOption,
                    { getSelectedChoice },
                );
            }

            const filename = buildImageDownloadFilename(
                getCanvasLabel(downloadCanvas, viewerState.currentCanvasIndex),
                mode,
                'image/png',
            );
            downloadBlob(blob, filename);
            resultMessage = t('image_download_result_downloaded', { filename });
        } catch (error) {
            errorMessage = t('image_download_error_failed');
            // Surface the failure to the host on the structured channel (in
            // addition to the panel-local message) so integrations can react
            // without scraping the browser console for diagnostics.
            if (rootEl) {
                reportImageDownloadError(rootEl, error, () =>
                    void handleDownload(),
                );
            }
        } finally {
            isDownloading = false;
        }
    }

    // Render the toolbar/header glyph through the SDK UI service so core owns the
    // `<svg>` wrapper, sizing, color, and accessibility.
    function renderGlyph(node: HTMLElement): { destroy: () => void } {
        const cleanup = ui.renderIcon(DOWNLOAD_ICON, node);
        return { destroy: cleanup };
    }
</script>

<div class="tri-id" data-tri-id bind:this={rootEl}>
    {#if open}
        <div
            class="tri-id-panel"
            role="group"
            aria-label={t('image_download_title')}
            data-tri-id-panel
        >
            <div class="tri-id-header">
                <span use:renderGlyph aria-hidden="true"></span>
                {t('image_download_title')}
            </div>
            <p class="tri-id-desc">{t('image_download_description')}</p>

            <div class="tri-id-fields">
                {#if showModeSelect}
                    <div class="tri-id-field">
                        <label class="tri-id-label" for="tri-id-mode">
                            {t('image_download_mode')}
                        </label>
                        <select
                            id="tri-id-mode"
                            class="tri-id-select"
                            data-tri-id-mode
                            disabled={isDownloading}
                            value={mode}
                            onchange={(e) => {
                                mode = e.currentTarget.value as ImageDownloadMode;
                            }}
                        >
                            {#if showCompositeOption}
                                <option value="composite"
                                    >{t('image_download_mode_composite')}</option
                                >
                            {/if}
                            <option value="single"
                                >{t('image_download_mode_single')}</option
                            >
                            {#if showWorldOption}
                                <option value="world"
                                    >{t('image_download_mode_world')}</option
                                >
                            {/if}
                        </select>
                    </div>
                {/if}

                {#if mode === 'single' && hasMultipleVisibleCanvases}
                    <div class="tri-id-field">
                        <label class="tri-id-label" for="tri-id-canvas">
                            {t('image_download_canvas')}
                        </label>
                        <select
                            id="tri-id-canvas"
                            class="tri-id-select"
                            disabled={isDownloading}
                            value={selectedCanvasIndex}
                            onchange={(e) => {
                                selectedCanvasIndex = parseIndex(
                                    e.currentTarget.value,
                                );
                            }}
                        >
                            {#each visibleCanvases as visibleCanvas, index (index)}
                                <option value={index}>
                                    {getCanvasLabel(visibleCanvas, index)}
                                </option>
                            {/each}
                        </select>
                    </div>
                {/if}

                {#if mode === 'single' && singleModeHasMultipleImages}
                    <div class="tri-id-field">
                        <label class="tri-id-label" for="tri-id-image">
                            {t('image_download_image')}
                        </label>
                        <select
                            id="tri-id-image"
                            class="tri-id-select"
                            disabled={isDownloading}
                            value={selectedImageIndex}
                            onchange={(e) => {
                                selectedImageIndex = parseIndex(
                                    e.currentTarget.value,
                                );
                            }}
                        >
                            {#each singleModeCanvasImages as image, index (index)}
                                <option value={index}>
                                    {image.label ??
                                        `${t('image_download_image')} ${index + 1}`}
                                </option>
                            {/each}
                        </select>
                    </div>
                {/if}

                <div class="tri-id-field">
                    <label class="tri-id-label" for="tri-id-resolution">
                        {t('image_download_resolution')}
                    </label>
                    <select
                        id="tri-id-resolution"
                        class="tri-id-select"
                        data-tri-id-resolution
                        disabled={isDownloading ||
                            isLoadingSizes ||
                            !sizeOptions.length}
                        value={selectedSizeIndex ?? ''}
                        onchange={(e) => {
                            selectedSizeIndex = parseIndex(e.currentTarget.value);
                        }}
                    >
                        <option value="" disabled>
                            {t('image_download_resolution_placeholder')}
                        </option>
                        {#each sizeOptions as option, index (index)}
                            <option value={index}>{option.label}</option>
                        {/each}
                    </select>
                </div>
            </div>

            {#if resultMessage}
                <div class="tri-id-alert is-success" data-tri-id-result>
                    {resultMessage}
                </div>
            {/if}
            {#if errorMessage}
                <div class="tri-id-alert is-error" data-tri-id-error>
                    {errorMessage}
                </div>
            {/if}
            {#if disabledReason}
                <div class="tri-id-alert">{disabledReason}</div>
            {/if}

            <button
                type="button"
                class="tri-id-download"
                data-tri-id-download
                disabled={!canDownload}
                onclick={handleDownload}
            >
                <span use:renderGlyph aria-hidden="true"></span>
                {isDownloading
                    ? t('image_download_downloading')
                    : t('image_download_download')}
            </button>
        </div>
    {/if}

    <button
        type="button"
        class="tri-id-toggle"
        data-tri-id-toggle
        aria-expanded={open}
        aria-label={t('image_download_title')}
        title={t('image_download_title')}
        onclick={() => (open = !open)}
        use:renderGlyph
    ></button>
</div>
