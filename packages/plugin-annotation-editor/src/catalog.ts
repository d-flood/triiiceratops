import type { LocaleCatalog } from '@triiiceratops/plugin-sdk';

/**
 * The plugin's package-owned localization catalog (CONTEXT.md **Active locale**).
 * The catalog ships with (and evolves with) the plugin, so core's catalogs carry
 * no plugin keys. `en` is the required fallback; a missing key resolves to `en`
 * and then to the key itself.
 */
export const catalog: LocaleCatalog = {
    en: {
        annotation_editor_title: 'Annotation Editor',
        annotation_editor_edit_mode: 'Edit',
        annotation_editor_create_mode: 'Create',
        annotation_editor_instruction_rectangle:
            'Drag a box around the region to annotate',
        annotation_editor_instruction_ellipse:
            'Drag a box; the ellipse inscribed in it is what is saved',
        annotation_editor_instruction_polygon:
            'Click once per vertex; Enter or a double-click closes the outline',
        annotation_editor_instruction_point: 'Click once to place a point',
        annotation_editor_instruction_whole_canvas:
            'Choose the tool to annotate the whole canvas — there is nothing to draw',
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
        annotation_editor_handle_resize: 'Resize {edge}',
        annotation_editor_handle_move: 'Move annotation',
        annotation_editor_handle_vertex: 'Move vertex {index}',
        annotation_editor_handle_point: 'Move point',
        annotation_editor_edge_nw: 'top left',
        annotation_editor_edge_n: 'top',
        annotation_editor_edge_ne: 'top right',
        annotation_editor_edge_e: 'right',
        annotation_editor_edge_se: 'bottom right',
        annotation_editor_edge_s: 'bottom',
        annotation_editor_edge_sw: 'bottom left',
        annotation_editor_edge_w: 'left',
        annotation_editor_keys_title: 'Keyboard shortcuts',
        annotation_editor_keys_create:
            'Enter on a tool places a default shape at the centre of the view',
        annotation_editor_keys_nudge:
            'Arrow keys nudge the focused handle, vertex or shape',
        annotation_editor_keys_nudge_large:
            'Shift with an arrow key takes the larger step',
        annotation_editor_keys_tab:
            "Tab and Shift+Tab move between a shape's handles and vertices",
        annotation_editor_keys_commit:
            'Enter commits the shape; Escape cancels, then disarms the tool',
        annotation_editor_keys_delete:
            'Delete removes the annotation being edited',
        annotation_editor_keys_vertex:
            'I adds a polygon vertex after the focused one; X removes it',
        annotation_tool_rectangle: 'Rectangle',
        annotation_tool_ellipse: 'Ellipse',
        annotation_tool_polygon: 'Polygon',
        annotation_tool_point: 'Point',
        annotation_tool_whole_canvas: 'Whole canvas',
    },
    de: {
        annotation_editor_title: 'Anmerkungs-Editor',
        annotation_editor_edit_mode: 'Bearbeiten',
        annotation_editor_create_mode: 'Erstellen',
        annotation_editor_instruction_rectangle:
            'Ziehen Sie einen Rahmen um den Bereich',
        annotation_editor_instruction_ellipse:
            'Ziehen Sie einen Rahmen; gespeichert wird die einbeschriebene Ellipse',
        annotation_editor_instruction_polygon:
            'Je Punkt einmal klicken; Eingabetaste oder Doppelklick schließt den Umriss',
        annotation_editor_instruction_point:
            'Einmal klicken, um einen Punkt zu setzen',
        annotation_editor_instruction_whole_canvas:
            'Werkzeug wählen, um die ganze Leinwand zu annotieren — es gibt nichts zu zeichnen',
        annotation_editor_instruction_edit: 'Anmerkung klicken zum Bearbeiten',
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
        annotation_editor_handle_resize: 'Größe ändern: {edge}',
        annotation_editor_handle_move: 'Anmerkung verschieben',
        annotation_editor_handle_vertex: 'Punkt {index} verschieben',
        annotation_editor_handle_point: 'Punkt verschieben',
        annotation_editor_edge_nw: 'oben links',
        annotation_editor_edge_n: 'oben',
        annotation_editor_edge_ne: 'oben rechts',
        annotation_editor_edge_e: 'rechts',
        annotation_editor_edge_se: 'unten rechts',
        annotation_editor_edge_s: 'unten',
        annotation_editor_edge_sw: 'unten links',
        annotation_editor_edge_w: 'links',
        annotation_editor_keys_title: 'Tastaturkürzel',
        annotation_editor_keys_create:
            'Eingabetaste auf einem Werkzeug setzt eine Standardform in die Mitte der Ansicht',
        annotation_editor_keys_nudge:
            'Pfeiltasten verschieben den fokussierten Griff, Punkt oder die Form',
        annotation_editor_keys_nudge_large:
            'Umschalt mit einer Pfeiltaste nimmt den größeren Schritt',
        annotation_editor_keys_tab:
            'Tab und Umschalt+Tab wechseln zwischen Griffen und Punkten einer Form',
        annotation_editor_keys_commit:
            'Eingabetaste übernimmt die Form; Escape bricht ab und legt dann das Werkzeug weg',
        annotation_editor_keys_delete: 'Entf löscht die bearbeitete Anmerkung',
        annotation_editor_keys_vertex:
            'I fügt einen Polygonpunkt nach dem fokussierten ein; X entfernt ihn',
        annotation_tool_rectangle: 'Rechteck',
        annotation_tool_ellipse: 'Ellipse',
        annotation_tool_polygon: 'Polygon',
        annotation_tool_point: 'Punkt',
        annotation_tool_whole_canvas: 'Ganze Leinwand',
    },
};
