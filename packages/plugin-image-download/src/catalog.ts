import type { LocaleCatalog } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned localization catalog (CONTEXT.md **Active
 * locale**). These strings previously lived in core's `messages/en.json` /
 * `messages/de.json`; migrating the plugin out of core moves them here so the
 * catalog ships with (and evolves with) the plugin, and core's catalogs carry
 * no plugin keys. `en` is the required fallback; a missing key resolves to `en`
 * and then to the key itself. `image_download_result_downloaded` interpolates a
 * `{filename}` param through the locale service.
 */
export const catalog: LocaleCatalog = {
    en: {
        image_download_title: 'Download Image',
        image_download_close: 'Close Download Image',
        image_download_description: 'Download the current canvas as an image.',
        image_download_mode: 'What to download',
        image_download_mode_composite: 'Composite canvas',
        image_download_mode_composite_hint:
            'Every image on the current canvas, composited together.',
        image_download_mode_single: 'Single image',
        image_download_mode_single_hint: 'One image from the current canvas.',
        image_download_mode_world: 'Current view',
        image_download_mode_world_hint:
            'Everything currently laid out together in the viewer.',
        image_download_canvas: 'Canvas',
        image_download_image: 'Image',
        image_download_resolution: 'Resolution',
        image_download_resolution_placeholder: 'Select a resolution',
        image_download_downloading: 'Downloading...',
        image_download_download: 'Download',
        image_download_disabled_no_canvas:
            'Load a manifest to download an image.',
        image_download_disabled_no_resolution:
            'Select a resolution to download.',
        image_download_result_downloaded: 'Downloaded {filename}.',
        image_download_error_failed:
            'Unable to download image. Check the browser console for details.',
    },
    de: {
        image_download_title: 'Bild herunterladen',
        image_download_close: 'Bild-Download schließen',
        image_download_description:
            'Die aktuelle Leinwand als Bild herunterladen.',
        image_download_mode: 'Was heruntergeladen werden soll',
        image_download_mode_composite: 'Zusammengesetzte Leinwand',
        image_download_mode_composite_hint:
            'Alle Bilder der aktuellen Leinwand, zusammengesetzt.',
        image_download_mode_single: 'Einzelbild',
        image_download_mode_single_hint: 'Ein Bild von der aktuellen Leinwand.',
        image_download_mode_world: 'Aktuelle Ansicht',
        image_download_mode_world_hint:
            'Alles, was aktuell zusammen im Viewer angezeigt wird.',
        image_download_canvas: 'Leinwand',
        image_download_image: 'Bild',
        image_download_resolution: 'Auflösung',
        image_download_resolution_placeholder: 'Auflösung auswählen',
        image_download_downloading: 'Wird heruntergeladen...',
        image_download_download: 'Herunterladen',
        image_download_disabled_no_canvas:
            'Laden Sie ein Manifest, um ein Bild herunterzuladen.',
        image_download_disabled_no_resolution:
            'Wählen Sie eine Auflösung zum Herunterladen aus.',
        image_download_result_downloaded: '{filename} heruntergeladen.',
        image_download_error_failed:
            'Bild kann nicht heruntergeladen werden. Details in der Browserkonsole.',
    },
};
