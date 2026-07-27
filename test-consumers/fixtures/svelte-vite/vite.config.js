import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Minimal Vite + Svelte consumer of the packed `triiiceratops` tarball.
export default defineConfig({
    plugins: [svelte()],
});
