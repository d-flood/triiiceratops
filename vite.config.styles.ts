import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import scopeViewerRoot from './src/packaging/scopeViewerRoot';

const __dirname = dirname(fileURLToPath(import.meta.url));

/*
 * Builds the published light-DOM stylesheet `dist/triiiceratops.css` (the
 * package `style` / `./style.css` export that Svelte consumers import).
 *
 * The entry only imports CSS, so the emitted JS chunk is a throwaway — the
 * `build:lib` script deletes `dist/triiiceratops-styles.js` afterward. Every
 * rule is scoped under `.viewer-root` by the PostCSS plugin so the sheet cannot
 * bleed onto the host page. Runs LAST in build:lib so it is the definitive
 * writer of dist/triiiceratops.css.
 */
export default defineConfig({
    css: {
        postcss: {
            plugins: [scopeViewerRoot()],
        },
    },
    build: {
        cssCodeSplit: false,
        lib: {
            entry: resolve(__dirname, 'src/lib/styles-lightdom.ts'),
            formats: ['es'],
            fileName: () => 'triiiceratops-styles.js',
            cssFileName: 'triiiceratops',
        },
        outDir: 'dist',
        emptyOutDir: false,
    },
});
