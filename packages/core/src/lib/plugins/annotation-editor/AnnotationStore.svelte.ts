import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import type {
    AnnotationEditorConfig,
    AnnotationPersistenceOp,
    AnnotationStorageAdapter,
} from './types';
import type { W3CAnnotation, AdapterLoadResult } from './adapters/types';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';
import { manifestsState } from '../../state/manifests.svelte';

/**
 * A persisted operation captured for undo/redo (F6). Each entry is replayed
 * through the normal store write paths on undo/redo so display sync, id
 * reconciliation, and error rollback all apply — the visual state and storage
 * can never disagree (the fault of the old Annotorious-backed stack). A `create`
 * stores the canonical (post-reconcile) annotation; an `update` stores the
 * cached copy from both before and after the write; a `delete` stores the copy
 * that was removed so it can be re-created.
 */
type UndoableOp =
    | { kind: 'create'; annotation: W3CAnnotation }
    | { kind: 'update'; before: W3CAnnotation; after: W3CAnnotation }
    | { kind: 'delete'; annotation: W3CAnnotation };

/**
 * Plugin-internal persistence core. Owns everything the manager used to do "to
 * storage": the annotation cache, per-annotation hydration state, create-vs-update
 * resolution, the per-id save queue, the load-race token, and the raw adapter.
 *
 * `AnnotationManager` talks only to this store for persistence and keeps the
 * Annotorious/OpenSeadragon mechanics (selection, tools, coordinate transforms).
 * The store deals exclusively in **canvas-space** W3C annotations — transforms
 * live at the manager/store boundary.
 *
 * This class is a refactor of code previously inlined in `AnnotationManager`
 * (issues 01–04); behavior is intentionally unchanged (issue 05).
 */
export class AnnotationStore {
    private static readonly W3C_CONTEXT =
        'http://www.w3.org/ns/anno.jsonld';
    private static readonly DEFAULT_MOTIVATION = 'commenting';

    private adapter: AnnotationStorageAdapter;
    private config: AnnotationEditorConfig;

    /**
     * Notified when a `create` reconciles an annotation onto a server-assigned
     * id (F5), so the manager can re-open it in Annotorious under the canonical
     * id and re-emit the active-edit-id signal. Set by the manager; the loader
     * leaves it unset.
     */
    onReconcileId?: (oldId: string, canonical: W3CAnnotation) => void;

    /**
     * Notified after an undo/redo replay so the manager can reconcile the open
     * Annotorious editing session with the new storage state (F6): `annotation`
     * is the annotation now in the cache under `affectedId`, or `null` when the
     * replay removed it. Set by the manager; the loader leaves it unset.
     */
    onReplay?: (affectedId: string, annotation: W3CAnnotation | null) => void;

    // Current canvas context — the store owns it; the manager reads it back
    // through getters so its Annotorious/transform call sites are unchanged.
    private manifestId: string | null = null;
    private canvasId: string | null = null;

    // Cache of persisted annotations for the current canvas.
    private persistedAnnotations = new SvelteMap<string, W3CAnnotation>();
    // Per-annotation hydration state, kept internal because the
    // `__fullBodyLoaded` marker does not survive Annotorious's parse/serialize
    // round-trip (F7). Populated from adapter `load()` results; markers are then
    // stripped before anything leaves the store.
    private hydrationState = new SvelteMap<string, 'skeleton' | 'full'>();

    // Serializes adapter writes per annotation id so rapid saves of the same
    // annotation can't interleave create/update (F4).
    private saveQueue = new SvelteMap<string, Promise<void>>();
    // Bumped on every load() entry; a stale async load discards its result if
    // the token changed while it was awaiting (F14). Also read by hydrate() so a
    // hydrate whose canvas changed underneath it is discarded.
    private loadSequence = 0;

    // Canvas keys (`manifestId::canvasId`) whose overlay this store has pushed
    // into `manifestsState`. The plugin — not the adapter — owns display sync
    // (F10), so the store both injects on every successful read/write and clears
    // what it injected on destroy (F11). Bookkeeping that used to live in
    // `LocalStorageAdapter` moved here.
    private injectedCanvases = new SvelteSet<string>();

