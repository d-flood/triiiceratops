import { basename } from 'node:path';

import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
    // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
    // for more information about preprocessors
    preprocess: vitePreprocess(),
    // Ordinary components are NOT analyzed as custom elements (ticket 22). A
    // global `customElement: true` made every component a custom-element
    // candidate, so svelte-check emitted `custom_element_props_identifier`
    // warnings for each component whose `$props()` it could not statically map
    // to custom-element attributes. Compiling ONLY the Web Component wrapper as a
    // custom element — via `dynamicCompileOptions` — keeps ordinary components
    // out of custom-element analysis while the wrapper (which declares
    // `<svelte:options customElement>`) still upgrades correctly.
    //
    // The shadow-DOM CSS path is unaffected: the element builds
    // (vite.config.element*.ts) set `configFile: false` and carry their own
    // `emitCss: false` plus their own copy of the wrapper-only rule below
    // (src/packaging/elementCompileOptions.ts), so they never read this file.
    compilerOptions: {
        customElement: false,
    },
    vitePlugin: {
        // vite-plugin-svelte reads this; svelte-check does not (it relies on
        // `compilerOptions.customElement: false` above, which already keeps
        // ordinary components out of custom-element analysis). Under Vite, this
        // upgrades ONLY the wrapper to a custom element for configs that would
        // otherwise leave it a plain component.
        //
        // This must stay in lockstep with `elementOnlyCustomElement` in
        // src/packaging/elementCompileOptions.ts. It cannot import it: node
        // and svelte-check load this file as plain JS. The parity test in
        // src/packaging/elementCompileOptions.test.ts imports both and pins
        // them to the same answers instead.
        dynamicCompileOptions({ filename }) {
            // Whole basename, not a suffix — `endsWith` would also claim
            // `NotTriiiceratopsViewerElement.svelte`.
            if (basename(filename) === 'TriiiceratopsViewerElement.svelte') {
                return { customElement: true };
            }
            return undefined;
        },
    },
};
