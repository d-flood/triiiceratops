import type { LocaleCatalog } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned localization catalog (CONTEXT.md **Active
 * locale**). These strings previously lived in core's `messages/en.json` /
 * `messages/de.json` under the `pdf_export_*` keys; migrating the plugin out of
 * core moves them here so the catalog ships with (and evolves with) the plugin,
 * and core's catalogs carry no plugin keys. `en` is the required fallback; a
 * missing key resolves to `en` and then to the key itself.
 *
 * The `{param}` placeholders are substituted by the SDK locale service's `t`.
 * The progress/error strings are passed through `t` and handed to
 * `exportCanvasRangeAsPdf` as its `messages` builders (the pure export logic
 * itself carries no i18n runtime).
 */
export const catalog: LocaleCatalog = {
    en: {
        pdf_export_title: 'PDF Export',
        pdf_export_close: 'Close PDF Export',
        pdf_export_description:
            'Export a flat range of canvases as one PDF page per canvas.',
        pdf_export_start_canvas: 'Start canvas',
        pdf_export_start_canvas_placeholder: 'Select a start canvas',
        pdf_export_end_canvas: 'End canvas',
        pdf_export_end_canvas_placeholder: 'Select an end canvas',
        pdf_export_selected_canvases: 'Selected canvases',
        pdf_export_exporting: 'Exporting...',
        pdf_export_download: 'Download PDF',
        pdf_export_disabled_no_manifest: 'Load a manifest to export canvases.',
        pdf_export_disabled_no_canvases:
            'No canvases are available to export.',
        pdf_export_disabled_invalid_range:
            'Select a valid start and end canvas to export.',
        pdf_export_progress_preparing: 'Preparing export...',
        pdf_export_progress_cover_sheet: 'Preparing cover sheet...',
        pdf_export_progress_canvas: 'Exporting {current} of {total}: {label}',
        pdf_export_progress_download: 'Preparing download: {filename}',
        pdf_export_result_downloaded:
            'Downloaded {count} canvas(es) as {filename}.',
        pdf_export_result_partial:
            'Downloaded {exportedCount} canvas(es). Skipped {failedCount}.',
        pdf_export_error_failed:
            'Unable to export PDF. Check the browser console for details.',
        pdf_export_error_not_available:
            'PDF export is not available for this item because the image source does not allow direct browser download access.',
        pdf_export_error_no_canvases: 'No canvases available to export.',
        pdf_export_error_no_canvases_exported:
            'Unable to export any canvases to PDF.',
    },
    de: {
        pdf_export_title: 'PDF-Export',
        pdf_export_close: 'PDF-Export schließen',
        pdf_export_description:
            'Exportieren Sie einen zusammenhängenden Canvas-Bereich als PDF mit einer Seite pro Canvas.',
        pdf_export_start_canvas: 'Start-Canvas',
        pdf_export_start_canvas_placeholder: 'Start-Canvas auswählen',
        pdf_export_end_canvas: 'End-Canvas',
        pdf_export_end_canvas_placeholder: 'End-Canvas auswählen',
        pdf_export_selected_canvases: 'Ausgewählte Canvases',
        pdf_export_exporting: 'Export läuft...',
        pdf_export_download: 'PDF herunterladen',
        pdf_export_disabled_no_manifest:
            'Laden Sie ein Manifest, um Canvases zu exportieren.',
        pdf_export_disabled_no_canvases:
            'Es sind keine Canvases zum Export verfügbar.',
        pdf_export_disabled_invalid_range:
            'Wählen Sie einen gültigen Start- und End-Canvas für den Export aus.',
        pdf_export_progress_preparing: 'Export wird vorbereitet...',
        pdf_export_progress_cover_sheet: 'Deckblatt wird vorbereitet...',
        pdf_export_progress_canvas: 'Exportiere {current} von {total}: {label}',
        pdf_export_progress_download:
            'Download wird vorbereitet: {filename}',
        pdf_export_result_downloaded:
            '{count} Canvas(es) als {filename} heruntergeladen.',
        pdf_export_result_partial:
            '{exportedCount} Canvas(es) heruntergeladen. {failedCount} übersprungen.',
        pdf_export_error_failed:
            'PDF konnte nicht exportiert werden. Details finden Sie in der Browser-Konsole.',
        pdf_export_error_not_available:
            'Der PDF-Export ist für dieses Objekt nicht verfügbar, weil die Bildquelle keinen direkten Download im Browser erlaubt.',
        pdf_export_error_no_canvases: 'Keine Canvases zum Export verfügbar.',
        pdf_export_error_no_canvases_exported:
            'Es konnten keine Canvases als PDF exportiert werden.',
    },
};
