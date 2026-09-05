/*
 * The demo page chrome's own strings, and the page locale they read.
 *
 * Deliberately NOT part of core's inlang message set: that set is compiled into
 * a runtime-indexed table (`createLocalizedMessages`' Proxy) that no bundler can
 * tree-shake, so every demo-only key enrolled there is bytes in the shipped
 * element artifact. The app owns the locale outright and hands it to the viewer
 * as the `locale` configuration input, which is the API a real consumer has, so
 * the header's language picker moves the demo and the viewer together.
 */

const en = {
    change_theme_label: 'Change Theme',
    copied: 'Copied!',
    copy_config: 'Copy Config',
    demo_header_active_canvas: 'Active Canvas',
    demo_header_external_controls: 'External Controls:',
    demo_title: 'Triiiceratops IIIF Viewer',
    docs: 'Docs',
    drop_hint: 'Drop a IIIF link or content state to open it',
    drop_rejected: 'That was not a IIIF manifest URL or content state.',
    github: 'GitHub',
    iiif_manifest_label: 'IIIF Manifest:',
    language_select_label: 'Select language',
    link_copied: 'Link Copied!',
    load: 'Load',
    manifest_placeholder: 'Enter IIIF manifest URL',
    no_canvases_loaded: 'No canvases loaded',
    recipe_browser_group_institutional: 'Institutional manifests',
    recipe_browser_group_local: 'Local demo manifests',
    recipe_browser_group_waveforms: 'Waveforms (live Avalon)',
    recipe_browser_hide: 'Hide manifest list',
    recipe_browser_show: 'Show manifest list',
    recipe_browser_title: 'Manifests',
    recipe_support_partial: 'partial',
    recipe_support_unsupported: 'unsupported',
    reset_config: 'Reset Config',
    settings_category_configuration: 'Configuration',
    settings_category_general: 'General',
    settings_gallery_size: 'Gallery Size',
    settings_label: 'Settings',
    settings_paged_view_offset: 'Paged View Offset',
    settings_position_bottom: 'Bottom',
    settings_position_floating: 'Floating',
    settings_position_left: 'Left',
    settings_position_right: 'Right',
    settings_position_top: 'Top',
    settings_select_dock_position: 'Dock Position',
    settings_submenu_annotations: 'Annotations',
    settings_submenu_collection: 'Collection',
    settings_submenu_gallery: 'Gallery',
    settings_submenu_information: 'Information',
    settings_submenu_renderer: 'Renderer',
    settings_submenu_search: 'Search',
    settings_submenu_structures: 'Structures / TOC',
    settings_submenu_toolbar: 'Toolbar',
    settings_toggle_canvas_nav: 'Canvas Nav',
    settings_toggle_close_button: 'Close Button',
    settings_toggle_draggable: 'Draggable',
    settings_toggle_expanded: 'Expanded',
    settings_toggle_open: 'Open',
    settings_toggle_panel_open: 'Panel Open',
    settings_toggle_show_annotations: 'Show Annotations',
    settings_toggle_show_canvas_info_button: 'Canvas Info Button',
    settings_toggle_show_collection: 'Show Collection',
    settings_toggle_show_fullscreen: 'Show Fullscreen',
    settings_toggle_show_gallery: 'Show Gallery',
    settings_toggle_show_info: 'Show Information',
    settings_toggle_show_search: 'Show Search',
    settings_toggle_show_structures: 'Show Structures',
    settings_toggle_show_toggle: 'Show Open/Close',
    settings_toggle_show_viewing_mode: 'Show Viewing Mode',
    settings_toggle_zoom_controls: 'Zoom Controls',
    settings_toolbar_position: 'Toolbar Position',
    settings_transparent_background: 'Transparent Background',
    settings_view_configuration: 'Viewer Configuration',
    settings_zoom_per_wheel_notch: 'Wheel Zoom Speed',
    share_current_state: 'Share Current State',
    theme_menu_title: 'Theme',
    viewer_variant_core: 'Core',
    viewer_variant_custom_theme: 'Custom Theme',
    viewer_variant_full: 'Full',
    viewer_variant_svelte: 'Svelte',
    viewer_variant_svelte_component_tooltip:
        'Svelte component (not web component)',
    viewer_variant_tooltip_core: 'Example without plugins',
    viewer_variant_tooltip_custom_theme: 'Example with custom theme override',
    viewer_variant_tooltip_full: 'Example with plugins',
    viewing_direction_btt: 'Bottom-to-Top',
    viewing_direction_label: 'Viewing Direction',
    viewing_direction_ltr: 'Left-to-Right',
    viewing_direction_rtl: 'Right-to-Left',
    viewing_direction_ttb: 'Top-to-Bottom',
    viewing_mode_continuous: 'Continuous',
    viewing_mode_individuals: 'Individuals',
    viewing_mode_label: 'Viewing Mode',
    viewing_mode_paged: 'Paged',
} as const;

type DemoMessageKey = keyof typeof en;

