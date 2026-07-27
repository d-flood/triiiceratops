import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Light-DOM Svelte consumer built under a strict CSP. Component styles are
// extracted to a same-origin stylesheet at build time (Vite's default), so
// `style-src 'self'` covers them without any runtime `<style>` injection. The
// module-preload polyfill (an inline <script>) is disabled so `script-src
// 'self'` needs no `unsafe-inline`/nonce for scripts.
export default defineConfig({
    plugins: [svelte()],
    build: {
        modulePreload: { polyfill: false },
    },
});
