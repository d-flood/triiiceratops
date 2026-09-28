import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// No `isCustomElement`: the wrapper is a real Vue component.
export default defineConfig({
    plugins: [vue()],
});
