import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        paraglideVitePlugin({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
        svelte({
            // Ensure custom elements compile when these files are included (tests/dev)
            // @ts-expect-error - plugin supports a function signature with `url`
            compilerOptions: (url: string) => {
                const isCustomElement = url.includes(
                    'TriiiceratopsViewerElement.svelte',
                );
                return { customElement: isCustomElement };
            },
        }),
        tailwindcss(),
    ],
    esbuild: {
        pure: ['console.log', 'console.debug'],
        drop: ['debugger'],
    },
    server: {
        allowedHosts: ['df-laptop-wsl.flicker-lionfish.ts.net'],
    },
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}'],
        environment: 'happy-dom',
        globals: true,
    },
});