    // Persistence-aware undo/redo (F6). Each stack holds inverse-able operation
    // records; undo/redo replay them through the normal write paths. Capped at
    // UNDO_DEPTH and cleared on canvas change and destroy.
    private static readonly UNDO_DEPTH = 50;
    private undoStack: UndoableOp[] = [];
    private redoStack: UndoableOp[] = [];
    // True while an undo/redo replay is running its write through persist()/
    // delete(): suppresses the normal forward-recording so a replay doesn't push
    // onto the stack it is draining — the replay pushes onto the opposite stack
    // itself.
    private replaying = false;
    // The canonical annotation the most recent create committed (post-id
    // reconciliation). Read by an undo/redo replay right after a create-path
    // persist() so a re-created annotation's server-assigned id is captured for
    // the opposite stack.
    private lastCreateCanonical: W3CAnnotation | null = null;
    private _canUndo = $state(false);
    private _canRedo = $state(false);

    // The most recent unhandled persistence failure, shown as a dismissible line
    // in the panel when the host provides no `onPersistenceError` handler (F20).
    // Reactive so the controller can render it; reset on the next successful
    // operation, on canvas change, or when the user dismisses it.
    private _panelError = $state<{
        op: AnnotationPersistenceOp;
        annotationId?: string;
    } | null>(null);

    constructor(config: AnnotationEditorConfig) {
        this.config = config;
        this.adapter = config.adapter ?? new LocalStorageAdapter();
    }

    // === Context ===

    get currentManifestId(): string | null {
        return this.manifestId;
    }

    get currentCanvasId(): string | null {
        return this.canvasId;
    }

    /** Both a manifest and a canvas are known — persistence can run. */
    get ready(): boolean {
        return this.manifestId !== null && this.canvasId !== null;
    }

    /** The adapter can lazily hydrate skeleton bodies. */
    get hydrateSupported(): boolean {
        return typeof this.adapter.hydrate === 'function';
    }

    /**
     * The most recent persistence failure the host didn't handle, for the
     * panel's default error line. `null` when there's nothing to show or a host
     * `onPersistenceError` handler took ownership of the failure (F20).
     */
    get panelError(): { op: AnnotationPersistenceOp; annotationId?: string } | null {
        return this._panelError;
    }

    /** Dismiss the default error line (user clicked the ✕). */
    dismissError(): void {
        this._panelError = null;
    }

    /** An undo is available (reactive; drives the panel button). */
    get canUndo(): boolean {
        return this._canUndo;
    }

    /** A redo is available (reactive; drives the panel button). */
    get canRedo(): boolean {
        return this._canRedo;
    }

    /**
     * Point the store at a canvas and drop the previous canvas's cache. Does
     * not load — the manager drives load timing (and, from issue 06, display
     * sync) around this call.
     */
    setCanvas(manifestId: string | null, canvasId: string | null): void {
        this.manifestId = manifestId;
        this.canvasId = canvasId;
        this.persistedAnnotations.clear();
        this.hydrationState.clear();
        // A previous canvas's error is no longer relevant (F20).
        this._panelError = null;
        // Undo history is per-canvas — the recorded ops target the previous
        // canvas's storage (F6).
        this.clearHistory();
    }

    // === Reads ===

    get(id: string): W3CAnnotation | null {
        return this.persistedAnnotations.get(id) ?? null;
    }

    has(id: string): boolean {
        return this.persistedAnnotations.has(id);
    }

    isSkeleton(id: string): boolean {
        return this.hydrationState.get(id) === 'skeleton';
    }

    /**
     * Load the current canvas's annotations from the adapter into the cache.
     * A newer load (e.g. a canvas change) started while we awaited discards this
     * stale result so it can't clobber the current canvas (F14).
     */
    async load(): Promise<W3CAnnotation[]> {
        if (!this.ready) return [];

        const seq = ++this.loadSequence;

        let annotations: AdapterLoadResult[];
        try {
            annotations = await this.adapter.load(
                this.manifestId as string,
                this.canvasId as string,
            );
        } catch (error) {
            // A stale load (canvas changed underneath) is silently dropped.
            if (seq !== this.loadSequence) return [];
            this.reportError('load', undefined, error, () =>
                this.load().then(() => {}),
            );
            return [];
        }

        if (seq !== this.loadSequence) return [];

        this.cachePersistedAnnotations(annotations);
        this.syncDisplay();
        this._panelError = null;
        return annotations;
    }

