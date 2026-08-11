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

    import { Button, Select } from '@triiiceratops/ui';

    import {
        downloadBlob,
        getCanvasId,
        getCanvasLabel,
        resolveLanguageValue,
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
        getImageHost,
        getVisibleCanvasesForDownload,
        isCrossOriginImageFailure,
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
            s.manifestId,
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

    const t = (
        key: string,
        params?: Record<string, string | number>,
    ): string => {
        void localeTick;
        return locale.t(key, params);
    };

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

    // The manifest's own label, in the viewer's active locale, for the default
    // download filename. Read off the raw Manifest JSON the manifest cache
    // holds: `label` is spelled the same in v2 and v3, and the value-shape
    // difference is what `resolveLanguageValue` absorbs.
    const manifestLabel = $derived.by(() => {
        void stateTick;
        void localeTick;
        return (
            resolveLanguageValue(
                viewerState.manifestEntry?.json?.label,
                locale.current,
            ) || null
        );
    });

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

    /**
     * The reader-facing message for a failed download.
     *
     * An image server declining to let this page read its images is a policy
     * decision, not a fault, and it is the one failure a reader can act on: the
     * image is downloadable from the provider's own site and nowhere else. So it
     * says that plainly and names the host, rather than sending the reader to the
     * browser console to find out that nothing is wrong with the viewer. The
     * mechanics — which URL, which browser error — go to the console for whoever
     * is integrating.
     */
    function describeFailure(error: unknown): string {
        if (!isCrossOriginImageFailure(error)) {
            return t('image_download_error_failed');
        }

        const resolved =
            mode === 'single'
                ? singleModeCanvasImages[selectedImageIndex]
                : canvasImages[0];
        const host = resolved ? getImageHost(resolved) : null;

        // The browser has already logged its own CORS error for this request,
        // which reads as a viewer defect. This is the one line saying it is not
        // one, next to the message it explains; the panel message above is the
        // reader-facing surface and the failure also goes to `pluginerror`.
        // triiiceratops-console-allow — recorded in lint-allowlist.md.
        console.warn(
            '[ImageDownload] The image server refused to let this page read ' +
                'the image, so it cannot be downloaded or composited here. ' +
                "That is the image server's cross-origin policy — no " +
                "'Access-Control-Allow-Origin' header on the image response — " +
                'not a viewer error, and not something the viewer can change. ' +
                'The images still display because painting an image needs no ' +
                'such permission; reading its pixels back does.',
            { host, mode, resolution: selectedSizeOption?.label, error },
        );

        return host
            ? t('image_download_error_not_allowed', { host })
            : t('image_download_error_not_allowed_unknown_host');
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
                blob = await exportSingleImage(
                    resolvedImage,
                    selectedSizeOption,
                );
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
                getCanvasLabel(
                    downloadCanvas,
                    viewerState.currentCanvasIndex,
                    locale.current,
                ),
                mode,
                // The bytes decide the extension. A composited export really is
                // a PNG, but a single image is whatever the image service sent,
                // and naming a JPEG `.png` misleads every tool downstream.
                blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
                manifestLabel,
            );
            downloadBlob(blob, filename);
            resultMessage = t('image_download_result_downloaded', { filename });
        } catch (error) {
            errorMessage = describeFailure(error);
            // Surface the failure to the host on the structured channel (in
            // addition to the panel-local message) so integrations can react
            // without scraping the browser console for diagnostics.
            if (rootEl) {
                reportImageDownloadError(
                    rootEl,
                    error,
                    () => void handleDownload(),
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

<!--
    Panel CONTENT ONLY (core-owned-chrome path, ticket 04). Core renders the
    toolbar button (from `meta.icon`) and the docked panel header/title, and owns
    open/close + docking; this component mounts only the panel body + footer into
    the core-provided container. No self-rendered toggle, no `position: absolute`.
-->
<div
    class="tri-id"
    data-tri-id
    data-panel-id="image-download"
    bind:this={rootEl}
>
    <div class="tri-id-body">
        <p class="tri-id-desc">{t('image_download_description')}</p>

        <div class="tri-id-fields">
            {#if showModeSelect}
                <div class="tri-id-field">
                    <label class="tri-id-label" for="tri-id-mode">
                        <span>{t('image_download_mode')}</span>
                    </label>
                    <Select
                        id="tri-id-mode"
                        class="tri-id-field-select"
                        data-tri-id-mode
                        aria-label={t('image_download_mode')}
                        disabled={isDownloading}
                        value={mode}
                        onchange={(e) => {
                            mode = (e.currentTarget as HTMLSelectElement)
                                .value as ImageDownloadMode;
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
                    </Select>
                </div>
            {/if}

            {#if mode === 'single' && hasMultipleVisibleCanvases}
                <div class="tri-id-field">
                    <label class="tri-id-label" for="tri-id-canvas">
                        <span>{t('image_download_canvas')}</span>
                    </label>
                    <Select
                        id="tri-id-canvas"
                        class="tri-id-field-select"
                        aria-label={t('image_download_canvas')}
                        disabled={isDownloading}
                        value={selectedCanvasIndex}
                        onchange={(e) => {
                            selectedCanvasIndex = parseIndex(
                                (e.currentTarget as HTMLSelectElement).value,
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
                <div class="tri-id-field">
                    <label class="tri-id-label" for="tri-id-image">
                        <span>{t('image_download_image')}</span>
                    </label>
                    <Select
                        id="tri-id-image"
                        class="tri-id-field-select"
                        aria-label={t('image_download_image')}
                        disabled={isDownloading}
                        value={selectedImageIndex}
                        onchange={(e) => {
                            selectedImageIndex = parseIndex(
                                (e.currentTarget as HTMLSelectElement).value,
                            );
                        }}
                    >
                        {#each singleModeCanvasImages as image, index (index)}
                            <option value={index}>
                                {image.label ??
                                    `${t('image_download_image')} ${index + 1}`}
                            </option>
                        {/each}
                    </Select>
                </div>
            {/if}

            <div class="tri-id-field">
                <label class="tri-id-label" for="tri-id-resolution">
                    <span>{t('image_download_resolution')}</span>
                </label>
                <Select
                    id="tri-id-resolution"
                    class="tri-id-field-select"
                    data-tri-id-resolution
                    aria-label={t('image_download_resolution')}
                    disabled={isDownloading ||
                        isLoadingSizes ||
                        !sizeOptions.length}
                    value={selectedSizeIndex ?? ''}
                    onchange={(e) => {
                        selectedSizeIndex = parseIndex(
                            (e.currentTarget as HTMLSelectElement).value,
                        );
                    }}
                >
                    <option value="" disabled>
                        {t('image_download_resolution_placeholder')}
                    </option>
                    {#each sizeOptions as option, index (index)}
                        <option value={index}>{option.label}</option>
                    {/each}
                </Select>
            </div>
        </div>

        {#if resultMessage || errorMessage || disabledReason}
            <div class="tri-id-card">
                <div class="tri-id-card-body">
                    {#if resultMessage}
                        <div class="tri-id-alert is-success" data-tri-id-result>
                            <span>{resultMessage}</span>
                        </div>
                    {/if}
                    {#if errorMessage}
                        <div class="tri-id-alert is-error" data-tri-id-error>
                            <span>{errorMessage}</span>
                        </div>
                    {/if}
                    {#if disabledReason}
                        <div class="tri-id-alert">
                            <span>{disabledReason}</span>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}
    </div>

    <div class="tri-id-footer">
        <Button
            variant="primary"
            class="tri-id-download"
            data-tri-id-download
            style="width:100%"
            disabled={!canDownload}
            onclick={handleDownload}
        >
            <span use:renderGlyph aria-hidden="true"></span>
            {isDownloading
                ? t('image_download_downloading')
                : t('image_download_download')}
        </Button>
    </div>
</div>
