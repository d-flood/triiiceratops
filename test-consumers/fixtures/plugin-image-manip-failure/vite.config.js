import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The consumer app + core's source-distributed `.svelte` files are compiled by
// this app's Svelte runtime. The packed plugin resolves to its precompiled
// `svelte`-condition build, which imports this same runtime.
export default defineConfig({
    plugins: [svelte()],
});