    /**
     * Single chokepoint for adapter writes. Decides create-vs-update from the
     * in-memory cache (no per-save adapter.load round-trip — F4), serializes
     * writes per annotation id (F4), and updates the cache only after the
     * adapter call resolves.
     *
     * On create the store stamps a complete W3C/IIIF annotation (F18) and, if the
     * adapter returns a canonical annotation or id, reconciles the cache/display
     * onto the server-assigned id and notifies the manager (F5). On update it
     * refreshes `modified` and adopts a server-normalized copy when returned.
     *
     * Cache and display are only advanced *after* the adapter resolves, so a
     * rejected write leaves both at their pre-operation state — the rollback the
     * manager relies on to re-signal selection (F20). Returns `true` on success,
     * `false` when the adapter rejected (the failure has been reported).
     */
    async persist(annotation: W3CAnnotation): Promise<boolean> {
        if (!this.ready) return false;

        const manifestId = this.manifestId as string;
        const canvasId = this.canvasId as string;
        const id = annotation.id;
        const payload = this.stripInternalMarkers(annotation);

        let ok = false;
        const run = async () => {
            const isUpdate = this.persistedAnnotations.has(id);
            if (isUpdate) {
                // The copy currently in the cache, captured before the write so
                // an undo can restore it verbatim (F6).
                const before = this.persistedAnnotations.get(
                    id,
                ) as W3CAnnotation;
                const stamped = this.stampForUpdate(payload);
                try {
                    const returned = await this.adapter.update(
                        manifestId,
                        canvasId,
                        stamped,
                    );
                    // A server may normalize the annotation on update; adopt its
                    // returned copy when present, else keep what we sent.
                    const canonical =
                        returned && typeof returned === 'object'
                            ? this.stripInternalMarkers(
                                  returned as W3CAnnotation,
                              )
                            : stamped;
                    this.persistedAnnotations.set(id, canonical);
                    this.hydrationState.set(id, 'full');
                    this.syncDisplay();
                    this._panelError = null;
                    ok = true;
                    this.recordForward({
                        kind: 'update',
                        before,
                        after: canonical,
                    });
                } catch (error) {
                    // Cache untouched → the previous copy is still current.
                    this.reportError('update', id, error, () =>
                        this.persist(annotation).then(() => {}),
                    );
                }
            } else {
                const stamped = this.stampForCreate(payload);
                try {
                    const returned = await this.adapter.create(
                        manifestId,
                        canvasId,
                        stamped,
                    );
                    const canonical = this.reconcileCreate(
                        id,
                        stamped,
                        returned,
                    );
                    // Expose the canonical copy so an undo/redo replay create can
                    // capture its (possibly re-reconciled) server id (F6).
                    this.lastCreateCanonical = canonical;
                    // Reflect the write in the read-only display overlay (F10).
                    this.syncDisplay();
                    this._panelError = null;
                    ok = true;
                    this.recordForward({ kind: 'create', annotation: canonical });
                } catch (error) {
                    // Nothing was cached → no optimistic entry to remove.
                    this.reportError('create', id, error, () =>
                        this.persist(annotation).then(() => {}),
                    );
                }
            }
        };

        const previous = this.saveQueue.get(id) ?? Promise.resolve();
        // Chain regardless of whether the previous save resolved or rejected;
        // `run` never rejects (it catches), so a failed save frees its queue
        // slot and later saves of the same id still run (F20).
        const next = previous.then(run, run);
        this.saveQueue.set(id, next);
        await next;
        if (this.saveQueue.get(id) === next) {
            this.saveQueue.delete(id);
        }
        return ok;
    }

    /**
     * Delete an annotation through the adapter and drop it from the cache.
     * Cache/display are only advanced after the adapter resolves, so a rejected
     * delete leaves the entry (and its overlay) intact — the "restore the entry"
     * rollback (F20). Returns `true` on success, `false` when the adapter
     * rejected (the failure has been reported).
     */
    async delete(id: string): Promise<boolean> {
        if (!this.ready) return false;

        // The copy about to be removed, captured before the write so an undo can
        // re-create it (F6).
        const removed = this.persistedAnnotations.get(id) ?? null;

        try {
            await this.adapter.delete(
                this.manifestId as string,
                this.canvasId as string,
                id,
            );
        } catch (error) {
            this.reportError('delete', id, error, () =>
                this.delete(id).then(() => {}),
            );
            return false;
        }

        this.persistedAnnotations.delete(id);
        this.hydrationState.delete(id);
        this.syncDisplay();
        this._panelError = null;
        if (removed) {
            this.recordForward({ kind: 'delete', annotation: removed });
        }
        return true;
    }