const de: Record<DemoMessageKey, string> = {
    change_theme_label: 'Design ändern',
    copied: 'Kopiert!',
    copy_config: 'Konfiguration kopieren',
    demo_header_active_canvas: 'Aktives Canvas',
    demo_header_external_controls: 'Externe Steuerelemente:',
    demo_title: 'Triiiceratops IIIF-Viewer',
    docs: 'Doku',
    drop_hint: 'IIIF-Link oder Content State hier ablegen, um ihn zu öffnen',
    drop_rejected: 'Das war keine IIIF-Manifest-URL und kein Content State.',
    github: 'GitHub',
    iiif_manifest_label: 'IIIF-Manifest:',
    language_select_label: 'Sprache wählen',
    link_copied: 'Link kopiert!',
    load: 'Laden',
    manifest_placeholder: 'IIIF-Manifest-URL eingeben',
    no_canvases_loaded: 'Keine Canvases geladen',
    recipe_browser_group_institutional: 'Manifeste von Institutionen',
    recipe_browser_group_local: 'Lokale Demo-Manifeste',
    recipe_browser_group_waveforms: 'Wellenformen (Avalon, live)',
    recipe_browser_hide: 'Manifestliste ausblenden',
    recipe_browser_show: 'Manifestliste anzeigen',
    recipe_browser_title: 'Manifeste',
    recipe_support_partial: 'teilweise',
    recipe_support_unsupported: 'nicht unterstützt',
    reset_config: 'Konfiguration zurücksetzen',
    settings_category_configuration: 'Konfiguration',
    settings_category_general: 'Allgemein',
    settings_gallery_size: 'Galeriegröße',
    settings_label: 'Einstellungen',
    settings_paged_view_offset: 'Seitenansatz verschieben',
    settings_position_bottom: 'Unten',
    settings_position_floating: 'Schwebend',
    settings_position_left: 'Links',
    settings_position_right: 'Rechts',
    settings_position_top: 'Oben',
    settings_select_dock_position: 'Andockposition',
    settings_submenu_annotations: 'Annotationen',
    settings_submenu_collection: 'Sammlung',
    settings_submenu_gallery: 'Galerie',
    settings_submenu_information: 'Informationen',
    settings_submenu_renderer: 'Renderer',
    settings_submenu_search: 'Suche',
    settings_submenu_structures: 'Strukturen / Inhaltsverzeichnis',
    settings_submenu_toolbar: 'Werkzeugleiste',
    settings_toggle_canvas_nav: 'Canvas-Navigation',
    settings_toggle_close_button: 'Schließen-Button',
    settings_toggle_draggable: 'Verschiebbar',
    settings_toggle_expanded: 'Vergrößert',
    settings_toggle_open: 'Öffnen',
    settings_toggle_panel_open: 'Panel geöffnet',
    settings_toggle_show_annotations: 'Annotationen anzeigen',
    settings_toggle_show_canvas_info_button: 'Canvas-Info-Button',
    settings_toggle_show_collection: 'Sammlung anzeigen',
    settings_toggle_show_fullscreen: 'Vollbild anzeigen',
    settings_toggle_show_gallery: 'Galerie anzeigen',
    settings_toggle_show_info: 'Informationen anzeigen',
    settings_toggle_show_search: 'Suche anzeigen',
    settings_toggle_show_structures: 'Strukturen anzeigen',
    settings_toggle_show_toggle: 'Auf/Zu-Button',
    settings_toggle_show_viewing_mode: 'Ansichtsmodus anzeigen',
    settings_toggle_zoom_controls: 'Zoom-Steuerelemente',
    settings_toolbar_position: 'Werkzeugleisten-Position',
    settings_transparent_background: 'Transparenter Hintergrund',
    settings_view_configuration: 'Viewer-Konfiguration',
    settings_zoom_per_wheel_notch: 'Zoomgeschwindigkeit (Rad)',
    share_current_state: 'Aktuellen Zustand teilen',
    theme_menu_title: 'Design',
    viewer_variant_core: 'Basis',
    viewer_variant_custom_theme: 'Benutzerdefiniertes Thema',
    viewer_variant_full: 'Vollständig',
    viewer_variant_svelte: 'Svelte',
    viewer_variant_svelte_component_tooltip:
        'Svelte-Komponente (keine Web-Komponente)',
    viewer_variant_tooltip_core: 'Beispiel ohne Plugins',
    viewer_variant_tooltip_custom_theme:
        'Beispiel mit benutzerdefiniertem Thema',
    viewer_variant_tooltip_full: 'Beispiel mit Plugins',
    viewing_direction_btt: 'Unten nach Oben',
    viewing_direction_label: 'Ansichtsrichtung',
    viewing_direction_ltr: 'Links nach Rechts',
    viewing_direction_rtl: 'Rechts nach Links',
    viewing_direction_ttb: 'Oben nach Unten',
    viewing_mode_continuous: 'Kontinuierlich',
    viewing_mode_individuals: 'Einzelseiten',
    viewing_mode_label: 'Ansichtsmodus',
    viewing_mode_paged: 'Doppelseiten',
};

const tables: Record<string, Record<DemoMessageKey, string>> = { en, de };

/**
 * The locales the playground's own chrome is translated into. Also what the
 * language picker offers, and what it hands the viewer as its `locale` input —
 * the viewer translates a wider set, but offering one the demo chrome cannot
 * follow would leave the page half-translated.
 */
export const DEMO_LOCALES = Object.keys(tables);

/** The page locale. Owned here; nothing outside this app reads it. */
export const language = $state({ current: 'en' });

/**
 * The message namespace over the tables above: `m.docs()` reads the current page
 * locale, so the strings re-render when it changes. Unknown locales fall back to
 * English.
 */
export const m = Object.fromEntries(
    (Object.keys(en) as DemoMessageKey[]).map((key) => [
        key,
        () => (tables[language.current] ?? en)[key],
    ]),
) as Record<DemoMessageKey, () => string>;
