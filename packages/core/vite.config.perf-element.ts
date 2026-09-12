import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

import elementConfig from './vite.config.element';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    ...elementConfig,
    build: {
        ...elementConfig.build,
        lib: {
            entry: resolve(__dirname, 'src/devtools/perf-element.ts'),
            name: 'TriiiceratopsPerfElement',
            formats: ['iife'],
            fileName: () => 'triiiceratops-perf-element.iife.js',
        },
        outDir: '.svelte-kit/perf-dist',
        emptyOutDir: true,
    },
});