    /**
     * Fetch a skeleton annotation's full body from the adapter and cache it.
     * Returns the full annotation, or null when there is nothing to do (no
     * hydrate support), the fetch came back empty, the canvas changed while
     * awaiting (F14), or `shouldApply` vetoes committing the result (the manager
     * uses this to bail if the annotation is no longer being edited).
     */
    async hydrate(
        id: string,
        shouldApply?: () => boolean,
    ): Promise<W3CAnnotation | null> {
        if (!this.ready || !this.adapter.hydrate) return null;

        const seq = this.loadSequence;

        let hydrated: AdapterLoadResult | null;
        try {
            hydrated = await this.adapter.hydrate(
                this.manifestId as string,
                this.canvasId as string,
                id,
            );
        } catch (error) {
            // A stale hydrate (canvas changed underneath) is silently dropped.
            if (seq !== this.loadSequence) return null;
            this.reportError('hydrate', id, error, () =>
                this.hydrate(id, shouldApply).then(() => {}),
            );
            return null;
        }
        if (!hydrated) return null;

        // Bail if a canvas change (which bumps loadSequence) happened while we
        // were hydrating, or if the caller says the result is no longer wanted.
        if (seq !== this.loadSequence) return null;
        if (shouldApply && !shouldApply()) return null;

        const full = this.stripInternalMarkers(hydrated);
        this.persistedAnnotations.set(id, full);
        this.hydrationState.set(id, 'full');
        this._panelError = null;
        return full;
    }

    /**
     * Resolve the full annotation for editing: return the cached copy when it is
     * already full, hydrate it when the cache holds a skeleton, or reload the
     * canvas when the id isn't cached at all.
     */
    async resolve(id: string): Promise<W3CAnnotation | null> {
        const cached = this.persistedAnnotations.get(id);

        // Consult internal hydration state, not a body marker — markers are
        // stripped from the cache in cachePersistedAnnotations() (F7).
        if (cached && this.hydrationState.get(id) !== 'skeleton') {
            return cached;
        }

        if (cached && this.hydrateSupported && this.ready) {
            // Route through hydrate() so the load-race guard (F14) and error
            // surface (F20) apply. Inlining the fetch here used to skip both,
            // which could write a stale body into a new canvas's cache when the
            // canvas changed mid-hydrate. Falls back to the cached skeleton when
            // the hydrate is empty or discarded.
            const full = await this.hydrate(id);
            return full ?? cached;
        }

        if (!cached && this.ready) {
            const annotations = await this.adapter.load(
                this.manifestId as string,
                this.canvasId as string,
            );
            this.cachePersistedAnnotations(annotations);
            this.syncDisplay();
            return this.persistedAnnotations.get(id) ?? null;
        }

        return cached ?? null;
    }

    /**
     * Reverse the most recent persisted operation by replaying its inverse
     * through the normal write paths (F6): a `create` is deleted, an `update`
     * restores the previous cached copy, a `delete` re-creates the removed copy.
     * The reversed operation moves to the redo stack. A failed replay (the
     * adapter rejected — the error surface fires) leaves the operation on the
     * undo stack so it is never lost.
     */
    async undo(): Promise<void> {
        const op = this.undoStack.pop();
        this.refreshUndoRedoFlags();
        if (!op) return;

        this.replaying = true;
        try {
            switch (op.kind) {
                case 'create': {
                    // Inverse of create is delete of the canonical id.
                    if (await this.delete(op.annotation.id)) {
                        this.pushRedo(op);
                        this.onReplay?.(op.annotation.id, null);
                    } else {
                        this.restoreUndo(op);
                    }
                    break;
                }
                case 'update': {
                    // Inverse of update is restoring the previous cached copy.
                    if (await this.persist(op.before)) {
                        this.pushRedo(op);
                        this.onReplay?.(op.before.id, this.get(op.before.id));
                    } else {
                        this.restoreUndo(op);
                    }
                    break;
                }
                case 'delete': {
                    // Inverse of delete is re-creating the removed copy; a server
                    // may assign a fresh id, so the redo deletes the re-reconciled
                    // canonical id, not the original.
                    if (await this.persist(op.annotation)) {
                        const canonical =
                            this.lastCreateCanonical ?? op.annotation;
                        this.pushRedo({ kind: 'delete', annotation: canonical });
                        this.onReplay?.(canonical.id, this.get(canonical.id));
                    } else {
                        this.restoreUndo(op);
                    }
                    break;
                }
            }
        } finally {
            this.replaying = false;
        }
    }

