import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// A plain Vite + Vue application. The ONLY plugin is `@vitejs/plugin-vue`, so
// the client route's single-file components go through Vue's real template
// compiler — and it is configured with NO `compilerOptions` at all.
//
// That is the point: `<TriiiceratopsViewer>` is a Vue component, not a raw
// custom-element tag, so the tag never reaches the template compiler and a
// consumer needs no custom-element compiler configuration to use it.
//
// There is deliberately no Svelte plugin either: `triiiceratops/vue` is
// precompiled JavaScript and pulls no Svelte source into the graph.
export default defineConfig({
    plugins: [vue()],
    define: {
        // Vue compiles hydration-mismatch reporting out of production builds
        // unless this flag is on. The fixture asserts ZERO mismatches, so the
        // reporting has to exist for the assertion to mean anything.
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true',
    },
    build: {
        rollupOptions: {
            input: {
                index: fileURLToPath(new URL('./index.html', import.meta.url)),
                ssr: fileURLToPath(new URL('./ssr.html', import.meta.url)),
                conflict: fileURLToPath(
                    new URL('./conflict.html', import.meta.url),
                ),
            },
        },
    },
});
