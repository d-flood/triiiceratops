/**
 * Ambient module shims so `tsc --emitDeclarationOnly` (which does not run the
 * Svelte or Vite plugins) can resolve the non-TS imports the source uses.
 *
 * - `*.svelte`: the components are internal implementation details — they never
 *   appear in the package's public type surface (`view.mount` returns a
 *   `() => void`), so typing the default export as a Svelte `Component` is
 *   sufficient. `svelte-check` type-checks the components themselves.
 * - `*.css?inline`: Vite's `?inline` query yields the stylesheet text as a
 *   string; tsc needs the ambient declaration to resolve it.
 */
declare module '*.svelte' {
    import type { Component } from 'svelte';
    const component: Component<Record<string, unknown>>;
    export default component;
}

declare module '*.css?inline' {
    const css: string;
    export default css;
}
