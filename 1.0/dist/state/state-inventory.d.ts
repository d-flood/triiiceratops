/**
 * State inventory for {@link ViewerState}.
 *
 * A hand-authored, reviewed, machine-readable classification of every mutable
 * member of the live `ViewerState` object that plugins receive (ADR 0007:
 * `ViewerState` is the sole plugin-facing state surface). It is checked in and
 * reviewed — never generated. `state-inventory.test.ts` reflects over a
 * constructed instance and fails if any mutable member is missing here (the
 * "unclassified member fails CI" gate); ticket 04 builds the notification
 * capability matrix on top of it.
 *
 * Classification rules (binding — from CONTEXT.md glossary and the grilling
 * decisions):
 *
 * - `command`   — anything the viewer's own UI can change (the parity rule).
 *                 Readable and notifying, changed through a supported mutation
 *                 method that maintains invariants (never a bare field setter).
 *                 Every listed method exists on `ViewerState` and has at least
 *                 one behavior test.
 * - `observable`— mirrors an external fact core alone writes (network errors,
 *                 fetch flags, `osdViewer`). Readable and notifying, no mutator.
 * - `internal`  — no contract; changeable in a patch release and excluded from
 *                 the documented API (TS `private` fields and transient UI
 *                 bookkeeping that has no plugin-facing meaning).
 * - `query-only`— high-frequency/per-frame values readable on demand but never
 *                 notifying (e.g. continuous viewport position). There are no
 *                 such members on `ViewerState` today: continuous viewport
 *                 position is read from `osdViewer` (OpenSeadragon's own API),
 *                 so this classification currently has zero entries but is kept
 *                 available for future inventory decisions.
 *
 * Direct property assignment stays physically possible (the object is not
 * sealed); it is an unsupported escape hatch carrying no semver or invariant
 * guarantees (ADR 0007).
 *
 * The inventory is also the home of the reactive-collection invariant — see
 * {@link REACTIVE_COLLECTION_MEMBERS}.
 */
export type StateClassification = 'command' | 'observable' | 'internal' | 'query-only';
export interface StateInventoryEntry {
    /** Enumerable member name as reflected from a constructed `ViewerState`. */
    member: string;
    classification: StateClassification;
    /**
     * For `command` members, the supported mutation method(s) on `ViewerState`.
     * Required (and only meaningful) when `classification === 'command'`.
     */
    commands?: string[];
    /** Reviewer-facing rationale / parity note. */
    notes?: string;
}
export declare const STATE_INVENTORY: readonly StateInventoryEntry[];
/**
 * Public `ViewerState` members that MUST hold a reactive collection
 * (`SvelteSet`/`SvelteMap` from `svelte/reactivity`) at runtime.
 *
 * These four members are declared as the plain built-ins `Set`/`Map` — which
 * `SvelteSet`/`SvelteMap` extend — so that `svelte/reactivity` never reaches
 * core's published declaration graph and Svelte is not a type-time requirement
 * for a React or Vue framework wrapper consumer. That is a deliberate trade: the
 * type system no longer prevents assigning a plain `Set`/`Map` over one of these
 * members, and a plain collection would silently stop notifying subscribers
 * (`trackWatchedMembers` reads a reactive collection's size and version to wake
 * the batched notification — ADR 0008). Direct assignment onto `ViewerState` is
 * already an unsupported escape hatch (ADR 0007), so the invariant lives here
 * and in `state-inventory.test.ts`, which asserts a constructed instance still
 * holds reactive collections for every member listed below.
 *
 * Core itself must never replace one of these members with a plain collection;
 * commands mutate the existing collection in place or assign a fresh
 * `SvelteSet`/`SvelteMap`.
 */
export declare const REACTIVE_COLLECTION_MEMBERS: readonly string[];