    /**
     * Re-apply the most recently undone operation through the normal write paths
     * (F6). The re-applied operation moves back to the undo stack. A failed
     * replay leaves the operation on the redo stack so it is never lost.
     */
    async redo(): Promise<void> {
        const op = this.redoStack.pop();
        this.refreshUndoRedoFlags();
        if (!op) return;

        this.replaying = true;
        try {
            switch (op.kind) {
                case 'create': {
                    // A re-created annotation may receive a new server id, so
                    // capture the canonical copy for the undo entry.
                    if (await this.persist(op.annotation)) {
                        const canonical =
                            this.lastCreateCanonical ?? op.annotation;
                        this.pushUndo({ kind: 'create', annotation: canonical });
                        this.onReplay?.(canonical.id, this.get(canonical.id));
                    } else {
                        this.restoreRedo(op);
                    }
                    break;
                }
                case 'update': {
                    if (await this.persist(op.after)) {
                        this.pushUndo(op);
                        this.onReplay?.(op.after.id, this.get(op.after.id));
                    } else {
                        this.restoreRedo(op);
                    }
                    break;
                }
                case 'delete': {
                    if (await this.delete(op.annotation.id)) {
                        this.pushUndo(op);
                        this.onReplay?.(op.annotation.id, null);
                    } else {
                        this.restoreRedo(op);
                    }
                    break;
                }
            }
        } finally {
            this.replaying = false;
        }
    }

    destroy(): void {
        // Undo/redo history does not outlive the store (F6).
        this.clearHistory();
        // Remove every overlay this store injected so the display doesn't keep
        // showing annotations after the plugin is torn down (F11).
        for (const canvasKey of this.injectedCanvases) {
            const [manifestId, canvasId] = canvasKey.split('::');
            manifestsState.clearUserAnnotations(manifestId, canvasId);
        }
        this.injectedCanvases.clear();
        this.persistedAnnotations.clear();
        this.hydrationState.clear();
        // Let the adapter release its own resources (F11).
        this.adapter.destroy?.();
    }

    // === Internal ===

    /**
     * Record a just-committed forward operation for undo (F6). A normal user
     * operation becomes undoable and invalidates any redo path; while replaying
     * an undo/redo this is suppressed (the replay pushes onto the opposite stack
     * itself).
     */
    private recordForward(op: UndoableOp): void {
        if (this.replaying) return;
        this.pushCapped(this.undoStack, op);
        this.redoStack = [];
        this.refreshUndoRedoFlags();
    }

    private pushUndo(op: UndoableOp): void {
        this.pushCapped(this.undoStack, op);
        this.refreshUndoRedoFlags();
    }

    private pushRedo(op: UndoableOp): void {
        this.pushCapped(this.redoStack, op);
        this.refreshUndoRedoFlags();
    }

    /** Return a failed-replay op to the undo stack so it is never lost (F6). */
    private restoreUndo(op: UndoableOp): void {
        this.undoStack.push(op);
        this.refreshUndoRedoFlags();
    }

    /** Return a failed-replay op to the redo stack so it is never lost (F6). */
    private restoreRedo(op: UndoableOp): void {
        this.redoStack.push(op);
        this.refreshUndoRedoFlags();
    }

    private pushCapped(stack: UndoableOp[], op: UndoableOp): void {
        stack.push(op);
        if (stack.length > AnnotationStore.UNDO_DEPTH) {
            stack.shift();
        }
    }

    private clearHistory(): void {
        this.undoStack = [];
        this.redoStack = [];
        this.lastCreateCanonical = null;
        this.refreshUndoRedoFlags();
    }

    private refreshUndoRedoFlags(): void {
        this._canUndo = this.undoStack.length > 0;
        this._canRedo = this.redoStack.length > 0;
    }

    /**
     * Surface a failed persistence operation (F20). A host `onPersistenceError`
     * handler takes full ownership of the failure (it gets a `retry` handle);
     * without one, the store logs and records a dismissible panel error so the
     * failure is never invisible. The cache/display rollback has already
     * happened at the call sites (writes only commit on success).
     */
    private reportError(
        op: AnnotationPersistenceOp,
        annotationId: string | undefined,
        cause: unknown,
        retry: () => Promise<void>,
    ): void {
        if (this.config.onPersistenceError) {
            this.config.onPersistenceError({
                op,
                annotationId,
                manifestId: this.manifestId as string,
                canvasId: this.canvasId as string,
                cause,
                retry,
            });
            return;
        }
        console.error(`[AnnotationEditor] ${op} failed:`, cause);
        this._panelError = { op, annotationId };
    }

