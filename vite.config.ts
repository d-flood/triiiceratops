import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { paraglide } from '@inlang/paraglide-vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        paraglide({
            project: './project.inlang',
            outdir: './src/lib/paraglide',
        }),
        svelte({
            // Ensure custom elements compile when these files are included (tests/dev)
            // @ts-ignore - plugin supports a function signature with `url`
            compilerOptions: (url: string) => {
                const isCustomElement =
                    url.includes('TriiiceratopsViewerElement.svelte') ||
                    url.includes('TriiiceratopsViewerElementImage.svelte');
                return { customElement: isCustomElement };
            },
        }),
        tailwindcss(),
    ],
    test: {
        include: ['src/**/*.{test,spec}.{js,ts}'],
        environment: 'happy-dom',
        globals: true,
    },
});
