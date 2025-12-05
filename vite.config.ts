import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { paraglide } from '@inlang/paraglide-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    paraglide({ project: './project.inlang', outdir: './src/lib/paraglide' }),
    svelte(),
    tailwindcss()
  ],
})
