import { SvelteMap, SvelteSet } from 'svelte/reactivity';

import type {
    AnnotationEditorConfig,
    AnnotationPersistenceOp,
    AnnotationStorageAdapter,
} from './types';
import type { W3CAnnotation, AdapterLoadResult } from './adapters/types';
import { LocalStorageAdapter } from './adapters/LocalStorageAdapter';

export interface AnnotationDisplayState {
    setUserAnnotations(
        manifestId: string,
        canvasId: string,
        annotations: W3CAnnotation[],
    ): void;
    clearUserAnnotations(manifestId: string, canvasId: string): void;
}

type UndoableOp =
    | { kind: 'create'; annotation: W3CAnnotation }
    | { kind: 'update'; before: W3CAnnotation; after: W3CAnnotation }
    | { kind: 'delete'; annotation: W3CAnnotation };

/** Plugin-internal persistence core; deals exclusively in canvas-space annotations. */
export class AnnotationStore {
    private static readonly W3C_CONTEXT = 'http://www.w3.org/ns/anno.jsonld';
    private static readonly DEFAULT_MOTIVATION = 'commenting';

    private adapter: AnnotationStorageAdapter;
    private config: AnnotationEditorConfig;

    onReconcileId?: (oldId: string, canonical: W3CAnnotation) => void;

    onReplay?: (affectedId: string, annotation: W3CAnnotation | null) => void;

    private manifestId: string | null = null;
    private canvasId: string | null = null;

    private displayState: AnnotationDisplayState | null = null;

    private persistedAnnotations = new SvelteMap<string, W3CAnnotation>();
    private hydrationState = new SvelteMap<string, 'skeleton' | 'full'>();

    private saveQueue = new SvelteMap<string, Promise<void>>();
    private loadSequence = 0;

    private injectedCanvases = new SvelteSet<string>();

    private static readonly UNDO_DEPTH = 50;
    private undoStack: UndoableOp[] = [];
    private redoStack: UndoableOp[] = [];
    private replaying = false;
    private lastCreateCanonical: W3CAnnotation | null = null;
    private _canUndo = $state(false);
    private _canRedo = $state(false);

    private _panelError = $state<{
        op: AnnotationPersistenceOp;
        annotationId?: string;
    } | null>(null);

    constructor(config: AnnotationEditorConfig) {
        this.config = config;
        this.adapter = config.adapter ?? new LocalStorageAdapter();
    }

    setDisplayState(displayState: AnnotationDisplayState | null): void {
        this.displayState = displayState;
    }

    // === Context ===

    get currentManifestId(): string | null {
        return this.manifestId;
    }

    get currentCanvasId(): string | null {
        return this.canvasId;
    }

    get ready(): boolean {
        return this.manifestId !== null && this.canvasId !== null;
    }

    get hydrateSupported(): boolean {
        return typeof this.adapter.hydrate === 'function';
    }

    /**
     * The most recent persistence failure the host didn't handle, for the
     * panel's default error line. `null` when there's nothing to show or a host
     * `onPersistenceError` handler took ownership of the failure.
     */
    get panelError(): {
        op: AnnotationPersistenceOp;
        annotationId?: string;
    } | null {
        return this._panelError;
    }

    dismissError(): void {
        this._panelError = null;
    }

    get canUndo(): boolean {
        return this._canUndo;
    }

    get canRedo(): boolean {
        return this._canRedo;
    }

    setCanvas(manifestId: string | null, canvasId: string | null): void {
        this.manifestId = manifestId;
        this.canvasId = canvasId;
        this.persistedAnnotations.clear();
        this.hydrationState.clear();
        this._panelError = null;
        this.clearHistory();
    }

    get(id: string): W3CAnnotation | null {
        return this.persistedAnnotations.get(id) ?? null;
    }

    has(id: string): boolean {
        return this.persistedAnnotations.has(id);
    }

    isSkeleton(id: string): boolean {
        return this.hydrationState.get(id) === 'skeleton';
    }

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

