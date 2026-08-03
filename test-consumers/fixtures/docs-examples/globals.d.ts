// Ambient declarations for identifiers that documentation snippets reference
// from their surrounding page prose (e.g. "the `viewer` element you already
// have"). Declaring them here lets examples read naturally while `tsc` still
// fully checks every package import and every use of an imported symbol — a
// broken import or a wrong plugin-config shape still fails the compile.

// A `<triiiceratops-viewer>` element or Svelte viewer instance the page has
// already created before the snippet runs.
declare const viewer: any;

// The browser plugin registry (also declared by the packed core types at
// runtime; declared loosely here for no-bundler snippets).
interface Window {
    Triiiceratops?: any;
    appSelection?: string | null;
}

// Reader-owned Svelte and Vue component files examples import by relative path
// (e.g. "the `./PluginUI.svelte` you just wrote", "the `./CanvasLabel.vue`
// beside it") — loosely typed, same rationale as the STUBS in
// scripts/docs-examples.mjs.
declare module '*.svelte' {
    const component: any;
    export default component;
}

declare module '*.vue' {
    const component: any;
    export default component;
}
