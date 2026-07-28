import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The consumer app + core's source-distributed `.svelte` files are compiled by
// this app's Svelte runtime. The packed plugin dist is already compiled (with
// its own Svelte bundled in) and is left as-is.
export default defineConfig({
    plugins: [svelte()],
});
