<script lang="ts">
    import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';
    import { Button, Select } from '../../components/ui';
    import { m, language } from '../../state/i18n.svelte';

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
        // hasCoverSheet,
        onStartIndexChange,
        onEndIndexChange,
        onExport,
        embedded = false,
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
        embedded?: boolean;
    } = $props();

    function parseCanvasIndex(value: string): number | null {
        if (value === '') {
            return null;
        }

        const parsed = Number(value);
        return Number.isInteger(parsed) ? parsed : null;
    }
</script>

{#key language.current}
    <div class="panel" data-panel-id="pdf-export" class:standalone={!embedded}>
        {#if !embedded}
            <div class="header">
                <h2 class="header-title">
                    <DownloadSimple size={20} />
                    {m.pdf_export_title()}
                </h2>
            </div>
        {/if}

        <div class="body" class:scrollable={!embedded}>
            <p class="description">
                {m.pdf_export_description()}
            </p>
            <div class="fields">
                <div class="field">
                    <label class="label" for="pdf-export-start-canvas">
                        <span>
                            {m.pdf_export_start_canvas()}
                        </span>
                    </label>
                    <Select
                        id="pdf-export-start-canvas"
                        class="field-select"
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
                        <option value="" disabled>
                            {m.pdf_export_start_canvas_placeholder()}
                        </option>
                        {#each canvasOptions as option (option.id)}
                            <option
                                value={option.index}
                                disabled={endIndex !== null &&
                                    option.index > endIndex}
                            >
                                {option.index + 1}. {option.label}
                            </option>
                        {/each}
                    </Select>
                </div>

                <div class="field">
                    <label class="label" for="pdf-export-end-canvas">
                        <span>{m.pdf_export_end_canvas()}</span>
                    </label>
                    <Select
                        id="pdf-export-end-canvas"
                        class="field-select"
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
                        <option value="" disabled>
                            {m.pdf_export_end_canvas_placeholder()}
                        </option>
                        {#each canvasOptions as option (option.id)}
                            <option
                                value={option.index}
                                disabled={startIndex !== null &&
                                    option.index < startIndex}
                            >
                                {option.index + 1}. {option.label}
                            </option>
                        {/each}
                    </Select>
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <div class="summary-row">
                        <span class="summary-label">
                            {m.pdf_export_selected_canvases()}
                        </span>
                        <span class="summary-count">{selectedCount}</span>
                    </div>

                    {#if progressMessage}
                        <div class="alert alert-info">
                            <span>{progressMessage}</span>
                        </div>
                    {/if}

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
        </div>

        <div class="footer">
            <Button
                variant="primary"
                class="export-button"
                disabled={!canExport}
                onclick={onExport}
            >
                <DownloadSimple size={18} />
                {isExporting
                    ? m.pdf_export_exporting()
                    : m.pdf_export_download()}
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

    .summary-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.875rem;
        line-height: 1.25rem;
    }

    .summary-label {
        color: color-mix(in oklab, var(--panel-fg) 70%, transparent);
    }

    .summary-count {
        font-weight: 600;
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

    .alert.alert-info {
        --alert-color: var(--color-primary);
        color: var(--color-primary-content);
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

    .footer :global(.export-button) {
        width: 100%;
    }
</style>
