/**
 * Ambient module shim so `tsc --emitDeclarationOnly` (which does not run the
 * Svelte compiler) can resolve the `.svelte` import in `plugin.ts`. The
 * component is a purely internal implementation detail — it never appears in the
 * package's public type surface (`view.mount` returns a `() => void`) — so
 * typing the default export as a Svelte `Component` here is sufficient. Runtime
 * type-checking of the component itself is done by `svelte-check`.
 */
declare module '*.svelte' {
    import type { Component } from 'svelte';
    const component: Component<Record<string, unknown>>;
    export default component;
}
