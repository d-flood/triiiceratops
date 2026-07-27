import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Preprocess so the packed viewer's `lang="ts"` components and `.svelte.js`
// runes modules (e.g. ViewerState) compile in this consumer.
export default {
    preprocess: vitePreprocess(),
};
