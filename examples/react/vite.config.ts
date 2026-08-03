import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Nothing here is Triiiceratops-specific. `@vitejs/plugin-react` is present for
// JSX and fast refresh — this app's own requirement, not the viewer's. There is
// no Svelte plugin, no custom-element tag configuration, and no `optimizeDeps`
// tuning: `triiiceratops/react` is precompiled JavaScript that Vite treats like
// any other dependency.
export default defineConfig({
    plugins: [react()],
});
