import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Only the Svelte example has a build step. The web-component and plain-HTML
// examples load the IIFE artifact from a script tag by relative path, with no
// bundler at all — that is what they exist to demonstrate — so the `build:static`
// script copies them verbatim.
//
// Everything this app produces lands under its own `dist/`, laid out as the exact
// subtree it occupies in the published site: `dist/examples/{svelte,web-component,
// plain-html}/` alongside `dist/dist/`, the release bundles. The doubled `dist` is
// deliberate — the inner name is the published URL path that the web-component and
// plain-HTML examples' `../../dist/…` script tags resolve against, so renaming it
// breaks them. `apps/site/scripts/place-examples.mjs` copies this tree into the
// root of the site's build output verbatim.
export default defineConfig({
    plugins: [svelte()],
    resolve: {
        // `triiiceratops` ships Svelte SOURCE, compiled here by this app's own
        // build. It would otherwise resolve its `svelte` peer inside its own
        // package directory, giving the page two copies of the runtime and two
        // rune registries.
        dedupe: ['svelte'],
    },
    root: resolve(__dirname, 'src/svelte'),
    base: './', // Relative paths: the examples are published under a subpath.
    build: {
        outDir: resolve(__dirname, 'dist/examples/svelte'),
        emptyOutDir: true,
    },
});
