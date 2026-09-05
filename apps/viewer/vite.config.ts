import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [svelte()],
    server: {
        // `--port N` must mean N: the e2e run's `baseURL` is fixed, so silently
        // moving to the next free port would point it at nothing.
        strictPort: true,
    },
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    resolve: {
        // `triiiceratops` ships Svelte SOURCE, compiled here by this app's own
        // build. It would otherwise resolve its `svelte` peer inside its own
        // package directory, giving the page two copies of the runtime and two
        // rune registries.
        dedupe: ['svelte'],
    },
    base: './', // Relative paths: the bare viewer is published under a subpath.
    // The default `dist` here, not a staging directory inside `docs/`: the
    // publish job assembles the site's tree from each app's own output.
});
