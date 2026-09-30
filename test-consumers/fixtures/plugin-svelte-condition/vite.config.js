import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// The Svelte plugin adds the `svelte` resolve condition, so the packed plugins
// resolve their `svelte`-condition builds and import this app's Svelte runtime.
export default defineConfig({
    plugins: [svelte()],
});
