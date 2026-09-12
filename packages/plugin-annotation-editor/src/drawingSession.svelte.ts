/**
 * The arming state the panel and the drawing layer share.
 *
 * The two live in different component trees — the panel is mounted into core's
 * plugin surface, the layer into the overlay-layer container — so the tool the
 * reader armed reaches the layer through this object rather than through props.
 * Reactive so the layer's `pointer-events` follow the panel's mode toggle
 * without either side polling.
 */
import type { W3CAnnotation } from './adapters/types';
import type { DrawingTool } from './types';

export class DrawingSession {
    /**
     * The armed tool, or `null` while the reader is in edit mode — arming is
     * modal, and this is what the layer's whole-surface `pointer-events: auto`
     * is gated on.
     */
    armedTool = $state<DrawingTool | null>(null);

    /**
     * The persisted annotation open for editing, or `null`. The panel decides
     * it — a tap on a shape reaches core's edit bus, which the controller owns
     * — and the drawing layer draws its shape and its handles, which is what
     * makes core's own rendering of that one annotation stand down.
     */
    editingAnnotationId = $state<string | null>(null);

    /**
     * Set by the controller when an edit was opened by TAPPING the shape on the
     * image, and cleared by the drawing layer once focus is on it.
     *
     * A tap leaves focus wherever it was — core's own shape is removed the
     * instant the editor takes the rendering over, so the document is left
     * focused on nothing. Every keyboard verb the open shape has (nudge,
     * commit, delete, the vertex keys) is bound on the shape, so until focus
     * reaches it a reader who taps a shape has no keyboard at all.
     *
     * Only the tap. Selecting the annotation from the panel's LIST opens the
     * same edit, and pulling focus out of the list onto the image would take
     * the reader off the control they are actually working in.
     */
    focusOnEdit = $state(false);

    /**
     * Set by the controller so a committed shape opens its body editor. Not
     * reactive state: it is wiring, replaced only when the controller mounts.
     */
    onCreated: ((annotation: W3CAnnotation) => void) | null = null;

    /**
     * The host's `extension.prepareDraft` / `prepareAnnotation` hook, applied
     * to a NEW annotation before its first save. Set by the controller, which
     * is where the config and the runtime context the hook is handed live;
     * called by the drawing layer, which is where a shape becomes an
     * annotation.
     */
    prepareDraft: ((annotation: W3CAnnotation) => W3CAnnotation) | null = null;

    /**
     * The host's `extension.beforeSave` hook, applied to every annotation on
     * its way to the store — a create, a reshape and a body save alike, so a
     * host that rewrites annotations sees all three.
     */
    beforeSave: ((annotation: W3CAnnotation) => Promise<W3CAnnotation>) | null =
        null;

    /**
     * Create a whole-canvas annotation on the store's current canvas. Set by
     * the drawing layer, called by the controller: the whole-canvas tool has no
     * gesture, so the panel activating it IS the create, but the create itself
     * belongs beside every other one so id reconciliation and the handoff to
     * the body editor are not written twice.
     */
    createWholeCanvasAnnotation: (() => void) | null = null;

    /**
     * Place a tool's default shape at the centre of the current view, ready for
     * the ordinary editing verbs to move and size. Set by the drawing layer,
     * called by the controller when a tool is activated from the KEYBOARD.
     *
     * Creation is place-then-shape: a keyboard user has no cursor to describe a
     * region with, so the tool supplies a starting geometry rather than the
     * layer growing a second, keyboard-only creation path.
     */
    placeDefaultShape: ((tool: DrawingTool) => void) | null = null;

    /**
     * Delete the annotation open for editing — the Delete key's counterpart to
     * the panel's own delete button, and the same confirmation with it. Set by
     * the controller, called by the drawing layer.
     */
    requestDelete: (() => void) | null = null;

    /**
     * Escape's way back out of an open edit — the only way out there is, since
     * the body editor offers no cancel of its own. Set by the controller for the
     * same reason as {@link requestDisarm}: the open edit is DERIVED from the
     * panel's selection, so the layer clearing `editingAnnotationId` itself
     * would be overwritten by the next change to that selection.
     */
    requestCancelEdit: (() => void) | null = null;

    /**
     * Escape's way back out of the armed state. The layer cannot simply clear
     * `armedTool`: arming is DERIVED in the controller from create mode and the
     * selected tool, so a write here would be overwritten by the next change to
     * either, and the panel would meanwhile still show the tool lit. Disarming
     * has to happen at the state the panel renders from, which is the
     * controller's.
     */
    requestDisarm: (() => void) | null = null;
}
