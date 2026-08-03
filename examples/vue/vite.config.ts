import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Nothing here is Triiiceratops-specific. `@vitejs/plugin-vue` is present to
// compile this app's own single-file components. In particular there is NO
// `compilerOptions.isCustomElement` entry: the wrapper is a real Vue component,
// so Vue never sees the `<triiiceratops-viewer>` tag in a template.
export default defineConfig({
    plugins: [vue()],
});
