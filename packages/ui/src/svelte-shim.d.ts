/**
 * Ambient module shim so `tsc --emitDeclarationOnly` (which does not run the
 * Svelte compiler) can resolve the `.svelte` re-exports in `index.ts`. The
 * primitives' real props are type-checked by `svelte-check`; this shim exists
 * only so the type-emit `build` step can roll up the barrel. Mirrors the shim in
 * the first-party plugin packages.
 */
declare module '*.svelte' {
    import type { Component } from 'svelte';
    const component: Component<Record<string, unknown>>;
    export default component;
}
