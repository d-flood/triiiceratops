import type { LocaleCatalog } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned localization catalog (CONTEXT.md **Active locale**).
 * These strings previously lived in core's `messages/en.json` / `messages/de.json`;
 * migrating the plugin out of core moves them here so the catalog ships with (and
 * evolves with) the plugin, and core's catalogs carry no plugin keys. `en` is the
 * required fallback; a missing key resolves to `en` and then to the key itself.
 */
export const catalog: LocaleCatalog = {
    en: {
        annotation_editor_title: 'Annotation Editor',
        annotation_editor_edit_mode: 'Edit',
        annotation_editor_create_mode: 'Create',
        annotation_editor_instruction_create:
            'Click to start annotating, click again to set shape',
        annotation_editor_instruction_edit:
            'Click on an annotation to select and edit it',
        annotation_editor_tool_label: 'Drawing Tool',
        annotation_editor_undo: 'Undo',
        annotation_editor_redo: 'Redo',
        annotation_editor_edit_section: 'Edit Annotation',
        annotation_editor_delete_tooltip: 'Delete annotation',
        annotation_editor_tag_placeholder: 'Tag value...',
        annotation_editor_link_placeholder: 'https://...',
        annotation_editor_text_placeholder: 'Enter text...',
        annotation_editor_add_content: 'Add Content',
        annotation_editor_unknown_body_note:
            'This structured body is shown read-only and will be preserved when you save.',
        annotation_editor_hydrating: 'Loading the full annotation text...',
        annotation_editor_save: 'Save Changes',
        annotation_editor_delete_title: 'Delete Annotation?',
        annotation_editor_delete_message:
            'Are you sure you want to delete this annotation? This action cannot be undone.',
        annotation_editor_cancel: 'Cancel',
        annotation_editor_delete: 'Delete',
        annotation_editor_error_load:
            "Couldn't load annotations. Please try again.",
        annotation_editor_error_create:
            "Couldn't save the new annotation. Please try again.",
        annotation_editor_error_update:
            "Couldn't save your changes. Please try again.",
        annotation_editor_error_delete:
            "Couldn't delete the annotation. Please try again.",
        annotation_editor_error_hydrate:
            "Couldn't load the full annotation. Please try again.",
        annotation_editor_error_dismiss: 'Dismiss',
        annotation_tool_rectangle: 'Rectangle',
        annotation_tool_polygon: 'Polygon',
        annotation_tool_point: 'Point',
    },
    de: {
        annotation_editor_title: 'Anmerkungs-Editor',
        annotation_editor_edit_mode: 'Bearbeiten',
        annotation_editor_create_mode: 'Erstellen',
        annotation_editor_instruction_create:
            'Klicken zum Annotieren, erneut klicken zum Abschließen',
        annotation_editor_instruction_edit:
            'Anmerkung klicken zum Bearbeiten',
        annotation_editor_tool_label: 'Zeichenwerkzeug',
        annotation_editor_undo: 'Rückgängig',
        annotation_editor_redo: 'Wiederholen',
        annotation_editor_edit_section: 'Anmerkung bearbeiten',
        annotation_editor_delete_tooltip: 'Anmerkung löschen',
        annotation_editor_tag_placeholder: 'Tag eingeben...',
        annotation_editor_link_placeholder: 'https://...',
        annotation_editor_text_placeholder: 'Text eingeben...',
        annotation_editor_add_content: 'Inhalt hinzufügen',
        annotation_editor_unknown_body_note:
            'Dieser strukturierte Inhalt wird schreibgeschützt angezeigt und beim Speichern beibehalten.',
        annotation_editor_hydrating:
            'Vollständiger Anmerkungstext wird geladen...',
        annotation_editor_save: 'Speichern',
        annotation_editor_delete_title: 'Anmerkung löschen?',
        annotation_editor_delete_message:
            'Anmerkung wirklich löschen? Dies kann nicht rückgängig gemacht werden.',
        annotation_editor_cancel: 'Abbrechen',
        annotation_editor_delete: 'Löschen',
        annotation_editor_error_load:
            'Anmerkungen konnten nicht geladen werden. Bitte erneut versuchen.',
        annotation_editor_error_create:
            'Neue Anmerkung konnte nicht gespeichert werden. Bitte erneut versuchen.',
        annotation_editor_error_update:
            'Änderungen konnten nicht gespeichert werden. Bitte erneut versuchen.',
        annotation_editor_error_delete:
            'Anmerkung konnte nicht gelöscht werden. Bitte erneut versuchen.',
        annotation_editor_error_hydrate:
            'Vollständige Anmerkung konnte nicht geladen werden. Bitte erneut versuchen.',
        annotation_editor_error_dismiss: 'Schließen',
        annotation_tool_rectangle: 'Rechteck',
        annotation_tool_polygon: 'Polygon',
        annotation_tool_point: 'Punkt',
    },
};