    /**
     * Commit a created annotation to the cache under its canonical id. When the
     * adapter returns a server-assigned annotation or id string, the cache key is
     * swapped from the local id to the canonical one, and the manager is notified
     * so it can re-open the annotation under the new id (F5).
     */
    private reconcileCreate(
        localId: string,
        stamped: W3CAnnotation,
        returned: W3CAnnotation | string | void,
    ): W3CAnnotation {
        let canonical = stamped;
        let canonicalId = localId;

        if (typeof returned === 'string') {
            canonicalId = returned;
            canonical = { ...stamped, id: returned };
        } else if (returned && typeof returned === 'object') {
            canonical = this.stripInternalMarkers(returned);
            canonicalId = canonical.id;
        }

        const swapped = canonicalId !== localId;
        if (swapped) {
            this.persistedAnnotations.delete(localId);
            this.hydrationState.delete(localId);
        }

        this.persistedAnnotations.set(canonicalId, canonical);
        // Anything we persist carries a full body, so its hydration state is
        // now 'full' (F7).
        this.hydrationState.set(canonicalId, 'full');

        if (swapped) {
            this.onReconcileId?.(localId, canonical);
        }

        return canonical;
    }

    /**
     * Stamp a complete, valid W3C/IIIF annotation before create without
     * clobbering host-provided values (F18). `extension.beforeSave` has already
     * run (in the manager) and therefore still wins — stamping only fills gaps.
     */
    private stampForCreate(annotation: W3CAnnotation): W3CAnnotation {
        const stamped: W3CAnnotation = { ...annotation };
        if (!stamped['@context']) {
            stamped['@context'] = AnnotationStore.W3C_CONTEXT;
        }
        if (!stamped.type) {
            stamped.type = 'Annotation';
        }
        if (!stamped.creator && this.config.user) {
            stamped.creator = {
                id: this.config.user.id,
                name: this.config.user.name,
            };
        }
        if (!stamped.created) {
            // Transient, discarded immediately — not reactive state.
            // eslint-disable-next-line svelte/prefer-svelte-reactivity
            stamped.created = new Date().toISOString();
        }
        if (!stamped.motivation) {
            stamped.motivation =
                this.config.defaultMotivation ??
                AnnotationStore.DEFAULT_MOTIVATION;
        }
        return stamped;
    }

    /** Refresh `modified` on an updated annotation (F18). */
    private stampForUpdate(annotation: W3CAnnotation): W3CAnnotation {
        // Transient, discarded immediately — not reactive state.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        return { ...annotation, modified: new Date().toISOString() };
    }

    /**
     * Push the current canvas's cached annotations into `manifestsState` so the
     * read-only overlay reflects storage. The plugin owns this — adapters are
     * pure storage (F10). Records the canvas key so `destroy()` can clear it.
     */
    private syncDisplay(): void {
        if (!this.ready) return;
        const manifestId = this.manifestId as string;
        const canvasId = this.canvasId as string;
        this.injectedCanvases.add(`${manifestId}::${canvasId}`);
        manifestsState.setUserAnnotations(manifestId, canvasId, [
            ...this.persistedAnnotations.values(),
        ]);
    }

    private cachePersistedAnnotations(annotations: AdapterLoadResult[]): void {
        // Rebuild both maps together: read each adapter-supplied
        // `__fullBodyLoaded` marker once into internal hydration state, then
        // strip the markers so nothing downstream depends on them (F7).
        this.hydrationState.clear();
        this.persistedAnnotations = new SvelteMap(
            annotations.map((annotation) => {
                this.hydrationState.set(
                    annotation.id,
                    annotation.__fullBodyLoaded === false
                        ? 'skeleton'
                        : 'full',
                );
                return [
                    annotation.id,
                    this.stripInternalMarkers(annotation),
                ] as const;
            }),
        );
    }

    /**
     * Strip plugin-internal bookkeeping markers so they never reach an adapter,
     * the cache, or the panel.
     */
    private stripInternalMarkers(annotation: AdapterLoadResult): W3CAnnotation {
        if (
            annotation.__fullBodyLoaded === undefined &&
            annotation.__bodyPreview === undefined
        ) {
            return annotation;
        }
        const clone: any = { ...annotation };
        delete clone.__fullBodyLoaded;
        delete clone.__bodyPreview;
        return clone as W3CAnnotation;
    }
}
