<script lang="ts">
    import X from 'phosphor-svelte/lib/X';
    import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';

    type CanvasOption = {
        id: string;
        label: string;
        index: number;
    };

    let {
        canvasOptions,
        startIndex,
        endIndex,
        selectedCount,
        isExporting,
        progressMessage,
        resultMessage,
        errorMessage,
        canExport,
        disabledReason,
        hasCoverSheet,
        onStartIndexChange,
        onEndIndexChange,
        onExport,
        onClose,
    }: {
        canvasOptions: CanvasOption[];
        startIndex: number | null;
        endIndex: number | null;
        selectedCount: number;
        isExporting: boolean;
        progressMessage: string;
        resultMessage: string;
        errorMessage: string;
        canExport: boolean;
        disabledReason: string | null;
        hasCoverSheet: boolean;
        onStartIndexChange: (value: number | null) => void;
        onEndIndexChange: (value: number | null) => void;
        onExport: () => void;
        onClose: () => void;
    } = $props();

    function parseCanvasIndex(value: string): number | null {
        if (value === '') {
            return null;
        }

        const parsed = Number(value);
        return Number.isInteger(parsed) ? parsed : null;
    }
</script>

<div
    class="w-80 h-full bg-base-200 border-r border-base-300 shadow-xl flex flex-col"
>
    <div class="flex items-center justify-between p-4 border-b border-base-300">
        <h2 class="text-lg font-semibold flex items-center gap-2">
            <DownloadSimple size={20} />
            PDF export
        </h2>
        <button
            class="btn btn-sm btn-ghost btn-circle"
            onclick={onClose}
            aria-label="Close PDF export"
        >
            <X size={20} />
        </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <p class="text-sm text-base-content/70">
            Export a flat range of canvases as one PDF page per canvas. IIIF OCR
            annotations marked as supplementing text are embedded as selectable
            PDF text when present.
        </p>

        {#if hasCoverSheet}
            <div class="alert alert-info alert-soft text-sm">
                A configured cover sheet will be included before the selected
                canvases.
            </div>
        {/if}

        <div class="grid grid-cols-1 gap-3">
            <div class="form-control w-full">
                <label class="label" for="pdf-export-start-canvas">
                    <span class="label-text">Start canvas</span>
                </label>
                <select
                    id="pdf-export-start-canvas"
                    class="select select-bordered w-full"
                    disabled={!canvasOptions.length || isExporting}
                    value={startIndex ?? ''}
                    onchange={(event) =>
                        onStartIndexChange(
                            parseCanvasIndex(
                                (event.currentTarget as HTMLSelectElement)
                                    .value,
                            ),
                        )}
                >
                    <option value="" disabled> Select a start canvas </option>
                    {#each canvasOptions as option (option.id)}
                        <option
                            value={option.index}
                            disabled={endIndex !== null &&
                                option.index > endIndex}
                        >
                            {option.index + 1}. {option.label}
                        </option>
                    {/each}
                </select>
            </div>

            <div class="form-control w-full">
                <label class="label" for="pdf-export-end-canvas">
                    <span class="label-text">End canvas</span>
                </label>
                <select
                    id="pdf-export-end-canvas"
                    class="select select-bordered w-full"
                    disabled={!canvasOptions.length || isExporting}
                    value={endIndex ?? ''}
                    onchange={(event) =>
                        onEndIndexChange(
                            parseCanvasIndex(
                                (event.currentTarget as HTMLSelectElement)
                                    .value,
                            ),
                        )}
                >
                    <option value="" disabled> Select an end canvas </option>
                    {#each canvasOptions as option (option.id)}
                        <option
                            value={option.index}
                            disabled={startIndex !== null &&
                                option.index < startIndex}
                        >
                            {option.index + 1}. {option.label}
                        </option>
                    {/each}
                </select>
            </div>
        </div>

        <div class="card bg-base-100 border border-base-300">
            <div class="card-body gap-2 p-4">
                <div class="flex items-center justify-between text-sm">
                    <span class="text-base-content/70">Selected canvases</span>
                    <span class="font-semibold">{selectedCount}</span>
                </div>

                {#if progressMessage}
                    <div class="alert alert-info alert-soft text-sm py-2">
                        <span>{progressMessage}</span>
                    </div>
                {/if}

                {#if resultMessage}
                    <div class="alert alert-success alert-soft text-sm py-2">
                        <span>{resultMessage}</span>
                    </div>
                {/if}

                {#if errorMessage}
                    <div class="alert alert-error alert-soft text-sm py-2">
                        <span>{errorMessage}</span>
                    </div>
                {/if}

                {#if disabledReason}
                    <div class="alert alert-soft text-sm py-2">
                        <span>{disabledReason}</span>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div class="p-4 border-t border-base-300">
        <button
            class="btn btn-primary btn-block"
            disabled={!canExport}
            onclick={onExport}
        >
            <DownloadSimple size={18} />
            {isExporting ? 'Exporting...' : 'Download PDF'}
        </button>
    </div>
</div>
