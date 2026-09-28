import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// No Svelte plugin or custom-element config: `triiiceratops/react` is precompiled JS.
export default defineConfig({
    plugins: [react()],
});
