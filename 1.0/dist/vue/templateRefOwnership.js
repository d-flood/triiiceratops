/**
 * Which viewer owns the box a Vue template ref writes into.
 *
 * React's `useViewerHandle()` hands the wrapper a {@link ViewerHandleSlot}
 * explicitly, so `createViewerBinding({ handle })` can claim it and the
 * substrate can throw `TriiiceratopsHandleConflictError` the moment a
 * second element claims the same slot. Vue has no such prop: the handle is an
 * ORDINARY template ref, filled in by Vue's own ref mechanism, and
 * `<TriiiceratopsViewer>` never sees it as a prop. Passing one ref to two
 * viewers would therefore be silent — the second mount would simply overwrite
 * the first, and every composable reading through that ref would follow
 * whichever viewer happened to mount last.
 *
 * This module closes that gap WITHOUT changing Vue's public handle type. It
 * reads the ref Vue itself recorded on the component's vnode, resolves it to
 * the BOX the value will be written into, and gives that box a real
 * `ViewerHandleSlot` — the substrate's own — for the viewer to claim. So the
 * ownership rule, the conflict detection, and the error naming both elements
 * are the substrate's, exactly as they are for React; only the discovery of
 * "which box" is Vue-specific.
 *
 * ## What counts as a box
 *
 * Vue normalizes `ref="name"` / `:ref="expr"` into one or more atoms of
 * `{ i, r, k, f }` on the vnode (`i` = the owning component instance, `r` = the
 * ref itself, `f` = the `v-for` marker). Three shapes matter:
 *
 * - **`r` is a ref object** (`:ref="viewerRef"`, including `shallowRef` and a
 *   `useTemplateRef()` result passed along). The ref object IS the box, so its
 *   identity is the ownership key. Two viewers given the same ref conflict; two
 *   viewers given two refs do not.
 * - **`r` is a string** (`ref="viewer"`, which is also what `useTemplateRef`
 *   subscribes to). The box is `instance.refs[name]` on the OWNING component,
 *   so the key is that owner plus the name. Two viewers in the same component
 *   both written as `ref="viewer"` conflict; the same name used in two
 *   different components does not, because each component has its own `refs`.
 * - **`r` is a function** (`:ref="(el) => …"`). There is no box: the consumer
 *   is collecting the values themselves and a shared function ref is a normal
 *   pattern, so no ownership is claimed and nothing can throw.
 *
 * `f` (the `v-for` marker) is skipped for the same reason: inside `v-for` Vue
 * deliberately collects every match into an ARRAY, so sharing is the documented
 * intent rather than a mistake.
 *
 * A vnode can also carry an ARRAY of atoms, which is how `cloneVNode` merges a
 * caller's ref with one the element already had. Every atom is claimed, so a
 * viewer that reaches two boxes is owned in both — and a partial claim is
 * rolled back before the conflict is rethrown, so a failed mount leaves no
 * ownership behind.
 *
 * ## Module identity
 *
 * The two registries below are module-level MUTABLE state, so a second copy of
 * this module would be a second, disjoint ownership map that silently never
 * conflicts. It is reachable only from `dist/vue.js`, which imports it as a
 * real module; nothing bundles it. If a future entry point ever inlines it, it
 * must be listed in that build's shared-module-identity externals the way
 * `framework/runtimeRegistry.js` and `logging/logger.js` are in
 * `vite.config.testing.ts`.
 */
import { isRef } from 'vue';
import { createViewerHandleSlot, } from '../framework/index.js';
/** Ownership for `:ref="someRef"`, keyed by the ref object itself. */
const slotByRefObject = new WeakMap();
/** Ownership for `ref="name"`, keyed by the owning instance, then the name. */
const slotsByOwner = new WeakMap();
function atomsOf(vnodeRef) {
    if (!vnodeRef)
        return [];
    const list = Array.isArray(vnodeRef) ? vnodeRef : [vnodeRef];
    return list.filter((atom) => typeof atom === 'object' && atom !== null);
}
/** The slot standing for one atom's box, or `null` when it has no box. */
function slotForAtom(atom) {
    // Inside `v-for`, sharing one ref across every match is Vue's documented
    // behaviour, not a wiring mistake.
    if (atom.f)
        return null;
    const target = atom.r;
    if (isRef(target)) {
        const key = target;
        let slot = slotByRefObject.get(key);
        if (!slot) {
            slot = createViewerHandleSlot();
            slotByRefObject.set(key, slot);
        }
        return slot;
    }
    if (typeof target === 'string') {
        const owner = atom.i;
        // A string ref with no owner has nowhere to be written; nothing to own.
        if (typeof owner !== 'object' || owner === null)
            return null;
        let byName = slotsByOwner.get(owner);
        if (!byName) {
            byName = new Map();
            slotsByOwner.set(owner, byName);
        }
        let slot = byName.get(target);
        if (!slot) {
            slot = createViewerHandleSlot();
            byName.set(target, slot);
        }
        return slot;
    }
    // A callback ref owns nothing: the consumer decides what to do with each
    // value, and one callback legitimately serving several elements is normal.
    return null;
}
/**
 * Take ownership, for `element`, of every box this component's template ref
 * writes into. Call from `onMounted`, before anything else the mount does, so a
 * double-bound ref fails before a listener is installed or registration is
 * triggered — the order React's binding uses.
 *
 * Throws `TriiiceratopsHandleConflictError`, naming both elements, when a
 * DIFFERENT mounted viewer already owns one of those boxes. Thrown from a
 * lifecycle hook, so it reaches `onErrorCaptured` and
 * `app.config.errorHandler`.
 *
 * @param instance The `getCurrentInstance()` captured in `setup`. Its
 * `vnode.ref` is the ref Vue recorded for this component at mount.
 * @returns An idempotent release, to call from `onBeforeUnmount`. Releasing
 * lets a later viewer claim the same ref, so unmount/remount and a `v-if` swap
 * rebind cleanly.
 */
export function claimTemplateRefOwnership(instance, element) {
    const slots = atomsOf(instance?.vnode.ref)
        .map(slotForAtom)
        .filter((slot) => slot !== null);
    const claims = [];
    try {
        for (const slot of slots)
            claims.push(slot.claim(element));
    }
    catch (error) {
        // All or nothing: a viewer whose mount is about to fail must not keep
        // half the ownership and block a later, correct binding.
        for (const claim of claims)
            claim.release();
        throw error;
    }
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        for (const claim of claims)
            claim.release();
    };
}
