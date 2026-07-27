import type { LocaleCatalog } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned localization catalog (CONTEXT.md **Active
 * locale**). These strings previously lived in core's `messages/en.json` /
 * `messages/de.json`; migrating the plugin out of core moves them here so the
 * catalog ships with (and evolves with) the plugin, and core's catalogs carry
 * no plugin keys. `en` is the required fallback; a missing key resolves to `en`
 * and then to the key itself.
 */
export const catalog: LocaleCatalog = {
    en: {
        image_adjustments_title: 'Image Adjustments',
        image_filters_brightness: 'Brightness',
        image_filters_contrast: 'Contrast',
        image_filters_saturation: 'Saturation',
        image_filters_invert: 'Invert Colors',
        image_filters_grayscale: 'Grayscale',
        image_filters_reset: 'Reset to Default',
    },
    de: {
        image_adjustments_title: 'Bildanpassungen',
        image_filters_brightness: 'Helligkeit',
        image_filters_contrast: 'Kontrast',
        image_filters_saturation: 'Sättigung',
        image_filters_invert: 'Farben umkehren',
        image_filters_grayscale: 'Graustufen',
        image_filters_reset: 'Zurücksetzen',
    },
};