    /** Cache and display advance only after the adapter resolves. */
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
                    // capture its (possibly re-reconciled) server id.
                    this.lastCreateCanonical = canonical;
                    this.syncDisplay();
                    this._panelError = null;
                    ok = true;
                    this.recordForward({
                        kind: 'create',
                        annotation: canonical,
                    });
                } catch (error) {
                    this.reportError('create', id, error, () =>
                        this.persist(annotation).then(() => {}),
                    );
                }
            }
        };

        const previous = this.saveQueue.get(id) ?? Promise.resolve();
        const next = previous.then(run, run);
        this.saveQueue.set(id, next);
        await next;
        if (this.saveQueue.get(id) === next) {
            this.saveQueue.delete(id);
        }
        return ok;
    }

    async delete(id: string): Promise<boolean> {
        if (!this.ready) return false;

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
            if (seq !== this.loadSequence) return null;
            this.reportError('hydrate', id, error, () =>
                this.hydrate(id, shouldApply).then(() => {}),
            );
            return null;
        }
        if (!hydrated) return null;

        if (seq !== this.loadSequence) return null;
        if (shouldApply && !shouldApply()) return null;

        const full = this.stripInternalMarkers(hydrated);
        this.persistedAnnotations.set(id, full);
        this.hydrationState.set(id, 'full');
        this._panelError = null;
        return full;
    }

    async resolve(id: string): Promise<W3CAnnotation | null> {
        const cached = this.persistedAnnotations.get(id);

        if (cached && this.hydrationState.get(id) !== 'skeleton') {
            return cached;
        }

        if (cached && this.hydrateSupported && this.ready) {
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

    async undo(): Promise<void> {
        const op = this.undoStack.pop();
        this.refreshUndoRedoFlags();
        if (!op) return;

        this.replaying = true;
        try {
            switch (op.kind) {
                case 'create': {
                    if (await this.delete(op.annotation.id)) {
                        this.pushRedo(op);
                        this.onReplay?.(op.annotation.id, null);
                    } else {
                        this.restoreUndo(op);
                    }
                    break;
                }
                case 'update': {
                    if (await this.persist(op.before)) {
                        this.pushRedo(op);
                        this.onReplay?.(op.before.id, this.get(op.before.id));
                    } else {
                        this.restoreUndo(op);
                    }
                    break;
                }
                case 'delete': {
                    if (await this.persist(op.annotation)) {
                        const canonical =
                            this.lastCreateCanonical ?? op.annotation;
                        this.pushRedo({
                            kind: 'delete',
                            annotation: canonical,
                        });
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

    async redo(): Promise<void> {
        const op = this.redoStack.pop();
        this.refreshUndoRedoFlags();
        if (!op) return;

        this.replaying = true;
        try {
            switch (op.kind) {
                case 'create': {
                    if (await this.persist(op.annotation)) {
                        const canonical =
                            this.lastCreateCanonical ?? op.annotation;
                        this.pushUndo({
                            kind: 'create',
                            annotation: canonical,
                        });
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
        this.clearHistory();
        for (const canvasKey of this.injectedCanvases) {
            const [manifestId, canvasId] = canvasKey.split('::');
            this.displayState?.clearUserAnnotations(manifestId, canvasId);
        }
        this.injectedCanvases.clear();
        this.persistedAnnotations.clear();
        this.hydrationState.clear();
        this.adapter.destroy?.();
    }

    // === Internal ===

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

    private restoreUndo(op: UndoableOp): void {
        this.undoStack.push(op);
        this.refreshUndoRedoFlags();
    }

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
        // triiiceratops-console-allow: report-channel-first fallback. Only
        // reached when the host provided no `onPersistenceError` handler; the
        // dismissible panel error below is the primary user-facing surface.
        // Recorded in lint-allowlist.md.
        console.error(`[AnnotationEditor] ${op} failed:`, cause);
        this._panelError = { op, annotationId };
    }

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
        this.hydrationState.set(canonicalId, 'full');

        if (swapped) {
            this.onReconcileId?.(localId, canonical);
        }

        return canonical;
    }

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

    private stampForUpdate(annotation: W3CAnnotation): W3CAnnotation {
        // Transient, discarded immediately — not reactive state.
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        return { ...annotation, modified: new Date().toISOString() };
    }

    private syncDisplay(): void {
        if (!this.ready) return;
        const manifestId = this.manifestId as string;
        const canvasId = this.canvasId as string;
        this.injectedCanvases.add(`${manifestId}::${canvasId}`);
        this.displayState?.setUserAnnotations(manifestId, canvasId, [
            ...this.persistedAnnotations.values(),
        ]);
    }

    private cachePersistedAnnotations(annotations: AdapterLoadResult[]): void {
        this.hydrationState.clear();
        this.persistedAnnotations = new SvelteMap(
            annotations.map((annotation) => {
                this.hydrationState.set(
                    annotation.id,
                    annotation.__fullBodyLoaded === false ? 'skeleton' : 'full',
                );
                return [
                    annotation.id,
                    this.stripInternalMarkers(annotation),
                ] as const;
            }),
        );
    }

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
