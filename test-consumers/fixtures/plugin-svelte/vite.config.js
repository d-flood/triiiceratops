import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The plugin UI is a Svelte 5 component; the viewer's compiled `ViewerState`
// (a `.svelte.js` module in the packed dist) needs no compilation here.
export default defineConfig({
    plugins: [svelte()],
});
