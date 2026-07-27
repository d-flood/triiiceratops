import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// triiiceratops's `ViewerState` ships as an uncompiled `.svelte.js` runes
// module, so the consumer compiles it with vite-plugin-svelte. No `.svelte`
// components are authored in this fixture.
export default defineConfig({
    plugins: [svelte()],
});
