import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// A plain Vite app. Deliberately NO plugins at all:
//
//   · no `@sveltejs/vite-plugin-svelte` — `triiiceratops/react` is precompiled
//     JavaScript and pulls no `.svelte` / `.svelte.js` source into the graph,
//     so a Svelte plugin (and the `svelte` package) is not a consumer
//     requirement at build time either;
//   · no React plugin — the app is authored with `createElement`, so there is
//     no JSX to transform. (A real app would add `@vitejs/plugin-react` for
//     JSX and fast refresh; nothing about the wrapper needs it.)
//
// Three routes, one build: the client contract, the server-rendered route
// (whose markup `prerender.mjs` injects after this build), and the
// version-conflict route.
export default defineConfig({
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
